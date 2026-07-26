import rawTeams from "./cs2-vrs-top31.json" with { type: "json" };

export type PlayerRole = "igl" | "rifle" | "awp" | "flex";
export type LineupSlot = "igl" | "rifle1" | "rifle2" | "awp" | "flex";

export type PlayerStats = {
  firepower: number;
  awareness: number;
  reaction: number;
  utility: number;
  tactics: number;
};

export type ManagerPlayer = {
  id: string;
  nickname: string;
  fullName: string;
  country: string;
  portrait: string;
  profile: string;
  teamName: string;
  teamRank: number;
  role: PlayerRole;
  stats: PlayerStats;
};

export type ManagerTeam = {
  rank: number;
  name: string;
  country: string;
  region: string;
  points: number;
  logo: string;
  teamProfile: string;
  players: ManagerPlayer[];
  power: number;
};

export type LeagueStage = {
  id: string;
  name: string;
  shortName: string;
  ranks: number[];
  reward: number;
  rounds?: string[];
};

export const ROLE_LABELS: Record<PlayerRole, string> = {
  igl: "指挥",
  rifle: "步枪手",
  awp: "狙击手",
  flex: "自由人",
};

export const SLOT_LABELS: Record<LineupSlot, string> = {
  igl: "指挥位",
  rifle1: "步枪位 A",
  rifle2: "步枪位 B",
  awp: "狙击位",
  flex: "自由人位",
};

export const SLOT_ROLE: Record<LineupSlot, PlayerRole> = {
  igl: "igl",
  rifle1: "rifle",
  rifle2: "rifle",
  awp: "awp",
  flex: "flex",
};

export const LINEUP_SLOTS = Object.keys(SLOT_ROLE) as LineupSlot[];
export const FREE_RECRUIT_ROLES: PlayerRole[] = ["igl", "rifle", "rifle", "awp", "flex"];
export const RECRUIT_COST = 100_000;

export const LEAGUE_STAGES: LeagueStage[] = [
  { id: "challenger", name: "ESL Challenger", shortName: "CHALLENGER", ranks: [31, 30, 29, 28], reward: 50_000 },
  { id: "cct", name: "CCT 线下赛", shortName: "CCT LAN", ranks: [27, 26, 25, 24], reward: 50_000 },
  { id: "rmr", name: "RMR 资格赛", shortName: "RMR", ranks: [23, 22, 21, 20, 19, 18], reward: 50_000 },
  { id: "blast", name: "BLAST Premier", shortName: "BLAST", ranks: [17, 16, 15, 14, 13, 12, 11, 10], reward: 150_000 },
  { id: "epl", name: "ESL Pro League", shortName: "EPL", ranks: [9, 8, 7, 6, 5], reward: 150_000 },
  {
    id: "major",
    name: "Major 锦标赛",
    shortName: "MAJOR",
    ranks: [4, 3, 2, 1],
    reward: 0,
    rounds: ["8 强赛", "4 强赛", "半决赛", "决赛"],
  },
];

const TEAM_COUNTRIES: Record<string, string> = {
  Spirit: "俄罗斯",
  Falcons: "沙特阿拉伯",
  Vitality: "法国",
  "Natus Vincere": "乌克兰",
  FURIA: "巴西",
  MOUZ: "德国",
  Legacy: "巴西",
  Aurora: "土耳其",
  G2: "国际纵队",
  BetBoom: "俄罗斯",
  FUT: "土耳其",
  "9z": "阿根廷",
  "The MongolZ": "蒙古",
  B8: "乌克兰",
  Astralis: "丹麦",
  GamerLegion: "德国",
  Monte: "乌克兰",
  MIBR: "巴西",
  PARIVISION: "俄罗斯",
  magic: "俄罗斯",
  paiN: "巴西",
  TYLOO: "中国",
  FaZe: "国际纵队",
  M80: "美国",
  "Inner Circle": "乌克兰",
  BIG: "德国",
  Alliance: "瑞典",
  "Ninjas in Pyjamas": "瑞典",
  "Lynn Vision": "中国",
  Wildcard: "美国",
  Sharks: "巴西",
};

// Each entry follows the five-player order in Valve's 2026-07-06 VRS snapshot.
// Public roles are mapped into this game's fixed five-slot system; hybrid roles use
// the position that makes the real roster's tactical shape translate most closely.
const TEAM_ROLE_ORDER: Record<string, PlayerRole[]> = {
  Spirit: ["awp", "igl", "rifle", "flex", "rifle"],
  Falcons: ["igl", "rifle", "flex", "awp", "rifle"],
  Vitality: ["igl", "flex", "awp", "rifle", "rifle"],
  "Natus Vincere": ["igl", "rifle", "rifle", "awp", "flex"],
  FURIA: ["igl", "rifle", "rifle", "flex", "awp"],
  MOUZ: ["awp", "flex", "rifle", "rifle", "igl"],
  Legacy: ["igl", "rifle", "flex", "rifle", "awp"],
  Aurora: ["igl", "rifle", "awp", "flex", "rifle"],
  G2: ["igl", "flex", "awp", "rifle", "rifle"],
  BetBoom: ["igl", "awp", "flex", "rifle", "rifle"],
  FUT: ["rifle", "rifle", "flex", "awp", "igl"],
  "9z": ["igl", "flex", "rifle", "awp", "rifle"],
  "The MongolZ": ["igl", "flex", "rifle", "awp", "rifle"],
  B8: ["igl", "rifle", "rifle", "flex", "awp"],
  Astralis: ["igl", "awp", "flex", "rifle", "rifle"],
  GamerLegion: ["igl", "flex", "rifle", "rifle", "awp"],
  Monte: ["igl", "flex", "awp", "rifle", "rifle"],
  MIBR: ["igl", "rifle", "flex", "rifle", "awp"],
  PARIVISION: ["igl", "rifle", "rifle", "awp", "flex"],
  magic: ["igl", "rifle", "awp", "flex", "rifle"],
  paiN: ["flex", "igl", "rifle", "awp", "rifle"],
  TYLOO: ["rifle", "awp", "rifle", "flex", "igl"],
  FaZe: ["rifle", "igl", "awp", "flex", "rifle"],
  M80: ["awp", "rifle", "igl", "rifle", "flex"],
  "Inner Circle": ["igl", "awp", "rifle", "flex", "rifle"],
  BIG: ["igl", "rifle", "rifle", "flex", "awp"],
  Alliance: ["igl", "awp", "flex", "rifle", "rifle"],
  "Ninjas in Pyjamas": ["igl", "rifle", "flex", "rifle", "awp"],
  "Lynn Vision": ["rifle", "awp", "rifle", "flex", "igl"],
  Wildcard: ["igl", "awp", "rifle", "rifle", "flex"],
  Sharks: ["awp", "flex", "rifle", "rifle", "igl"],
};

function clamp(value: number, min = 60, max = 99) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function nicknameHash(nickname: string) {
  return [...nickname].reduce((total, char, index) => total + char.charCodeAt(0) * (index + 3), 17);
}

export function statsForPlayer(rank: number, nickname: string, role: PlayerRole): PlayerStats {
  const seed = nicknameHash(nickname);
  const base = 71 + (32 - rank) * 0.72;
  const variance = (offset: number) => ((seed >> offset) % 7) - 3;
  return {
    firepower: clamp(base + variance(0) + (role === "rifle" || role === "awp" ? 3 : 0)),
    awareness: clamp(base + variance(2) + (role === "flex" ? 4 : role === "igl" ? 3 : 0)),
    reaction: clamp(base + variance(4) + (role === "awp" ? 4 : role === "rifle" ? 2 : 0)),
    utility: clamp(base + variance(6) + (role === "igl" ? 4 : role === "flex" ? 3 : 0)),
    tactics: role === "igl" ? clamp(base + variance(8) + 5) : 0,
  };
}

export function playerPower(player: ManagerPlayer) {
  const { firepower, awareness, reaction, utility, tactics } = player.stats;
  return firepower + awareness + reaction + utility + tactics;
}

export function lineupPower(players: ManagerPlayer[]) {
  return players.reduce((total, player) => total + playerPower(player), 0);
}

export const MANAGER_TEAMS: ManagerTeam[] = rawTeams.map((team) => {
  const roles = TEAM_ROLE_ORDER[team.name];
  const players = team.players.map((player, index): ManagerPlayer => {
    const role = roles[index];
    return {
      ...player,
      id: `${team.rank}-${player.nickname.toLowerCase()}`,
      profile: `https://www.hltv.org${player.profile}`,
      teamName: team.name,
      teamRank: team.rank,
      role,
      stats: statsForPlayer(team.rank, player.nickname, role),
    };
  });
  return {
    ...team,
    country: TEAM_COUNTRIES[team.name] ?? team.region,
    teamProfile: `https://www.hltv.org${team.teamProfile}`,
    players,
    power: lineupPower(players),
  };
});

export const MANAGER_PLAYERS = MANAGER_TEAMS.flatMap((team) => team.players);

export function recruitBandFromRoll(roll: number): [number, number] {
  if (roll < 0.55) return [20, 31];
  if (roll < 0.85) return [10, 19];
  if (roll < 0.95) return [5, 9];
  return [1, 4];
}

export function recruitPool(roll: number, role?: PlayerRole, excludedIds: string[] = []) {
  const [minimumRank, maximumRank] = recruitBandFromRoll(roll);
  const excluded = new Set(excludedIds);
  return MANAGER_PLAYERS.filter(
    (player) =>
      player.teamRank >= minimumRank &&
      player.teamRank <= maximumRank &&
      (!role || player.role === role) &&
      !excluded.has(player.id),
  );
}

export function drawRecruit(
  bandRoll: number,
  playerRoll: number,
  role?: PlayerRole,
  excludedIds: string[] = [],
) {
  const pool = recruitPool(bandRoll, role, excludedIds);
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, playerRoll) * pool.length))];
}

export function majorReward(roundIndex: number) {
  return [300_000, 400_000, 500_000, 1_000_000][roundIndex] ?? 0;
}

export function stageReward(stageIndex: number, opponentIndex: number) {
  const stage = LEAGUE_STAGES[stageIndex];
  return stage.id === "major" ? majorReward(opponentIndex) : stage.reward;
}

export function nextLeaguePosition(stageIndex: number, opponentIndex: number, won: boolean) {
  const stage = LEAGUE_STAGES[stageIndex];
  if (!won) {
    if (stageIndex === LEAGUE_STAGES.length - 1) return { stageIndex: 0, opponentIndex: 0, seasonComplete: true };
    return { stageIndex: stageIndex + 1, opponentIndex: 0, seasonComplete: false };
  }
  if (opponentIndex + 1 < stage.ranks.length) {
    return { stageIndex, opponentIndex: opponentIndex + 1, seasonComplete: false };
  }
  if (stageIndex === LEAGUE_STAGES.length - 1) return { stageIndex: 0, opponentIndex: 0, seasonComplete: true };
  return { stageIndex: stageIndex + 1, opponentIndex: 0, seasonComplete: false };
}

export function roleFitsSlot(role: PlayerRole, slot: LineupSlot) {
  return SLOT_ROLE[slot] === role;
}

export function isCompleteLineup(lineup: Partial<Record<LineupSlot, string>>) {
  return LINEUP_SLOTS.every((slot) => Boolean(lineup[slot]));
}

export function formatCoins(coins: number) {
  return new Intl.NumberFormat("zh-CN").format(coins);
}
