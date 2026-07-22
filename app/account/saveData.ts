export const LOCAL_SAVE_CHANGED_EVENT = "dead-road-local-save-changed";

export type SaveOwner =
  | { kind: "guest" }
  | { kind: "account"; userId: string };

export const GUEST_SAVE_OWNER: SaveOwner = { kind: "guest" };

export function accountSaveOwner(userId: string): SaveOwner {
  return { kind: "account", userId };
}

export function sameSaveOwner(left: SaveOwner, right: SaveOwner): boolean {
  if (left.kind === "guest") return right.kind === "guest";
  return right.kind === "account" && left.userId === right.userId;
}

const LOCAL_KEYS = {
  bestDay: "dead-road-best-day",
  progress: "dead-road-progress",
  seenZombies: "dead-road-codex-seen",
  clearedLevels: "dead-road-levels-cleared",
  clearedExplorationTasks: "dead-road-exploration-cleared",
  cloudMeta: "dead-road-cloud-save-meta",
  activeOwner: "dead-road-active-save-owner",
  guestMigratedTo: "dead-road-guest-save-migrated-to",
} as const;

const OWNER_CACHE_PREFIX = "dead-road-owner-save:";

type JsonObject = Record<string, unknown>;

export type CloudSaveData = {
  schemaVersion: 1;
  updatedAt: string;
  bestDay: number;
  progress: JsonObject | null;
  seenZombies: string[];
  clearedLevels: string[];
  clearedExplorationTasks: number[];
};

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function objectOrNull(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((entry): entry is string => typeof entry === "string")))
    : [];
}

function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((entry): entry is number => Number.isInteger(entry) && entry > 0))).sort((a, b) => a - b)
    : [];
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isoOrEpoch(value: unknown): string {
  if (typeof value !== "string") return new Date(0).toISOString();
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(0).toISOString();
}

function uniqueStrings(...values: unknown[]): string[] {
  return Array.from(new Set(values.flatMap(stringList)));
}

function mergeInventories(left: unknown, right: unknown): JsonObject {
  const leftInventory = objectOrNull(left) ?? {};
  const rightInventory = objectOrNull(right) ?? {};
  const result: JsonObject = {};
  for (const key of new Set([...Object.keys(leftInventory), ...Object.keys(rightInventory)])) {
    result[key] = Math.max(finiteNonNegative(leftInventory[key]), finiteNonNegative(rightInventory[key]));
  }
  return result;
}

function progressRank(progress: JsonObject): [number, number, number] {
  return [
    finiteNonNegative(progress.nextDay),
    finiteNonNegative(progress.kills),
    finiteNonNegative(progress.coins),
  ];
}

function compareRank(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/**
 * Progress deliberately merges unlocks and inventory instead of choosing one
 * whole document. A first login must never erase items earned in either copy.
 */
export function mergeProgress(left: JsonObject | null, right: JsonObject | null): JsonObject | null {
  if (!left) return right ? structuredClone(right) : null;
  if (!right) return structuredClone(left);

  const preferred = compareRank(progressRank(left), progressRank(right)) >= 0 ? left : right;
  const other = preferred === left ? right : left;
  return {
    ...structuredClone(other),
    ...structuredClone(preferred),
    version: Math.max(finiteNonNegative(left.version), finiteNonNegative(right.version), 2),
    nextDay: Math.max(finiteNonNegative(left.nextDay), finiteNonNegative(right.nextDay), 1),
    coins: Math.max(finiteNonNegative(left.coins), finiteNonNegative(right.coins)),
    kills: Math.max(finiteNonNegative(left.kills), finiteNonNegative(right.kills)),
    owned: uniqueStrings(left.owned, right.owned),
    ownedArmors: uniqueStrings(left.ownedArmors, right.ownedArmors),
    ownedPartners: uniqueStrings(left.ownedPartners, right.ownedPartners),
    itemInventory: mergeInventories(left.itemInventory, right.itemInventory),
  };
}

export function normalizeCloudSave(value: unknown): CloudSaveData {
  const source = objectOrNull(value) ?? {};
  return {
    schemaVersion: 1,
    updatedAt: isoOrEpoch(source.updatedAt),
    bestDay: finiteNonNegative(source.bestDay),
    progress: objectOrNull(source.progress),
    seenZombies: stringList(source.seenZombies),
    clearedLevels: stringList(source.clearedLevels),
    clearedExplorationTasks: numberList(source.clearedExplorationTasks),
  };
}

export function mergeCloudSaves(leftValue: unknown, rightValue: unknown): CloudSaveData {
  const left = normalizeCloudSave(leftValue);
  const right = normalizeCloudSave(rightValue);
  const leftUpdatedAt = Date.parse(left.updatedAt);
  const rightUpdatedAt = Date.parse(right.updatedAt);
  let progress: JsonObject | null;
  if (!left.progress && right.progress) progress = leftUpdatedAt > rightUpdatedAt ? null : structuredClone(right.progress);
  else if (left.progress && !right.progress) progress = rightUpdatedAt > leftUpdatedAt ? null : structuredClone(left.progress);
  else progress = mergeProgress(left.progress, right.progress);
  return {
    schemaVersion: 1,
    updatedAt: new Date(Math.max(leftUpdatedAt, rightUpdatedAt, Date.now())).toISOString(),
    bestDay: Math.max(left.bestDay, right.bestDay),
    progress,
    seenZombies: uniqueStrings(left.seenZombies, right.seenZombies),
    clearedLevels: uniqueStrings(left.clearedLevels, right.clearedLevels),
    clearedExplorationTasks: numberList([
      ...left.clearedExplorationTasks,
      ...right.clearedExplorationTasks,
    ]),
  };
}

export function sameSaveContent(leftValue: unknown, rightValue: unknown): boolean {
  const left = normalizeCloudSave(leftValue);
  const right = normalizeCloudSave(rightValue);
  return JSON.stringify({ ...left, updatedAt: "" }) === JSON.stringify({ ...right, updatedAt: "" });
}

export function readLocalSaveData(storage: Pick<Storage, "getItem"> = window.localStorage): CloudSaveData {
  const bestDay = Number(storage.getItem(LOCAL_KEYS.bestDay));
  return normalizeCloudSave({
    updatedAt: storage.getItem(LOCAL_KEYS.cloudMeta),
    bestDay: Number.isFinite(bestDay) ? bestDay : 0,
    progress: parseJson(storage.getItem(LOCAL_KEYS.progress)),
    seenZombies: parseJson(storage.getItem(LOCAL_KEYS.seenZombies)),
    clearedLevels: parseJson(storage.getItem(LOCAL_KEYS.clearedLevels)),
    clearedExplorationTasks: parseJson(storage.getItem(LOCAL_KEYS.clearedExplorationTasks)),
  });
}

export function writeLocalSaveData(
  saveValue: unknown,
  storage: Storage = window.localStorage,
  dispatchChange = true,
): CloudSaveData {
  const save = normalizeCloudSave(saveValue);
  if (save.bestDay > 0) storage.setItem(LOCAL_KEYS.bestDay, String(save.bestDay));
  else storage.removeItem(LOCAL_KEYS.bestDay);
  if (save.progress) storage.setItem(LOCAL_KEYS.progress, JSON.stringify(save.progress));
  else storage.removeItem(LOCAL_KEYS.progress);
  storage.setItem(LOCAL_KEYS.seenZombies, JSON.stringify(save.seenZombies));
  storage.setItem(LOCAL_KEYS.clearedLevels, JSON.stringify(save.clearedLevels));
  storage.setItem(LOCAL_KEYS.clearedExplorationTasks, JSON.stringify(save.clearedExplorationTasks));
  storage.setItem(LOCAL_KEYS.cloudMeta, save.updatedAt);
  if (dispatchChange) notifyLocalSaveChanged(false, storage);
  return save;
}

function serializeSaveOwner(owner: SaveOwner): string {
  return owner.kind === "guest" ? "guest" : `account:${owner.userId}`;
}

function ownerCacheKey(owner: SaveOwner): string {
  return `${OWNER_CACHE_PREFIX}${serializeSaveOwner(owner)}`;
}

export function getActiveSaveOwner(storage: Pick<Storage, "getItem"> = window.localStorage): SaveOwner {
  const stored = storage.getItem(LOCAL_KEYS.activeOwner);
  return stored?.startsWith("account:") ? accountSaveOwner(stored.slice("account:".length)) : GUEST_SAVE_OWNER;
}

export function cacheActiveLocalSave(storage: Storage = window.localStorage): CloudSaveData {
  const save = readLocalSaveData(storage);
  storage.setItem(ownerCacheKey(getActiveSaveOwner(storage)), JSON.stringify(save));
  return save;
}

export function readOwnerSave(owner: SaveOwner, storage: Pick<Storage, "getItem"> = window.localStorage): CloudSaveData | null {
  const cached = parseJson(storage.getItem(ownerCacheKey(owner)));
  return cached ? normalizeCloudSave(cached) : null;
}

export function activateSaveOwner(
  owner: SaveOwner,
  saveValue: unknown,
  storage: Storage = window.localStorage,
): CloudSaveData {
  const save = normalizeCloudSave(saveValue);
  storage.setItem(LOCAL_KEYS.activeOwner, serializeSaveOwner(owner));
  storage.setItem(ownerCacheKey(owner), JSON.stringify(save));
  return writeLocalSaveData(save, storage, false);
}

export function guestMigrationOwner(storage: Pick<Storage, "getItem"> = window.localStorage): string | null {
  return storage.getItem(LOCAL_KEYS.guestMigratedTo);
}

export function markGuestSaveMigrated(userId: string, storage: Pick<Storage, "setItem"> = window.localStorage) {
  storage.setItem(LOCAL_KEYS.guestMigratedTo, userId);
}

/** Called after any existing game save write so the signed-in account can autosync. */
export function notifyLocalSaveChanged(touchTimestamp = true, storage: Pick<Storage, "setItem"> = window.localStorage) {
  if (typeof window === "undefined") return;
  if (touchTimestamp) storage.setItem(LOCAL_KEYS.cloudMeta, new Date().toISOString());
  window.dispatchEvent(new Event(LOCAL_SAVE_CHANGED_EVENT));
}
