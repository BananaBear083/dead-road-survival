import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  cappedDailyKillReward,
  dailyIncomeBand,
  dailyKillBudget,
  settleDailyIncome,
} from "../app/survivalEconomy.ts";

test("生存模式每日金币区间在第 7、8、15、16 天正确切换", () => {
  assert.deepEqual(dailyIncomeBand(1), [1400, 1500]);
  assert.deepEqual(dailyIncomeBand(7), [1400, 1500]);
  assert.deepEqual(dailyIncomeBand(8), [2300, 2400]);
  assert.deepEqual(dailyIncomeBand(15), [2300, 2400]);
  assert.deepEqual(dailyIncomeBand(16), [3200, 3300]);
  assert.deepEqual(dailyIncomeBand(99), [3200, 3300]);
});

test("击杀金币预算保持为各收入档下限的一半", () => {
  assert.equal(dailyKillBudget(1), 700);
  assert.equal(dailyKillBudget(7), 700);
  assert.equal(dailyKillBudget(8), 1150);
  assert.equal(dailyKillBudget(15), 1150);
  assert.equal(dailyKillBudget(16), 1600);
});

test("每名玩家的击杀金币分别封顶，避免极高天数或击杀不均突破日收入上限", () => {
  assert.equal(cappedDailyKillReward(1, 690, 25), 10);
  assert.equal(cappedDailyKillReward(1, 700, 25), 0);
  assert.equal(cappedDailyKillReward(8, 1140, 25), 10);
  assert.equal(cappedDailyKillReward(16, 1590, 25), 10);
});

test("结算奖励把每个钱包分别补足到各自当天目标", () => {
  const p1 = settleDailyIncome(8, 625, 0);
  const p2 = settleDailyIncome(8, 410, 1);

  assert.deepEqual(p1, { targetTotal: 2300, bonus: 1675 });
  assert.deepEqual(p2, { targetTotal: 2400, bonus: 1990 });
  assert.equal(625 + p1.bonus, 2300);
  assert.equal(410 + p2.bonus, 2400);
});

test("结算随机值会被限制在收入区间端点内", () => {
  assert.deepEqual(settleDailyIncome(16, 1000, -5), {
    targetTotal: 3200,
    bonus: 2200,
  });
  assert.deepEqual(settleDailyIncome(16, 1000, 5), {
    targetTotal: 3300,
    bonus: 2300,
  });
});

test("双人通关时为 P1、P2 分别按各自击杀所得结算", async () => {
  const source = await readFile(
    new URL("../app/DeadRoadGame.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /for \(const slot of \(g\.coOp \? \[1, 2\] : \[1\]\) as PlayerSlot\[\]\)/,
  );
  assert.match(
    source,
    /settleDailyIncome\(g\.day, dayKillCoinsForSlot\(g, slot\)\)/,
  );
  assert.match(source, /addCoinsForSlot\(g, slot, bonus\)/);
  assert.match(
    source,
    /cappedDailyKillReward\(g\.day, dayKillCoinsForSlot\(g, rewardOwner\), rawCoinGain\)/,
  );
});

test("新预算只用于生存模式，靶场保留原来的 460 击杀预算", async () => {
  const source = await readFile(
    new URL("../app/DeadRoadGame.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const killBudget = g\.mode === "survival" \? dailyKillBudget\(g\.day\) : 460;/,
  );
});
