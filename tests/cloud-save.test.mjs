import assert from "node:assert/strict";
import test from "node:test";

import {
  activateSaveOwner,
  accountSaveOwner,
  cacheActiveLocalSave,
  getActiveSaveOwner,
  mergeCloudSaves,
  normalizeCloudSave,
  readLocalSaveData,
  readOwnerSave,
  sameSaveContent,
  sameSaveOwner,
  writeLocalSaveData,
} from "../app/account/saveData.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    get length() { return values.size; },
  };
}

test("merges local and cloud achievements without losing either copy", () => {
  const merged = mergeCloudSaves(
    {
      updatedAt: "2026-07-20T00:00:00.000Z",
      bestDay: 8,
      seenZombies: ["normal", "runner"],
      clearedLevels: ["level-escape-home"],
      clearedExplorationTasks: [1, 2],
    },
    {
      updatedAt: "2026-07-21T00:00:00.000Z",
      bestDay: 12,
      seenZombies: ["runner", "spitter"],
      clearedLevels: ["level-join-army"],
      clearedExplorationTasks: [2, 3],
    },
  );

  assert.equal(merged.bestDay, 12);
  assert.deepEqual(merged.seenZombies, ["normal", "runner", "spitter"]);
  assert.deepEqual(merged.clearedLevels, ["level-escape-home", "level-join-army"]);
  assert.deepEqual(merged.clearedExplorationTasks, [1, 2, 3]);
});

test("keeps the most advanced loadout while unioning unlocks and inventory", () => {
  const merged = mergeCloudSaves(
    {
      progress: {
        version: 2,
        coOp: false,
        nextDay: 5,
        kills: 90,
        coins: 400,
        loadout: ["glock17", "sawedoff"],
        weapon: "glock17",
        owned: ["glock17", "sawedoff"],
        ownedArmors: ["civilian"],
        ownedPartners: [],
        itemInventory: { frag: 1, molotov: 4 },
        secondPlayer: {
          coins: 100,
          loadout: ["glock17", "sawedoff"],
          owned: ["glock17", "sawedoff"],
          ownedArmors: ["civilian"],
          ownedPartners: ["hound"],
          partner: "hound",
          itemInventory: { frag: 1, molotov: 2 },
        },
      },
    },
    {
      progress: {
        version: 2,
        coOp: true,
        nextDay: 9,
        kills: 150,
        coins: 250,
        loadout: ["pkm", "glock17"],
        weapon: "pkm",
        owned: ["glock17", "pkm"],
        ownedArmors: ["combat"],
        ownedPartners: ["soldier"],
        itemInventory: { frag: 3, molotov: 1 },
        secondPlayer: {
          coins: 175,
          loadout: ["glock17", "sawedoff"],
          owned: ["glock17", "pkm"],
          ownedArmors: ["army"],
          ownedPartners: ["officer"],
          partner: "officer",
          itemInventory: { frag: 3, molotov: 1 },
        },
      },
    },
  );

  assert.equal(merged.progress.nextDay, 9);
  assert.equal(merged.progress.coOp, true);
  assert.equal(merged.progress.version, 5);
  assert.deepEqual(merged.progress.secondPlayer, {
    coins: 175,
    loadout: ["glock17", "sawedoff"],
    owned: ["glock17", "sawedoff", "pkm"],
    ownedArmors: ["civilian", "army"],
    ownedPartners: ["hound", "officer"],
    partner: "officer",
    itemInventory: { frag: 3, molotov: 2 },
  });
  assert.equal(merged.progress.coins, 400);
  assert.deepEqual(merged.progress.loadout, ["pkm", "glock17"]);
  assert.equal(merged.progress.weapon, "pkm");
  assert.deepEqual(merged.progress.owned, ["glock17", "sawedoff", "pkm"]);
  assert.deepEqual(merged.progress.ownedArmors, ["civilian", "combat"]);
  assert.deepEqual(merged.progress.ownedPartners, ["soldier"]);
  assert.deepEqual(merged.progress.itemInventory, { frag: 3, molotov: 4 });
});

test("round-trips browser storage and rejects malformed collection entries", () => {
  const storage = memoryStorage({
    "dead-road-best-day": "7",
    "dead-road-codex-seen": JSON.stringify(["normal", 42, "normal"]),
    "dead-road-levels-cleared": "not-json",
    "dead-road-exploration-cleared": JSON.stringify([3, -1, 2, 3, "4"]),
  });

  const read = readLocalSaveData(storage);
  assert.equal(read.bestDay, 7);
  assert.deepEqual(read.seenZombies, ["normal"]);
  assert.deepEqual(read.clearedLevels, []);
  assert.deepEqual(read.clearedExplorationTasks, [2, 3]);

  const written = writeLocalSaveData(normalizeCloudSave({ ...read, bestDay: 11 }), storage);
  assert.equal(written.bestDay, 11);
  assert.equal(storage.getItem("dead-road-best-day"), "11");
});

test("a newer explicit progress reset is not resurrected by an older cloud copy", () => {
  const reset = {
    updatedAt: "2026-07-22T10:00:00.000Z",
    progress: null,
    clearedLevels: ["level-escape-home"],
  };
  const olderCloud = {
    updatedAt: "2026-07-21T10:00:00.000Z",
    progress: { version: 2, nextDay: 12, coins: 900, kills: 400 },
    clearedLevels: ["level-join-army"],
  };

  const merged = mergeCloudSaves(reset, olderCloud);
  assert.equal(merged.progress, null);
  assert.deepEqual(merged.clearedLevels, ["level-escape-home", "level-join-army"]);
});

test("keeps guest and player caches isolated when the active owner changes", () => {
  const storage = memoryStorage();
  writeLocalSaveData({ bestDay: 3, clearedLevels: ["guest-level"] }, storage, false);
  cacheActiveLocalSave(storage);
  const playerA = accountSaveOwner("player-a");
  activateSaveOwner(playerA, { bestDay: 10, clearedLevels: ["player-a-level"] }, storage);

  assert.equal(sameSaveOwner(getActiveSaveOwner(storage), playerA), true);
  assert.equal(readLocalSaveData(storage).bestDay, 10);
  assert.deepEqual(readOwnerSave({ kind: "guest" }, storage).clearedLevels, ["guest-level"]);
  assert.deepEqual(readOwnerSave(playerA, storage).clearedLevels, ["player-a-level"]);
  assert.equal(sameSaveContent(readOwnerSave({ kind: "guest" }, storage), readOwnerSave(playerA, storage)), false);
});
