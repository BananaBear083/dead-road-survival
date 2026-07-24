export type DailyIncomeSettlement = {
  targetTotal: number;
  bonus: number;
};

/**
 * 生存模式每天每名玩家的总金币收入区间。
 * 第 15 天仍属于中间档，第 16 天起进入最高档。
 */
export function dailyIncomeBand(day: number): [number, number] {
  const normalizedDay = Math.max(1, Math.floor(day));
  return normalizedDay <= 7
    ? [1400, 1500]
    : normalizedDay <= 15
      ? [2300, 2400]
      : [3200, 3300];
}

/** 击杀阶段先发放当天收入档下限的一半，剩余部分在通关时补足。 */
export function dailyKillBudget(day: number): number {
  const [minimum] = dailyIncomeBand(day);
  return minimum / 2;
}

/** 将每名玩家的当日击杀所得分别限制在击杀预算内。 */
export function cappedDailyKillReward(
  day: number,
  dayKillCoins: number,
  rawReward: number,
): number {
  const remainingBudget = Math.max(
    0,
    dailyKillBudget(day) - Math.max(0, Math.floor(dayKillCoins)),
  );
  return Math.min(
    remainingBudget,
    Math.max(0, Math.floor(rawReward)),
  );
}

/** 按单个玩家当天的击杀所得，独立计算该玩家的通关补足奖励。 */
export function settleDailyIncome(
  day: number,
  dayKillCoins: number,
  randomValue = Math.random(),
): DailyIncomeSettlement {
  const [minimum, maximum] = dailyIncomeBand(day);
  const roll = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(1, randomValue))
    : 0;
  const targetTotal = Math.round(minimum + roll * (maximum - minimum));
  const earnedFromKills = Math.max(0, Math.floor(dayKillCoins));
  return {
    targetTotal,
    bonus: Math.max(0, targetTotal - earnedFromKills),
  };
}
