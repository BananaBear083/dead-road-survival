import assert from "node:assert/strict";
import test from "node:test";

import {
  drawRecruit,
  FREE_RECRUIT_ROLES,
  isCompleteLineup,
  LEAGUE_STAGES,
  MANAGER_PLAYERS,
  MANAGER_TEAMS,
  majorReward,
  nextLeaguePosition,
  recruitBandFromRoll,
  recruitPool,
  roleFitsSlot,
  stageReward,
} from "../app/cs2Manager.ts";

test("VRS snapshot contains exactly 31 teams and five sourced portraits per team", () => {
  assert.equal(MANAGER_TEAMS.length, 31);
  assert.equal(MANAGER_PLAYERS.length, 155);
  assert.deepEqual(MANAGER_TEAMS.map((team) => team.rank), Array.from({ length: 31 }, (_, index) => index + 1));
  for (const team of MANAGER_TEAMS) {
    assert.equal(team.players.length, 5);
    assert.ok(team.logo.startsWith("https://img-cdn.hltv.org/"));
    for (const player of team.players) {
      assert.ok(player.portrait.startsWith("https://img-cdn.hltv.org/playerbodyshot/"));
      assert.ok(player.profile.startsWith("https://www.hltv.org/player/"));
    }
  }
});

test("recruit probability boundaries match the requested 55/30/10/5 split", () => {
  assert.deepEqual(recruitBandFromRoll(0), [20, 31]);
  assert.deepEqual(recruitBandFromRoll(0.549999), [20, 31]);
  assert.deepEqual(recruitBandFromRoll(0.55), [10, 19]);
  assert.deepEqual(recruitBandFromRoll(0.849999), [10, 19]);
  assert.deepEqual(recruitBandFromRoll(0.85), [5, 9]);
  assert.deepEqual(recruitBandFromRoll(0.949999), [5, 9]);
  assert.deepEqual(recruitBandFromRoll(0.95), [1, 4]);
});

test("an exhausted recruit band never falls through into another probability tier", () => {
  const bandPlayers = recruitPool(0.96);
  assert.ok(bandPlayers.length > 0);
  assert.equal(recruitPool(0.96, undefined, bandPlayers.map((player) => player.id)).length, 0);
});

test("first five recruits can be forced into exactly one IGL, two rifles, one AWP and one flex", () => {
  const drawn = FREE_RECRUIT_ROLES.map((role, index) => drawRecruit(0.1, index / 5, role));
  assert.deepEqual(drawn.map((player) => player?.role), ["igl", "rifle", "rifle", "awp", "flex"]);
  assert.equal(new Set(drawn.map((player) => player?.id)).size, 5);
  assert.equal(roleFitsSlot(drawn[0].role, "igl"), true);
  assert.equal(roleFitsSlot(drawn[3].role, "rifle1"), false);
});

test("lineup completion requires all five fixed slots", () => {
  assert.equal(isCompleteLineup({}), false);
  assert.equal(isCompleteLineup({ igl: "a", rifle1: "b", rifle2: "c", awp: "d" }), false);
  assert.equal(isCompleteLineup({ igl: "a", rifle1: "b", rifle2: "c", awp: "d", flex: "e" }), true);
});

test("a loss skips the rest of the current tournament while wins advance in order", () => {
  assert.deepEqual(nextLeaguePosition(0, 0, true), { stageIndex: 0, opponentIndex: 1, seasonComplete: false });
  assert.deepEqual(nextLeaguePosition(0, 1, false), { stageIndex: 1, opponentIndex: 0, seasonComplete: false });
  assert.deepEqual(nextLeaguePosition(4, LEAGUE_STAGES[4].ranks.length - 1, true), {
    stageIndex: 5,
    opponentIndex: 0,
    seasonComplete: false,
  });
  assert.deepEqual(nextLeaguePosition(5, 1, false), { stageIndex: 0, opponentIndex: 0, seasonComplete: true });
});

test("event and Major rewards use the requested amounts", () => {
  assert.equal(stageReward(0, 0), 50_000);
  assert.equal(stageReward(1, 3), 50_000);
  assert.equal(stageReward(2, 5), 50_000);
  assert.equal(stageReward(3, 0), 150_000);
  assert.equal(stageReward(4, 4), 150_000);
  assert.deepEqual([0, 1, 2, 3].map(majorReward), [300_000, 400_000, 500_000, 1_000_000]);
});
