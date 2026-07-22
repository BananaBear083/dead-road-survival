"use client";

/* eslint-disable react-hooks/immutability -- the canvas game loop intentionally uses mutable refs */

import { useCallback, useEffect, useRef, useState } from "react";

import { AccountControl } from "./account/AccountControl";
import { notifyLocalSaveChanged } from "./account/saveData";
import { soundManager as sound } from "./sound";

// 世界高度恒定 720 单位；世界宽度动态化：画布位图跟随舞台实际宽高比（宽 = 720 × 实际比例），
// 位图比例与容器恒等 → 任何屏幕比例下满屏、无黑边、无拉伸（不夹取，极端窄屏改由 HUD 缩放兜底）。
// DEFAULT 仅作首帧前初始值，实际宽度存于 GameState.worldW，resize 时由 ResizeObserver 更新并按比重映射实体。
const DEFAULT_WORLD_W = 1280;
const H = 720;
const ROAD_TOP = 160;
const ROAD_BOTTOM = 650;
const SAVE_KEY = "dead-road-best-day";
const ZOMBIE_FALL_MS = 480;
const ZOMBIE_RECOVER_MS = 860;
const ZOMBIE_DEATH_FALL_MS = 1050;
const ZOMBIE_CORPSE_MS = 10000;
const GROUND_PROP_MS = 10000;
const MAX_GROUND_PROPS = 60;
const BLOOD_STAIN_MS = 10000;
const MAX_BLOOD_STAINS = 60;

type MajorMode = "classic" | "exploration";
type Screen = "menu" | "exploration" | "playing" | "shop" | "loadout" | "gameover" | "codex" | "levels" | "levelComplete" | "lottery";
type GameMode = "survival" | "range" | "level";
type ShopTab = "weapons" | "armor" | "supplies" | "items" | "partners" | "zombies";
type CodexCategory = "regular" | "special";
type LotteryRarity = "common" | "rare" | "epic" | "legendary";
type LotteryPhase = "idle" | "firing" | "flash" | "reveal";
type WeaponKey =
  | "glock17" | "m1911" | "pkm" | "fruitknife" | "combatknife" | "crowbar"
  | "hammer" | "fireaxe" | "baseballbat" | "sawedoff"
  | "mac11" | "mp5k" | "ak47" | "m4" | "m16" | "scarh"
  | "saiga12" | "rem870" | "awm" | "m107" | "flint66" | "m240l" | "mg42"
  | "rpg7" | "m32" | "gatling" | "fists";

type Weapon = {
  key: WeaponKey;
  name: string;
  price: number;
  damage: number;
  fireRate: number;
  magazine: number;
  reload: number;
  range: number;
  color: string;
  description: string;
  caliber: string;
  pellets?: number;
  spread?: number;
  explosionRadius?: number;
  blastKind?: "rocket" | "grenade";
  penetration?: number;
  automatic?: boolean;
  /** 新增枪械按详情标称伤害直接结算，不再重复套用旧武器的历史平衡倍率。 */
  usesListedDamage?: boolean;
  /** 磷燃弹：命中点燃目标，持续灼烧直至死亡 */
  ignite?: boolean;
};

const WEAPONS: Record<WeaponKey, Weapon> = {
  glock17: {
    key: "glock17",
    name: "Glock 17",
    price: 0,
    damage: 21,
    fireRate: 185,
    magazine: 17,
    reload: 1120,
    range: 820,
    color: "#f4c542",
    description: "标准单发制式手枪，可靠且易于操控",
    caliber: "9×19mm · 17 发",
  },
  m1911: {
    key: "m1911", name: "M1911", price: 390, damage: 46, fireRate: 245,
    magazine: 7, reload: 1260, range: 900, color: "#c8b28c",
    description: "经典大口径手枪，单发伤害出色", caliber: ".45 ACP · 7 发",
  },
  pkm: {
    key: "pkm", name: "PKM", price: 23200, damage: 57, fireRate: 92,
    magazine: 100, reload: 3050, range: 1250, color: "#9a7b4d",
    description: "木质枪托通用机枪，百发弹链提供强力持续压制", caliber: "7.62×54mmR · 100 发", spread: .048, automatic: true,
  },
  fruitknife: {
    key: "fruitknife",
    name: "水果刀",
    price: 0,
    damage: 34,
    fireRate: 360,
    magazine: 1,
    reload: 0,
    range: 92,
    color: "#d9e1d0",
    description: "轻便备用刀具，近身攻击不消耗弹药",
    caliber: "近战 · 无限",
  },
  baseballbat: {
    key: "baseballbat",
    name: "实木球棒",
    price: 800,
    damage: 68,
    fireRate: 690,
    magazine: 1,
    reload: 0,
    range: 148,
    color: "#c18a54",
    description: "双手大幅挥击，伤害与击退高于短刀",
    caliber: "重型近战 · 无限",
  },
  crowbar: {
    key: "crowbar", name: "撬棍", price: 300, damage: 76, fireRate: 720,
    magazine: 1, reload: 0, range: 154, color: "#a83935",
    description: "弯头钢制撬棍，挥击稳定并具有较强击退", caliber: "重型近战 · 无限",
  },
  combatknife: {
    key: "combatknife", name: "战斗刀", price: 1100, damage: 56, fireRate: 320,
    magazine: 1, reload: 0, range: 116, color: "#9fb2a0",
    description: "带护手的全尺寸战斗刀，刺击速度快、距离更远", caliber: "短刀近战 · 无限",
  },
  hammer: {
    key: "hammer", name: "锤子", price: 1200, damage: 108, fireRate: 840,
    magazine: 1, reload: 0, range: 142, color: "#9b7650",
    description: "双手抡击的重型锤，单次伤害和硬直更高", caliber: "重型近战 · 无限",
  },
  fireaxe: {
    key: "fireaxe", name: "消防斧", price: 3700, damage: 158, fireRate: 980,
    magazine: 1, reload: 0, range: 168, color: "#dc3f34",
    description: "长柄破拆斧，挥击缓慢但拥有极高伤害", caliber: "重型近战 · 无限",
  },
  sawedoff: {
    key: "sawedoff", name: "短截霰弹枪", price: 0, damage: 24, fireRate: 650,
    magazine: 2, reload: 1480, range: 420, color: "#d28a4c",
    description: "开局副武器，双发近距离霰弹", caliber: "12 Gauge · 2 发", pellets: 8, spread: .27,
  },
  mp5k: {
    key: "mp5k",
    name: "MP5K",
    price: 4200,
    damage: 25,
    fireRate: 86,
    magazine: 30,
    reload: 1280,
    range: 890,
    color: "#6fc9b8",
    description: "紧凑冲锋枪，稳定且弹匣容量大",
    caliber: "9×19mm · 30 发",
    automatic: true,
  },
  mac11: {
    key: "mac11", name: "MAC-11", price: 1100, damage: 17, fireRate: 55,
    magazine: 32, reload: 1320, range: 720, color: "#d4bd75",
    description: "极高射速微型冲锋枪，近战火力凶猛", caliber: ".380 ACP · 32 发", spread: .075, automatic: true,
  },
  ak47: {
    key: "ak47",
    name: "AK-47",
    price: 6600,
    damage: 43,
    fireRate: 132,
    magazine: 30,
    reload: 1510,
    range: 1080,
    color: "#e58a45",
    description: "大威力突击步枪，后坐力更明显",
    caliber: "7.62×39mm · 30 发",
    spread: 0.055,
    automatic: true,
  },
  m4: {
    key: "m4", name: "M4", price: 7800, damage: 34, fireRate: 86,
    magazine: 30, reload: 1450, range: 1110, color: "#91ad8a",
    description: "紧凑型军用卡宾枪，操控灵活、连射稳定", caliber: "5.56×45mm · 30 发", spread: .025, automatic: true, usesListedDamage: true,
  },
  m16: {
    key: "m16", name: "M16", price: 10800, damage: 36, fireRate: 98,
    magazine: 30, reload: 1420, range: 1180, color: "#86a58c",
    description: "精准轻后坐力步枪，适合中远距离", caliber: "5.56×45mm · 30 发", spread: .022, automatic: true,
  },
  scarh: {
    key: "scarh", name: "SCAR-H", price: 14000, damage: 54, fireRate: 145,
    magazine: 20, reload: 1580, range: 1220, color: "#c49b61",
    description: "重型战斗步枪，威力与精度兼备", caliber: "7.62×51mm · 20 发", spread: .028, automatic: true,
  },
  saiga12: {
    key: "saiga12",
    name: "Saiga-12",
    price: 4200,
    damage: 22,
    fireRate: 360,
    magazine: 8,
    reload: 1740,
    range: 540,
    color: "#ef473f",
    description: "半自动战斗霰弹枪，近距离毁灭尸群",
    caliber: "12 Gauge · 8 发",
    pellets: 8,
    spread: 0.22,
  },
  rem870: {
    key: "rem870", name: "雷明顿 870", price: 700, damage: 28, fireRate: 720,
    magazine: 7, reload: 1850, range: 520, color: "#b06c3d",
    description: "泵动霰弹枪，一次射击横扫近距离", caliber: "12 Gauge · 7 发", pellets: 9, spread: .25,
  },
  awm: {
    key: "awm", name: "AWM", price: 9500, damage: 235, fireRate: 980,
    magazine: 5, reload: 2150, range: 1450, color: "#7f9c75",
    description: "远程重型狙击枪，可贯穿多个目标", caliber: ".338 Lapua · 5 发", spread: .006, penetration: 3,
  },
  m107: {
    key: "m107", name: "Barrett M107", price: 14500, damage: 200, fireRate: 720,
    magazine: 10, reload: 2600, range: 1550, color: "#879178",
    description: "半自动反器材狙击枪，强制动力与五目标穿透", caliber: ".50 BMG · 10 发", spread: .005, penetration: 5, usesListedDamage: true,
  },
  flint66: {
    key: "flint66", name: "燧石66", price: 15000, damage: 50, fireRate: 750,
    magazine: 10, reload: 2400, range: 1500, color: "#c96f3b",
    description: "栓动重型狙击枪，磷燃穿甲弹贯穿整列尸群，命中即点燃（格挡也挡不住灼烧），灼烧直至死亡",
    caliber: "12.7 磷燃穿甲 · 10 发", spread: .004, penetration: 15, ignite: true,
  },
  m240l: {
    key: "m240l", name: "M240L", price: 24000, damage: 49, fireRate: 88,
    magazine: 100, reload: 2850, range: 1180, color: "#768b61",
    description: "通用机枪，百发弹链持续压制尸潮", caliber: "7.62×51mm · 100 发", spread: .052, automatic: true,
  },
  mg42: {
    key: "mg42", name: "MG42", price: 26000, damage: 40, fireRate: 50,
    magazine: 100, reload: 3300, range: 1280, color: "#968767",
    description: "高射速通用机枪，1200 发/分并可连续穿透两个目标", caliber: "7.92×57mm · 100 发", spread: .058, penetration: 2, automatic: true, usesListedDamage: true,
  },
  rpg7: {
    key: "rpg7", name: "RPG-7", price: 25000, damage: 310, fireRate: 1350,
    magazine: 1, reload: 2650, range: 1080, color: "#9b8f58",
    description: "火箭弹造成大范围爆炸伤害", caliber: "PG-7V · 1 发", spread: .012, explosionRadius: 175, blastKind: "rocket",
  },
  m32: {
    key: "m32", name: "M32 榴弹发射器", price: 30000, damage: 145, fireRate: 440,
    magazine: 6, reload: 3100, range: 820, color: "#b7904f",
    description: "六连发榴弹发射器，快速覆盖尸群", caliber: "40×46mm · 6 发", spread: .025, explosionRadius: 118, blastKind: "grenade",
  },
  gatling: {
    key: "gatling", name: "加特林", price: 25000, damage: 32, fireRate: 42,
    magazine: 180, reload: 3600, range: 1120, color: "#d69b4b",
    description: "旋转多管机枪，以极致射速封锁公路", caliber: "7.62mm · 180 发", spread: .065, automatic: true,
  },
  // 拳脚：关卡模式专用（徒手开局/丢弃武器后的兜底），极弱拳击；不进商店、不进装备整备
  fists: {
    key: "fists", name: "拳脚", price: 0, damage: 9, fireRate: 380,
    magazine: 1, reload: 0, range: 88, color: "#9aa39b",
    description: "赤手空拳，聊胜于无", caliber: "徒手",
  },
};

const KNIFE_WEAPONS = new Set<WeaponKey>(["fruitknife", "combatknife"]);
const HEAVY_MELEE_WEAPONS = new Set<WeaponKey>(["baseballbat", "crowbar", "hammer", "fireaxe"]);
const MELEE_WEAPONS = new Set<WeaponKey>([...KNIFE_WEAPONS, ...HEAVY_MELEE_WEAPONS, "fists"]);
// 近战攻击全动作时长（重型武器上举蓄力更久；绘制与伤害判定共用，避免两处不一致）
function meleeAttackDuration(key: WeaponKey) {
  return key === "fireaxe" ? 760 : key === "hammer" ? 700 : HEAVY_MELEE_WEAPONS.has(key) ? 620 : 430;
}
// 武器操控属性：重量（kg，参考现实）与制动力（0~1，命中僵尸时的减速/击退强度）
// 梯度：霰弹/狙击 > 机枪/重步 > 步枪 > 冲锋枪/手枪；重型近战也有较高制动力；爆炸类由爆炸自身击退负责
const WEAPON_HANDLING: Record<WeaponKey, { weightKg: number; stopping: number }> = {
  glock17: { weightKg: 0.62, stopping: 0.25 }, m1911: { weightKg: 1.1, stopping: 0.4 },
  pkm: { weightKg: 7.5, stopping: 0.5 }, fruitknife: { weightKg: 0.2, stopping: 0.15 },
  combatknife: { weightKg: 0.35, stopping: 0.2 }, crowbar: { weightKg: 2.4, stopping: 0.5 },
  hammer: { weightKg: 1.6, stopping: 0.55 }, fireaxe: { weightKg: 3.2, stopping: 0.65 },
  baseballbat: { weightKg: 1.05, stopping: 0.6 }, sawedoff: { weightKg: 2.6, stopping: 0.85 },
  mac11: { weightKg: 1.6, stopping: 0.2 }, mp5k: { weightKg: 2.5, stopping: 0.25 },
  ak47: { weightKg: 4.3, stopping: 0.45 }, m16: { weightKg: 3.6, stopping: 0.4 },
  m4: { weightKg: 3.1, stopping: 0.4 },
  scarh: { weightKg: 4.5, stopping: 0.55 }, saiga12: { weightKg: 3.8, stopping: 0.75 },
  rem870: { weightKg: 3.6, stopping: 0.85 }, awm: { weightKg: 6.8, stopping: 1 }, m107: { weightKg: 12.9, stopping: 1 },
  flint66: { weightKg: 12, stopping: 1 },
  m240l: { weightKg: 10.9, stopping: 0.5 }, mg42: { weightKg: 11.6, stopping: .5 }, rpg7: { weightKg: 8.6, stopping: 0 },
  m32: { weightKg: 6, stopping: 0 }, gatling: { weightKg: 16.8, stopping: 0.35 },
  fists: { weightKg: 0, stopping: 0.1 },
};
// 平衡：非爆炸武器（枪械+近战）伤害统一 ×0.75；爆炸类 RPG-7/M32 与道具爆炸物保持原值
const BALLISTIC_DAMAGE_FACTOR = 0.75;
// 本轮全模式平衡：所有霰弹枪在现有结算伤害基础上再乘 75%，详情面板与实战共用该函数。
const SHOTGUN_DAMAGE_FACTOR = .75;
// 磷燃弹灼烧：点燃后每秒伤害（持续至目标死亡；普通僵尸 62hp 约 4.4 秒烧死）
const IGNITE_DPS = 14;
function weaponDamage(key: WeaponKey) {
  const spec = WEAPONS[key];
  const baseDamage = spec.explosionRadius || spec.usesListedDamage ? spec.damage : spec.damage * BALLISTIC_DAMAGE_FACTOR;
  return spec.pellets ? baseDamage * SHOTGUN_DAMAGE_FACTOR : baseDamage;
}
// 栓动步枪：每次击发后播放完整拉栓循环（上抬→后拉→前推→下压），时长小于其射速冷却，不改数值
const BOLT_ACTION_WEAPONS = new Set<WeaponKey>(["awm", "flint66"]);
// 拉栓循环时长（ms）：须完整放入各自射速间隔——AWM 620 ⊂ 980；燧石66 480 ⊂ 750（四阶段压缩但清晰可辨）
const BOLT_CYCLE_MS: Partial<Record<WeaponKey, number>> = { awm: 620, flint66: 480 };
function boltCycleMs(key: WeaponKey) {
  return BOLT_CYCLE_MS[key] ?? 620;
}

// 后坐力规格（纯视觉，不影响弹道与伤害）：rise=枪口上跳角（弧度，绕握把），back=枪身后挫（角色局部像素），
// heat=每发累积的连发热度（0~1，约 900ms 冷却完毕；热度放大上跳/后挫并触发机枪系持续抖动）
const WEAPON_RECOIL: Record<WeaponKey, { rise: number; back: number; heat: number }> = {
  glock17: { rise: .055, back: 2.0, heat: .34 }, m1911: { rise: .07, back: 2.6, heat: .4 },
  mp5k: { rise: .032, back: 1.5, heat: .2 }, mac11: { rise: .03, back: 1.4, heat: .18 },
  ak47: { rise: .05, back: 2.4, heat: .26 }, m16: { rise: .042, back: 2.1, heat: .24 },
  m4: { rise: .039, back: 1.9, heat: .22 },
  scarh: { rise: .06, back: 2.8, heat: .3 },
  sawedoff: { rise: .12, back: 4.8, heat: .6 }, rem870: { rise: .11, back: 4.4, heat: .55 }, saiga12: { rise: .09, back: 3.6, heat: .42 },
  awm: { rise: .13, back: 5.0, heat: .7 }, m107: { rise: .14, back: 5.4, heat: .62 },
  flint66: { rise: .11, back: 4.6, heat: .55 },
  pkm: { rise: .036, back: 1.9, heat: .26 }, m240l: { rise: .038, back: 2.0, heat: .26 }, mg42: { rise: .041, back: 2.2, heat: .28 },
  gatling: { rise: .014, back: 1.0, heat: .1 },
  rpg7: { rise: .085, back: 4.2, heat: .55 }, m32: { rise: .06, back: 2.8, heat: .4 },
  fruitknife: { rise: 0, back: 0, heat: 0 }, combatknife: { rise: 0, back: 0, heat: 0 },
  crowbar: { rise: 0, back: 0, heat: 0 }, hammer: { rise: 0, back: 0, heat: 0 },
  fireaxe: { rise: 0, back: 0, heat: 0 }, baseballbat: { rise: 0, back: 0, heat: 0 },
  fists: { rise: 0, back: 0, heat: 0 },
};
// 连发热度冷却时长（ms）：热度越高上跳/后挫越强，停火自然回落
const RECOIL_HEAT_COOL_MS = 900;
// 后坐力脉冲：70ms 快速上跳到峰值，随后 350ms 弹性衰减复位（一次轻微回荡，不过度）
function recoilImpulse(age: number): number {
  if (age < 0 || age >= 420) return 0;
  if (age < 70) return 1 - Math.pow(1 - age / 70, 3);
  const t = (age - 70) / 350;
  return Math.cos(t * Math.PI * 1.55) * Math.pow(1 - t, 2.1);
}

type ArmorKey = "civilian" | "police" | "construction" | "riot" | "army" | "specialforces";
type Armor = {
  key: ArmorKey;
  name: string;
  price: number;
  maxHp: number;
  weightKg: number;
  description: string;
  torso: string;
  sleeves: string;
  pants: string;
  accent: string;
  elbow: string;
  helmet: "none" | "cap" | "hardhat" | "riot" | "combat" | "tactical";
};

const ARMORS: Record<ArmorKey, Armor> = {
  civilian: { key: "civilian", name: "幸存者便装", price: 0, maxHp: 100, weightKg: 1.5, description: "轻便基础服装与鸭舌帽，无额外生命值", torso: "#2f443e", sleeves: "#32483f", pants: "#243230", accent: "#6e857c", elbow: "#5c5648", helmet: "none" },
  police: { key: "police", name: "警服", price: 800, maxHp: 125, weightKg: 4, description: "增加 25 点最大生命值，配有执勤腰带与警帽", torso: "#263952", sleeves: "#2a405c", pants: "#1f2c3c", accent: "#a9b6c2", elbow: "#1c2733", helmet: "cap" },
  construction: { key: "construction", name: "建筑工服", price: 2000, maxHp: 145, weightKg: 5, description: "增加 45 点最大生命值，反光背心与安全帽提高防护", torso: "#c4712f", sleeves: "#3a4f58", pants: "#354247", accent: "#e3c94b", elbow: "#caa92e", helmet: "hardhat" },
  riot: { key: "riot", name: "防爆警察服", price: 4000, maxHp: 180, weightKg: 9, description: "增加 80 点最大生命值，配备硬质胸甲与防暴头盔", torso: "#20262b", sleeves: "#252d33", pants: "#1b2024", accent: "#667785", elbow: "#0f1418", helmet: "riot" },
  army: { key: "army", name: "军队服", price: 6000, maxHp: 220, weightKg: 11, description: "增加 120 点最大生命值，迷彩作战服与插板背心", torso: "#4a5639", sleeves: "#4f5c3f", pants: "#3b4531", accent: "#8f8360", elbow: "#434f36", helmet: "combat" },
  specialforces: { key: "specialforces", name: "特种部队服", price: 9000, maxHp: 270, weightKg: 13, description: "增加 170 点最大生命值，全套战术护甲与头盔", torso: "#161d20", sleeves: "#20292d", pants: "#151b1e", accent: "#536b70", elbow: "#12181b", helmet: "tactical" },
};

const MEDKIT_PRICE = 500;
const MEDKIT_HEAL = 50;

// 每日总收入区间（击杀获取 + 通关结算奖励之和）：1–10 天 900–1200，11–20 天 1900–2300，21 天起 2900–3500
function dailyIncomeBand(day: number): [number, number] {
  return day <= 10 ? [900, 1200] : day <= 20 ? [1900, 2300] : [2900, 3500];
}
// 当日击杀奖励总预算（约为区间下限的一半）：按僵尸数量均摊到每只，通关结算奖励再补足到区间
function dailyKillBudget(day: number): number {
  return day <= 10 ? 460 : day <= 20 ? 950 : 1450;
}
const THROW_FLIGHT_MS = 620;
const FRAG_FUSE_MS = 2000;
const MOLOTOV_BURN_MS = 10000;

// 搭档：购买后每天自动并肩作战，不会死亡、不被僵尸选为目标，只能装备 1 个
type PartnerKey = "hound" | "officer" | "drone";
type Partner = {
  key: PartnerKey;
  name: string;
  price: number;
  description: string;
};
const PARTNERS: Record<PartnerKey, Partner> = {
  hound: { key: "hound", name: "猎犬", price: 2000, description: "忠诚的战斗犬，自主巡猎并扑向僵尸撕咬，将其扑倒约 3 秒" },
  officer: { key: "officer", name: "警察", price: 6000, description: "持 M1911 的幸存警官，自主走位保持中距离射击，弹匣打空后换弹" },
  drone: { key: "drone", name: "ZH501 攻击无人机", price: 15000, description: "悬浮伴随的攻击无人机，机载机枪穿透射击，射击 10 秒后换弹 3 秒" },
};
const PARTNER_KEYS = Object.keys(PARTNERS) as PartnerKey[];
// 搭档战斗数值表（详情面板与逻辑共用）
const HOUND_DAMAGE = 30;
const HOUND_INTERVAL_MS = 3000;
const DRONE_DAMAGE = 80;
const DRONE_INTERVAL_MS = 480;
const DRONE_FIRE_MS = 10000;
const DRONE_RELOAD_MS = 3000;
// 无人机机载机枪后坐力（纯视觉）：小幅整机反冲 + 枪组微仰，热度随 480ms 连射缓慢累积
const DRONE_RECOIL = { rise: .05, back: 1.6, heat: .1 };

// 搭档场上运行时状态（每次进入战斗按玩家位置重置）
type PartnerField = {
  x: number;
  y: number;
  angle: number;
  attackAt: number;
  cycleAt: number;
  reloading: boolean;
  moving: boolean;
  muzzleAt: number;
  /** 射击后坐力：最后一发时刻与连发热度（纯视觉，与玩家同语义） */
  recoilAt: number;
  recoilHeat: number;
  /** 警察 M1911 当前弹匣余弹 */
  ammo: number;
  /** 警察换弹编舞计时（与玩家同字段语义） */
  reloadStartedAt: number;
  reloadingUntil: number;
  /** 自主游走：当前巡逻目标点与下一次换点时间 */
  roamX: number;
  roamY: number;
  nextRoamAt: number;
};
function freshPartnerField(x = 170, y = 440): PartnerField {
  return {
    x, y, angle: 0, attackAt: 0, cycleAt: 0, reloading: false, moving: false, muzzleAt: 0,
    recoilAt: 0, recoilHeat: 0,
    ammo: WEAPONS.m1911.magazine, reloadStartedAt: 0, reloadingUntil: 0,
    roamX: x, roamY: y, nextRoamAt: 0,
  };
}

// 携带总重量（主副武器 + 近战 + 战斗服）与移速系数：
// speedFactor = max(0.72, 1 - 0.007 × (总重kg - 5))——轻装 5kg 以内 100%，每多 1kg 减 0.7%，全重装（约 40kg）≈ 75%
function carriedWeightKg(g: GameState) {
  return WEAPON_HANDLING[g.loadout[0]].weightKg + WEAPON_HANDLING[g.loadout[1]].weightKg
    + WEAPON_HANDLING[g.melee].weightKg + ARMORS[g.armor].weightKg;
}
function playerSpeedFactor(g: GameState) {
  return Math.max(0.72, Math.min(1, 1 - 0.007 * (carriedWeightKg(g) - 5)));
}

type ItemKey = "molotov" | "barricade" | "frag" | "claymore" | "flashbang" | "airstrike" | "impact";
type ItemDelivery = "throw" | "place" | "auto";
type BlastKind = "frag" | "airstrike" | "claymore" | "rocket" | "grenade";
type ItemDefinition = {
  key: ItemKey;
  name: string;
  price: number;
  hotkey: string;
  color: string;
  description: string;
  delivery: ItemDelivery;
  deployDelay: number | null;
  lifetime: number | null;
  blastKind?: BlastKind;
  /** 碰炸引信：投掷飞行中直接命中僵尸立即起爆（不等落地） */
  impactFuse?: boolean;
  blastDuration: number;
  cleanupDelay: number | null;
  radius: number;
  damage: number;
  particleCount: number;
  shakeMs: number;
};

const ITEMS: Record<ItemKey, ItemDefinition> = {
  molotov: { key: "molotov", name: "燃烧瓶", price: 150, hotkey: "1", color: "#e36a2f", description: "落地即燃烧，火焰区域持续 10 秒", delivery: "throw", deployDelay: 0, lifetime: MOLOTOV_BURN_MS, blastDuration: 0, cleanupDelay: null, radius: 118, damage: 25, particleCount: 34, shakeMs: 120 },
  barricade: { key: "barricade", name: "路障", price: 150, hotkey: "2", color: "#c89d5b", description: "部署 100 HP 路障，阻挡并承受僵尸攻击", delivery: "place", deployDelay: null, lifetime: null, blastDuration: 0, cleanupDelay: null, radius: 68, damage: 0, particleCount: 16, shakeMs: 160 },
  frag: { key: "frag", name: "破片手榴弹", price: 220, hotkey: "3", color: "#7d9368", description: "落地 2 秒后爆炸，破片重创范围内目标", delivery: "throw", deployDelay: FRAG_FUSE_MS, lifetime: null, blastKind: "frag", blastDuration: 1050, cleanupDelay: 760, radius: 155, damage: 175, particleCount: 72, shakeMs: 320 },
  claymore: { key: "claymore", name: "阔剑地雷", price: 500, hotkey: "4", color: "#768369", description: "感应前方僵尸并喷射定向破片", delivery: "place", deployDelay: null, lifetime: null, blastKind: "claymore", blastDuration: 820, cleanupDelay: 760, radius: 190, damage: 250, particleCount: 48, shakeMs: 270 },
  flashbang: { key: "flashbang", name: "震撼弹", price: 600, hotkey: "5", color: "#d9d5bd", description: "落地即闪爆，5 秒内削弱僵尸行动与攻击", delivery: "throw", deployDelay: 0, lifetime: null, blastDuration: 0, cleanupDelay: 420, radius: 240, damage: 0, particleCount: 56, shakeMs: 190 },
  airstrike: { key: "airstrike", name: "空中支援", price: 2000, hotkey: "6", color: "#d34b3e", description: "自动锁定尸群最密集处并投下航空炸弹", delivery: "auto", deployDelay: 1450, lifetime: null, blastKind: "airstrike", blastDuration: 1450, cleanupDelay: 1050, radius: 260, damage: 520, particleCount: 130, shakeMs: 620 },
  impact: { key: "impact", name: "冲击手榴弹", price: 500, hotkey: "7", color: "#c77b3a", description: "碰炸引信：直接命中僵尸立即起爆，落地亦即爆，无需等待引信", delivery: "throw", deployDelay: 0, lifetime: null, blastKind: "frag", impactFuse: true, blastDuration: 950, cleanupDelay: 760, radius: 140, damage: 150, particleCount: 64, shakeMs: 280 },
};

const ITEM_KEYS = Object.keys(ITEMS) as ItemKey[];
const EMPTY_ITEM_INVENTORY = (): Record<ItemKey, number> => ({ molotov: 0, barricade: 0, frag: 0, claymore: 0, flashbang: 0, airstrike: 0, impact: 0 });

// 进度存档：带版本字段；读取时逐项校验，解析失败一律视为无存档
const PROGRESS_KEY = "dead-road-progress";
const PROGRESS_VERSION = 2;

type ProgressSave = {
  version: number;
  nextDay: number;
  coins: number;
  kills: number;
  owned: WeaponKey[];
  loadout: [WeaponKey, WeaponKey];
  melee: WeaponKey;
  weapon: WeaponKey;
  armor: ArmorKey;
  ownedArmors: ArmorKey[];
  itemInventory: Record<ItemKey, number>;
  ownedPartners: PartnerKey[];
  partner: PartnerKey | null;
};

function readProgressSave(): ProgressSave | null {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProgressSave>;
    // v1 旧档容错：缺少搭档字段时按空处理，其余校验一致
    if (parsed.version !== 1 && parsed.version !== PROGRESS_VERSION) return null;
    if (typeof parsed.nextDay !== "number" || !Number.isFinite(parsed.nextDay) || parsed.nextDay < 1) return null;
    if (typeof parsed.coins !== "number" || !Number.isFinite(parsed.coins) || parsed.coins < 0) return null;
    if (!Array.isArray(parsed.owned) || !Array.isArray(parsed.ownedArmors)) return null;
    if (!Array.isArray(parsed.loadout) || parsed.loadout.length !== 2) return null;
    if (typeof parsed.melee !== "string" || typeof parsed.armor !== "string" || typeof parsed.weapon !== "string") return null;
    if (typeof parsed.itemInventory !== "object" || parsed.itemInventory === null) return null;
    return {
      ...(parsed as Omit<ProgressSave, "ownedPartners" | "partner">),
      ownedPartners: Array.isArray(parsed.ownedPartners) ? parsed.ownedPartners : [],
      partner: typeof parsed.partner === "string" ? parsed.partner : null,
    };
  } catch {
    return null;
  }
}

function writeProgressSave(save: ProgressSave) {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(save));
    notifyLocalSaveChanged();
  } catch { /* 存储不可用时不阻断游戏 */ }
}

function clearProgressSave() {
  try {
    window.localStorage.removeItem(PROGRESS_KEY);
    notifyLocalSaveChanged();
  } catch { /* 同上 */ }
}

type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: ArmorKey;
  angle: number;
  weapon: WeaponKey;
  ammo: Record<WeaponKey, number>;
  lastShot: number;
  lastMuzzleFlash: number;
  /** 后坐力（纯视觉）：上次击发时刻与连发热度（0~1，随时间冷却） */
  recoilAt: number;
  recoilHeat: number;
  lastMeleeAttack: number;
  meleeMode: "slash" | "stab";
  lastKick: number;
  reloadStartedAt: number;
  reloadingUntil: number;
  /** 空仓左键自动换弹锁：必须松开左键后才能再次射击/再次触发空仓换弹。 */
  emptyReloadLatch: boolean;
  invulnerableUntil: number;
  moving: boolean;
};

// 僵尸服装款式：便装衬衫 / T 恤 / 破损西装 / 工装 / 汗背心 / 病号服 / 警服残片 / 连帽夹克（8 套，纯外观）
type ZombieOutfitStyle = "shirt" | "tee" | "suit" | "work" | "vest" | "patient" | "police" | "jacket";
type ZombieOutfit = {
  style: ZombieOutfitStyle;
  /** 上衣主色（躯干） */
  top: string;
  /** 袖子色（背心款为肤色，呈现无袖） */
  sleeve: string;
  pantsRear: string;
  pantsFront: string;
  shoes: string;
  /** 0~1 破损程度：决定躯干/裤装裂口与补丁数量 */
  wear: number;
};

// 僵尸种类：normal/brute 为既有体系（数值不变）；其余为按天解锁的扩展种类
type ZombieKind =
  | "normal" | "brute" | "runner" | "spitter" | "largeSpitter" | "zombieDog" | "helmet" | "helmetRunner"
  | "armored" | "armoredRunner" | "mutant" | "army" | "armyRunner" | "shield" | "juggernaut";
// 扩展种类规格：unlockDay=出现天数（当日起混入生成池，4 天内权重渐进爬满）；hp/radius 缺省沿用普通僵尸公式；
// speedFactor 叠乘普通僵尸速度；damageReduction 为子弹伤害减免基数（爆炸/火焰无视，穿透武器按梯度豁免）
const ZOMBIE_KIND_SPECS: Record<Exclude<ZombieKind, "normal" | "brute">, {
  unlockDay: number;
  weight: number;
  hp?: number;
  radius?: number;
  speedFactor?: number;
  attack?: number;
  damageReduction?: number;
}> = {
  runner: { unlockDay: 3, weight: 26, speedFactor: 3 },
  zombieDog: { unlockDay: 4, weight: 18, hp: 60, radius: 20, speedFactor: 4, attack: 9 },
  spitter: { unlockDay: 5, weight: 16 },
  armored: { unlockDay: 6, weight: 12, hp: 100, speedFactor: 1.5, damageReduction: .99 },
  helmet: { unlockDay: 5, weight: 14, hp: 200 },
  helmetRunner: { unlockDay: 5, weight: 10, hp: 200, speedFactor: 3 },
  mutant: { unlockDay: 7, weight: 12, hp: 500, radius: 36 },
  armoredRunner: { unlockDay: 9, weight: 10, hp: 100, speedFactor: 3, damageReduction: .99 },
  army: { unlockDay: 9, weight: 12, hp: 350, damageReduction: .5 },
  armyRunner: { unlockDay: 11, weight: 10, hp: 350, damageReduction: .5, speedFactor: 3 },
  largeSpitter: { unlockDay: 12, weight: 9, hp: 200, radius: 37, attack: 12 },
  shield: { unlockDay: 15, weight: 9, hp: 350, damageReduction: .5 },
  juggernaut: { unlockDay: 18, weight: 7, hp: 500, radius: 35, attack: 16, damageReduction: .7 },
};
// 重甲弱点严格限制在上胸的受损装甲板；腹部与其余部位仍由完整重甲覆盖。
const JUGGERNAUT_CHEST_WEAK_HALF_WIDTH = 15;
const JUGGERNAUT_CHEST_WEAK_TOP_Y = -100;
const JUGGERNAUT_CHEST_WEAK_BOTTOM_Y = -76;
const JUGGERNAUT_BODY_HIT_RADIUS = 25;

function isJuggernautChestWeakHit(region: HitRegion, localX: number, localY: number): boolean {
  if (region !== "body") return false;
  const centerY = (JUGGERNAUT_CHEST_WEAK_TOP_Y + JUGGERNAUT_CHEST_WEAK_BOTTOM_Y) / 2;
  const halfHeight = (JUGGERNAUT_CHEST_WEAK_BOTTOM_Y - JUGGERNAUT_CHEST_WEAK_TOP_Y) / 2;
  const weakX = localX / JUGGERNAUT_CHEST_WEAK_HALF_WIDTH;
  const weakY = (localY - centerY) / halfHeight;
  return weakX * weakX + weakY * weakY <= 1;
}
/** 盾兵僵尸金属盾的独立 HP：子弹/爆炸震伤盾牌，归零后碎裂（永久消失，此后按无盾处理） */
const SHIELD_HP = 500;
// 靶场"僵尸生成"页签的信息表：展示名 / 生存模式解锁天数 / 第 1 天基数 HP / 速度档位 / 关键特性
const ZOMBIE_KIND_INFO: Record<ZombieKind, { name: string; unlockDay: number; hp: number; speed: string; trait: string }> = {
  normal: { name: "普通僵尸", unlockDay: 1, hp: 62, speed: "中速", trait: "基础感染者，无特殊能力" },
  brute: { name: "大块头", unlockDay: 3, hp: 128, speed: "迟缓", trait: "高 HP 巨型感染者" },
  runner: { name: "奔跑僵尸", unlockDay: 3, hp: 62, speed: "3× 疾速", trait: "移动速度为普通僵尸 3 倍" },
  zombieDog: { name: "僵尸狗", unlockDay: 4, hp: 60, speed: "4× 极快", trait: "四足冲刺，速度为普通僵尸 4 倍" },
  spitter: { name: "呕吐僵尸", unlockDay: 5, hp: 62, speed: "中速", trait: "远程喷吐毒液 20 伤害，不近战" },
  armored: { name: "护甲僵尸", unlockDay: 6, hp: 100, speed: "1.5× 快速", trait: "全身插板护甲，基础伤害减免 99%" },
  helmet: { name: "摩托头盔僵尸", unlockDay: 5, hp: 200, speed: "中速", trait: "只有眼缝能造成爆头" },
  helmetRunner: { name: "头盔奔跑僵尸", unlockDay: 5, hp: 200, speed: "3× 疾速", trait: "3 倍奔跑 + 摩托头盔眼缝" },
  mutant: { name: "突变强壮僵尸", unlockDay: 7, hp: 500, speed: "中速", trait: "HP 500 肌肉巨体" },
  armoredRunner: { name: "奔跑护甲僵尸", unlockDay: 9, hp: 100, speed: "3× 疾速", trait: "奔跑僵尸速度 + 护甲僵尸 99% 减伤" },
  army: { name: "军队僵尸", unlockDay: 9, hp: 350, speed: "中速", trait: "防弹衣头盔，伤害减免 50%" },
  armyRunner: { name: "军队奔跑僵尸", unlockDay: 11, hp: 350, speed: "3× 疾速", trait: "3 倍奔跑 + 减免 50%" },
  largeSpitter: { name: "大型喷吐僵尸", unlockDay: 12, hp: 200, speed: "中速", trait: "连续喷出 3 股腐蚀液，每股接触伤害 20" },
  shield: { name: "盾兵僵尸", unlockDay: 15, hp: 350, speed: "中速", trait: "全身金属盾 500 HP，击碎后失效；仅眼平观察窗可命中，踹可落盾，减免 50%" },
  juggernaut: { name: "重甲僵尸", unlockDay: 18, hp: 500, speed: "中速", trait: "仅胸口可伤、免疫打腿倒地，减免 70%；高穿透武器可削弱减伤" },
};
const ZOMBIE_CONFIG_KINDS = Object.keys(ZOMBIE_KIND_INFO) as ZombieKind[];

/** 僵尸图鉴简介：每种僵尸一段档案描述（与数值表 ZOMBIE_KIND_INFO 互补，一页一种展示） */
const CODEX_DESCRIPTIONS: Record<ZombieKind, string> = {
  normal: "封锁区里最常见的感染者，动作僵硬却从不停歇。单个威胁有限——真正的麻烦是它们从不单独出现。",
  brute: "感染后异常增生的巨型个体，皮糙肉厚、HP 远超普通僵尸。保持距离，别让它近身挥击。",
  runner: "病毒强化了腿部肌肉的快速个体，移动速度是普通僵尸的 3 倍。听到急促脚步声时，它通常已经近在咫尺。",
  zombieDog: "感染后的军犬以四足姿态高速冲刺，只有 60 HP，却拥有普通僵尸 4 倍速度。腿部受创后同样会翻倒并进入爬起流程。",
  spitter: "喉部异变的远程个体，不近身，只会远远喷吐腐蚀性毒液（20 伤害）逼你走位。建议优先点名清除。",
  armored: "与仓库中遇到的护甲感染者相同：100 HP，全身附着重型插板并减免 99% 常规伤害。燃烧与爆炸仍可绕过护甲。",
  helmet: "戴着摩托头盔的感染者，头部只剩一道眼缝能造成爆头。瞄不准那条缝，就老老实实打身体。",
  helmetRunner: "速度与防护的麻烦组合：3 倍奔跑速度，头盔眼缝仍是唯一的爆头通道。",
  mutant: "肌肉过度膨胀的突变体，HP 高达 500。没有取巧的弱点，只有倾泻火力的诚意。",
  armoredRunner: "奔跑僵尸与护甲感染者的结合体，兼具 3 倍冲刺速度、100 HP 与 99% 常规伤害减免。",
  army: "生前是封锁区驻军，防弹衣与头盔仍在发挥作用，受到的所有伤害减半；高穿透武器可部分无视其防护。",
  armyRunner: "军队感染者的快速变体：3 倍速度外加伤害减半，是尸潮里最该优先处理的目标。",
  largeSpitter: "体型膨胀的远程感染者，拥有 200 HP。一次蓄力会连续喷出三股绿色腐蚀液，每股接触造成 20 伤害。",
  shield: "举着全身防暴盾的特警感染者，盾牌拥有独立 500 HP，击碎后失效；眼平观察窗是唯一命中通道，踹击可以把整面盾踹飞。",
  juggernaut: "全身重甲的行走堡垒，拥有 500 HP，只有胸口能造成有效伤害，且基础减伤 70%、免疫打腿倒地；武器穿透力越强，受到减伤的影响越小。",
};

/** 图鉴"见过"记录：生存模式生成上场即登记，localStorage 持久化（独立于进度存档，死亡/重开不清除）；靶场生成不计入 */
const CODEX_KEY = "dead-road-codex-seen";

function readSeenZombies(): ZombieKind[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(CODEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((kind): kind is ZombieKind => typeof kind === "string" && kind in ZOMBIE_KIND_INFO);
  } catch {
    return [];
  }
}

/** 登记见过的僵尸种类；返回是否为首次记录（首次才需要同步 UI state） */
function markZombieSeen(kind: ZombieKind): boolean {
  const seen = readSeenZombies();
  if (seen.includes(kind)) return false;
  seen.push(kind);
  try {
    window.localStorage.setItem(CODEX_KEY, JSON.stringify(seen));
    notifyLocalSaveChanged();
  } catch { /* 存储不可用时不阻断游戏 */ }
  return true;
}

/** 关卡模式：独立关卡与剧情的数据模型（当前为占位结构——后续接入关卡选择、解锁条件与实际玩法） */
type LevelDef = {
  id: string;
  /** 关卡序号（展示用，两位补零） */
  order: number;
  title: string;
  /** 关卡简报（剧情文案） */
  briefing: string;
  /** 预留解锁条件：需要生存模式达到的天数 */
  unlockedByDay: number;
  /** 已开放可玩（占位卡为 undefined/false） */
  playable?: boolean;
};

const LEVEL1_ID = "level-escape-home";
const LEVEL1_TITLE = "逃出小区";
const LEVEL2_ID = "level-join-army";
const LEVEL2_TITLE = "加入军队";
const LEVEL3_ID = "level-defend-base";
const LEVEL3_TITLE = "防守基地";
const LEVEL4_ID = "level-capture-radio";
const LEVEL4_TITLE = "占领电台";
const LEVEL5_ID = "level-rescue-operation";
const LEVEL5_TITLE = "解救行动";
const LEVEL6_ID = "level-occupy-building";
const LEVEL6_TITLE = "攻占大楼";
const LEVEL7_ID = "level-seize-warehouse";
const LEVEL7_TITLE = "夺取仓库";
const LEVEL8_ID = "level-clear-highway";
const LEVEL8_TITLE = "清理高速";

type ExplorationTask = { order: number; label: string; x: number; y: number };
const EXPLORATION_TASK_NAMES = ["任务一", "任务二", "任务三", "任务四", "任务五", "任务六", "任务七", "任务八", "任务九", "任务十"];
const EXPLORATION_TASK_POSITIONS = [
  [22, 76], [33, 64], [44, 75], [54, 57], [65, 68],
  [75, 50], [67, 33], [55, 41], [43, 25], [31, 35],
] as const;
/** 探索模式农田地图的十个任务节点；任务内容后续接入，当前只建立顺序解锁入口。 */
const EXPLORATION_TASKS: ExplorationTask[] = Array.from({ length: 10 }, (_, index) => ({
  order: index + 1,
  label: EXPLORATION_TASK_NAMES[index],
  x: EXPLORATION_TASK_POSITIONS[index][0],
  y: EXPLORATION_TASK_POSITIONS[index][1],
}));
const EXPLORATION_CLEARED_KEY = "dead-road-exploration-cleared";

const LOTTERY_RARITIES: Record<LotteryRarity, { label: string; chance: number; rank: number }> = {
  common: { label: "普通", chance: 50, rank: 0 },
  rare: { label: "稀有", chance: 30, rank: 1 },
  epic: { label: "史诗", chance: 15, rank: 2 },
  legendary: { label: "传奇", chance: 5, rank: 3 },
};
const LOTTERY_RARITY_ORDER: LotteryRarity[] = ["common", "rare", "epic", "legendary"];
const LOTTERY_ZOMBIES = [
  [17, 34, .7], [28, 38, .76], [38, 32, .82], [48, 39, .68], [59, 34, .78], [70, 40, .7], [82, 33, .8],
  [22, 22, .96], [34, 25, .88], [45, 19, 1.06], [56, 27, .9], [68, 21, 1.04], [78, 25, .92],
  [29, 7, 1.22], [42, 10, 1.16], [55, 5, 1.3], [67, 11, 1.14], [76, 4, 1.28],
] as const;
const LOTTERY_KILL_INTERVAL_MS = 135;
const LOTTERY_WHITE_FLASH_MS = 500;

function rollLotteryRarity(roll = Math.random()): LotteryRarity {
  let cumulativeChance = 0;
  for (const rarity of LOTTERY_RARITY_ORDER) {
    cumulativeChance += LOTTERY_RARITIES[rarity].chance / 100;
    if (roll < cumulativeChance) return rarity;
  }
  return "legendary";
}

function highestLotteryRarity(rewards: LotteryRarity[]): LotteryRarity | null {
  return rewards.reduce<LotteryRarity | null>((highest, rarity) => (
    highest === null || LOTTERY_RARITIES[rarity].rank > LOTTERY_RARITIES[highest].rank ? rarity : highest
  ), null);
}

function readExplorationClearedTasks(): number[] {
  try {
    if (typeof window === "undefined") return [];
    const parsed = JSON.parse(window.localStorage.getItem(EXPLORATION_CLEARED_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((order): order is number => Number.isInteger(order) && order >= 1 && order <= EXPLORATION_TASKS.length);
  } catch {
    return [];
  }
}

function isExplorationTaskUnlocked(order: number, cleared: number[]) {
  return order === 1 || cleared.includes(order - 1);
}

/** 关卡列表：01—08 均为可玩的连续战役，按上一关通关记录逐关解锁。 */
const LEVEL_DEFS: LevelDef[] = [
  { id: LEVEL1_ID, order: 1, title: LEVEL1_TITLE, briefing: "僵尸爆发，所在小区已经沦陷——从家中出发，穿过走廊与街道，抵达保安亭。", unlockedByDay: 1, playable: true },
  { id: LEVEL2_ID, order: 2, title: LEVEL2_TITLE, briefing: "逃出小区后在公路上遭遇尸群，被军队救下并邀请加入——抵达军事基地。", unlockedByDay: 1, playable: true },
  { id: LEVEL3_ID, order: 3, title: LEVEL3_TITLE, briefing: "驻守军事基地的深夜，尸群撞上外墙——与队友守住围墙，再独自走进黑暗，查清墙外的东西。", unlockedByDay: 1, playable: true },
  { id: LEVEL4_ID, order: 4, title: LEVEL4_TITLE, briefing: "被僵尸占领的电台价值极为重要——小队乘车出发，突破门口、逐层清剿，把人类的信号重新接回来。", unlockedByDay: 1, playable: true },
  { id: LEVEL5_ID, order: 5, title: LEVEL5_TITLE, briefing: "队友在通讯基地发现了隧道里的求救信号——乘直升机赶往入口，恢复电力，找到幸存者并开通撤离道路。", unlockedByDay: 1, playable: true },
  { id: LEVEL6_ID, order: 6, title: LEVEL6_TITLE, briefing: "小队将对被感染者占领的市政大楼发起进攻——恢复楼内供电，逐层夺回档案室与中央大厅。", unlockedByDay: 1, playable: true },
  { id: LEVEL7_ID, order: 7, title: LEVEL7_TITLE, briefing: "基地物资正在告急——与小队夺取城外仓库，清除重甲感染者并掩护物资装车。", unlockedByDay: 1, playable: true },
  { id: LEVEL8_ID, order: 8, title: LEVEL8_TITLE, briefing: "高速公路仍被尸群封锁——驾驶装甲车清理沿线感染者，夺回前方收费站。", unlockedByDay: 1, playable: true },
];

/** 已通关关卡记录：独立 localStorage 键，与进度存档/图鉴记录互不影响（容错读取） */
const LEVELS_CLEARED_KEY = "dead-road-levels-cleared";

function readClearedLevels(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(LEVELS_CLEARED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && LEVEL_DEFS.some((def) => def.id === id));
  } catch {
    return [];
  }
}

/** 登记已通关关卡；返回最新记录（重复通关不重复写入） */
function markLevelCleared(levelId: string): string[] {
  const cleared = readClearedLevels();
  if (!cleared.includes(levelId)) cleared.push(levelId);
  try {
    window.localStorage.setItem(LEVELS_CLEARED_KEY, JSON.stringify(cleared));
    notifyLocalSaveChanged();
  } catch { /* 存储不可用时不阻断游戏 */ }
  return cleared;
}

/** 解锁链：第一关始终可玩；第 N 关需通关第 N-1 关（按 LEVEL_DEFS 顺序） */
function isLevelUnlocked(levelId: string, cleared: string[]): boolean {
  const index = LEVEL_DEFS.findIndex((def) => def.id === levelId);
  if (index < 0) return false;
  return index === 0 || cleared.includes(LEVEL_DEFS[index - 1].id);
}

type LevelTask = { id: string; text: string };
type LevelSceneDef = {
  name: string;
  extra: number;
  entryX: number;
  obstacles: { kind: "car" | "table"; fx: number; y: number; w: number; h: number; seed: number }[];
  pickups: { weapon: WeaponKey; fx: number; y: number; onTable?: boolean }[];
  zombies: { kind: ZombieKind; fx: number }[];
  /** 巡逻 NPC 出生点（军事基地游走士兵，非战斗） */
  patrols?: { fx: number; y: number }[];
  tasks: LevelTask[];
};

const LEVEL1_SCENES: LevelSceneDef[] = [
  {
    name: "家中 · 客厅",
    extra: 0,
    entryX: 220,
    obstacles: [{ kind: "table", fx: 0.62, y: 388, w: 180, h: 84, seed: 7 }],
    pickups: [{ weapon: "fruitknife", fx: 0.62, y: 366, onTable: true }],
    zombies: [],
    tasks: [
      { id: "take-knife", text: "拾取桌上的水果刀（走近后按右键）" },
      { id: "leave-home", text: "离开家 → 走向房门" },
    ],
  },
  {
    name: "居民楼 · 走廊",
    extra: 1350,
    entryX: 130,
    obstacles: [],
    pickups: [],
    zombies: [0.3, 0.43, 0.55, 0.69, 0.83].map((fx) => ({ kind: "normal" as ZombieKind, fx })),
    tasks: [{ id: "clear-corridor", text: "找到大门（消灭拦路的僵尸）" }],
  },
  {
    name: "小区 · 街道",
    extra: 2300,
    entryX: 140,
    obstacles: [
      { kind: "car", fx: 0.36, y: 372, w: 230, h: 118, seed: 11 },
      { kind: "car", fx: 0.6, y: 440, w: 230, h: 118, seed: 23 },
      { kind: "table", fx: 0.925, y: 396, w: 150, h: 76, seed: 31 },
    ],
    pickups: [{ weapon: "glock17", fx: 0.925, y: 380, onTable: true }],
    zombies: [
      ...[0.28, 0.4, 0.52, 0.64, 0.76, 0.87].map((fx) => ({ kind: "normal" as ZombieKind, fx })),
      { kind: "helmet", fx: 0.46 },
      { kind: "helmet", fx: 0.7 },
    ],
    tasks: [
      { id: "clear-street", text: "消灭街道上的僵尸" },
      { id: "take-glock", text: "到保安亭拾取格洛克 17（右键拾取）" },
    ],
  },
];

// ===== 第二关「加入军队」 =====
/** 场景 1：到达加油站所需击杀数 */
const LEVEL2_ROAD_KILLS = 5;
/** 加油站伏击：便利店涌出僵尸总数（10 头盔 + 20 普通，按 3 取 1 交错）与坚持时长 */
const LEVEL2_AMBUSH_TOTAL = 30;
const LEVEL2_SURVIVE_MS = 10000;
/** 救援小队士兵人数 */
const LEVEL2_SOLDIERS = 5;
/** 加油站 / 军营 在世界宽中的位置分数 */
const LEVEL2_GAS_FX = 0.8;
const LEVEL2_BARRACKS_FX = 0.86;

const LEVEL2_SCENES: LevelSceneDef[] = [
  {
    name: "城郊公路",
    extra: 2600,
    entryX: 140,
    obstacles: [{ kind: "car", fx: 0.35, y: 420, w: 230, h: 118, seed: 41 }],
    pickups: [],
    zombies: [0.16, 0.28, 0.4, 0.52, 0.63, 0.72].map((fx) => ({ kind: "normal" as ZombieKind, fx })),
    tasks: [
      { id: "reach-gas", text: "到达加油站（击杀拦路的僵尸）" },
      { id: "survive", text: "活下去" },
    ],
  },
  {
    name: "军事基地",
    extra: 1500,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    patrols: [
      { fx: 0.18, y: 350 }, { fx: 0.3, y: 470 }, { fx: 0.42, y: 380 },
      { fx: 0.55, y: 500 }, { fx: 0.66, y: 340 }, { fx: 0.75, y: 460 },
      { fx: 0.48, y: 560 }, { fx: 0.24, y: 540 },
    ],
    tasks: [{ id: "reach-barracks", text: "到达军营" }],
  },
];

// ===== 第三关「防守基地」 =====
/** 开场演出：警报渐强/屏幕渐亮时长与起身时长 */
const LEVEL3_WAKE_MS = 6000;
const LEVEL3_RISE_MS = 1400;
/** 混凝土围墙共享 HP 池；判定段 id 起点（与玩家部署路障区分） */
const LEVEL3_WALL_HP = 500;
const LEVEL3_WALL_ID = 91000;
/** 围墙在世界宽中的位置分数；射击孔中心 y（子弹仅经孔位越过围墙） */
const LEVEL3_WALL_FX = 0.55;
const LEVEL3_WALL_HOLES = [280, 420, 560];
/** 围墙电机大门（夜防结束后开启，通往土路）：门洞 y 区间 */
const LEVEL3_GATE_TOP = 462;
const LEVEL3_GATE_BOTTOM = 578;
/** 基地内路灯位置（世界宽分数）：沿道路与围墙内侧分布，接入黑夜光照 */
const LEVEL3_LAMP_FX = [0.1, 0.3, 0.48];
/** 第一波攻势：20 奔跑 + 20 头盔奔跑 + 15 军队奔跑（11 只一循环交错 ×5），上场节奏加快保持压迫感 */
const LEVEL3_WAVE_TOTAL = 55;
const LEVEL3_WAVE_EVERY_MS = 640;
/** 盾兵先锋梯队：15 只盾兵最先上场（继承生存全部机制：金属盾 500 HP + 碎裂、仅眼平观察窗可命中、踹可落盾、减伤 50%，本体 HP 本关覆盖为 500），间隔略密形成"盾墙先行、速度僵尸后至"的层次 */
const LEVEL3_VANGUARD_TOTAL = 15;
const LEVEL3_VANGUARD_EVERY_MS = 480;
/** 夜防总数 = 盾兵先锋 + 奔跑系主力 */
const LEVEL3_DEFEND_TOTAL = LEVEL3_VANGUARD_TOTAL + LEVEL3_WAVE_TOTAL;
const LEVEL3_WAVE_KINDS: ZombieKind[] = [
  "runner", "helmetRunner", "armyRunner", "runner", "helmetRunner", "runner",
  "helmetRunner", "armyRunner", "runner", "helmetRunner", "armyRunner",
];
/** 夜防精英强化：本关奔跑系与盾兵本体 HP 统一 500（仅第三关生成处覆盖，不改全局 ZOMBIE_KIND_SPECS；盾兵的金属盾 500 不变；maxHp 同步保证血条以 500 为满血） */
const LEVEL3_ELITE_HP = 500;
const LEVEL3_ELITE_KINDS: ReadonlySet<ZombieKind> = new Set(["runner", "helmetRunner", "armyRunner", "shield"]);
/** 土路侦查：拦路突变强壮僵尸数 */
const LEVEL3_MUTANTS = 5;

const LEVEL3_SCENES: LevelSceneDef[] = [
  {
    name: "军营宿舍 · 夜",
    extra: 300,
    entryX: 230,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [
      { id: "wake-up", text: "醒来" },
      { id: "leave-barracks", text: "走出军营" },
    ],
  },
  {
    name: "基地外墙 · 夜",
    extra: 1200,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [
      { id: "take-position", text: "走到掩体后" },
      { id: "defend-wave", text: "阻击第一波攻势" },
      { id: "reach-gate", text: "走到基地大门" },
    ],
  },
  {
    name: "城外土路 · 夜",
    extra: 3200,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [0.22, 0.34, 0.46, 0.58, 0.7].map((fx) => ({ kind: "mutant" as ZombieKind, fx })),
    tasks: [
      { id: "scout", text: "探查（沿土路走到尽头）" },
      { id: "kill-juggernaut", text: "击杀重甲僵尸" },
    ],
  },
];

// ===== 第四关「占领电台」 =====
/** 场景 0：会议桌；场景 1：基地大门（上车点）在各自世界宽中的位置分数 */
const LEVEL4_TABLE_FX = 0.16;
const LEVEL4_GATE_FX = 0.88;
/** 场景 2：军车停靠在电台门厅前，完全刹停后再下车；下车警戒队友数 */
const LEVEL4_TRUCK_STOP_FX = 0.68;
const LEVEL4_STATION_DOOR_FX = 0.82;
const LEVEL4_SQUAD = 4;
const LEVEL4_PLAYER_EXIT_DELAY_MS = 650;
/** 楼梯可行走轨迹：绘制与移动共用同一组比例/高度，避免角色、台阶和出口门错位 */
const LEVEL4_STAIR_LOWER_START_FX = 0.08;
const LEVEL4_STAIR_LANDING_FX = 0.43;
const LEVEL4_STAIR_LANDING_W_FX = 0.15;
const LEVEL4_STAIR_UPPER_END_FX = 0.9;
const LEVEL4_STAIR_BOTTOM_Y = 620;
const LEVEL4_STAIR_LANDING_Y = 470;
const LEVEL4_STAIR_EXIT_Y = 340;
const LEVEL4_STAIR_MIN_WORLD_W = 620;
/** 一/二层走廊清剿数：一层 5 突变 + 5 头盔奔跑 + 5 军队；二层 5 盾兵 + 5 军队奔跑 + 5 军队 */
const LEVEL4_FLOOR1_TOTAL = 15;
const LEVEL4_FLOOR2_TOTAL = 15;
/** 天台通讯设备区防守战：军队奔跑僵尸自右冲击总数与间隔；设备共享 HP（参照第三关围墙体系，判定段 id 起点）；维修所需时长 */
const LEVEL4_DEFEND_TOTAL = 30;
const LEVEL4_DEFEND_EVERY_MS = 600;
const LEVEL4_EQUIP_HP = 500;
const LEVEL4_EQUIP_ID = 92000;
const LEVEL4_EQUIP_FX = 0.6;
const LEVEL4_REPAIR_MS = 20000;

const LEVEL4_SCENES: LevelSceneDef[] = [
  {
    name: "军事基地 · 商讨室",
    extra: 500,
    entryX: 140,
    obstacles: [{ kind: "table", fx: LEVEL4_TABLE_FX, y: 400, w: 240, h: 92, seed: 5 }],
    pickups: [],
    zombies: [],
    patrols: [{ fx: LEVEL4_TABLE_FX + 0.05, y: 350 }],
    tasks: [
      { id: "find-teammate", text: "找到队友（走到会议桌旁）" },
      { id: "leave-briefing", text: "走出商讨室" },
    ],
  },
  {
    name: "军事基地 · 集合区",
    extra: 1400,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    patrols: [{ fx: 0.28, y: 350 }, { fx: 0.48, y: 500 }],
    tasks: [{ id: "board-truck", text: "上车（走到基地大门）" }],
  },
  {
    name: "电台门口 · 白天",
    extra: 1600,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "breach", text: "突破（单人进入电台通讯基地）" }],
  },
  {
    name: "电台 · 一层走廊",
    extra: 2600,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [
      ...[0.3, 0.45, 0.6, 0.75, 0.88].map((fx) => ({ kind: "mutant" as ZombieKind, fx })),
      ...[0.24, 0.4, 0.56, 0.72, 0.84].map((fx) => ({ kind: "helmetRunner" as ZombieKind, fx })),
      ...[0.34, 0.5, 0.66, 0.8, 0.92].map((fx) => ({ kind: "army" as ZombieKind, fx })),
    ],
    tasks: [{ id: "clear-floor-1", text: "清剿一层走廊" }],
  },
  {
    name: "楼梯间",
    extra: 260,
    entryX: 120,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "climb-1", text: "上楼（前往二层）" }],
  },
  {
    name: "电台 · 二层走廊",
    extra: 2600,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [
      ...[0.28, 0.44, 0.6, 0.76, 0.9].map((fx) => ({ kind: "shield" as ZombieKind, fx })),
      ...[0.24, 0.4, 0.56, 0.72, 0.86].map((fx) => ({ kind: "armyRunner" as ZombieKind, fx })),
      ...[0.34, 0.5, 0.66, 0.8, 0.93].map((fx) => ({ kind: "army" as ZombieKind, fx })),
    ],
    tasks: [{ id: "clear-floor-2", text: "清剿二层走廊" }],
  },
  {
    name: "楼梯间",
    extra: 260,
    entryX: 120,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "climb-2", text: "上楼（前往天台）" }],
  },
  {
    name: "天台 · 白天",
    extra: 900,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [{ kind: "juggernaut" as ZombieKind, fx: 0.62 }],
    tasks: [{ id: "kill-juggernaut", text: "击杀重甲僵尸" }],
  },
  {
    name: "天台 · 通讯设备区",
    extra: 1400,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "defend-radio", text: "维修通讯设备（坚守等待维修完成）" }],
  },
];

// ===== 第五关「解救行动」 =====
/**
 * 第五关只编排场景、任务和出生表；玩家、NPC 与所有 ZombieKind 继续走生存模式同一套
 * 绘制、步态、下砸攻击、血液/结构损伤、断肢和打腿倒地结算，不创建关卡专用简化实体。
 */
const LEVEL5_HELIPAD_FX = 0.78;
const LEVEL5_HELI_STOP_FX = 0.34;
const LEVEL5_SQUAD = 4;
const LEVEL5_PLAYER_EXIT_DELAY_MS = 650;
const LEVEL5_HELICOPTER_SCALE = 1.75;
const LEVEL5_POWER_FX = 0.28;
const LEVEL5_FENCE_FX = 0.43;
const LEVEL5_FENCE_HP = 500;
const LEVEL5_FENCE_DAMAGE_FACTOR = 0.35;
const LEVEL5_FENCE_ID = 93000;
const LEVEL5_REPAIR_MS = 15000;
const LEVEL5_DEFEND_TOTAL = 36;
const LEVEL5_DEFEND_EVERY_MS = 400;
const LEVEL5_SURVIVOR_FX = 0.92;
const LEVEL5_RESCUE_TOTAL = 20;
const LEVEL5_ROAD_TOTAL = 50;
const LEVEL5_VEHICLE_FX = 0.94;

const LEVEL5_SCENES: LevelSceneDef[] = [
  {
    name: "通讯基地 · 无线电监听室",
    extra: 900,
    entryX: 140,
    obstacles: [{ kind: "table", fx: 0.38, y: 402, w: 300, h: 94, seed: 51 }],
    pickups: [],
    zombies: [],
    patrols: [{ fx: 0.3, y: 360 }],
    tasks: [{ id: "find-radio-teammate", text: "找到队友" }],
  },
  {
    name: "通讯基地 · 天台停机坪",
    extra: 1600,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "board-helicopter", text: "乘坐直升机" }],
  },
  {
    name: "隧道入口 · 直升机降落区",
    extra: 1400,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "board-helicopter", text: "乘坐直升机" }],
  },
  {
    name: "隧道 · 电力配置室",
    extra: 2800,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "repair-power", text: "维修电力系统" }],
  },
  {
    name: "隧道 · 搜救区",
    extra: 5200,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [
      ...[0.18, 0.24, 0.3, 0.36, 0.43, 0.5, 0.58, 0.66, 0.75, 0.84].map((fx) => ({ kind: "army" as ZombieKind, fx })),
      ...[0.32, 0.45, 0.57, 0.71, 0.86].map((fx) => ({ kind: "armyRunner" as ZombieKind, fx })),
      ...[0.38, 0.52, 0.64, 0.78, 0.9].map((fx) => ({ kind: "shield" as ZombieKind, fx })),
    ],
    tasks: [{ id: "find-survivor", text: "找到求救人员" }],
  },
  {
    name: "隧道 · 撤离道路",
    extra: 6500,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: Array.from({ length: LEVEL5_ROAD_TOTAL }, (_, i) => ({
      kind: "army" as ZombieKind,
      fx: 0.12 + (i / (LEVEL5_ROAD_TOTAL - 1)) * 0.78,
    })),
    tasks: [
      { id: "clear-rescue-road", text: "开通道路" },
      { id: "board-rescue-vehicle", text: "上车" },
    ],
  },
];

// ===== 第六关「攻占大楼」 =====
/**
 * 第六关继续复用生存模式的 Player / Zombie / LevelNpc 实体与完整伤害、动作和掉落系统；
 * 这里只定义市政大楼的场景编排、两人突击小队与巨型变异 Boss 的专属参数。
 */
const LEVEL6_BRIEFING_TABLE_FX = 0.16;
const LEVEL6_BASE_GATE_FX = 0.88;
const LEVEL6_TRUCK_STOP_FX = 0.58;
const LEVEL6_BUILDING_DOOR_FX = 0.82;
const LEVEL6_PLAYER_EXIT_DELAY_MS = 650;
const LEVEL6_SQUAD_SIZE = 2;
const LEVEL6_SQUAD_HP = 100;
const LEVEL6_POWER_SWITCH_FX = 0.9;
const LEVEL6_CORRIDOR_ONE_TOTAL = 23;
const LEVEL6_POWER_ROOM_TOTAL = 15;
const LEVEL6_CORRIDOR_TWO_TOTAL = 10;
const LEVEL6_ARCHIVE_TOTAL = 2;
const LEVEL6_CENTRAL_HALL_TOTAL = 6;
const LEVEL6_BOSS_SPEED = 52;
const LEVEL6_BOSS_SPAWN_Y = 590;
const LEVEL6_BOSS_SPIT_INTERVAL_MS = 5000;
const LEVEL6_BOSS_SPIT_WINDUP_MS = 800;
const LEVEL6_BOSS_SPIT_COUNT = 14;

const LEVEL6_SCENES: LevelSceneDef[] = [
  {
    name: "军事基地 · 商讨室",
    extra: 500,
    entryX: 140,
    obstacles: [{ kind: "table", fx: LEVEL6_BRIEFING_TABLE_FX, y: 400, w: 240, h: 92, seed: 61 }],
    pickups: [],
    zombies: [],
    patrols: [{ fx: LEVEL6_BRIEFING_TABLE_FX + 0.05, y: 350 }],
    tasks: [
      { id: "find-assault-team", text: "找到队友" },
      { id: "board-assault-truck", text: "上车（走出商讨室并前往基地大门）" },
    ],
  },
  {
    name: "军事基地 · 集合区",
    extra: 1400,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    patrols: [{ fx: 0.3, y: 350 }, { fx: 0.48, y: 500 }],
    tasks: [{ id: "board-assault-truck", text: "上车" }],
  },
  {
    name: "市政大楼 · 大门",
    extra: 1800,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "occupy-power-room", text: "占领配电室（进入市政大楼）" }],
  },
  {
    name: "市政大楼 · 断电走廊",
    extra: 5200,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [
      ...Array.from({ length: 10 }, (_, i) => ({ kind: "armyRunner" as ZombieKind, fx: 0.16 + i * 0.075 })),
      ...[0.24, 0.48, 0.72].map((fx) => ({ kind: "juggernaut" as ZombieKind, fx })),
      ...Array.from({ length: 10 }, (_, i) => ({ kind: "army" as ZombieKind, fx: 0.2 + i * 0.073 })),
    ],
    tasks: [{ id: "occupy-power-room", text: "占领配电室（清剿断电走廊）" }],
  },
  {
    name: "市政大楼 · 配电室",
    extra: 2400,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [
      ...Array.from({ length: 10 }, (_, i) => ({ kind: "army" as ZombieKind, fx: 0.18 + i * 0.07 })),
      ...[0.38, 0.5, 0.62, 0.74, 0.84].map((fx) => ({ kind: "shield" as ZombieKind, fx })),
    ],
    tasks: [{ id: "occupy-power-room", text: "占领配电室（清剿并开启电闸）" }],
  },
  {
    name: "市政大楼 · 二层走廊",
    extra: 4800,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [
      ...[0.22, 0.36, 0.52, 0.68, 0.84].map((fx) => ({ kind: "shield" as ZombieKind, fx })),
      ...[0.28, 0.43, 0.58, 0.73, 0.88].map((fx) => ({ kind: "juggernaut" as ZombieKind, fx })),
    ],
    tasks: [{ id: "occupy-archives", text: "占领档案室（清剿走廊）" }],
  },
  {
    name: "市政大楼 · 档案室",
    extra: 1800,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [{ kind: "juggernaut", fx: 0.5 }, { kind: "juggernaut", fx: 0.76 }],
    tasks: [{ id: "occupy-archives", text: "占领档案室" }],
  },
  {
    name: "市政大楼 · 楼梯间",
    extra: 260,
    entryX: 120,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "occupy-central-hall", text: "占领中央大厅（上楼）" }],
  },
  {
    name: "市政大楼 · 中央大厅",
    extra: 2200,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [
      { kind: "mutant", fx: 0.48 },
      { kind: "mutant", fx: 0.58 },
      { kind: "mutant", fx: 0.66 },
      { kind: "mutant", fx: 0.74 },
      { kind: "mutant", fx: 0.82 },
      { kind: "mutant", fx: 0.9 },
    ],
    tasks: [{ id: "occupy-central-hall", text: "占领中央大厅" }],
  },
];

// ===== 第七关「夺取仓库」 =====
/**
 * 第七关只增加仓库编排与剧情护甲参数；Zombie / Player / LevelNpc 仍复用生存模式的
 * 姿势、结构损伤、血液、下砸攻击、断肢和打腿倒地等公共系统。
 */
const LEVEL7_BRIEFING_TABLE_FX = 0.16;
const LEVEL7_BASE_GATE_FX = 0.88;
const LEVEL7_TRUCK_STOP_FX = 0.3;
const LEVEL7_WAREHOUSE_DOOR_FX = 0.82;
const LEVEL7_PLAYER_EXIT_DELAY_MS = 650;
const LEVEL7_SQUAD_SIZE = 4;
const LEVEL7_JUGGERNAUTS = 2;
const LEVEL7_SHIELDS = 5;
const LEVEL7_ARMORED = 10;
const LEVEL7_INITIAL_TOTAL = LEVEL7_JUGGERNAUTS + LEVEL7_SHIELDS + LEVEL7_ARMORED;
const LEVEL7_ARMORED_HP = 100;
const LEVEL7_ARMORED_REDUCTION = .99;
const LEVEL7_ARMORED_SPEED_FACTOR = 1.5;
const LEVEL7_FLINT_FX = .34;
const LEVEL7_TRUCK_FX = .12;
const LEVEL7_SUPPLY_FX = .38;
const LEVEL7_WALL_FX = .6;
const LEVEL7_WALL_HP = 500;
const LEVEL7_WALL_ID = 94000;
const LEVEL7_DEFENDERS = 2;
const LEVEL7_TRANSPORT_BASE_LEG_MS = 4500;
const LEVEL7_TRANSPORT_SPEED_FACTOR = .66;
const LEVEL7_TRANSPORT_LEG_MS = LEVEL7_TRANSPORT_BASE_LEG_MS / LEVEL7_TRANSPORT_SPEED_FACTOR;
const LEVEL7_TRANSPORT_LEGS = 4;
const LEVEL7_DEFEND_SPAWN_MS = 460;
const LEVEL7_MAX_ACTIVE_ATTACKERS = 28;
const LEVEL7_ATTACKER_SPAWN_OFFSET = 900;

const LEVEL7_SCENES: LevelSceneDef[] = [
  {
    name: "军事基地 · 商讨室",
    extra: 500,
    entryX: 140,
    obstacles: [{ kind: "table", fx: LEVEL7_BRIEFING_TABLE_FX, y: 400, w: 240, h: 92, seed: 71 }],
    pickups: [],
    zombies: [],
    patrols: [{ fx: LEVEL7_BRIEFING_TABLE_FX + .05, y: 350 }],
    tasks: [
      { id: "find-warehouse-team", text: "找到队友" },
      { id: "board-warehouse-truck", text: "上车（走出商讨室并前往基地大门）" },
    ],
  },
  {
    name: "军事基地 · 集合区",
    extra: 1400,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    patrols: [{ fx: .3, y: 350 }, { fx: .48, y: 500 }],
    tasks: [{ id: "board-warehouse-truck", text: "上车" }],
  },
  {
    name: "物资仓库 · 大门",
    extra: 1800,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    tasks: [{ id: "enter-warehouse", text: "进入仓库" }],
  },
  {
    name: "物资仓库 · 堆放区",
    extra: 4200,
    entryX: 140,
    obstacles: [{ kind: "table", fx: LEVEL7_FLINT_FX, y: 404, w: 260, h: 104, seed: 72 }],
    pickups: [{ weapon: "flint66", fx: LEVEL7_FLINT_FX, y: 365, onTable: true }],
    zombies: [
      ...[.58, .76].map((fx) => ({ kind: "juggernaut" as ZombieKind, fx })),
      ...[.44, .52, .64, .72, .84].map((fx) => ({ kind: "shield" as ZombieKind, fx })),
      ...Array.from({ length: LEVEL7_ARMORED }, (_, i) => ({ kind: "army" as ZombieKind, fx: .4 + i * .052 })),
    ],
    tasks: [
      { id: "take-flint66", text: "拾取燧石66以对付护甲僵尸（走近物资箱后按右键）" },
      { id: "clear-warehouse", text: "使用燧石66击杀仓库内的僵尸" },
      { id: "protect-supplies", text: "保护队友运送物资" },
    ],
  },
];

// ===== 第八关「清理高速」 =====
const LEVEL8_BRIEFING_TABLE_FX = .16;
const LEVEL8_BASE_GATE_FX = .88;
const LEVEL8_HIGHWAY_JUGGERNAUTS = 10;
const LEVEL8_HIGHWAY_ARMY = 30;
const LEVEL8_HIGHWAY_SHIELDS = 20;
const LEVEL8_HIGHWAY_HELMETS = 30;
const LEVEL8_HIGHWAY_TOTAL = LEVEL8_HIGHWAY_JUGGERNAUTS + LEVEL8_HIGHWAY_ARMY + LEVEL8_HIGHWAY_SHIELDS + LEVEL8_HIGHWAY_HELMETS;
const LEVEL8_TOLL_ARMY = 10;
const LEVEL8_TOLL_RUNNERS = 5;
const LEVEL8_TOLL_SHIELDS = 5;
const LEVEL8_TOLL_JUGGERNAUTS = 2;
const LEVEL8_TOLL_TOTAL = LEVEL8_TOLL_ARMY + LEVEL8_TOLL_RUNNERS + LEVEL8_TOLL_SHIELDS + LEVEL8_TOLL_JUGGERNAUTS;
const LEVEL8_TOLL_SQUAD_SIZE = 2;
const LEVEL8_VEHICLE_HP = 500;
const LEVEL8_VEHICLE_SPEED = 340;
const LEVEL8_VEHICLE_START_X = 210;
const LEVEL8_TOLL_FX = .93;
const LEVEL8_HMG_DAMAGE = 80;
const LEVEL8_HMG_MAGAZINE = 200;
const LEVEL8_HMG_FIRE_MS = 86;
const LEVEL8_HMG_RELOAD_MS = 2700;
const LEVEL8_HMG_RANGE = 1420;
const LEVEL8_HMG_PENETRATION = 7;
const LEVEL8_HMG_PENETRATION_BYPASS = .8;
const LEVEL8_HMG_STOPPING = 1;
const LEVEL8_HMG_MOUNT_X = -18;
const LEVEL8_HMG_MOUNT_Y = -211;
const LEVEL8_HMG_MUZZLE_X = 163;

function level8ZombieLine(kind: ZombieKind, count: number, start: number, end: number): Array<{ kind: ZombieKind; fx: number }> {
  return Array.from({ length: count }, (_, index) => ({ kind, fx: start + (end - start) * (count === 1 ? 0 : index / (count - 1)) }));
}

const LEVEL8_SCENES: LevelSceneDef[] = [
  {
    name: "军事基地 · 商讨室",
    extra: 500,
    entryX: 140,
    obstacles: [{ kind: "table", fx: LEVEL8_BRIEFING_TABLE_FX, y: 400, w: 240, h: 92, seed: 81 }],
    pickups: [],
    zombies: [],
    patrols: [{ fx: LEVEL8_BRIEFING_TABLE_FX + .05, y: 350 }],
    tasks: [
      { id: "find-highway-team", text: "找到队友" },
      { id: "board-armored-vehicle", text: "上车（走出商讨室并前往基地大门）" },
    ],
  },
  {
    name: "军事基地 · 装甲车集结区",
    extra: 1400,
    entryX: 140,
    obstacles: [],
    pickups: [],
    zombies: [],
    patrols: [{ fx: .34, y: 350 }, { fx: .5, y: 500 }],
    tasks: [{ id: "board-armored-vehicle", text: "上车" }],
  },
  {
    name: "封锁高速",
    extra: 11000,
    entryX: LEVEL8_VEHICLE_START_X,
    obstacles: [],
    pickups: [],
    zombies: [
      ...level8ZombieLine("juggernaut", LEVEL8_HIGHWAY_JUGGERNAUTS, .16, .84),
      ...level8ZombieLine("army", LEVEL8_HIGHWAY_ARMY, .1, .88),
      ...level8ZombieLine("shield", LEVEL8_HIGHWAY_SHIELDS, .13, .86),
      ...level8ZombieLine("helmet", LEVEL8_HIGHWAY_HELMETS, .11, .9),
    ],
    tasks: [{ id: "clear-highway", text: "清理僵尸并到达收费站" }],
  },
  {
    name: "收费站 · 长走廊",
    extra: 5200,
    entryX: 150,
    obstacles: [],
    pickups: [],
    zombies: [
      ...level8ZombieLine("army", LEVEL8_TOLL_ARMY, .18, .82),
      ...level8ZombieLine("armyRunner", LEVEL8_TOLL_RUNNERS, .25, .78),
      ...level8ZombieLine("shield", LEVEL8_TOLL_SHIELDS, .3, .86),
      ...level8ZombieLine("juggernaut", LEVEL8_TOLL_JUGGERNAUTS, .48, .76),
    ],
    tasks: [{ id: "clear-toll-station", text: "清理收费站" }],
  },
];

function isLevel3WallSegment(id: number): boolean {
  return id >= LEVEL3_WALL_ID && id < LEVEL4_EQUIP_ID;
}

function isLevel4EquipmentSegment(id: number): boolean {
  return id >= LEVEL4_EQUIP_ID && id < LEVEL5_FENCE_ID;
}

function isLevel5FenceSegment(id: number): boolean {
  return id >= LEVEL5_FENCE_ID && id < LEVEL5_FENCE_ID + 1000;
}

function isLevel7WallSegment(id: number): boolean {
  return id >= LEVEL7_WALL_ID && id < LEVEL7_WALL_ID + 1000;
}

function isScriptedLevelStructure(id: number): boolean {
  return isLevel3WallSegment(id) || isLevel4EquipmentSegment(id) || isLevel5FenceSegment(id) || isLevel7WallSegment(id);
}

function levelScenesFor(levelId: string): LevelSceneDef[] {
  return levelId === LEVEL8_ID ? LEVEL8_SCENES : levelId === LEVEL7_ID ? LEVEL7_SCENES : levelId === LEVEL6_ID ? LEVEL6_SCENES : levelId === LEVEL5_ID ? LEVEL5_SCENES : levelId === LEVEL4_ID ? LEVEL4_SCENES : levelId === LEVEL3_ID ? LEVEL3_SCENES : levelId === LEVEL2_ID ? LEVEL2_SCENES : LEVEL1_SCENES;
}

function levelTitleById(levelId: string | null): string {
  const def = LEVEL_DEFS.find((entry) => entry.id === levelId);
  return def ? `第 ${def.order} 关 · ${def.title}` : "关卡";
}

/** 通关结算提示：下一关确实已解锁时才显示「已开放」（与解锁链联动；占位卡/无下一关则预告制作中） */
function levelCompleteHint(levelId: string, cleared: string[]): string {
  const currentDef = LEVEL_DEFS.find((def) => def.id === levelId);
  const nextDef = LEVEL_DEFS.find((def) => def.order === (currentDef?.order ?? 0) + 1);
  if (nextDef?.playable && isLevelUnlocked(nextDef.id, cleared)) return `第 ${nextDef.order} 关『${nextDef.title}』已开放 · 从关卡模式进入`;
  return nextDef ? `第 ${nextDef.order} 关正在制作中，敬请期待` : "新关卡正在制作中，敬请期待";
}

/** 关卡 NPC（士兵）：field 复用搭档骨架（步态/持枪/换弹/后坐全通用）；combat=战斗型自动索敌射击，否则锚点巡逻；hold=钉在锚点射击不位移（夜防就位）；weapon=手持武器（默认 M16，夜防增援含 PKM 机枪手与燧石66 狙击手） */
type LevelNpc = {
  field: PartnerField;
  combat: boolean;
  anchorX: number;
  anchorY: number;
  hold?: boolean;
  weapon: WeaponKey;
  hp: number;
  maxHp: number;
  invulnerableUntil: number;
  /** 第六关突击队：跨场景跟随玩家并成为僵尸可选择的攻击目标。 */
  followPlayer?: boolean;
  targetable?: boolean;
  squadIndex?: number;
  /** 剧情运输员：位置由关卡事件直接驱动，不进入普通巡逻/战斗 AI。 */
  scripted?: boolean;
  carryingCrate?: boolean;
};

function makeLevelNpc(
  x: number,
  y: number,
  combat: boolean,
  hold = false,
  weapon: WeaponKey = "m16",
  options: { hp?: number; maxHp?: number; followPlayer?: boolean; targetable?: boolean; squadIndex?: number; scripted?: boolean; carryingCrate?: boolean } = {},
): LevelNpc {
  const field = freshPartnerField(x, y);
  field.ammo = WEAPONS[weapon].magazine;
  const hp = options.hp ?? 100;
  return {
    field, combat, anchorX: x, anchorY: y, hold, weapon,
    hp, maxHp: options.maxHp ?? hp, invulnerableUntil: 0,
    followPlayer: options.followPlayer,
    targetable: options.targetable,
    squadIndex: options.squadIndex,
    scripted: options.scripted,
    carryingCrate: options.carryingCrate,
  };
}

function levelZombieCount(scene: LevelSceneDef): number {
  return scene.zombies.length;
}

function levelSceneWorldWidth(levelId: string, sceneIndex: number, canvasW: number): number {
  const scene = levelScenesFor(levelId)[sceneIndex];
  const stairScene = (levelId === LEVEL4_ID && (sceneIndex === 4 || sceneIndex === 6)) || (levelId === LEVEL6_ID && sceneIndex === 7);
  const minimum = stairScene ? LEVEL4_STAIR_MIN_WORLD_W : 1;
  return Math.max(canvasW + scene.extra, minimum);
}

// 关卡预置僵尸：固定第 1 天基数（normal 62 / helmet 200），字段与 spawnZombie 生成结构保持一致
function makeLevelZombie(id: number, kind: ZombieKind, x: number, y: number, now: number): Zombie {
  const spec = kind === "normal" || kind === "brute" ? undefined : ZOMBIE_KIND_SPECS[kind];
  const hp = spec?.hp ?? 62;
  const radius = spec?.radius ?? 25;
  const skinTone = radius > 29 ? "#6e7c52" : "#7e8c60";
  const outfit = randomZombieOutfit(skinTone);
  return {
    id,
    kind,
    warehouseArmor: kind === "armored" || kind === "armoredRunner",
    x,
    y,
    hp,
    maxHp: hp,
    speed: (42 + Math.random() * 24) * (spec?.speedFactor ?? 1),
    radius,
    attack: spec?.attack ?? 8.7,
    damageReduction: spec?.damageReduction ?? 0,
    shieldIntact: kind === "shield",
    shieldHp: kind === "shield" ? SHIELD_HP : 0,
    shieldDents: [],
    spitAt: 0,
    nextSpitAt: now + 1200 + Math.random() * 900,
    lastHit: 0,
    attackHitApplied: true,
    knockedDownAt: 0,
    knockedDownUntil: 0,
    knockFacing: -1,
    knockStartFactor: 0,
    knockStartLift: 0,
    knockStartRecoveryProgress: 0,
    debuffedUntil: 0,
    staggeredUntil: 0,
    heldUntil: 0,
    ignitedAt: 0,
    missingLimbs: new Set<ZombieLimb>(),
    wounds: [],
    tint: outfit.top,
    outfit,
    wobble: Math.random() * 8,
  };
}

/** 第六关 Boss：沿用 mutant 的绘制、步态、受伤和断肢，仅覆盖剧情指定的体型与战斗参数。 */
function makeLevel6Boss(boss: Zombie, now: number): Zombie {
  boss.bossKind = "giantMutant";
  boss.hp = 1500;
  boss.maxHp = 1500;
  boss.radius = 54;
  boss.speed = LEVEL6_BOSS_SPEED;
  boss.y = LEVEL6_BOSS_SPAWN_Y;
  boss.attack = 50;
  boss.nextSpitAt = now + LEVEL6_BOSS_SPIT_INTERVAL_MS - LEVEL6_BOSS_SPIT_WINDUP_MS;
  return boss;
}

/** 第六关切换建筑内部场景时，按保留 HP 把仍存活的两名队友放到玩家身后。 */
function restoreLevel6Squad(g: GameState): void {
  const level = g.level;
  if (!level || level.levelId !== LEVEL6_ID || level.sceneIndex < 3 || level.squadHp.length === 0) return;
  for (let squadIndex = 0; squadIndex < level.squadHp.length; squadIndex++) {
    const hp = level.squadHp[squadIndex];
    if (hp <= 0) continue;
    g.npcs.push(makeLevelNpc(
      g.player.x - 70 - squadIndex * 58,
      g.player.y + (squadIndex === 0 ? -48 : 48),
      true,
      false,
      "m16",
      { hp, maxHp: LEVEL6_SQUAD_HP, followPlayer: true, targetable: true, squadIndex },
    ));
  }
}

// 第三关专属：本关生成的精英僵尸（奔跑系 + 盾兵本体）HP 覆盖为 500（生成处调用；生存/靶场/其他关卡不受影响）
function applyLevel3ZombieHp(z: Zombie): Zombie {
  if (LEVEL3_ELITE_KINDS.has(z.kind)) {
    z.hp = LEVEL3_ELITE_HP;
    z.maxHp = LEVEL3_ELITE_HP;
  }
  return z;
}

/** 第七关护甲僵尸：军队僵尸外形与公共动作不变，附加仓库重型插板及 99% 基础减伤。 */
function applyLevel7ArmorZombie(z: Zombie): Zombie {
  z.warehouseArmor = true;
  z.hp = LEVEL7_ARMORED_HP;
  z.maxHp = LEVEL7_ARMORED_HP;
  z.damageReduction = LEVEL7_ARMORED_REDUCTION;
  z.speed *= LEVEL7_ARMORED_SPEED_FACTOR;
  return z;
}

// 载入关卡场景：重置世界宽度/摄像机/场景实体，清掉上一场景的战斗残留，玩家放回入口
function loadLevelScene(g: GameState, sceneIndex: number, now: number, canvasW: number): void {
  const levelId = g.level?.levelId ?? LEVEL1_ID;
  const scene = levelScenesFor(levelId)[sceneIndex];
  const stairScene = (levelId === LEVEL4_ID && (sceneIndex === 4 || sceneIndex === 6)) || (levelId === LEVEL6_ID && sceneIndex === 7);
  const worldW = levelSceneWorldWidth(levelId, sceneIndex, canvasW);
  g.worldW = worldW;
  g.cameraX = 0;
  g.zombies = scene.zombies.map((z, i) => {
    const zombie = makeLevelZombie(1000 + sceneIndex * 100 + i, z.kind, Math.round(z.fx * worldW), 280 + ((i * 137) % 260), now);
    if (g.level?.levelId === LEVEL3_ID) return applyLevel3ZombieHp(zombie);
    if (g.level?.levelId === LEVEL6_ID && sceneIndex === 8 && i === 0) return makeLevel6Boss(zombie, now);
    if (g.level?.levelId === LEVEL7_ID && sceneIndex === 3 && i >= LEVEL7_JUGGERNAUTS + LEVEL7_SHIELDS) return applyLevel7ArmorZombie(zombie);
    return zombie;
  });
  g.corpses = [];
  g.particles = [];
  g.tracers = [];
  g.bloodStains = [];
  g.detachedLimbs = [];
  g.metalShards = [];
  g.blastEffects = [];
  g.explosiveProjectiles = [];
  g.spits = [];
  g.barricades = [];
  g.deployedItems = [];
  // 关卡掉落武器按 sceneIndex 留存在整局状态中；切场景只追加该场景预置物，不清除玩家此前丢下的武器。
  g.pickups.push(...scene.pickups.map((pk, i) => ({
    // 预置物使用稳定负数 ID，与运行时丢弃物的正数 ID 隔离；重复载入场景也不会复制或复活已拾取武器。
    id: -(sceneIndex * 100 + i + 1),
    sceneIndex,
    weapon: pk.weapon,
    x: Math.round(pk.fx * worldW),
    y: pk.y,
    onTable: Boolean(pk.onTable),
    taken: false,
  })).filter((preset) => !g.pickups.some((existing) => existing.id === preset.id)));
  g.obstacles = scene.obstacles.map((ob) => ({
    kind: ob.kind,
    x: Math.round(ob.fx * worldW),
    y: ob.y,
    w: ob.w,
    h: ob.h,
    seed: ob.seed,
  }));
  const p = g.player;
  p.x = scene.entryX;
  p.y = 420;
  p.angle = 0;
  p.reloadStartedAt = 0;
  p.reloadingUntil = 0;
  p.lastKick = 0;
  p.invulnerableUntil = now + 800;
  p.moving = false;
  // 场景 NPC（军事基地巡逻士兵）；战斗型 NPC 由事件动态加入
  g.npcs = (scene.patrols ?? []).map((pt) => makeLevelNpc(Math.round(pt.fx * worldW), pt.y, false));
  if (g.level) {
    g.level.sceneIndex = sceneIndex;
    g.level.sceneKills = 0;
    g.level.eventStage = "none";
    g.level.eventAt = 0;
    g.level.eventCount = 0;
    g.level.nextEventSpawnAt = 0;
    g.level.truckX = -1;
    g.level.truckY = -1;
    g.level.truckStopX = 0;
    g.level.wallHp = 0;
    g.level.vehicleHp = 0;
    g.level.vehicleAmmo = 0;
    g.level.vehicleLastShot = 0;
    g.level.vehicleReloadUntil = 0;
    g.level.vehicleAimAngle = 0;
    g.level.dialog = null;
    if (stairScene) {
      p.x = Math.max(52, worldW * LEVEL4_STAIR_LOWER_START_FX);
      p.y = LEVEL4_STAIR_BOTTOM_Y;
    }
    restoreLevel6Squad(g);
  }
}

function collideObstacles(obstacles: LevelObstacle[], x: number, y: number, r: number): [number, number] {
  let nx = x;
  let ny = y;
  for (const ob of obstacles) {
    const left = ob.x - ob.w / 2 - r;
    const right = ob.x + ob.w / 2 + r;
    const top = ob.y - ob.h / 2 - r;
    const bottom = ob.y + ob.h / 2 + r;
    if (nx > left && nx < right && ny > top && ny < bottom) {
      const pushLeft = nx - left;
      const pushRight = right - nx;
      const pushTop = ny - top;
      const pushBottom = bottom - ny;
      const minPush = Math.min(pushLeft, pushRight, pushTop, pushBottom);
      if (minPush === pushLeft) nx = left;
      else if (minPush === pushRight) nx = right;
      else if (minPush === pushTop) ny = top;
      else ny = bottom;
    }
  }
  return [nx, ny];
}

function levelTaskText(g: GameState, now: number): string {
  if (!g.level) return "";
  const scene = levelScenesFor(g.level.levelId)[g.level.sceneIndex];
  const task = scene.tasks[g.level.taskIndex];
  if (!task) return "";
  if (g.level.levelId === LEVEL8_ID) {
    if (task.id === "clear-highway") return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL8_HIGHWAY_TOTAL)}/${LEVEL8_HIGHWAY_TOTAL} · 装甲车 ${Math.ceil(g.level.vehicleHp)} HP）`;
    if (task.id === "clear-toll-station") return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL8_TOLL_TOTAL)}/${LEVEL8_TOLL_TOTAL}）`;
  }
  if (g.level.levelId === LEVEL7_ID) {
    if (task.id === "clear-warehouse") return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL7_INITIAL_TOTAL)}/${LEVEL7_INITIAL_TOTAL}）`;
    if (task.id === "protect-supplies") {
      return `${task.text}（运输 ${Math.min(2, Math.floor(g.level.eventCount / 2))}/2 · 围墙 ${Math.ceil(g.level.wallHp)} HP）`;
    }
  }
  if (g.level.levelId === LEVEL6_ID) {
    const livingSquad = g.level.squadHp.filter((hp) => hp > 0).length;
    const squadSuffix = g.level.squadHp.length ? ` · 队友 ${livingSquad}/${LEVEL6_SQUAD_SIZE}` : "";
    if (g.level.sceneIndex === 3) return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL6_CORRIDOR_ONE_TOTAL)}/${LEVEL6_CORRIDOR_ONE_TOTAL}${squadSuffix}）`;
    if (g.level.sceneIndex === 4) return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL6_POWER_ROOM_TOTAL)}/${LEVEL6_POWER_ROOM_TOTAL}${squadSuffix}）`;
    if (g.level.sceneIndex === 5) return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL6_CORRIDOR_TWO_TOTAL)}/${LEVEL6_CORRIDOR_TWO_TOTAL}${squadSuffix}）`;
    if (g.level.sceneIndex === 6) return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL6_ARCHIVE_TOTAL)}/${LEVEL6_ARCHIVE_TOTAL}${squadSuffix}）`;
    if (g.level.sceneIndex === 8) return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL6_CENTRAL_HALL_TOTAL)}/${LEVEL6_CENTRAL_HALL_TOTAL}${squadSuffix}）`;
  }
  if (task.id === "clear-corridor" || task.id === "clear-street") {
    return `${task.text}（${Math.min(g.level.sceneKills, levelZombieCount(scene))}/${levelZombieCount(scene)}）`;
  }
  if (task.id === "reach-gas") {
    return `${task.text}（${Math.min(g.level.sceneKills, LEVEL2_ROAD_KILLS)}/${LEVEL2_ROAD_KILLS}）`;
  }
  if (task.id === "survive") {
    const remain = Math.max(0, Math.ceil((LEVEL2_SURVIVE_MS - (now - g.level.eventAt)) / 1000));
    return `${task.text}（增援抵达 ${remain} 秒）`;
  }
  if (task.id === "defend-wave") {
    return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL3_DEFEND_TOTAL)}/${LEVEL3_DEFEND_TOTAL} · 围墙 ${Math.ceil(g.level.wallHp)} HP）`;
  }
  if (task.id === "scout") {
    return `${task.text}（突变僵尸 ${Math.min(g.level.sceneKills, LEVEL3_MUTANTS)}/${LEVEL3_MUTANTS}）`;
  }
  if (task.id === "kill-juggernaut") {
    return `${task.text}（仅胸口可伤 · 减免 70% · 高穿透武器可削弱减伤 · 破片手榴弹有效）`;
  }
  if (task.id === "clear-floor-1" || task.id === "clear-floor-2") {
    return `${task.text}（击杀 ${Math.min(g.level.sceneKills, levelZombieCount(scene))}/${levelZombieCount(scene)}）`;
  }
  if (task.id === "defend-radio" && g.level.eventStage === "repair") {
    const remain = Math.max(0, Math.ceil((LEVEL4_REPAIR_MS - (now - g.level.eventAt)) / 1000));
    return `${task.text}（维修剩余 ${remain} 秒 · 设备 ${Math.ceil(g.level.wallHp)} HP）`;
  }
  if (task.id === "repair-power" && g.level.eventStage === "power") {
    const remain = Math.max(0, Math.ceil((LEVEL5_REPAIR_MS - (now - g.level.eventAt)) / 1000));
    return `${task.text}（维修剩余 ${remain} 秒 · 围栏 ${Math.ceil(g.level.wallHp)} HP）`;
  }
  if (task.id === "find-survivor") {
    return `${task.text}（清剿 ${Math.min(g.level.sceneKills, LEVEL5_RESCUE_TOTAL)}/${LEVEL5_RESCUE_TOTAL}）`;
  }
  if (task.id === "clear-rescue-road") {
    return `${task.text}（击杀 ${Math.min(g.level.sceneKills, LEVEL5_ROAD_TOTAL)}/${LEVEL5_ROAD_TOTAL}）`;
  }
  return task.text;
}

// ===== 关卡模式：场景与道具绘制（世界坐标，drawWorld 已完成摄像机平移）=====

function drawLevel8Highway(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const sky = ctx.createLinearGradient(0, 0, 0, 190);
  sky.addColorStop(0, "#6e8994"); sky.addColorStop(1, "#c0b79d");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 190);
  ctx.fillStyle = "#454944"; ctx.fillRect(0, 150, W, H - 150);
  ctx.fillStyle = "#313531"; ctx.fillRect(0, 190, W, 430);
  ctx.fillStyle = "#d8c248";
  for (let x = 20; x < W; x += 260) ctx.fillRect(x, 390, 150, 9);
  ctx.fillStyle = "#e8e4d5";
  for (let x = 80; x < W; x += 340) { ctx.fillRect(x, 248, 190, 7); ctx.fillRect(x, 540, 190, 7); }
  ctx.fillStyle = "#7d817b"; ctx.fillRect(0, 172, W, 20); ctx.fillRect(0, 615, W, 18);
  ctx.strokeStyle = "#aeb2aa"; ctx.lineWidth = 5;
  for (const y of [184, 620]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    for (let x = 40; x < W; x += 180) { ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 22); ctx.stroke(); }
  }
  for (let x = 700; x < W - 900; x += 1500) {
    ctx.fillStyle = "#315f55"; ctx.fillRect(x, 76, 300, 72);
    ctx.strokeStyle = "#d8ddd5"; ctx.lineWidth = 4; ctx.strokeRect(x, 76, 300, 72);
    drawText(ctx, "前方收费站", x + 150, 108, 20, "#eef1e8", "center");
    drawText(ctx, `${Math.max(1, Math.ceil((W - x) / 1800))} KM`, x + 150, 136, 15, "#d9e4dc", "center");
    ctx.fillStyle = "#59605b"; ctx.fillRect(x + 38, 148, 12, 70); ctx.fillRect(x + 250, 148, 12, 70);
  }
  const tollX = LEVEL8_TOLL_FX * W;
  ctx.fillStyle = "#d4d0c3"; ctx.fillRect(tollX - 440, 82, 880, 128);
  ctx.fillStyle = "#3c615b"; ctx.fillRect(tollX - 460, 62, 920, 38);
  drawText(ctx, "17号高速收费站", tollX, 90, 24, "#f4f0dd", "center");
  for (let lane = -3; lane <= 3; lane++) {
    const boothX = tollX + lane * 112;
    ctx.fillStyle = "#707b78"; ctx.fillRect(boothX - 35, 178, 70, 170);
    ctx.fillStyle = "#9eb4b3"; ctx.fillRect(boothX - 25, 198, 50, 48);
    ctx.fillStyle = "#1f2e2d"; ctx.fillRect(boothX - 29, 270, 58, 78);
    ctx.fillStyle = lane % 2 ? "#d8b346" : "#a23c35"; ctx.fillRect(boothX - 35, 166, 70, 12);
  }
  drawText(ctx, "WASD 驾驶装甲车 · 左键操控重机枪 · R 换弹", Math.max(440, g.cameraX + 520), 680, 17, "#f1df9b", "center");
  void now;
}

function drawLevel8TollCorridor(ctx: CanvasRenderingContext2D, g: GameState) {
  const W = g.worldW;
  ctx.fillStyle = "#555d5d"; ctx.fillRect(0, 0, W, 455);
  ctx.fillStyle = "#2f3535"; ctx.fillRect(0, 455, W, H - 455);
  ctx.fillStyle = "#3c4444"; ctx.fillRect(0, 0, W, 54);
  for (let x = 110; x < W; x += 430) {
    ctx.fillStyle = "#d8cf9c"; ctx.fillRect(x, 70, 220, 13);
    ctx.fillStyle = "rgba(228,218,170,.12)"; ctx.beginPath(); ctx.moveTo(x - 35, 83); ctx.lineTo(x + 255, 83); ctx.lineTo(x + 320, 455); ctx.lineTo(x - 100, 455); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#77807d";
  for (let x = 60; x < W; x += 560) {
    ctx.fillRect(x, 146, 230, 184);
    ctx.fillStyle = "#30494b"; ctx.fillRect(x + 18, 166, 194, 86);
    ctx.strokeStyle = "#99acab"; ctx.lineWidth = 3; ctx.strokeRect(x + 18, 166, 194, 86);
    ctx.fillStyle = "#77807d";
  }
  ctx.fillStyle = "#252a2a"; ctx.fillRect(0, 445, W, 18);
  ctx.fillStyle = "#c7aa3b"; for (let x = 0; x < W; x += 180) ctx.fillRect(x, 570, 105, 8);
  drawText(ctx, "收费站管理走廊", 220, 122, 26, "#e1e5df", "center");
  drawText(ctx, "出口 / 管理中心", W - 260, 120, 20, "#d3c982", "center");
}

function drawLevel8ArmoredVehicle(ctx: CanvasRenderingContext2D, level: LevelRunState, now: number, parkedX = level.truckX, parkedY = level.truckY) {
  const x = parkedX;
  const y = parkedY;
  ctx.save(); ctx.translate(x, y);
  // M-ATV-inspired four-wheel MRAP silhouette：参照真实 M-ATV 的短轴距、高离地间隙、独立发动机舱和单体装甲乘员舱。
  ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.beginPath(); ctx.ellipse(0, 13, 187, 29, 0, 0, Math.PI * 2); ctx.fill();

  // 后挂备胎先绘制在乘员舱之后，形成真实车尾轮廓。
  ctx.fillStyle = "#171a17"; ctx.beginPath(); ctx.arc(-157, -102, 31, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#454b43"; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = "#555d53"; ctx.beginPath(); ctx.arc(-157, -102, 11, 0, Math.PI * 2); ctx.fill();

  const wheelCenters = [-108, 104];
  // TAK-4-style independent suspension：可见的上/下摆臂、减振筒和高离地车架。
  ctx.strokeStyle = "#252b26"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-143, -44); ctx.lineTo(139, -44); ctx.stroke();
  for (const wx of wheelCenters) {
    ctx.strokeStyle = "#343b34"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(wx - 27, -48); ctx.lineTo(wx, -13); ctx.lineTo(wx + 31, -47); ctx.stroke();
    ctx.strokeStyle = "#697167"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(wx - 8, -56); ctx.lineTo(wx + 7, -18); ctx.stroke();
    ctx.fillStyle = "#151916"; ctx.beginPath(); ctx.arc(wx, 0, 43, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3b423b"; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = "#0b0e0c"; ctx.lineWidth = 3;
    for (let lug = 0; lug < 12; lug++) {
      const a = lug * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * 34, Math.sin(a) * 34); ctx.lineTo(wx + Math.cos(a) * 41, Math.sin(a) * 41); ctx.stroke();
    }
    ctx.fillStyle = "#667067"; ctx.beginPath(); ctx.arc(wx, 0, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2b312c"; ctx.beginPath(); ctx.arc(wx, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a2a89e";
    for (let bolt = 0; bolt < 6; bolt++) { const a = bolt * Math.PI / 3; ctx.beginPath(); ctx.arc(wx + Math.cos(a) * 11, Math.sin(a) * 11, 1.8, 0, Math.PI * 2); ctx.fill(); }
  }

  // V-hull keel：从两侧装甲向中央低点收束，前后以独立车架承托。
  const hullGradient = ctx.createLinearGradient(0, -72, 0, 9);
  hullGradient.addColorStop(0, "#56604f"); hullGradient.addColorStop(1, "#2c342d");
  ctx.fillStyle = hullGradient; ctx.beginPath();
  ctx.moveTo(-150, -78); ctx.lineTo(142, -78); ctx.lineTo(128, -35); ctx.lineTo(18, 8); ctx.lineTo(-127, -33); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#252c26"; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = "#1f2520"; ctx.fillRect(-178, -61, 31, 20); ctx.fillRect(143, -63, 37, 22);
  ctx.strokeStyle = "#4f594e"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-172, -51); ctx.lineTo(-186, -35); ctx.moveTo(168, -51); ctx.lineTo(184, -34); ctx.stroke();

  // 单体装甲乘员舱：高而窄、车尾近乎垂直，前风挡与车鼻之间有明确折线。
  const capsuleGradient = ctx.createLinearGradient(-30, -194, 20, -62);
  capsuleGradient.addColorStop(0, "#78826c"); capsuleGradient.addColorStop(.55, "#626d5a"); capsuleGradient.addColorStop(1, "#465043");
  ctx.fillStyle = capsuleGradient; ctx.beginPath();
  ctx.moveTo(-148, -69); ctx.lineTo(-151, -144); ctx.lineTo(-119, -190); ctx.lineTo(25, -190); ctx.lineTo(73, -137); ctx.lineTo(77, -70); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#2c342d"; ctx.lineWidth = 5; ctx.stroke();
  // 前置发动机舱：低于乘员舱，斜置引擎盖与近垂直散热器构成真实车头。
  ctx.fillStyle = "#596451"; ctx.beginPath();
  ctx.moveTo(68, -132); ctx.lineTo(145, -119); ctx.lineTo(170, -91); ctx.lineTo(164, -59); ctx.lineTo(76, -59); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#293129"; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = "#303932"; ctx.beginPath(); ctx.moveTo(146, -112); ctx.lineTo(169, -89); ctx.lineTo(163, -66); ctx.lineTo(148, -68); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#707a69"; ctx.lineWidth = 2;
  for (let gy = -103; gy <= -74; gy += 7) { ctx.beginPath(); ctx.moveTo(151, gy); ctx.lineTo(165, gy + 3); ctx.stroke(); }
  ctx.fillStyle = "#d8cf9a"; ctx.beginPath(); ctx.ellipse(157, -111, 10, 7, -.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8c2f2b"; ctx.fillRect(-154, -116, 8, 21);

  // ballistic-glass trapezoids：小面积厚防弹玻璃嵌入两扇重型装甲门，前窗沿 A 柱倾斜。
  const glassGradient = ctx.createLinearGradient(0, -181, 0, -139);
  glassGradient.addColorStop(0, "#26383a"); glassGradient.addColorStop(1, "#122124");
  ctx.fillStyle = glassGradient;
  ctx.beginPath(); ctx.moveTo(-108, -178); ctx.lineTo(-57, -178); ctx.lineTo(-54, -145); ctx.lineTo(-116, -145); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-44, -178); ctx.lineTo(18, -178); ctx.lineTo(53, -139); ctx.lineTo(-40, -139); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#9aa99f"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-108, -178); ctx.lineTo(-57, -178); ctx.lineTo(-54, -145); ctx.lineTo(-116, -145); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-44, -178); ctx.lineTo(18, -178); ctx.lineTo(53, -139); ctx.lineTo(-40, -139); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = "rgba(190,215,205,.18)"; ctx.beginPath(); ctx.moveTo(-102, -174); ctx.lineTo(-78, -174); ctx.lineTo(-91, -150); ctx.lineTo(-109, -150); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-36, -174); ctx.lineTo(-8, -174); ctx.lineTo(28, -145); ctx.lineTo(-31, -145); ctx.closePath(); ctx.fill();

  // 四人乘员舱的前后门、外露铰链、门闩、射击孔和侧踏板。
  ctx.strokeStyle = "#2b332c"; ctx.lineWidth = 2.5;
  ctx.strokeRect(-129, -136, 73, 68); ctx.beginPath(); ctx.moveTo(-49, -137); ctx.lineTo(56, -137); ctx.lineTo(65, -70); ctx.lineTo(-49, -70); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = "#30382f";
  for (const hinge of [[-126, -124], [-126, -81], [-45, -124], [-45, -81]]) { ctx.fillRect(hinge[0], hinge[1], 8, 13); }
  ctx.fillStyle = "#1d241e"; ctx.fillRect(-78, -112, 15, 5); ctx.fillRect(23, -110, 15, 5);
  ctx.fillStyle = "#232a24"; ctx.beginPath(); ctx.arc(-84, -125, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(10, -123, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3c463b"; ctx.fillRect(-131, -60, 76, 10); ctx.fillRect(-47, -60, 105, 10);
  ctx.strokeStyle = "#222922"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-123, -50); ctx.lineTo(-112, -39); ctx.lineTo(-64, -39); ctx.moveTo(-37, -50); ctx.lineTo(-26, -39); ctx.lineTo(38, -39); ctx.stroke();
  // 轮拱边缘与装甲接缝强调车体并非规则矩形。
  ctx.strokeStyle = "#252c26"; ctx.lineWidth = 5;
  for (const wx of wheelCenters) { ctx.beginPath(); ctx.arc(wx, -2, 51, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); }
  ctx.fillStyle = "#242b25"; for (const px of [-140, -123, -55, -47, 57, 72, 139]) for (const py of [-132, -73]) { ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); }

  // 后置排气筒、前视镜、天线座和拖车钩。
  ctx.strokeStyle = "#303730"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-136, -144); ctx.lineTo(-169, -157); ctx.lineTo(-169, -194); ctx.stroke();
  ctx.fillStyle = "#171d19"; ctx.fillRect(-174, -199, 10, 14);
  ctx.strokeStyle = "#252c26"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(61, -148); ctx.lineTo(88, -163); ctx.stroke();
  ctx.fillStyle = "#182023"; ctx.fillRect(84, -172, 18, 14);
  ctx.strokeStyle = "#313a32"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-96, -188); ctx.lineTo(-116, -238); ctx.moveTo(17, -190); ctx.lineTo(25, -247); ctx.stroke();
  ctx.fillStyle = "#242b25"; ctx.beginPath(); ctx.arc(171, -48, 8, 0, Math.PI * 2); ctx.stroke();

  // 低矮遥控武器站：旋转座圈、装甲光电舱、弹药箱与带散热套筒的重机枪。
  ctx.fillStyle = "#374137"; ctx.beginPath(); ctx.ellipse(LEVEL8_HMG_MOUNT_X, -191, 51, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#202721"; ctx.lineWidth = 3; ctx.stroke();
  ctx.save(); ctx.translate(LEVEL8_HMG_MOUNT_X, LEVEL8_HMG_MOUNT_Y); ctx.rotate(level.vehicleAimAngle);
  ctx.fillStyle = "#66725e"; ctx.beginPath(); roundedRect(ctx, -27, -25, 55, 49, 6); ctx.fill();
  ctx.strokeStyle = "#2b332c"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#202722"; ctx.beginPath(); roundedRect(ctx, -17, -34, 30, 15, 3); ctx.fill();
  ctx.fillStyle = "#a7b4a9"; ctx.beginPath(); ctx.arc(-3, -27, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#475246"; ctx.beginPath(); roundedRect(ctx, -48, -17, 19, 34, 3); ctx.fill();
  ctx.fillStyle = "#161b18"; ctx.fillRect(22, -8, LEVEL8_HMG_MUZZLE_X - 22, 15); ctx.fillRect(132, -12, LEVEL8_HMG_MUZZLE_X - 132, 23);
  ctx.strokeStyle = "#7a8378"; ctx.lineWidth = 1.5;
  for (let bx = 45; bx < 132; bx += 14) { ctx.beginPath(); ctx.moveTo(bx, -7); ctx.lineTo(bx, 6); ctx.stroke(); }
  if (now - level.vehicleLastShot < 70) {
    ctx.fillStyle = "#fff2b0"; ctx.beginPath(); ctx.moveTo(LEVEL8_HMG_MUZZLE_X, 0); ctx.lineTo(196, -12); ctx.lineTo(181, 0); ctx.lineTo(197, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(238,151,46,.35)"; ctx.beginPath(); ctx.arc(LEVEL8_HMG_MUZZLE_X + 6, 0, 21, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#e2e5d8"; ctx.fillRect(-114, -105, 36, 22); drawText(ctx, "08", -96, -88, 14, "#273127", "center");
  drawText(ctx, "M-ATV", -16, -77, 11, "rgba(224,231,216,.72)", "center");
  ctx.restore();
}

function drawLevelBackground(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const sceneIndex = g.level?.sceneIndex ?? 0;
  if (g.level?.levelId === LEVEL8_ID) {
    if (sceneIndex === 0) drawLevel4Briefing(ctx, g, now);
    else if (sceneIndex === 1) drawLevel4BaseYard(ctx, g, now);
    else if (sceneIndex === 2) drawLevel8Highway(ctx, g, now);
    else drawLevel8TollCorridor(ctx, g);
    return;
  }
  if (g.level?.levelId === LEVEL7_ID) {
    if (sceneIndex === 0) drawLevel4Briefing(ctx, g, now);
    else if (sceneIndex === 1) drawLevel4BaseYard(ctx, g, now);
    else if (sceneIndex === 2) drawLevel7WarehouseExterior(ctx, g, now);
    else drawLevel7WarehouseInterior(ctx, g, now);
    return;
  }
  if (g.level?.levelId === LEVEL6_ID) {
    if (sceneIndex === 0) drawLevel4Briefing(ctx, g, now);
    else if (sceneIndex === 1) drawLevel4BaseYard(ctx, g, now);
    else if (sceneIndex === 2) drawLevel6CityHallExterior(ctx, g, now);
    else if (sceneIndex === 3) drawLevel6Corridor(ctx, g, now, false, "配电室方向");
    else if (sceneIndex === 4) drawLevel6PowerRoom(ctx, g, now);
    else if (sceneIndex === 5) drawLevel6Corridor(ctx, g, now, true, "档案室方向");
    else if (sceneIndex === 6) drawLevel6Archives(ctx, g, now);
    else if (sceneIndex === 7) drawLevel4Stairwell(ctx, g, 3);
    else drawLevel6CentralHall(ctx, g, now);
    return;
  }
  if (g.level?.levelId === LEVEL5_ID) {
    if (sceneIndex === 0) drawLevel5MonitoringRoom(ctx, g, now);
    else if (sceneIndex === 1) drawLevel5Helipad(ctx, g, now);
    else if (sceneIndex === 2) drawLevel5TunnelEntrance(ctx, g);
    else if (sceneIndex === 3) drawLevel5Tunnel(ctx, g, now, false, "power");
    else if (sceneIndex === 4) drawLevel5Tunnel(ctx, g, now, true, "rescue");
    else drawLevel5Tunnel(ctx, g, now, true, "road");
    return;
  }
  if (g.level?.levelId === LEVEL4_ID) {
    if (sceneIndex === 0) drawLevel4Briefing(ctx, g, now);
    else if (sceneIndex === 1) drawLevel4BaseYard(ctx, g, now);
    else if (sceneIndex === 2) drawLevel4StationGate(ctx, g, now);
    else if (sceneIndex === 3) drawLevel4Floor(ctx, g, now, 1);
    else if (sceneIndex === 4) drawLevel4Stairwell(ctx, g, 2);
    else if (sceneIndex === 5) drawLevel4Floor(ctx, g, now, 2);
    else if (sceneIndex === 6) drawLevel4Stairwell(ctx, g, 3);
    else if (sceneIndex === 7) drawLevel4Roof(ctx, g, now);
    else drawLevel4RoofDefense(ctx, g, now);
    return;
  }
  if (g.level?.levelId === LEVEL3_ID) {
    if (sceneIndex === 0) drawLevelDorm(ctx, g, now);
    else if (sceneIndex === 1) drawLevelNightBase(ctx, g, now);
    else drawLevelDirtRoad(ctx, g);
    return;
  }
  if (g.level?.levelId === LEVEL2_ID) {
    if (sceneIndex === 0) drawLevelHighway(ctx, g);
    else drawLevelBase(ctx, g, now);
    return;
  }
  if (sceneIndex === 0) drawLevelHome(ctx, g);
  else if (sceneIndex === 1) drawLevelCorridor(ctx, g, now);
  else drawLevelStreet(ctx, g, now);
}

// ===== 第三关「防守基地」场景绘制与黑夜光照系统 =====

// 场景 0：军营宿舍——夜色营房（床铺/储物柜/窗/大门），开场演出时在床上绘制睡卧/起身的人物
function drawLevelDorm(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  // 墙与地板（熄灯后的军营宿舍：青灰冷色调）
  const wall = ctx.createLinearGradient(0, 0, 0, 460);
  wall.addColorStop(0, "#131a18"); wall.addColorStop(1, "#1e2823");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, 460);
  const floor = ctx.createLinearGradient(0, 460, 0, H);
  floor.addColorStop(0, "#262b26"); floor.addColorStop(1, "#191d19");
  ctx.fillStyle = floor; ctx.fillRect(0, 460, W, H - 460);
  ctx.fillStyle = "#0e1311"; ctx.fillRect(0, 452, W, 10);
  // 夜窗：两块泛着夜色的窗玻璃 + 月光斜影
  for (const wx of [W * 0.34, W * 0.58]) {
    ctx.fillStyle = "#0d1522"; ctx.fillRect(wx, 120, 130, 150);
    ctx.strokeStyle = "#2a352f"; ctx.lineWidth = 6; ctx.strokeRect(wx, 120, 130, 150);
    ctx.beginPath(); ctx.moveTo(wx + 65, 120); ctx.lineTo(wx + 65, 270); ctx.moveTo(wx, 195); ctx.lineTo(wx + 130, 195); ctx.stroke();
    ctx.fillStyle = "rgba(190,205,225,.06)";
    ctx.beginPath(); ctx.moveTo(wx + 16, 270); ctx.lineTo(wx + 96, 270); ctx.lineTo(wx + 150, 452); ctx.lineTo(wx + 40, 452); ctx.closePath(); ctx.fill();
  }
  // 空床铺排（第二、三张床，暗示同寝室友已出勤）
  for (const bx of [W * 0.42, W * 0.62]) {
    ctx.fillStyle = "#232d27"; ctx.fillRect(bx, 470, 250, 20);
    ctx.fillStyle = "#1a211d"; ctx.fillRect(bx, 490, 16, 70); ctx.fillRect(bx + 234, 490, 16, 70);
    ctx.fillStyle = "#2c352d"; ctx.fillRect(bx + 8, 442, 234, 30);
    ctx.fillStyle = "#39423a"; ctx.fillRect(bx + 14, 446, 64, 22);
  }
  // 储物柜
  for (const lx of [W * 0.80, W * 0.845]) {
    ctx.fillStyle = "#26302a"; ctx.fillRect(lx, 330, 56, 130);
    ctx.strokeStyle = "#161d19"; ctx.lineWidth = 3; ctx.strokeRect(lx, 330, 56, 130);
    ctx.beginPath(); ctx.moveTo(lx + 40, 344); ctx.lineTo(lx + 40, 402); ctx.stroke();
  }
  // 主角床铺（床头朝左，被褥军绿）
  ctx.fillStyle = "#2b352e"; ctx.fillRect(130, 470, 300, 22);
  ctx.fillStyle = "#1a211d"; ctx.fillRect(134, 492, 18, 82); ctx.fillRect(408, 492, 18, 82);
  ctx.fillStyle = "#333e35"; ctx.fillRect(138, 436, 284, 36);
  ctx.fillStyle = "#d8d4c4"; ctx.fillRect(146, 440, 62, 26);
  // 墙上「熄灯纪律」告示与门牌
  ctx.fillStyle = "#c8b890"; ctx.fillRect(W * 0.24, 150, 90, 60);
  drawText(ctx, "熄灯", W * 0.24 + 45, 176, 17, "#33383d", "center");
  drawText(ctx, "静音", W * 0.24 + 45, 198, 17, "#33383d", "center");
  // 大门（右侧出口，门缝透光）
  ctx.fillStyle = "#10150f"; ctx.fillRect(W - 120, 210, 86, 250);
  ctx.strokeStyle = "#3a4436"; ctx.lineWidth = 5; ctx.strokeRect(W - 120, 210, 86, 250);
  ctx.fillStyle = "rgba(214,190,120,.28)"; ctx.fillRect(W - 44, 214, 5, 242);
  ctx.fillStyle = "#c8b890"; ctx.fillRect(W - 128, 168, 100, 30);
  drawText(ctx, "宿舍门", W - 78, 190, 16, "#33383d", "center");
  // 开场演出：睡卧 → 起身（可控后由正常玩家模型接管）
  const level = g.level;
  if (level && (level.eventStage === "sleep" || level.eventStage === "rise")) {
    const riseT = level.eventStage === "rise" ? Math.min(1, (now - level.eventAt) / LEVEL3_RISE_MS) : 0;
    drawDormSleeper(ctx, riseT, now);
  }
}

// 开场演出人物：睡卧呼吸（riseT=0）→ 坐起 → 双腿挪下床沿站立（riseT→1 后切换为玩家模型）
function drawDormSleeper(ctx: CanvasRenderingContext2D, riseT: number, now: number) {
  const breath = riseT === 0 ? Math.sin(now / 680) * 2.2 : 0;
  const sit = Math.min(1, riseT / 0.6);            // 坐起进度
  const stand = Math.max(0, (riseT - 0.55) / 0.45); // 下床进度
  ctx.save();
  ctx.translate(300, 446);
  // 双腿：平躺 → 垂下床沿
  ctx.fillStyle = "#3b4531";
  ctx.beginPath();
  ctx.roundRect(10, 8 - sit * 4, 108 - stand * 62, 22 - sit * 6, 6);
  ctx.fill();
  if (stand > 0) ctx.fillRect(96, 22, 18, 64 * stand);
  // 躯干：自平躺逐渐立起（绕髋部旋转）
  ctx.save();
  ctx.rotate(-sit * (Math.PI / 2.15));
  ctx.fillStyle = "#4f5c3f";
  ctx.beginPath(); ctx.roundRect(-14, -26 - breath * 0.4, 88, 30 + breath, 9); ctx.fill();
  // 手臂交叠胸前
  ctx.fillStyle = "#434f36";
  ctx.beginPath(); ctx.roundRect(16, -22 - breath * 0.5, 46, 12, 6); ctx.fill();
  // 头（枕上 → 抬起）
  ctx.fillStyle = "#d0a079";
  ctx.beginPath(); ctx.arc(86, -12 - breath, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1a1f1d";
  ctx.beginPath(); ctx.arc(83, -17 - breath, 11, Math.PI * 0.9, Math.PI * 2.05); ctx.fill();
  ctx.restore();
  // 军绿被子：随坐起滑落到腿上
  ctx.fillStyle = "#46523b";
  ctx.beginPath();
  ctx.roundRect(6, -6 + sit * 14 - breath * 0.6, 116 - sit * 30, 20 + breath * 0.8, 7);
  ctx.fill();
  ctx.restore();
}

// 场景 1：基地外墙夜防——星空/岗哨塔/混凝土围墙（射击孔 + 沙袋）/ 红色警灯座
function drawLevelNightBase(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const wallX = LEVEL3_WALL_FX * W;
  // 夜空与星
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 24);
  sky.addColorStop(0, "#05080f"); sky.addColorStop(1, "#0c1220");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 24);
  ctx.fillStyle = "rgba(220,228,240,.5)";
  for (let i = 0; i < 40; i++) {
    const sx = (i * 173) % W;
    const sy = (i * 97) % 130 + 8;
    ctx.globalAlpha = 0.25 + ((i * 37) % 10) / 18;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;
  // 地面（夯土训练场，夜里近乎全黑）
  const ground = ctx.createLinearGradient(0, ROAD_TOP + 24, 0, H);
  ground.addColorStop(0, "#232a22"); ground.addColorStop(1, "#14180f");
  ctx.fillStyle = ground; ctx.fillRect(0, ROAD_TOP + 24, W, H - ROAD_TOP - 24);
  // 基地侧（围墙左）：营房剪影 + 旗杆
  ctx.fillStyle = "#12170f";
  ctx.fillRect(60, 120, 320, 64); ctx.fillRect(120, 96, 180, 26);
  ctx.strokeStyle = "#1c2318"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(W * 0.1, 184); ctx.lineTo(W * 0.1, 90); ctx.stroke();
  // 岗哨塔（探照灯座，灯光由光照系统绘制）
  for (const tx of [0.2 * W, 0.42 * W]) {
    ctx.fillStyle = "#1a201a"; ctx.fillRect(tx - 8, 96, 16, 92);
    ctx.fillStyle = "#242c24"; ctx.fillRect(tx - 30, 66, 60, 36);
    ctx.fillStyle = "#141a14"; ctx.fillRect(tx - 34, 58, 68, 10);
    ctx.fillStyle = "#3a4438"; ctx.beginPath(); ctx.arc(tx, 84, 7, 0, Math.PI * 2); ctx.fill();
  }
  // 基地路灯：写实灯杆 + 挑臂 + 发光灯头（光洞由光照系统挖出）；沿道路与围墙内侧分布
  for (const [i, fx] of LEVEL3_LAMP_FX.entries()) {
    const lx = fx * W;
    const flicker = 0.82 + Math.sin(now / 210 + i * 2.1) * 0.1;
    ctx.strokeStyle = "#20251f"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(lx, 486); ctx.lineTo(lx, 218); ctx.lineTo(lx + 34, 226); ctx.stroke();
    ctx.fillStyle = "#2c322c"; ctx.fillRect(lx + 24, 218, 36, 14);
    ctx.fillStyle = `rgba(238,214,140,${0.85 * flicker})`;
    ctx.beginPath(); ctx.roundRect(lx + 28, 226, 28, 7, 3); ctx.fill();
    // 灯座与地面光斑底色（亮边在光照层叠加）
    ctx.fillStyle = "#181d18"; ctx.fillRect(lx - 8, 480, 16, 10);
    ctx.fillStyle = `rgba(232,208,130,${0.05 * flicker})`;
    ctx.beginPath(); ctx.ellipse(lx + 42, 492, 150, 34, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 外围墙右侧：铁丝网立柱没入黑暗
  ctx.strokeStyle = "#161b16"; ctx.lineWidth = 3;
  for (let x = wallX + 90; x < W; x += 150) {
    ctx.beginPath(); ctx.moveTo(x, 196); ctx.lineTo(x, 164); ctx.stroke();
  }
  // 混凝土防御围墙：通高墙体 + 三个射击孔 + 顶部铁丝 + 红色警灯座
  ctx.fillStyle = "#3f4440"; ctx.fillRect(wallX - 20, 176, 40, 474);
  ctx.fillStyle = "#343936"; ctx.fillRect(wallX - 26, 168, 52, 12);
  ctx.strokeStyle = "#222624"; ctx.lineWidth = 2;
  for (let y = 216; y < 640; y += 42) { ctx.beginPath(); ctx.moveTo(wallX - 20, y); ctx.lineTo(wallX + 20, y); ctx.stroke(); }
  for (const holeY of LEVEL3_WALL_HOLES) {
    ctx.fillStyle = "#0a0d0b"; ctx.fillRect(wallX - 22, holeY - 38, 44, 76);
    ctx.strokeStyle = "#565c55"; ctx.lineWidth = 3; ctx.strokeRect(wallX - 22, holeY - 38, 44, 76);
  }
  // 围墙电机大门（混凝土门洞 + 金属闸板）：夜防结束后闸板升起放行
  const level = g.level;
  const gateOpen = !!level && level.taskIndex >= 2;
  ctx.fillStyle = "#10140f";
  ctx.fillRect(wallX - 21, LEVEL3_GATE_TOP, 42, LEVEL3_GATE_BOTTOM - LEVEL3_GATE_TOP);
  if (!gateOpen) {
    // 关闭态：钢闸板 + 警示斜纹
    ctx.fillStyle = "#39413c"; ctx.fillRect(wallX - 19, LEVEL3_GATE_TOP + 2, 38, LEVEL3_GATE_BOTTOM - LEVEL3_GATE_TOP - 4);
    ctx.strokeStyle = "#22271f"; ctx.lineWidth = 2; ctx.strokeRect(wallX - 19, LEVEL3_GATE_TOP + 2, 38, LEVEL3_GATE_BOTTOM - LEVEL3_GATE_TOP - 4);
    ctx.fillStyle = "#8a7a2e";
    for (let y = LEVEL3_GATE_TOP + 10; y < LEVEL3_GATE_BOTTOM - 12; y += 26) {
      ctx.beginPath(); ctx.moveTo(wallX - 17, y + 12); ctx.lineTo(wallX + 1, y); ctx.lineTo(wallX + 17, y); ctx.lineTo(wallX - 1, y + 12); ctx.closePath(); ctx.fill();
    }
    drawText(ctx, "大门", wallX, LEVEL3_GATE_TOP + 34, 13, "#c9c2a8", "center");
  } else {
    // 开启态：闸板收进门楣，只留顶部一截
    ctx.fillStyle = "#39413c"; ctx.fillRect(wallX - 19, LEVEL3_GATE_TOP, 38, 14);
    ctx.strokeStyle = "#565c55"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wallX - 19, LEVEL3_GATE_TOP + 14); ctx.lineTo(wallX + 19, LEVEL3_GATE_TOP + 14); ctx.stroke();
  }
  // 红色警报灯座（旋转光效由光照系统叠加）
  ctx.fillStyle = "#2a2422"; ctx.fillRect(wallX - 10, 146, 20, 24);
  ctx.fillStyle = "#7a221c"; ctx.beginPath(); ctx.arc(wallX, 148, 8, 0, Math.PI * 2); ctx.fill();
  // 墙后沙袋掩体（玩家防守位）
  for (const sy of [330, 450, 570]) {
    for (let r = 0; r < 2; r++) for (let s = 0; s < 4; s++) {
      ctx.fillStyle = r ? "#4a4636" : "#544f3c";
      ctx.beginPath(); ctx.roundRect(wallX - 96 + s * 22 + (r ? 10 : 0), sy + r * 14, 22, 14, 5); ctx.fill();
    }
  }
  // 防守进行中：围墙 HP 条
  if (level && level.eventStage === "defend") {
    const ratio = Math.max(0, level.wallHp / LEVEL3_WALL_HP);
    ctx.fillStyle = "#101311"; ctx.fillRect(wallX - 90, 128, 180, 10);
    ctx.fillStyle = ratio > .45 ? "#d5ad39" : "#c33c36"; ctx.fillRect(wallX - 90, 128, 180 * ratio, 10);
    drawText(ctx, `围墙 ${Math.ceil(level.wallHp)} HP`, wallX, 122, 13, "#f0ead8", "center");
  }
}

// 场景 2：城外土路侦查——荒野土路、枯树与电线杆剪影，尽头没入黑暗（仅枪灯照明）
function drawLevelDirtRoad(ctx: CanvasRenderingContext2D, g: GameState) {
  const W = g.worldW;
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 24);
  sky.addColorStop(0, "#04070d"); sky.addColorStop(1, "#0a101a");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 24);
  ctx.fillStyle = "rgba(215,222,236,.4)";
  for (let i = 0; i < 46; i++) {
    ctx.globalAlpha = 0.2 + ((i * 41) % 10) / 20;
    ctx.fillRect((i * 211) % W, (i * 83) % 120 + 6, 2, 2);
  }
  ctx.globalAlpha = 1;
  // 土路
  const road = ctx.createLinearGradient(0, ROAD_TOP + 24, 0, H);
  road.addColorStop(0, "#2a2419"); road.addColorStop(1, "#17130c");
  ctx.fillStyle = road; ctx.fillRect(0, ROAD_TOP + 24, W, H - ROAD_TOP - 24);
  ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 3;
  for (let x = 200; x < W; x += 380) {
    ctx.beginPath(); ctx.moveTo(x, 320 + (x % 5) * 46); ctx.lineTo(x + 30, 352 + (x % 5) * 46); ctx.stroke();
  }
  // 基地大门（起点后方：铁门 + 门柱，回望可见）
  ctx.fillStyle = "#171c17"; ctx.fillRect(20, 180, 18, 180); ctx.fillRect(150, 180, 18, 180);
  ctx.strokeStyle = "#222a22"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(38, 200); ctx.lineTo(150, 200); ctx.moveTo(38, 250); ctx.lineTo(150, 250); ctx.stroke();
  // 枯树与电线杆剪影
  ctx.strokeStyle = "#0d110d"; ctx.lineWidth = 7;
  for (let i = 0; i < 8; i++) {
    const tx = 420 + i * ((W - 700) / 8);
    ctx.beginPath(); ctx.moveTo(tx, 210); ctx.lineTo(tx + 6, 130); ctx.moveTo(tx + 6, 150); ctx.lineTo(tx - 18, 108); ctx.moveTo(tx + 6, 140); ctx.lineTo(tx + 30, 104); ctx.stroke();
  }
  ctx.lineWidth = 6;
  for (let i = 0; i < 5; i++) {
    const px = 700 + i * 760;
    if (px > W - 100) break;
    ctx.beginPath(); ctx.moveTo(px, 220); ctx.lineTo(px, 96); ctx.moveTo(px - 24, 112); ctx.lineTo(px + 24, 112); ctx.stroke();
  }
  // 道路尽头：黑暗林地剪影
  ctx.fillStyle = "#080b08";
  ctx.fillRect(W - 260, 60, 260, 130);
  for (let i = 0; i < 6; i++) {
    const tx = W - 250 + i * 44;
    ctx.beginPath(); ctx.moveTo(tx, 190); ctx.lineTo(tx + 20, 84); ctx.lineTo(tx + 40, 190); ctx.closePath(); ctx.fill();
  }
}

// ===== 黑夜光照系统（第三关）：离屏暗色覆盖层 + destination-out 挖出光洞，再叠回主画布 =====
// 暗层画布复用（跟随主画布尺寸），避免逐帧分配
let nightLayer: HTMLCanvasElement | null = null;
function nightLayerCtx(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!nightLayer) nightLayer = document.createElement("canvas");
  if (nightLayer.width !== w) nightLayer.width = w;
  if (nightLayer.height !== h) nightLayer.height = h;
  return nightLayer.getContext("2d");
}

// 在暗层上挖出锥形光洞（sector 路径 + 轴向线性渐隐，destination-out 模式下白色即擦除）
function punchCone(lctx: CanvasRenderingContext2D, x: number, y: number, angle: number, reach: number, halfAngle: number, alpha: number) {
  const grad = lctx.createLinearGradient(x, y, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
  grad.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.5})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  lctx.fillStyle = grad;
  lctx.beginPath();
  lctx.moveTo(x, y);
  lctx.arc(x, y, reach, angle - halfAngle, angle + halfAngle);
  lctx.closePath();
  lctx.fill();
}

// 在暗层上挖出圆形光洞（径向渐隐）
function punchCircle(lctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  const grad = lctx.createRadialGradient(x, y, 2, x, y, r);
  grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
  grad.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.5})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  lctx.fillStyle = grad;
  lctx.beginPath(); lctx.arc(x, y, r, 0, Math.PI * 2); lctx.fill();
}

function level4StairFootY(worldW: number, x: number): number {
  const lowerStart = worldW * LEVEL4_STAIR_LOWER_START_FX;
  const landingStart = worldW * LEVEL4_STAIR_LANDING_FX;
  const landingEnd = landingStart + worldW * LEVEL4_STAIR_LANDING_W_FX * .82;
  const upperEnd = worldW * LEVEL4_STAIR_UPPER_END_FX;
  const steps = 10;
  if (x <= lowerStart) return LEVEL4_STAIR_BOTTOM_Y;
  if (x < landingStart) {
    const step = Math.min(steps - 1, Math.floor(((x - lowerStart) / Math.max(1, landingStart - lowerStart)) * steps));
    return LEVEL4_STAIR_BOTTOM_Y + (LEVEL4_STAIR_LANDING_Y - LEVEL4_STAIR_BOTTOM_Y) * (step / steps);
  }
  if (x <= landingEnd) return LEVEL4_STAIR_LANDING_Y;
  if (x < upperEnd) {
    const step = Math.min(steps - 1, Math.floor(((x - landingEnd) / Math.max(1, upperEnd - landingEnd)) * steps));
    return LEVEL4_STAIR_LANDING_Y + (LEVEL4_STAIR_EXIT_Y - LEVEL4_STAIR_LANDING_Y) * (step / steps);
  }
  return LEVEL4_STAIR_EXIT_Y;
}

function isLevel4StairScene(g: GameState): boolean {
  if (g.mode !== "level" || !g.level) return false;
  return (g.level.levelId === LEVEL4_ID && (g.level.sceneIndex === 4 || g.level.sceneIndex === 6))
    || (g.level.levelId === LEVEL6_ID && g.level.sceneIndex === 7);
}

function isLevel8Driving(g: GameState): boolean {
  return g.mode === "level" && g.level?.levelId === LEVEL8_ID && g.level.sceneIndex === 2 && g.level.eventStage === "armored-drive";
}

// 开场/乘车演出输入冻结判定：第三关睡眠起身；第四关车辆行驶、停稳及全员下车。
function levelInputFrozen(g: GameState): boolean {
  const level = g.level;
  if (g.mode !== "level" || !level) return false;
  if (level.levelId === LEVEL3_ID && level.sceneIndex === 0) return level.eventStage === "sleep" || level.eventStage === "rise";
  if (level.levelId === LEVEL4_ID && level.sceneIndex === 2) return level.eventStage === "ride" || level.eventStage === "disembark";
  if (level.levelId === LEVEL6_ID && level.sceneIndex === 2) return level.eventStage === "ride" || level.eventStage === "disembark";
  if (level.levelId === LEVEL7_ID && level.sceneIndex === 2) return level.eventStage === "ride" || level.eventStage === "disembark";
  if (level.levelId === LEVEL8_ID && level.sceneIndex === 2) return level.eventStage === "disembark";
  return level.levelId === LEVEL5_ID && level.sceneIndex === 2
    && (level.eventStage === "flight" || level.eventStage === "landed");
}

function levelPlayerHidden(g: GameState, now: number): boolean {
  const level = g.level;
  if (g.mode !== "level" || !level) return false;
  if (level.levelId === LEVEL3_ID && level.sceneIndex === 0) return level.eventStage === "sleep" || level.eventStage === "rise";
  if (level.levelId === LEVEL4_ID && level.sceneIndex === 2) {
    return level.eventStage === "ride" || (level.eventStage === "disembark" && now < level.eventAt + LEVEL4_PLAYER_EXIT_DELAY_MS);
  }
  if (level.levelId === LEVEL6_ID && level.sceneIndex === 2) {
    return level.eventStage === "ride" || (level.eventStage === "disembark" && now < level.eventAt + LEVEL6_PLAYER_EXIT_DELAY_MS);
  }
  if (level.levelId === LEVEL7_ID && level.sceneIndex === 2) {
    return level.eventStage === "ride" || (level.eventStage === "disembark" && now < level.eventAt + LEVEL7_PLAYER_EXIT_DELAY_MS);
  }
  if (level.levelId === LEVEL8_ID && level.sceneIndex === 2) {
    return level.eventStage === "armored-drive" || (level.eventStage === "disembark" && now < level.eventAt + 700);
  }
  return level.levelId === LEVEL5_ID && level.sceneIndex === 2
    && (level.eventStage === "flight" || (level.eventStage === "landed" && now < level.eventAt + LEVEL5_PLAYER_EXIT_DELAY_MS));
}

// 夜防围墙：子弹仅经射击孔越过墙体；被墙挡下时返回交点（用于截断曳光与命中），否则 null
function level3WallBlock(g: GameState, x1: number, y1: number, x2: number, y2: number): { x: number; y: number } | null {
  if (g.mode !== "level" || g.level?.levelId !== LEVEL3_ID || g.level.sceneIndex !== 1) return null;
  const wallX = LEVEL3_WALL_FX * g.worldW;
  if (!(x1 < wallX - 20 && x2 > wallX + 20)) return null;
  const t = (wallX - x1) / (x2 - x1 || 1e-6);
  const crossY = y1 + (y2 - y1) * t;
  for (const holeY of LEVEL3_WALL_HOLES) if (Math.abs(crossY - holeY) <= 38) return null;
  // 大门开启后（任务推进到「走到基地大门」），门洞可通行/射击
  if (g.level.taskIndex >= 2 && crossY >= LEVEL3_GATE_TOP && crossY <= LEVEL3_GATE_BOTTOM) return null;
  return { x: wallX, y: crossY };
}

// 黑暗光照主入口：第三关夜景、第五关未通电隧道与第六关断电楼层共用枪灯、枪口火光、队友枪灯和爆炸照明。
function drawNightLighting(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const level = g.level;
  if (g.mode !== "level" || !level) return;
  const level3Night = level.levelId === LEVEL3_ID;
  const level5DarkTunnel = level.levelId === LEVEL5_ID && level.sceneIndex === 3;
  const level6DarkBuilding = level.levelId === LEVEL6_ID && !level.powerOn && (level.sceneIndex === 3 || level.sceneIndex === 4);
  if (!level3Night && !level5DarkTunnel && !level6DarkBuilding) return;
  const W = ctx.canvas.width;
  if (level3Night && level.sceneIndex === 0) {
    // 屏幕亮度由暗变亮：睡眠段 0.96 → 0.18，起身段归零
    let alpha = 0;
    if (level.eventStage === "sleep") alpha = 0.96 - Math.min(1, (now - level.eventAt) / LEVEL3_WAKE_MS) * 0.78;
    else if (level.eventStage === "rise") alpha = 0.18 * (1 - Math.min(1, (now - level.eventAt) / LEVEL3_RISE_MS));
    if (alpha > 0.004) {
      ctx.fillStyle = `rgba(2,4,9,${alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }
  const lctx = nightLayerCtx(W, H);
  if (!lctx) return;
  const camX = g.cameraX;
  const p = g.player;
  lctx.clearRect(0, 0, W, H);
  lctx.globalCompositeOperation = "source-over";
  lctx.fillStyle = "rgba(3,7,15,0.94)";
  lctx.fillRect(0, 0, W, H);
  lctx.globalCompositeOperation = "destination-out";
  // 第三关保留人物周身微光；未通电的隧道和市政大楼严格只靠枪灯与开火/爆炸照明。
  if (level3Night) punchCircle(lctx, p.x - camX, p.y - 92, 150, 0.5);
  // 枪灯：武器下挂战术灯，锥形光束随枪口方向（M16 远距离锥形照明；手枪为近程微光）
  const reach = p.weapon === "m16" ? 650 : MELEE_WEAPONS.has(p.weapon) ? 0 : 290;
  if (reach > 0) {
    const gun = playerGunOrigin(p);
    const gx = gun.x - camX;
    punchCone(lctx, gx, gun.y, p.angle, reach, 0.19, 0.9);
    punchCone(lctx, gx, gun.y, p.angle, reach * 0.6, 0.1, 0.7);
  }
  // 枪口火光短暂照亮近场
  if (now - p.lastMuzzleFlash < 80) {
    const gun = playerGunOrigin(p);
    punchCircle(lctx, gun.x - camX + Math.cos(p.angle) * 40, gun.y + Math.sin(p.angle) * 40, 190, 0.9);
  }
  // 队友枪灯：每名士兵的 M16 同带锥形光束（方向随各自瞄准），叠加开火火光
  for (const npc of g.npcs) {
    const f = npc.field;
    const shoulderY = f.y - 88 * CHARACTER_SCALE;
    punchCone(lctx, f.x - camX, shoulderY, f.angle, 560, 0.17, 0.65);
    if (now - f.muzzleAt < 80) punchCircle(lctx, f.x - camX, shoulderY, 150, 0.75);
  }
  // 爆炸与火光（手雷/爆炸物照明）
  for (const blast of g.blastEffects) {
    const fade = Math.max(0, Math.min(1, (blast.until - now) / 700));
    if (fade > 0) punchCircle(lctx, blast.x - camX, blast.y, 150 + 130 * fade, 0.95 * fade);
  }
  if (level.sceneIndex === 1) {
    // 基地路灯光洞：灯头暖光 + 地面光池（随灯杆闪烁同步明暗）
    for (const [i, fx] of LEVEL3_LAMP_FX.entries()) {
      const flicker = 0.82 + Math.sin(now / 210 + i * 2.1) * 0.1;
      const lx = fx * g.worldW - camX;
      punchCircle(lctx, lx + 42, 240, 190, 0.62 * flicker);
      punchCircle(lctx, lx + 42, 486, 170, 0.5 * flicker);
    }
    // 探照灯：两座岗哨塔旋转光束扫过墙外（加亮加宽的光柱 + 更大的落点光斑）
    for (const [i, fx] of [0.2, 0.42].entries()) {
      const ang = 0.62 + Math.sin(now / 3000 + i * 2.4) * 0.5;
      const sx = fx * g.worldW - camX;
      punchCone(lctx, sx, 92, ang, 1150, 0.085, 0.85);
      punchCircle(lctx, sx + Math.cos(ang) * 830, 92 + Math.sin(ang) * 830, 190, 0.75);
    }
    // 红色警报灯：围墙顶警灯闪烁（微光照亮墙体）
    const blink = 0.5 + Math.sin(now / 130) * 0.5;
    punchCircle(lctx, LEVEL3_WALL_FX * g.worldW - camX, 178, 160, 0.16 + blink * 0.2);
  }
  lctx.globalCompositeOperation = "source-over";
  ctx.drawImage(nightLayer as HTMLCanvasElement, 0, 0);
  // 加色层：路灯光晕、探照灯光柱与警报红光本体（在黑暗中可见的光效）
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (level.sceneIndex === 1) {
    for (const [i, fx] of LEVEL3_LAMP_FX.entries()) {
      const flicker = 0.82 + Math.sin(now / 210 + i * 2.1) * 0.1;
      const lx = fx * g.worldW - camX;
      const lampHalo = ctx.createRadialGradient(lx + 42, 232, 3, lx + 42, 232, 110);
      lampHalo.addColorStop(0, `rgba(240,216,140,${(0.4 * flicker).toFixed(3)})`);
      lampHalo.addColorStop(1, "rgba(240,216,140,0)");
      ctx.fillStyle = lampHalo;
      ctx.beginPath(); ctx.arc(lx + 42, 232, 110, 0, Math.PI * 2); ctx.fill();
    }
    for (const [i, fx] of [0.2, 0.42].entries()) {
      const ang = 0.62 + Math.sin(now / 3000 + i * 2.4) * 0.5;
      const sx = fx * g.worldW - camX;
      const ex = sx + Math.cos(ang) * 1150;
      const ey = 92 + Math.sin(ang) * 1150;
      const beam = ctx.createLinearGradient(sx, 92, ex, ey);
      beam.addColorStop(0, "rgba(216,228,246,.24)");
      beam.addColorStop(1, "rgba(216,228,246,0)");
      ctx.strokeStyle = beam;
      ctx.lineWidth = 58;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sx, 92); ctx.lineTo(ex, ey); ctx.stroke();
    }
    const wallX = LEVEL3_WALL_FX * g.worldW - camX;
    const blink = 0.5 + Math.sin(now / 130) * 0.5;
    const halo = ctx.createRadialGradient(wallX, 178, 3, wallX, 178, 130);
    halo.addColorStop(0, `rgba(255,58,44,${(0.55 * blink).toFixed(3)})`);
    halo.addColorStop(1, "rgba(255,58,44,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(wallX, 178, 130, 0, Math.PI * 2); ctx.fill();
    // 旋转警灯光斑（左右交替扫动）
    const sweep = Math.sin(now / 260) * 70;
    const rg = ctx.createRadialGradient(wallX + sweep, 300, 6, wallX + sweep, 300, 120);
    rg.addColorStop(0, `rgba(255,44,36,${(0.22 * blink).toFixed(3)})`);
    rg.addColorStop(1, "rgba(255,44,36,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(wallX + sweep, 300, 120, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// 场景 0：家中客厅——暖墙、夜景窗、沙发、右侧通向走廊的房门
function drawLevelHome(ctx: CanvasRenderingContext2D, g: GameState) {
  const W = g.worldW;
  const wall = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 40);
  wall.addColorStop(0, "#4a3a30"); wall.addColorStop(1, "#6b5644");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, ROAD_TOP + 40);
  // 墙裙与地板（行走带）
  ctx.fillStyle = "#7a6248"; ctx.fillRect(0, ROAD_TOP + 40, W, 16);
  const floor = ctx.createLinearGradient(0, ROAD_TOP + 56, 0, H);
  floor.addColorStop(0, "#8a6f4f"); floor.addColorStop(1, "#5d4936");
  ctx.fillStyle = floor; ctx.fillRect(0, ROAD_TOP + 56, W, H - ROAD_TOP - 56);
  ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 2;
  for (let y = ROAD_TOP + 96; y < H; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // 夜景窗（左墙）：深蓝夜空 + 远处火光
  ctx.fillStyle = "#2b2118"; ctx.fillRect(120, 40, 190, 120);
  const night = ctx.createLinearGradient(0, 44, 0, 156);
  night.addColorStop(0, "#0d1420"); night.addColorStop(1, "#2a1f16");
  ctx.fillStyle = night; ctx.fillRect(128, 48, 174, 104);
  ctx.fillStyle = "#e8e4c8"; ctx.beginPath(); ctx.arc(262, 76, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(224,120,48,.55)"; ctx.beginPath(); ctx.arc(168, 138, 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#2b2118"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(215, 48); ctx.lineTo(215, 152); ctx.moveTo(128, 100); ctx.lineTo(302, 100); ctx.stroke();
  // 沙发（左下）
  ctx.fillStyle = "#5e3f36"; ctx.fillRect(90, 300, 240, 92);
  ctx.fillStyle = "#6e4a3f"; ctx.fillRect(90, 278, 240, 34);
  ctx.fillStyle = "#543832"; ctx.fillRect(78, 286, 26, 106); ctx.fillRect(316, 286, 26, 106);
  ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(170, 312); ctx.lineTo(170, 388); ctx.moveTo(250, 312); ctx.lineTo(250, 388); ctx.stroke();
  // 墙上挂钟与全家福相框
  ctx.fillStyle = "#d8cfb8"; ctx.beginPath(); ctx.arc(470, 84, 26, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#3a2c22"; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(470, 84); ctx.lineTo(470, 66); ctx.moveTo(470, 84); ctx.lineTo(482, 90); ctx.stroke();
  ctx.fillStyle = "#c8b890"; ctx.fillRect(560, 56, 84, 64);
  ctx.fillStyle = "#8a9a7a"; ctx.fillRect(568, 64, 68, 48);
  // 右侧房门（通往走廊）
  const doorX = W - 96;
  ctx.fillStyle = "#3a2c20"; ctx.fillRect(doorX - 8, 108, 96, 260);
  ctx.fillStyle = "#6d5138"; ctx.fillRect(doorX, 116, 80, 252);
  ctx.strokeStyle = "#4a3826"; ctx.lineWidth = 4; ctx.strokeRect(doorX + 10, 128, 60, 100); ctx.strokeRect(doorX + 10, 244, 60, 108);
  ctx.fillStyle = "#c9a44a"; ctx.beginPath(); ctx.arc(doorX + 14, 244, 5, 0, Math.PI * 2); ctx.fill();
  drawText(ctx, "房门 →", doorX + 40, 100, 15, "#d8c9a0", "center");
}

// 场景 1：居民楼走廊——重复门框、壁灯、血渍，尽头玻璃双开门
function drawLevelCorridor(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const wall = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 30);
  wall.addColorStop(0, "#3d3a33"); wall.addColorStop(1, "#57544a");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, ROAD_TOP + 30);
  ctx.fillStyle = "#4c463c"; ctx.fillRect(0, ROAD_TOP + 30, W, 14);
  const floor = ctx.createLinearGradient(0, ROAD_TOP + 44, 0, H);
  floor.addColorStop(0, "#6a6558"); floor.addColorStop(1, "#453f35");
  ctx.fillStyle = floor; ctx.fillRect(0, ROAD_TOP + 44, W, H - ROAD_TOP - 44);
  ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 92) { ctx.beginPath(); ctx.moveTo(x, ROAD_TOP + 44); ctx.lineTo(x - 40, H); ctx.stroke(); }
  // 重复住户门框（上沿墙）
  for (let x = 170; x < W - 260; x += 300) {
    ctx.fillStyle = "#2e2a24"; ctx.fillRect(x - 5, 66, 84, 122);
    ctx.fillStyle = "#574a39"; ctx.fillRect(x, 72, 74, 116);
    ctx.fillStyle = "#c9a44a"; ctx.beginPath(); ctx.arc(x + 62, 134, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d8cfb8"; ctx.fillRect(x + 18, 60, 38, 10);
  }
  // 壁灯（暖光晕，轻微闪烁）
  for (let x = 320; x < W - 200; x += 600) {
    const flicker = 0.75 + Math.sin(now / 130 + x) * 0.1;
    ctx.fillStyle = "rgba(240,205,130,.10)".replace(".10", String(0.10 * flicker));
    ctx.beginPath(); ctx.arc(x, 92, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d8b968"; ctx.fillRect(x - 14, 80, 28, 14);
    ctx.fillStyle = "#3a352c"; ctx.fillRect(x - 4, 94, 8, 14);
  }
  // 血渍拖痕（地面）
  ctx.fillStyle = "rgba(122,22,18,.5)";
  for (const [bx, bw] of [[430, 150], [900, 220], [1470, 130], [1980, 180]] as Array<[number, number]>) {
    ctx.beginPath(); ctx.ellipse(bx, 560 + (bx % 3) * 22, bw / 2, 14, 0.06, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "rgba(122,22,18,.35)";
  ctx.beginPath(); ctx.ellipse(1230, 300, 60, 10, -0.05, 0, Math.PI * 2); ctx.fill();
  // 尽头玻璃双开门（小区大门）
  const doorX = W - 120;
  ctx.fillStyle = "#22262a"; ctx.fillRect(doorX - 10, 96, 130, 290);
  const glass = ctx.createLinearGradient(0, 104, 0, 380);
  glass.addColorStop(0, "#31434e"); glass.addColorStop(1, "#1a242b");
  ctx.fillStyle = glass; ctx.fillRect(doorX, 104, 54, 274); ctx.fillRect(doorX + 58, 104, 54, 274);
  ctx.strokeStyle = "#6a7276"; ctx.lineWidth = 4;
  ctx.strokeRect(doorX, 104, 54, 274); ctx.strokeRect(doorX + 58, 104, 54, 274);
  ctx.beginPath(); ctx.moveTo(doorX + 12, 330); ctx.lineTo(doorX + 44, 330); ctx.moveTo(doorX + 70, 330); ctx.lineTo(doorX + 102, 330); ctx.stroke();
  ctx.strokeStyle = "rgba(210,225,235,.35)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(doorX + 8, 130); ctx.lineTo(doorX + 40, 210); ctx.moveTo(doorX + 70, 120); ctx.lineTo(doorX + 104, 204); ctx.stroke();
}

// 场景 2：小区街道——夜空视差、破楼剪影、裂缝柏油、路灯、尽头保安亭
function drawLevelStreet(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  // 远景视差层：回移摄像机的一部分，营造纵深
  ctx.save();
  ctx.translate(g.cameraX * 0.55, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 20);
  sky.addColorStop(0, "#0a0f18"); sky.addColorStop(.7, "#1d2030"); sky.addColorStop(1, "#33251f");
  ctx.fillStyle = sky; ctx.fillRect(-W, 0, W * 3, ROAD_TOP + 20);
  ctx.fillStyle = "#e6e2c6"; ctx.beginPath(); ctx.arc(300, 46, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(230,226,198,.12)"; ctx.beginPath(); ctx.arc(300, 46, 44, 0, Math.PI * 2); ctx.fill();
  // 破损居民楼剪影（错落、零星亮窗/火光）
  const buildingColors = ["#141a20", "#10151b", "#181d24"];
  for (let i = 0; i < 12; i++) {
    const bx = -200 + i * 260;
    const bw = 150 + (i % 3) * 36;
    const bh = 96 + ((i * 53) % 60);
    ctx.fillStyle = buildingColors[i % 3];
    ctx.fillRect(bx, ROAD_TOP + 20 - bh, bw, bh);
    // 顶部破损缺口
    ctx.fillStyle = "#0a0f18";
    ctx.beginPath(); ctx.moveTo(bx + bw * 0.3, ROAD_TOP + 20 - bh); ctx.lineTo(bx + bw * 0.45, ROAD_TOP + 20 - bh + 18); ctx.lineTo(bx + bw * 0.6, ROAD_TOP + 20 - bh); ctx.closePath(); ctx.fill();
    for (let wy = 0; wy < 3; wy++) for (let wx = 0; wx < 3; wx++) {
      if ((i * 7 + wy * 3 + wx) % 5 === 0) {
        ctx.fillStyle = (i + wy + wx) % 7 === 0 ? "rgba(224,120,48,.75)" : "rgba(210,190,120,.4)";
        ctx.fillRect(bx + 18 + wx * 42, ROAD_TOP + 20 - bh + 16 + wy * 28, 12, 14);
      }
    }
  }
  ctx.restore();
  // 近景：道路（裂缝柏油 + 车道线残段）
  const road = ctx.createLinearGradient(0, ROAD_TOP + 20, 0, H);
  road.addColorStop(0, "#3b3d40"); road.addColorStop(1, "#26272b");
  ctx.fillStyle = road; ctx.fillRect(0, ROAD_TOP + 20, W, H - ROAD_TOP - 20);
  ctx.fillStyle = "rgba(214,190,110,.4)";
  for (let x = 90; x < W; x += 240) ctx.fillRect(x, 394, 90, 7);
  ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 3;
  for (let x = 150; x < W; x += 330) {
    ctx.beginPath(); ctx.moveTo(x, 300 + (x % 5) * 40); ctx.lineTo(x + 34, 330 + (x % 5) * 40); ctx.lineTo(x + 18, 366 + (x % 5) * 40); ctx.stroke();
  }
  // 路缘与绿化带残迹
  ctx.fillStyle = "#494b42"; ctx.fillRect(0, ROAD_TOP + 20, W, 14);
  // 路灯（暖光锥，轻微闪烁）
  for (let x = 380; x < W - 160; x += 620) {
    const flicker = 0.8 + Math.sin(now / 160 + x * 1.7) * 0.12;
    ctx.strokeStyle = "#1d2023"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x, ROAD_TOP + 26); ctx.lineTo(x, 92); ctx.lineTo(x + 30, 100); ctx.stroke();
    ctx.fillStyle = "#2c2f33"; ctx.fillRect(x + 22, 94, 30, 12);
    ctx.fillStyle = `rgba(238,208,128,${0.10 * flicker})`;
    ctx.beginPath(); ctx.moveTo(x + 10, 106); ctx.lineTo(x + 64, 106); ctx.lineTo(x + 120, 430); ctx.lineTo(x - 46, 430); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(238,208,128,${0.5 * flicker})`; ctx.beginPath(); ctx.arc(x + 37, 104, 6, 0, Math.PI * 2); ctx.fill();
  }
  // 尽头保安亭（亮灯小房 + 道闸；人物高≈245，亭体 210 高、门 170 高）
  const boothX = W - 170;
  ctx.fillStyle = "#3d444a"; ctx.fillRect(boothX - 20, 130, 190, 210);
  ctx.fillStyle = "#4d565e"; ctx.fillRect(boothX - 30, 110, 210, 22);
  ctx.fillStyle = "rgba(238,220,150,.85)"; ctx.fillRect(boothX + 4, 172, 62, 58);
  ctx.strokeStyle = "#2c3238"; ctx.lineWidth = 4; ctx.strokeRect(boothX + 4, 172, 62, 58);
  ctx.fillStyle = "#22272c"; ctx.fillRect(boothX + 92, 170, 50, 170);
  ctx.fillStyle = "#c9cdd2"; ctx.fillRect(boothX - 12, 136, 150, 24);
  drawText(ctx, "保安亭", boothX + 63, 154, 15, "#33383d", "center");
  // 道闸杆
  ctx.fillStyle = "#8a2f2a"; ctx.fillRect(boothX - 190, 318, 182, 10);
  ctx.fillStyle = "#d8d8d8";
  for (let x = boothX - 182; x < boothX - 16; x += 36) ctx.fillRect(x, 318, 18, 10);
  ctx.fillStyle = "#2c3238"; ctx.fillRect(boothX - 16, 300, 18, 40);
}

// 十六进制体色明暗派生：factor>1 提亮（受光顶面）、<1 压暗（侧面/端面暗部）
function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}

// ===== 第二关场景绘制 =====

// 场景 0：城郊公路——黄昏天际线 + 城市楼群视差 + 长直公路 + 尽头加油站
function drawLevelHighway(ctx: CanvasRenderingContext2D, g: GameState) {
  const W = g.worldW;
  ctx.save();
  ctx.translate(g.cameraX * 0.55, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 24);
  sky.addColorStop(0, "#2b2733"); sky.addColorStop(.6, "#4a3540"); sky.addColorStop(1, "#6b4a3a");
  ctx.fillStyle = sky; ctx.fillRect(-W, 0, W * 3, ROAD_TOP + 24);
  ctx.fillStyle = "rgba(232,150,80,.8)"; ctx.beginPath(); ctx.arc(500, 118, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(232,150,80,.14)"; ctx.beginPath(); ctx.arc(500, 118, 52, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const bx = -260 + i * 210;
    const bw = 120 + (i % 4) * 30;
    const bh = 110 + ((i * 37) % 80);
    ctx.fillStyle = i % 2 ? "#221d26" : "#1c1820";
    ctx.fillRect(bx, ROAD_TOP + 24 - bh, bw, bh);
    for (let wy = 0; wy < 4; wy++) for (let wx = 0; wx < 3; wx++) {
      if ((i * 5 + wy + wx) % 6 === 0) {
        ctx.fillStyle = "rgba(220,170,90,.35)";
        ctx.fillRect(bx + 14 + wx * 34, ROAD_TOP + 24 - bh + 14 + wy * 26, 10, 12);
      }
    }
  }
  ctx.restore();
  const road = ctx.createLinearGradient(0, ROAD_TOP + 24, 0, H);
  road.addColorStop(0, "#3a3c40"); road.addColorStop(1, "#24262a");
  ctx.fillStyle = road; ctx.fillRect(0, ROAD_TOP + 24, W, H - ROAD_TOP - 24);
  ctx.fillStyle = "rgba(214,178,80,.5)";
  for (let x = 60; x < W; x += 260) ctx.fillRect(x, 388, 110, 6);
  ctx.fillStyle = "rgba(210,210,200,.35)";
  for (let x = 160; x < W; x += 300) ctx.fillRect(x, 500, 80, 5);
  // 护栏（上沿远景）
  ctx.strokeStyle = "#4c5157"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, ROAD_TOP + 34); ctx.lineTo(W, ROAD_TOP + 34); ctx.stroke();
  ctx.strokeStyle = "#33373c"; ctx.lineWidth = 3;
  for (let x = 40; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, ROAD_TOP + 34); ctx.lineTo(x, ROAD_TOP + 52); ctx.stroke(); }
  ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2.5;
  for (let x = 220; x < W; x += 420) { ctx.beginPath(); ctx.moveTo(x, 300 + (x % 4) * 60); ctx.lineTo(x + 28, 330 + (x % 4) * 60); ctx.stroke(); }
  drawGasStation(ctx, g);
}

// 加油站：雨棚 + 油泵 + 便利店（门口为伏击涌出点）；人物高≈245，门/店立面按此放大
function drawGasStation(ctx: CanvasRenderingContext2D, g: GameState) {
  const gasX = LEVEL2_GAS_FX * g.worldW;
  // 便利店主体与顶部檐口
  ctx.fillStyle = "#3d3830"; ctx.fillRect(gasX - 20, 60, 380, 300);
  ctx.fillStyle = "#2c2822"; ctx.fillRect(gasX - 30, 44, 400, 18);
  // 店门（黑洞，僵尸涌出口，居中 ≈ gasX+158）
  ctx.fillStyle = "#0c0d0e"; ctx.fillRect(gasX + 126, 120, 64, 240);
  ctx.strokeStyle = "#4a4438"; ctx.lineWidth = 3; ctx.strokeRect(gasX + 126, 120, 64, 240);
  // 碎玻璃窗
  ctx.fillStyle = "#1b232a"; ctx.fillRect(gasX + 6, 140, 96, 110); ctx.fillRect(gasX + 216, 140, 120, 110);
  ctx.strokeStyle = "rgba(200,215,225,.3)"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gasX + 14, 148); ctx.lineTo(gasX + 82, 236);
  ctx.moveTo(gasX + 228, 148); ctx.lineTo(gasX + 316, 238);
  ctx.stroke();
  // 招牌（屋顶）
  ctx.fillStyle = "#c8b890"; ctx.fillRect(gasX + 70, 8, 220, 42);
  drawText(ctx, "加油站", gasX + 180, 40, 26, "#33383d", "center");
  // 雨棚（底沿高于人物头顶）+ 立柱
  ctx.fillStyle = "#4a4440"; ctx.fillRect(gasX - 190, 84, 220, 20);
  ctx.fillStyle = "#a8322c"; ctx.fillRect(gasX - 190, 84, 220, 6);
  ctx.fillStyle = "#38342e"; ctx.fillRect(gasX - 178, 104, 12, 256); ctx.fillRect(gasX - 40, 104, 12, 256);
  // 两台油泵（≈150 高）
  for (const px of [gasX - 160, gasX - 90]) {
    ctx.fillStyle = "#8a2f2a"; ctx.fillRect(px, 210, 34, 150);
    ctx.fillStyle = "#d8d3c8"; ctx.fillRect(px + 5, 222, 24, 34);
    ctx.fillStyle = "#222"; ctx.fillRect(px + 9, 262, 16, 12);
  }
}

// 场景 1：军事基地——围墙铁丝网、岗哨塔、帐篷排、停放军车、训练场、尽头军营
function drawLevelBase(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 24);
  sky.addColorStop(0, "#3a4149"); sky.addColorStop(1, "#6a6a58");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 24);
  // 围墙 + 顶部铁丝网
  ctx.fillStyle = "#4c4f45"; ctx.fillRect(0, 96, W, ROAD_TOP + 24 - 96);
  ctx.strokeStyle = "#2c2e28"; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, 96); ctx.lineTo(x + 14, 84); ctx.stroke(); }
  ctx.fillStyle = "#383b33"; ctx.fillRect(0, ROAD_TOP + 24 - 8, W, 8);
  // 岗哨塔
  for (const tx of [W * 0.2, W * 0.62]) {
    ctx.fillStyle = "#3a3d34"; ctx.fillRect(tx - 6, 60, 12, 100);
    ctx.fillStyle = "#4a4d42"; ctx.fillRect(tx - 26, 30, 52, 36);
    ctx.fillStyle = "#2c2e26"; ctx.fillRect(tx - 30, 22, 60, 10);
    ctx.fillStyle = "rgba(240,220,140,.75)"; ctx.fillRect(tx - 12, 40, 24, 14);
  }
  // 沙土训练场
  const ground = ctx.createLinearGradient(0, ROAD_TOP + 24, 0, H);
  ground.addColorStop(0, "#6b6250"); ground.addColorStop(1, "#4a4438");
  ctx.fillStyle = ground; ctx.fillRect(0, ROAD_TOP + 24, W, H - ROAD_TOP - 24);
  ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 2;
  for (let x = 80; x < W; x += 180) { ctx.beginPath(); ctx.moveTo(x, 500); ctx.lineTo(x + 90, 500); ctx.stroke(); }
  // 帐篷排
  for (let i = 0; i < 4; i++) {
    const tx = 120 + i * 170;
    ctx.fillStyle = "#4f5c3f";
    ctx.beginPath(); ctx.moveTo(tx, 380); ctx.lineTo(tx + 60, 316); ctx.lineTo(tx + 120, 380); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#434f36";
    ctx.beginPath(); ctx.moveTo(tx + 60, 316); ctx.lineTo(tx + 120, 380); ctx.lineTo(tx + 96, 380); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#2f3826"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, 380); ctx.lineTo(tx + 60, 316); ctx.lineTo(tx + 120, 380); ctx.stroke();
  }
  // 停放军车与旗杆
  drawMilitaryTruck(ctx, W * 0.55, 620, false, now);
  ctx.strokeStyle = "#2c2e28"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(W * 0.42, 300); ctx.lineTo(W * 0.42, 150); ctx.stroke();
  ctx.fillStyle = "#8a2f2a"; ctx.fillRect(W * 0.42, 150, 40, 24);
  // 军营建筑（目标点；人物高≈245，主楼 330 高、大门 200 高）
  const bx = LEVEL2_BARRACKS_FX * W;
  ctx.fillStyle = "#4a4d42"; ctx.fillRect(bx - 190, 60, 420, 330);
  ctx.fillStyle = "#3a3d34"; ctx.fillRect(bx - 200, 44, 440, 18);
  for (const wx of [bx - 160, bx - 100, bx + 60, bx + 120]) { ctx.fillStyle = "#232a20"; ctx.fillRect(wx, 110, 52, 64); }
  ctx.fillStyle = "#0f1410"; ctx.fillRect(bx - 36, 190, 72, 200);
  ctx.fillStyle = "#c8b890"; ctx.fillRect(bx - 80, 136, 160, 40);
  drawText(ctx, "军营", bx, 164, 24, "#33383d", "center");
}

// 军用卡车（伪 3D：侧面 + 受光顶面，与废弃车辆同一风格；driving 时车身微颠、尾部排烟）
function drawMilitaryTruck(ctx: CanvasRenderingContext2D, x: number, baseY: number, driving: boolean, now: number) {
  const bounce = driving ? Math.sin(now / 90) * 1.6 : 0;
  ctx.save();
  ctx.translate(x, baseY + bounce);
  ctx.scale(1.8, 1.8); // 与人物（高≈245）同场景比例：整车 ≈540 宽 × 262 高
  const w = 300;
  // 地面投影
  ctx.fillStyle = "rgba(0,0,0,.32)";
  ctx.beginPath(); ctx.ellipse(0, 4, w * 0.54, 16, 0, 0, Math.PI * 2); ctx.fill();
  // 底盘
  ctx.fillStyle = "#22261e"; ctx.fillRect(-w / 2 + 4, -46, w - 8, 16);
  // 货厢侧面（军绿渐变）
  const bedGrad = ctx.createLinearGradient(0, -132, 0, -44);
  bedGrad.addColorStop(0, "#4f5c3f"); bedGrad.addColorStop(1, "#323b2a");
  ctx.fillStyle = bedGrad; ctx.fillRect(-w / 2 + 6, -118, 196, 74);
  // 帆布篷（圆拱 + 篷骨棱线）与受光顶面
  ctx.fillStyle = "#55633f";
  ctx.beginPath(); ctx.roundRect(-w / 2 + 8, -134, 192, 32, 14); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = 2;
  for (let rx = -w / 2 + 34; rx < -w / 2 + 196; rx += 32) {
    ctx.beginPath(); ctx.moveTo(rx, -104); ctx.quadraticCurveTo(rx + 2, -134, rx + 4, -134); ctx.stroke();
  }
  ctx.fillStyle = "#5a684a";
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 8, -132); ctx.lineTo(-w / 2 + 198, -132);
  ctx.lineTo(-w / 2 + 186, -146); ctx.lineTo(-w / 2 - 2, -146);
  ctx.closePath(); ctx.fill();
  // 白星标志
  ctx.fillStyle = "rgba(230,230,220,.85)";
  ctx.beginPath();
  const starX = -44, starY = -82;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 4) / 5;
    const px = starX + Math.cos(a) * 13, py = starY + Math.sin(a) * 13;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  // 驾驶室：侧箱 + 风挡 + 车顶受光面 + 保险杠/大灯/格栅
  const cabGrad = ctx.createLinearGradient(0, -124, 0, -44);
  cabGrad.addColorStop(0, "#4f5c3f"); cabGrad.addColorStop(1, "#323b2a");
  ctx.fillStyle = cabGrad; ctx.fillRect(52, -118, 92, 74);
  const glassGrad = ctx.createLinearGradient(0, -114, 0, -84);
  glassGrad.addColorStop(0, "#26323c"); glassGrad.addColorStop(1, "#0f151b");
  ctx.fillStyle = glassGrad; ctx.fillRect(96, -112, 40, 30);
  ctx.fillStyle = "#5a684a"; ctx.fillRect(48, -126, 100, 9);
  ctx.fillStyle = "#22261e"; ctx.fillRect(140, -44, 12, 20);
  ctx.strokeStyle = "rgba(12,14,12,.8)"; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(140, -66); ctx.lineTo(148, -66); ctx.moveTo(140, -58); ctx.lineTo(148, -58); ctx.stroke();
  ctx.fillStyle = "rgba(216,207,154,.9)"; ctx.beginPath(); ctx.ellipse(143, -74, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
  // 三对车轮（轮胎/轮辋/轮毂层次）
  for (const wx of [-105, -45, 95]) {
    ctx.fillStyle = "#101112"; ctx.beginPath(); ctx.arc(wx, -22, 22, 0, Math.PI * 2); ctx.fill();
    const rimGrad = ctx.createRadialGradient(wx - 3, -25, 1, wx, -22, 13);
    rimGrad.addColorStop(0, "#8a8d8f"); rimGrad.addColorStop(1, "#56595b");
    ctx.fillStyle = rimGrad; ctx.beginPath(); ctx.arc(wx, -22, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f3233"; ctx.beginPath(); ctx.arc(wx, -22, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(8,10,9,.5)"; ctx.beginPath(); ctx.arc(wx, -22, 25, Math.PI, 0); ctx.fill();
  }
  // 行驶排烟
  if (driving) {
    for (let i = 0; i < 3; i++) {
      const puff = ((now / 140 + i * 12) % 36) / 36;
      ctx.fillStyle = `rgba(90,90,88,${0.22 * (1 - puff)})`;
      ctx.beginPath(); ctx.arc(-w / 2 - 8 - puff * 40, -30 - i * 7 - puff * 16, 6 + puff * 12, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// 士兵 NPC：复用人物骨架/步态/两骨 IK 持枪（军队迷彩 + 战斗头盔 + M16，结构与 drawOfficer 一致）
function drawLevelSoldier(ctx: CanvasRenderingContext2D, f: PartnerField, now: number, weapon: WeaponKey = "m16") {
  const uniform = ARMORS.army;
  const facing = Math.cos(f.angle) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(CHARACTER_SCALE, CHARACTER_SCALE);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath(); ctx.ellipse(0, 4, 23, 7, 0, 0, Math.PI * 2); ctx.fill();
  const cycle = f.moving ? (now / 230) % 1 : 0;
  if (f.moving) ctx.translate(0, Math.sin(cycle * Math.PI * 4) * 1.8);
  const rearLeg = f.moving ? gaitLegPose((cycle + .5) % 1, facing, -5) : standingLegPose(facing, -5);
  const frontLeg = f.moving ? gaitLegPose(cycle, facing, 5) : standingLegPose(facing, 5);
  drawLimb(ctx, rearLeg, 7.5, uniform.pants, "#101513");
  drawLimb(ctx, frontLeg, 7.5, uniform.pants, "#111715");
  drawFoot(ctx, rearLeg[2], facing, 14, "#101513", f.moving ? gaitFootPitch((cycle + .5) % 1) : 0);
  drawFoot(ctx, frontLeg[2], facing, 14, "#101513", f.moving ? gaitFootPitch(cycle) : 0);
  // 行进时上身随步幅前倾、左右摆动；避免跟随编队看起来像站姿模型在地面平移。
  if (f.moving) {
    ctx.translate(facing * Math.sin(cycle * Math.PI * 2) * 1.5, -Math.abs(Math.sin(cycle * Math.PI * 2)) * 1.4);
    ctx.rotate(facing * (.025 + Math.sin(cycle * Math.PI * 2) * .018));
  }
  // 迷彩躯干：底衬 + 主层 + 迷彩斑块 + 插板背心
  ctx.fillStyle = "#18211f";
  ctx.beginPath();
  ctx.moveTo(-12.5, -103); ctx.lineTo(12.5, -103); ctx.lineTo(12, -88); ctx.lineTo(9.5, -78); ctx.lineTo(10.5, -63);
  ctx.lineTo(-10.5, -63); ctx.lineTo(-9.5, -78); ctx.lineTo(-12, -88);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = uniform.torso;
  ctx.beginPath();
  ctx.moveTo(-15, -102); ctx.lineTo(15, -102); ctx.lineTo(14, -88); ctx.lineTo(11.5, -78); ctx.lineTo(12.5, -66);
  ctx.lineTo(-12.5, -66); ctx.lineTo(-11.5, -78); ctx.lineTo(-14, -88);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(59,69,49,.9)";
  ctx.beginPath(); ctx.ellipse(-6, -94, 5, 3.4, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(7, -82, 4.4, 3, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(143,131,96,.5)";
  ctx.beginPath(); ctx.ellipse(4, -97, 3.6, 2.6, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.beginPath();
  ctx.moveTo(-facing * 15, -102); ctx.lineTo(-facing * 8, -102); ctx.lineTo(-facing * 7, -66); ctx.lineTo(-facing * 12.5, -66); ctx.lineTo(-facing * 11.5, -78); ctx.lineTo(-facing * 14, -88);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#242c1e"; roundedRect(ctx, -9, -92, 18, 22, 3); ctx.fill();
  // 双手持枪（grip + fore 步枪位，两骨 IK；M16 / PKM / 燧石66 同套编舞）
  const hold = WEAPON_HOLD[weapon];
  const gunScale = playerWeaponScale(weapon);
  const recoilSpec = WEAPON_RECOIL[weapon];
  const recoilAge = now - f.recoilAt;
  const recoilHeat = f.recoilHeat * Math.max(0, 1 - Math.max(0, recoilAge) / RECOIL_HEAT_COOL_MS);
  const recoilKick = recoilImpulse(recoilAge);
  const recoilRise = recoilSpec.rise * recoilKick * (1 + recoilHeat * 1.5);
  const recoilBack = recoilSpec.back * recoilKick * (1 + recoilHeat * .6);
  const gunAngle = f.angle - facing * recoilRise;
  const cosA = Math.cos(gunAngle);
  const sinA = Math.sin(gunAngle);
  const gunRelX = cosA * (12 - recoilBack);
  const gunRelY = -88 + sinA * 6 - recoilBack * .35;
  const toLocal = (m: [number, number]): [number, number] => [
    gunRelX + (cosA * m[0] - sinA * m[1]) * gunScale,
    gunRelY + (sinA * m[0] + cosA * m[1]) * gunScale,
  ];
  const rearShoulder: [number, number] = [-cosA * 11, -99 - sinA * 5];
  const leadShoulder: [number, number] = [cosA * 11, -99 + sinA * 5];
  const rightHand = toLocal(hold.grip);
  let leadHand = toLocal(hold.fore);
  const reloadProgress = f.reloadingUntil > now && f.reloadStartedAt > 0
    ? Math.min(1, (now - f.reloadStartedAt) / Math.max(1, f.reloadingUntil - f.reloadStartedAt))
    : 0;
  const reloadVisual = reloadProgress > 0 ? computeReloadVisual(weapon, reloadProgress, toLocal, facing) : null;
  if (reloadVisual?.lead) leadHand = reloadVisual.lead;
  const elbowDown = (s: [number, number], h: [number, number]): [number, number] => [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2 + 16];
  const rightArm = solveTwoBoneArm(rearShoulder, rightHand, elbowDown(rearShoulder, rightHand));
  const leadArm = solveTwoBoneArm(leadShoulder, leadHand, elbowDown(leadShoulder, leadHand));
  drawLimb(ctx, rightArm, 6.5, uniform.sleeves, "#c38e67");
  drawLimb(ctx, leadArm, 6.5, uniform.sleeves, "#c38e67");
  drawHand(ctx, rightArm[2], rightArm[1], 7, "#c58e67");
  drawHand(ctx, leadArm[2], leadArm[1], 7, "#c58e67");
  // 颈部/头部 + 战斗头盔
  ctx.fillStyle = "#c58e67";
  ctx.beginPath();
  ctx.moveTo(-5.5, -102); ctx.lineTo(5.5, -102); ctx.lineTo(4, -112); ctx.lineTo(-4, -112);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d0a079";
  ctx.beginPath();
  ctx.moveTo(facing * -9, -118);
  ctx.lineTo(facing * -7.5, -125); ctx.lineTo(facing * -1, -128.5); ctx.lineTo(facing * 5.5, -126.5);
  ctx.lineTo(facing * 8.5, -121); ctx.lineTo(facing * 9.5, -117.5); ctx.lineTo(facing * 8, -115);
  ctx.lineTo(facing * 8.5, -113.5); ctx.lineTo(facing * 6.5, -110.5); ctx.lineTo(facing * 1, -108.5);
  ctx.lineTo(facing * -5, -110);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3f4a34";
  ctx.beginPath(); ctx.ellipse(facing * 0.5, -124, 10.5, 7.5, facing * 0.1, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#333d2b"; ctx.fillRect(facing > 0 ? -10 : -1.5, -121.5, 11.5, 3);
  ctx.fillStyle = "#23282c";
  ctx.beginPath(); ctx.ellipse(facing * 5, -116.6, 1.7, 1.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#6b4f3c"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(facing * 2.8, -118.6); ctx.lineTo(facing * 7.6, -119); ctx.stroke();
  // 枪模与枪口火光（按手持武器绘制：M16 / PKM 弹链机枪 / 燧石66 重型狙击）
  ctx.save();
  ctx.translate(gunRelX, gunRelY);
  ctx.rotate(gunAngle);
  drawWeaponModel(ctx, weapon, gunScale, reloadVisual?.hideMag ?? false, reloadVisual?.bolt ?? 0, reloadVisual?.cylinderSpin ?? 0);
  if (reloadVisual) {
    ctx.save();
    ctx.scale(gunScale, gunScale);
    drawReloadProps(ctx, weapon, reloadVisual);
    ctx.restore();
  }
  ctx.restore();
  if (now - f.muzzleAt < 65) {
    const muzzle = weaponMuzzleOffset(weapon) / CHARACTER_SCALE;
    ctx.save();
    ctx.translate(gunRelX, gunRelY);
    ctx.rotate(gunAngle);
    ctx.fillStyle = "#fff2a8";
    ctx.beginPath();
    ctx.moveTo(muzzle - 7, 0);
    ctx.lineTo(muzzle + 17, -9);
    ctx.lineTo(muzzle + 9, 0);
    ctx.lineTo(muzzle + 17, 9);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// 关卡对话框（屏幕坐标）：底部暗色描金面板 + 说话人 + 台词 + 继续提示
function drawLevelDialog(ctx: CanvasRenderingContext2D, g: GameState, W: number, now: number) {
  const dialog = g.level?.dialog;
  if (!dialog) return;
  const line = dialog.lines[Math.min(dialog.index, dialog.lines.length - 1)];
  const boxW = Math.min(620, W - 80);
  const boxX = (W - boxW) / 2;
  const boxY = H - 178;
  ctx.fillStyle = "rgba(8,11,9,.94)";
  roundedRect(ctx, boxX, boxY, boxW, 118, 12); ctx.fill();
  ctx.strokeStyle = "rgba(241,198,67,.55)"; ctx.lineWidth = 2; roundedRect(ctx, boxX, boxY, boxW, 118, 12); ctx.stroke();
  drawText(ctx, line.speaker, boxX + 28, boxY + 36, 17, "#f1c643");
  drawText(ctx, line.text, boxX + 28, boxY + 76, 20, "#e8e4d7");
  if (Math.sin(now / 300) > -0.2) drawText(ctx, "按任意键 / 点击 继续 ▸", boxX + boxW - 28, boxY + 100, 13, "#8f978d", "right");
}

// 废弃车辆（伪 3D：近侧面车身 + 可见车顶/引擎盖/后备箱受光顶面 + 玻璃厚度挤出，3/4 俯视感；碰撞箱不变）。
// 两辆车姿态不同：seed<20 更侧视（顶面浅挤）；seed≥20 角度更明显（顶面深挤 + 露出车头端面、缺一只后轮）。
function drawWreckedCar(ctx: CanvasRenderingContext2D, ob: LevelObstacle) {
  const bodyColors = ["#5d4038", "#3f4a52", "#54483a"];
  const facing = ob.seed < 20 ? 1 : -1;
  const angled = ob.seed >= 20;
  const body = bodyColors[(ob.seed + (angled ? 1 : 0)) % bodyColors.length];
  const w = ob.w, h = ob.h;
  // 车侧纵向关键线（世界单位，y 向下为正）
  const tireBottom = h * 0.5;      // 轮胎接地点
  const rockerY = h * 0.30;        // 侧裙下沿
  const beltY = -h * 0.06;         // 窗线下沿
  const hoodY = -h * 0.20;         // 引擎盖棱线
  const roofY = -h * 0.50;         // 车顶棱线
  const upY = -h * 0.16;           // 顶面挤出（视点抬升）
  const sx = (angled ? w * 0.065 : w * 0.028); // 顶面 3/4 斜移量
  const ex = -sx * 0.6;            // 顶面远边水平回缩（朝车尾上方）
  ctx.save();
  ctx.translate(ob.x, ob.y);
  ctx.scale(facing, 1); // 统一按车头向右绘制，朝向镜像

  // ── 地面投影：双层软影 + 轮下接触影，增强落地感 ──
  ctx.fillStyle = "rgba(0,0,0,.30)";
  ctx.beginPath(); ctx.ellipse(-sx * 0.3, tireBottom - 1, w * 0.56, h * 0.115, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.beginPath(); ctx.ellipse(0, tireBottom - 4, w * 0.46, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  // 车底环境光遮蔽（车身正下方一条暗带）
  const ao = ctx.createLinearGradient(0, rockerY - 2, 0, tireBottom);
  ao.addColorStop(0, "rgba(0,0,0,.38)"); ao.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ao; ctx.fillRect(-w / 2 + 8, rockerY - 2, w - 16, tireBottom - rockerY + 2);

  // ── 近侧面车身剪影：垂直三段渐变（受光 beltline → 体色 → 侧裙暗部）──
  const sideGrad = ctx.createLinearGradient(0, roofY, 0, rockerY);
  sideGrad.addColorStop(0, shadeHex(body, 1.10));
  sideGrad.addColorStop(0.55, body);
  sideGrad.addColorStop(1, shadeHex(body, 0.52));
  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 14, rockerY);
  ctx.lineTo(w / 2 - 18, rockerY);
  ctx.quadraticCurveTo(w / 2 - 1, rockerY, w / 2 - 1, rockerY - 16);      // 前保险杠圆角
  ctx.lineTo(w / 2 - 1, hoodY + 8);
  ctx.quadraticCurveTo(w / 2 - 1, hoodY, w / 2 - 15, hoodY);               // 前翼子板棱
  ctx.lineTo(w * 0.24, beltY);                                             // 引擎盖 → 风挡根部
  ctx.lineTo(w * 0.12, roofY);                                             // A 柱外轮廓
  ctx.lineTo(-w * 0.22, roofY);                                            // 车顶
  ctx.lineTo(-w * 0.30, beltY);                                            // 后窗斜面
  ctx.lineTo(-w / 2 + 12, hoodY + 3);                                      // 后备箱盖
  ctx.quadraticCurveTo(-w / 2 + 2, hoodY + 3, -w / 2 + 2, hoodY + 14);     // 车尾圆角
  ctx.lineTo(-w / 2 + 2, rockerY - 10);
  ctx.quadraticCurveTo(-w / 2 + 2, rockerY, -w / 2 + 14, rockerY);
  ctx.closePath(); ctx.fill();

  // ── 受光顶面（体积关键）：引擎盖 / 车顶 / 后备箱顶面向车尾上方挤出 ──
  const topPanel = (x1: number, y1: number, x2: number, y2: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineTo(x2 + ex, y2 + upY); ctx.lineTo(x1 + ex, y1 + upY);
    ctx.closePath(); ctx.fill();
    // 远棱高光
    ctx.strokeStyle = "rgba(235,230,210,.28)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x1 + ex, y1 + upY); ctx.lineTo(x2 + ex, y2 + upY); ctx.stroke();
  };
  topPanel(w / 2 - 15, hoodY, w * 0.24, beltY, shadeHex(body, 1.06));   // 引擎盖顶面
  topPanel(w * 0.12, roofY, -w * 0.22, roofY, shadeHex(body, 1.26));    // 车顶面（最亮）
  topPanel(-w * 0.30, beltY, -w / 2 + 12, hoodY + 3, shadeHex(body, 1.06)); // 后备箱顶面

  // ── 玻璃厚度/透视：风挡与后窗沿斜面向外挤出半透明玻璃边 ──
  ctx.fillStyle = "rgba(22,30,38,.55)";
  ctx.beginPath();
  ctx.moveTo(w * 0.24, beltY); ctx.lineTo(w * 0.12, roofY);
  ctx.lineTo(w * 0.12 + ex, roofY + upY); ctx.lineTo(w * 0.24 + ex, beltY + upY);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-w * 0.22, roofY); ctx.lineTo(-w * 0.30, beltY);
  ctx.lineTo(-w * 0.30 + ex, beltY + upY); ctx.lineTo(-w * 0.22 + ex, roofY + upY);
  ctx.closePath(); ctx.fill();

  // ── 车头端面（仅 3/4 角度车）：从前缘向车尾上方翻出，带格栅与大灯 ──
  if (angled) {
    ctx.fillStyle = shadeHex(body, 0.68);
    ctx.beginPath();
    ctx.moveTo(w / 2 - 1, hoodY + 4);
    ctx.lineTo(w / 2 - 1, rockerY - 2);
    ctx.lineTo(w / 2 - 1 - sx * 1.3, rockerY - 2 + upY * 0.9);
    ctx.lineTo(w / 2 - 1 - sx * 1.3, hoodY + 4 + upY * 0.9);
    ctx.closePath(); ctx.fill();
    // 格栅横杠
    ctx.strokeStyle = "rgba(12,14,14,.8)"; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 4, hoodY + 14); ctx.lineTo(w / 2 - 4 - sx * 1.2, hoodY + 14 + upY * 0.85);
    ctx.moveTo(w / 2 - 4, hoodY + 20); ctx.lineTo(w / 2 - 4 - sx * 1.2, hoodY + 20 + upY * 0.85);
    ctx.stroke();
    // 大灯（端面上的残灯）
    ctx.fillStyle = "rgba(216,207,154,.85)";
    ctx.beginPath(); ctx.ellipse(w / 2 - 6 - sx * 0.3, hoodY + 7 + upY * 0.2, 5, 3, -0.3, 0, Math.PI * 2); ctx.fill();
  }

  // ── 近侧玻璃：风挡 / 前后侧窗（B 柱留白为体色），深色渐变 + 反光 streak ──
  const glassGrad = ctx.createLinearGradient(0, roofY, 0, beltY);
  glassGrad.addColorStop(0, "#26323c"); glassGrad.addColorStop(1, "#0f151b");
  ctx.fillStyle = glassGrad;
  const glassPanel = (pts: Array<[number, number]>) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  };
  glassPanel([[w * 0.225, beltY - 2], [w * 0.115, roofY + 4], [w * 0.065, roofY + 4], [w * 0.165, beltY - 2]]); // 风挡
  glassPanel([[w * 0.05, roofY + 5], [-w * 0.02, roofY + 5], [-w * 0.02, beltY - 3], [w * 0.10, beltY - 3]]);   // 前侧窗
  glassPanel([[-w * 0.05, roofY + 5], [-w * 0.19, roofY + 5], [-w * 0.26, beltY - 3], [-w * 0.05, beltY - 3]]); // 后侧窗
  // 玻璃反光（斜向高光条）与碎裂纹理（后侧窗放射裂纹）
  ctx.strokeStyle = "rgba(205,220,230,.28)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.075, roofY + 6); ctx.lineTo(w * 0.02, beltY - 4); ctx.stroke();
  ctx.strokeStyle = "rgba(200,215,225,.45)"; ctx.lineWidth = 1.3;
  const crackX = -w * 0.15, crackY = (roofY + beltY) / 2 + 2;
  ctx.beginPath();
  ctx.moveTo(crackX, crackY); ctx.lineTo(crackX - 10, crackY - 9);
  ctx.moveTo(crackX, crackY); ctx.lineTo(crackX + 8, crackY - 6);
  ctx.moveTo(crackX, crackY); ctx.lineTo(crackX - 6, crackY + 8);
  ctx.moveTo(crackX, crackY); ctx.lineTo(crackX + 9, crackY + 7);
  ctx.stroke();

  // ── 车轮：轮毂层次（轮胎 → 轮辋 → 轮毂盖 → 螺孔）；3/4 车缺后轮露出刹车盘 ──
  const wheelR = h * 0.135;
  const drawWheel = (wx: number, missing: boolean) => {
    const wy = tireBottom - wheelR;
    if (missing) {
      // 轮洞阴影 + 裸露刹车盘/轴头
      ctx.fillStyle = "#0b0d0c";
      ctx.beginPath(); ctx.arc(wx, wy, wheelR + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7d7462";
      ctx.beginPath(); ctx.arc(wx, wy, wheelR * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a362e";
      ctx.beginPath(); ctx.arc(wx, wy, wheelR * 0.2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.fillStyle = "#101112";
    ctx.beginPath(); ctx.arc(wx, wy, wheelR, 0, Math.PI * 2); ctx.fill();
    const rimGrad = ctx.createRadialGradient(wx - 3, wy - 3, 1, wx, wy, wheelR * 0.58);
    rimGrad.addColorStop(0, "#8a8d8f"); rimGrad.addColorStop(1, "#56595b");
    ctx.fillStyle = rimGrad;
    ctx.beginPath(); ctx.arc(wx, wy, wheelR * 0.58, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f3233";
    ctx.beginPath(); ctx.arc(wx, wy, wheelR * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#242627";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - 0.5;
      ctx.beginPath(); ctx.arc(wx + Math.cos(a) * wheelR * 0.4, wy + Math.sin(a) * wheelR * 0.4, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(wx, wy, wheelR * 0.5, -2.4, -1.2); ctx.stroke();
  };
  drawWheel(w * 0.30, false);
  drawWheel(-w * 0.30, angled);
  // 轮拱内衬阴影（压暗轮胎上半，营造内凹）
  ctx.fillStyle = "rgba(8,10,9,.55)";
  for (const wx of [w * 0.30, -w * 0.30]) {
    ctx.beginPath(); ctx.arc(wx, tireBottom - wheelR, wheelR + 4, Math.PI, 0); ctx.fill();
  }

  // ── 车身细节：高光棱线 / 门缝与把手 / 前后灯 / 烧灼与锈斑 ──
  ctx.strokeStyle = "rgba(240,235,215,.20)"; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, beltY + 3); ctx.lineTo(w * 0.22, beltY + 3);      // 腰线高光
  ctx.moveTo(w * 0.26, beltY + 1); ctx.lineTo(w / 2 - 17, hoodY + 1);     // 引擎盖侧棱高光
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.035, beltY + 1); ctx.lineTo(w * 0.035, rockerY - 5);   // 前门缝
  ctx.moveTo(-w * 0.045, beltY + 1); ctx.lineTo(-w * 0.045, rockerY - 5); // 后门缝
  ctx.stroke();
  ctx.fillStyle = "rgba(15,17,16,.8)";
  ctx.beginPath(); ctx.roundRect(-w * 0.005, beltY + 7, 10, 3.4, 1.6); ctx.fill();  // 前门把手
  ctx.beginPath(); ctx.roundRect(-w * 0.125, beltY + 7, 10, 3.4, 1.6); ctx.fill();  // 后门把手
  ctx.fillStyle = "rgba(216,207,154,.9)";
  ctx.beginPath(); ctx.roundRect(w / 2 - 14, hoodY + 5, 9, 5, 2); ctx.fill();       // 前大灯（侧缘）
  ctx.fillStyle = "rgba(150,40,34,.9)";
  ctx.beginPath(); ctx.roundRect(-w / 2 + 6, hoodY + 6, 6, 9, 2); ctx.fill();       // 尾灯
  // 烧灼：主焦斑趴在引擎盖顶面上（随顶面位置），侧面锈斑与弹孔
  ctx.fillStyle = "rgba(15,12,10,.55)";
  ctx.beginPath(); ctx.ellipse(w * 0.33 + ex * 0.5, (hoodY + beltY) / 2 + upY * 0.5, w * 0.10, h * 0.075, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(198,92,42,.22)";
  ctx.beginPath(); ctx.ellipse(w * 0.31 + ex * 0.5, (hoodY + beltY) / 2 + upY * 0.5 - 2, w * 0.05, h * 0.035, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(120,70,40,.42)";
  ctx.beginPath(); ctx.ellipse(-w * 0.33, beltY + 16, 16, 9, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(10,10,10,.7)";
  for (const [hx, hy] of [[w * 0.10, beltY + 14], [w * 0.14, beltY + 20], [-w * 0.10, beltY + 18]] as Array<[number, number]>) {
    ctx.beginPath(); ctx.arc(hx, hy, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ===== 第四关「占领电台」场景绘制（白天；电台内部为冷色金属白配色，明显区别于其他场景） =====

// 场景 0：军事基地商讨室——独立封闭室内；只有走到右端房门后才切换到室外集合区。
function drawLevel4Briefing(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const roomW = W;
  const tableX = LEVEL4_TABLE_FX * W;
  const cityHallBriefing = g.level?.levelId === LEVEL6_ID;
  const warehouseBriefing = g.level?.levelId === LEVEL7_ID;
  const highwayBriefing = g.level?.levelId === LEVEL8_ID;
  const operationTarget = highwayBriefing ? "高速收费站" : warehouseBriefing ? "物资仓库" : cityHallBriefing ? "市政大楼" : "电台";
  const operationTitle = highwayBriefing ? "行动：清理高速" : warehouseBriefing ? "行动：夺取仓库" : cityHallBriefing ? "行动：攻占市政大楼" : "行动：占领电台";
  // 室内：暖灰墙面 + 地板 + 踢脚线
  const wall = ctx.createLinearGradient(0, 0, 0, 460);
  wall.addColorStop(0, "#474d51"); wall.addColorStop(1, "#5b6165");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, roomW, 460);
  const inFloor = ctx.createLinearGradient(0, 460, 0, H);
  inFloor.addColorStop(0, "#3a3e40"); inFloor.addColorStop(1, "#2b2e30");
  ctx.fillStyle = inFloor; ctx.fillRect(0, 460, roomW, H - 460);
  ctx.fillStyle = "#33373a"; ctx.fillRect(0, 450, roomW, 10);
  // 地面中央深色毯面走道（简报室向地图板聚拢的构图）
  ctx.fillStyle = "rgba(20,24,26,.5)";
  ctx.beginPath(); ctx.moveTo(0, 560); ctx.lineTo(roomW, 560); ctx.lineTo(roomW, 640); ctx.lineTo(0, 640); ctx.closePath(); ctx.fill();
  // 吊顶与两盏军用吊灯（金属灯罩 + 防护网 + 垂杆 + 地面光锥）
  ctx.fillStyle = "#33383b"; ctx.fillRect(0, 0, roomW, 46);
  ctx.fillStyle = "#2a2f32"; ctx.fillRect(0, 42, roomW, 6);
  for (let lx = 180; lx < roomW - 70; lx += 300) {
    ctx.strokeStyle = "#22262a"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(lx, 46); ctx.lineTo(lx, 86); ctx.stroke();
    ctx.fillStyle = "#3f464b";
    ctx.beginPath(); ctx.moveTo(lx - 34, 118); ctx.lineTo(lx + 34, 118); ctx.lineTo(lx + 18, 86); ctx.lineTo(lx - 18, 86); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(20,24,26,.6)"; ctx.lineWidth = 2;
    for (let cx = -24; cx <= 24; cx += 12) { ctx.beginPath(); ctx.moveTo(lx + cx, 116); ctx.lineTo(lx + cx * 0.5, 88); ctx.stroke(); }
    ctx.fillStyle = "#f2e2ae";
    ctx.beginPath(); ctx.ellipse(lx, 118, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(240,225,170,.08)";
    ctx.beginPath(); ctx.moveTo(lx - 30, 122); ctx.lineTo(lx + 30, 122); ctx.lineTo(lx + 90, 460); ctx.lineTo(lx - 90, 460); ctx.closePath(); ctx.fill();
  }
  // 顶部通风管
  ctx.fillStyle = "#3d4347"; ctx.fillRect(60, 56, roomW - 120, 22);
  ctx.strokeStyle = "#2c3134"; ctx.lineWidth = 2;
  for (let x = 90; x < roomW - 90; x += 60) { ctx.beginPath(); ctx.moveTo(x, 56); ctx.lineTo(x, 78); ctx.stroke(); }
  // 作战态势地图板（整墙主视觉）：封锁区地图 + 道路网 + 电台目标点（闪烁标记）
  ctx.fillStyle = "#2c3540"; ctx.fillRect(80, 92, 340, 200);
  ctx.strokeStyle = "#1b222b"; ctx.lineWidth = 6; ctx.strokeRect(80, 92, 340, 200);
  ctx.fillStyle = "#222a33"; ctx.fillRect(80, 92, 340, 26);
  drawText(ctx, "封锁区态势图", 250, 112, 15, "#b8c4cf", "center");
  ctx.strokeStyle = "rgba(140,170,195,.4)"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(110, 250); ctx.quadraticCurveTo(180, 170, 250, 210); ctx.quadraticCurveTo(310, 240, 390, 150);
  ctx.moveTo(130, 130); ctx.lineTo(220, 272);
  ctx.moveTo(180, 130); ctx.quadraticCurveTo(260, 190, 380, 240);
  ctx.stroke();
  ctx.fillStyle = "rgba(150,180,205,.5)";
  for (const [px, py] of [[140, 190], [210, 240], [300, 170], [250, 150]] as Array<[number, number]>) { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
  const ping = 0.5 + Math.sin(now / 300) * 0.5;
  ctx.fillStyle = "#e05244";
  ctx.beginPath(); ctx.arc(356, 158, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(224,82,68,${0.7 * ping})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(356, 158, 12 + ping * 8, 0, Math.PI * 2); ctx.stroke();
  drawText(ctx, operationTarget, 356, 136, 14, "#f0d8d4", "center");
  // 白板（行动简报）：标题 + 要点 + 突击箭头
  ctx.fillStyle = "#dfe3e6"; ctx.fillRect(452, 100, 216, 176);
  ctx.strokeStyle = "#3a4046"; ctx.lineWidth = 5; ctx.strokeRect(452, 100, 216, 176);
  drawText(ctx, operationTitle, 560, 130, 17, "#2c3338", "center");
  ctx.strokeStyle = "rgba(60,70,80,.75)"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(474, 152); ctx.lineTo(622, 152);
  ctx.moveTo(474, 176); ctx.lineTo(600, 176);
  ctx.moveTo(474, 200); ctx.lineTo(612, 200);
  ctx.stroke();
  ctx.strokeStyle = "#b0402f"; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(486, 236); ctx.lineTo(596, 236); ctx.lineTo(584, 226); ctx.moveTo(596, 236); ctx.lineTo(584, 246); ctx.stroke();
  drawText(ctx, "10 分钟后集合", 560, 262, 13, "#8a4038", "center");
  // 投影仪（吊顶悬挂，镜头朝向白板）
  ctx.strokeStyle = "#22262a"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(560, 46); ctx.lineTo(560, 66); ctx.stroke();
  ctx.fillStyle = "#2e3438"; ctx.fillRect(540, 66, 40, 20);
  ctx.fillStyle = "rgba(220,235,245,.5)"; ctx.fillRect(556, 86, 8, 6);
  // 军旗（右侧墙）
  ctx.strokeStyle = "#2c2e28"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(roomW - 128, 120); ctx.lineTo(roomW - 128, 250); ctx.stroke();
  ctx.fillStyle = "#7a2f2a"; ctx.fillRect(roomW - 124, 126, 62, 42);
  ctx.fillStyle = "rgba(230,220,170,.85)"; ctx.fillRect(roomW - 114, 138, 20, 18);
  // 长桌座椅（桌面由障碍物绘制）：桌旁两排椅子 + 桌上沙盘/文件
  for (const cx of [tableX - 84, tableX - 10, tableX + 64]) {
    for (const cy of [322, 478]) {
      ctx.fillStyle = "#46413a";
      ctx.beginPath(); ctx.roundRect(cx, cy, 44, 26, 5); ctx.fill();
      ctx.fillStyle = "#373330"; ctx.fillRect(cx + 4, cy + 26, 8, 30); ctx.fillRect(cx + 32, cy + 26, 8, 30);
      ctx.fillStyle = "#524c44"; ctx.fillRect(cx + 2, cy - 4, 40, 8);
    }
  }
  ctx.fillStyle = "#d8d2c0"; ctx.fillRect(tableX - 30, 372, 52, 10);
  ctx.fillStyle = "#b8b2a0"; ctx.fillRect(tableX - 24, 364, 40, 8);
  // 会议室后半区：装备柜、无线电席与文件架，补足从长桌到门厅的空间层次。
  const supportX = Math.max(700, roomW - 430);
  ctx.fillStyle = "#363c40";
  ctx.fillRect(supportX, 112, 300, 178);
  ctx.strokeStyle = "#24292c"; ctx.lineWidth = 4; ctx.strokeRect(supportX, 112, 300, 178);
  for (let x = supportX + 18; x < supportX + 286; x += 68) {
    ctx.fillStyle = "#4d555a"; ctx.fillRect(x, 132, 52, 132);
    ctx.strokeStyle = "#2e3438"; ctx.lineWidth = 2; ctx.strokeRect(x, 132, 52, 132);
    ctx.fillStyle = "#252b2f"; ctx.fillRect(x + 9, 150, 34, 5); ctx.fillRect(x + 9, 188, 34, 5);
    ctx.fillStyle = "#c9a64c"; ctx.fillRect(x + 40, 202, 4, 9);
  }
  ctx.fillStyle = "#2c3236"; ctx.fillRect(supportX + 16, 322, 270, 86);
  ctx.fillStyle = "#171c20"; ctx.fillRect(supportX + 30, 336, 78, 42); ctx.fillRect(supportX + 118, 336, 78, 42);
  ctx.fillStyle = "#6ed08a"; ctx.fillRect(supportX + 42, 348, 7, 7);
  ctx.fillStyle = "#d6a14b"; ctx.fillRect(supportX + 132, 348, 7, 7);
  ctx.strokeStyle = "#777f82"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(supportX + 226, 348); ctx.lineTo(supportX + 240, 318); ctx.lineTo(supportX + 254, 348); ctx.stroke();
  drawText(ctx, "基地通讯席", supportX + 151, 430, 14, "#bfc6c8", "center");
  // 承重柱、墙面导向线与门厅缓冲区，避免房门像直接开在一张平面贴图上。
  ctx.fillStyle = "#30363a"; ctx.fillRect(roomW - 126, 46, 18, 414);
  ctx.fillStyle = "#697176"; ctx.fillRect(roomW - 122, 52, 4, 402);
  ctx.fillStyle = "#242a2e"; ctx.fillRect(roomW - 210, 448, 210, 12);
  ctx.strokeStyle = "rgba(215,220,216,.16)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(roomW - 250, 520); ctx.lineTo(roomW, 520); ctx.moveTo(roomW - 250, 620); ctx.lineTo(roomW, 620); ctx.stroke();
  // 房门（右侧通向室外基地道路）+ 出口灯牌
  ctx.fillStyle = "#171b1d"; ctx.fillRect(roomW - 108, 210, 108, 250);
  ctx.strokeStyle = "#41484c"; ctx.lineWidth = 5; ctx.strokeRect(roomW - 108, 210, 108, 250);
  ctx.strokeStyle = "#2b3135"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(roomW - 54, 214); ctx.lineTo(roomW - 54, 458); ctx.stroke();
  ctx.fillStyle = "rgba(140,175,190,.3)"; ctx.fillRect(roomW - 94, 238, 30, 54); ctx.fillRect(roomW - 44, 238, 30, 54);
  ctx.fillStyle = "#3f8f5f"; ctx.fillRect(roomW - 94, 184, 80, 24);
  drawText(ctx, "出口", roomW - 54, 202, 15, "#eef6ee", "center");

  // 房门之外不提前绘制任何室外内容；任务推进后通过独立场景进入集合区。
}

// 场景 1：基地室外集合区——营房、道路、岗亭与停靠军车；从商讨室出门后才载入。
function drawLevel4BaseYard(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 24);
  sky.addColorStop(0, "#7ea9cb"); sky.addColorStop(1, "#ccd6da");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 24);
  ctx.fillStyle = "#5c6055"; ctx.fillRect(0, 96, W, ROAD_TOP + 24 - 96);
  ctx.strokeStyle = "#3a3d34"; ctx.lineWidth = 2;
  for (let x = 20; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, 96); ctx.lineTo(x + 14, 84); ctx.stroke(); }
  const outGround = ctx.createLinearGradient(0, ROAD_TOP + 24, 0, H);
  outGround.addColorStop(0, "#6f6854"); outGround.addColorStop(1, "#4e493c");
  ctx.fillStyle = outGround; ctx.fillRect(0, ROAD_TOP + 24, W, H - ROAD_TOP - 24);
  ctx.strokeStyle = "rgba(0,0,0,.14)"; ctx.lineWidth = 2;
  for (let x = 60; x < W; x += 200) { ctx.beginPath(); ctx.moveTo(x, 520); ctx.lineTo(x + 100, 520); ctx.stroke(); }
  // 基地院区：营房、器材棚、路灯、沙袋与道路标线，连接商讨室和远端上车点。
  for (let x = 120; x < W - 620; x += 520) {
    ctx.fillStyle = "#555b50"; ctx.fillRect(x, 128, 310, 170);
    ctx.fillStyle = "#666c5e"; ctx.beginPath(); ctx.moveTo(x - 14, 128); ctx.lineTo(x + 155, 80); ctx.lineTo(x + 324, 128); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2f342f"; ctx.fillRect(x + 34, 188, 64, 110); ctx.fillRect(x + 212, 188, 64, 110);
    ctx.fillStyle = "rgba(206,220,190,.45)"; ctx.fillRect(x + 126, 164, 58, 48);
    ctx.strokeStyle = "rgba(38,42,36,.55)"; ctx.lineWidth = 3; ctx.strokeRect(x, 128, 310, 170);
  }
  for (let x = 90; x < W - 240; x += 420) {
    ctx.strokeStyle = "#343a34"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, 410); ctx.lineTo(x, 180); ctx.lineTo(x + 36, 180); ctx.stroke();
    ctx.fillStyle = "#e4d28f"; ctx.fillRect(x + 28, 176, 24, 10);
    const lamp = ctx.createRadialGradient(x + 40, 184, 2, x + 40, 184, 80);
    lamp.addColorStop(0, "rgba(244,224,150,.24)"); lamp.addColorStop(1, "rgba(244,224,150,0)");
    ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(x + 40, 184, 80, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "rgba(225,214,167,.42)";
  for (let x = 140; x < W - 380; x += 300) ctx.fillRect(x, 594, 150, 8);
  ctx.fillStyle = "#665b42";
  for (let x = W - 760; x < W - 340; x += 54) {
    ctx.beginPath(); ctx.ellipse(x, 455, 30, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#413a2d"; ctx.lineWidth = 2; ctx.stroke();
  }
  // 基地大门（上车点）：门柱 + 横杆 + 岗亭 + 停靠军车
  const gx = LEVEL4_GATE_FX * W;
  ctx.fillStyle = "#43473e"; ctx.fillRect(gx - 16, 180, 26, 280); ctx.fillRect(gx + 130, 180, 26, 280);
  ctx.fillStyle = "#535849"; ctx.fillRect(gx - 26, 164, 192, 22);
  drawText(ctx, "基地大门", gx + 70, 152, 17, "#d8d2b8", "center");
  ctx.fillStyle = "#3d4138"; ctx.fillRect(gx + 190, 300, 90, 160);
  ctx.fillStyle = "rgba(230,225,180,.6)"; ctx.fillRect(gx + 206, 322, 58, 40);
  if (g.level?.levelId === LEVEL8_ID) drawLevel8ArmoredVehicle(ctx, g.level, now, gx - 180, 470);
  else drawMilitaryTruck(ctx, gx - 180, 470, false, now);
}

// 场景 2：电台门口——白天，放大的电台通讯基地主楼（三层立面 + 门厅雨棚 + 大字招牌）+ 独立天线铁塔 + 围栏大门
function drawLevel4StationGate(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 24);
  sky.addColorStop(0, "#7fb0d6"); sky.addColorStop(1, "#d2dce0");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 24);
  // 地面必须先于建筑绘制；旧顺序会用整块水泥路覆盖主楼 y=184 以下的门厅和一层立面。
  const ground = ctx.createLinearGradient(0, ROAD_TOP + 24, 0, H);
  ground.addColorStop(0, "#8b9095"); ground.addColorStop(1, "#676c71");
  ctx.fillStyle = ground; ctx.fillRect(0, ROAD_TOP + 24, W, H - ROAD_TOP - 24);
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(0, ROAD_TOP + 24, W, 12);
  // 远景：城市建筑剪影（高低错落）
  ctx.fillStyle = "rgba(120,135,145,.4)";
  for (let x = 60; x < W * 0.5; x += 260) ctx.fillRect(x, ROAD_TOP - 60 - (x % 3) * 20, 120, 60 + (x % 3) * 20);
  const doorX = LEVEL4_STATION_DOOR_FX * W;
  const bx = doorX - 520;
  const bw = 900;
  // 主楼体量：完整三层金属白立面。屋顶、三排窗带和一层门厅全部保持在画布内，
  // 既保留通讯基地的体量，也避免顶层与屋顶设备因负坐标被裁掉。
  const buildingTop = 32;
  const buildingBottom = 420;
  ctx.fillStyle = "#c6cfd7"; ctx.fillRect(bx, buildingTop, bw, buildingBottom - buildingTop);
  ctx.fillStyle = "#b4bec7"; ctx.fillRect(bx - 12, buildingBottom - 20, bw + 24, 20);
  ctx.fillStyle = "#aeb8c1"; ctx.fillRect(bx - 16, buildingTop, bw + 32, 14);
  ctx.fillStyle = "#a4aeb7"; ctx.fillRect(bx, 146, bw, 10); ctx.fillRect(bx, 252, bw, 10);
  // 立面竖向分格 + 三层深色窗带
  ctx.strokeStyle = "rgba(88,98,108,.35)"; ctx.lineWidth = 2;
  for (let x = bx + 60; x < bx + bw; x += 92) { ctx.beginPath(); ctx.moveTo(x, buildingTop + 14); ctx.lineTo(x, buildingBottom - 40); ctx.stroke(); }
  ctx.fillStyle = "#2b343c";
  for (const [wy, wh] of [[52, 80], [166, 72], [272, 112]] as Array<[number, number]>) {
    for (let wx = bx + 26; wx < bx + bw - 40; wx += 74) ctx.fillRect(wx, wy, 46, wh);
  }
  // 玻璃反光（几片窗亮面）
  ctx.fillStyle = "rgba(190,215,230,.35)";
  ctx.fillRect(bx + 100, 58, 46, 68); ctx.fillRect(bx + 322, 172, 46, 60); ctx.fillRect(bx + 26, 278, 46, 100);
  // 门厅：外凸入口 + 雨棚 + 立柱 + 大门（单人进入点）
  ctx.fillStyle = "#b9c3cc"; ctx.fillRect(doorX - 130, 154, 260, 266);
  ctx.fillStyle = "#9aa5af"; ctx.fillRect(doorX - 154, 136, 308, 20);
  ctx.fillStyle = "#8b96a0"; ctx.fillRect(doorX - 142, 158, 16, 262); ctx.fillRect(doorX + 126, 158, 16, 262);
  ctx.fillStyle = "#0f1214"; ctx.fillRect(doorX - 58, 184, 116, 236);
  ctx.strokeStyle = "#434d55"; ctx.lineWidth = 5; ctx.strokeRect(doorX - 58, 184, 116, 236);
  ctx.beginPath(); ctx.moveTo(doorX, 184); ctx.lineTo(doorX, 420); ctx.stroke();
  drawText(ctx, "通讯基地", doorX, 174, 14, "#c8cdd2", "center");
  // 大字招牌（门厅上方）+ 英文小字
  ctx.fillStyle = "#e8e4d4"; ctx.fillRect(doorX - 170, 70, 340, 62);
  ctx.strokeStyle = "#a8a494"; ctx.lineWidth = 3; ctx.strokeRect(doorX - 170, 70, 340, 62);
  drawText(ctx, "市广播电台", doorX, 111, 34, "#33383d", "center");
  drawText(ctx, "RADIO STATION", doorX, 146, 12, "#6a7068", "center");
  // 独立天线铁塔（主楼右后侧，格构式，直出画面顶部）：双斜撑塔身 + 横担 + 红色障碍灯
  const tx = bx + bw + 60;
  const towerTop = 8;
  ctx.strokeStyle = "#5a646d"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(tx - 34, 400); ctx.lineTo(tx - 8, towerTop); ctx.moveTo(tx + 34, 400); ctx.lineTo(tx + 8, towerTop); ctx.stroke();
  ctx.lineWidth = 2.5;
  for (let ty = 380; ty > towerTop; ty -= 46) {
    const towerProgress = (ty - towerTop) / (380 - towerTop);
    const spread = 8 + towerProgress * 26;
    ctx.beginPath();
    ctx.moveTo(tx - spread, ty); ctx.lineTo(tx + spread, ty);
    ctx.moveTo(tx - spread, ty); ctx.lineTo(tx + spread - 4, ty - 46);
    ctx.moveTo(tx + spread, ty); ctx.lineTo(tx - spread + 4, ty - 46);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(tx - 34, 28); ctx.lineTo(tx + 34, 28); ctx.moveTo(tx - 26, 112); ctx.lineTo(tx + 26, 112); ctx.stroke();
  const blink = Math.floor(now / 520) % 2 === 0;
  ctx.fillStyle = blink ? "#ff5a4a" : "#7a2620";
  ctx.beginPath(); ctx.arc(tx, towerTop + 4, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx, 26, 4, 0, Math.PI * 2); ctx.fill();
  // 屋顶设备群：抛物面天线、馈线桥架、空调机组与备用微波天线。
  const roofEquipmentY = buildingTop - 8;
  ctx.fillStyle = "#8b959e";
  ctx.beginPath(); ctx.arc(bx + 90, roofEquipmentY, 20, -0.7, Math.PI * 0.85); ctx.lineTo(bx + 90, roofEquipmentY); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#6a737c"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bx + 90, roofEquipmentY); ctx.lineTo(bx + 90, buildingTop + 18); ctx.stroke();
  for (const ax of [bx + 250, bx + 430, bx + 650]) {
    ctx.fillStyle = "#89939c"; ctx.fillRect(ax, roofEquipmentY, 112, 42);
    ctx.strokeStyle = "#626c75"; ctx.lineWidth = 2; ctx.strokeRect(ax, roofEquipmentY, 112, 42);
    for (let gx = ax + 12; gx < ax + 102; gx += 18) { ctx.beginPath(); ctx.moveTo(gx, roofEquipmentY + 4); ctx.lineTo(gx, roofEquipmentY + 36); ctx.stroke(); }
  }
  ctx.strokeStyle = "#5b656e"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(bx + 30, buildingTop + 58); ctx.lineTo(bx + bw - 24, buildingTop + 58); ctx.stroke();
  // 左侧附属机房与发电设施，让大门前的长距离不再是一片空地。
  const annexX = bx - 500;
  ctx.fillStyle = "#adb7c0"; ctx.fillRect(annexX, 132, 430, 268);
  ctx.fillStyle = "#929da7"; ctx.fillRect(annexX - 12, 118, 454, 18);
  ctx.strokeStyle = "rgba(70,80,90,.45)"; ctx.lineWidth = 3; ctx.strokeRect(annexX, 132, 430, 268);
  ctx.fillStyle = "#313941";
  for (let x = annexX + 26; x < annexX + 250; x += 74) ctx.fillRect(x, 174, 52, 76);
  ctx.fillStyle = "#56616b"; ctx.fillRect(annexX + 298, 196, 92, 204);
  ctx.fillStyle = "#d2d9df"; ctx.fillRect(annexX + 34, 278, 224, 42);
  drawText(ctx, "供电与发射机房", annexX + 146, 306, 19, "#3b444c", "center");
  ctx.fillStyle = "#56616a"; ctx.fillRect(annexX - 240, 290, 190, 110);
  ctx.strokeStyle = "#353d44"; ctx.lineWidth = 4; ctx.strokeRect(annexX - 240, 290, 190, 110);
  for (let x = annexX - 220; x < annexX - 70; x += 28) { ctx.beginPath(); ctx.moveTo(x, 308); ctx.lineTo(x, 380); ctx.stroke(); }
  ctx.fillStyle = "#d9aa3f"; ctx.fillRect(annexX - 220, 316, 18, 12);
  // 铁围栏（主楼左侧，大门敞开）：栏杆柱 + 横杆 + 门柱
  const fx = bx - 60;
  ctx.strokeStyle = "#454b51"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 330); ctx.lineTo(fx, 330); ctx.moveTo(0, 380); ctx.lineTo(fx, 380); ctx.stroke();
  for (let x = 20; x < fx; x += 44) { ctx.beginPath(); ctx.moveTo(x, 316); ctx.lineTo(x, 396); ctx.stroke(); }
  ctx.fillStyle = "#4c5258"; ctx.fillRect(fx - 8, 300, 18, 100); ctx.fillRect(fx + 60, 300, 18, 100);
  // 入口检查区：岗亭、升降杆、减速带、停车位与通向门厅的双车道导向。
  const checkpointX = Math.max(360, annexX - 560);
  ctx.fillStyle = "#88929a"; ctx.fillRect(checkpointX, 286, 132, 114);
  ctx.fillStyle = "#4c5861"; ctx.fillRect(checkpointX + 16, 304, 100, 50);
  ctx.fillStyle = "rgba(184,215,229,.55)"; ctx.fillRect(checkpointX + 24, 312, 84, 34);
  ctx.fillStyle = "#6d7680"; ctx.fillRect(checkpointX - 12, 276, 156, 14);
  ctx.strokeStyle = "#4b5258"; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(checkpointX + 132, 350); ctx.lineTo(checkpointX + 360, 350); ctx.stroke();
  ctx.strokeStyle = "#d7d8cf"; ctx.lineWidth = 4;
  for (let x = checkpointX + 150; x < checkpointX + 350; x += 44) { ctx.beginPath(); ctx.moveTo(x, 343); ctx.lineTo(x + 24, 357); ctx.stroke(); }
  ctx.fillStyle = "#31363a";
  for (let x = checkpointX - 40; x < checkpointX + 470; x += 52) ctx.fillRect(x, 612, 32, 10);
  ctx.strokeStyle = "rgba(235,232,210,.5)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(checkpointX + 190, 540); ctx.lineTo(doorX - 160, 540); ctx.moveTo(checkpointX + 190, 650); ctx.lineTo(doorX - 160, 650); ctx.stroke();
  ctx.fillStyle = "rgba(235,232,210,.55)";
  for (let x = checkpointX + 240; x < doorX - 200; x += 210) ctx.fillRect(x, 590, 110, 7);
  // 门前水泥路裂纹与排水沟最后叠加在地表，不再覆盖建筑。
  ctx.strokeStyle = "rgba(40,44,48,.4)"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(doorX - 440, 500); ctx.lineTo(doorX - 340, 560); ctx.moveTo(doorX - 230, 480); ctx.lineTo(doorX - 150, 548); ctx.stroke();
  ctx.fillStyle = "rgba(35,39,43,.42)"; ctx.fillRect(bx - 30, 684, bw + 90, 8);
}

// 场景 3/5：电台内部走廊——金属白配色（高吊顶 + 冷色金属墙面 + 顶灯 + 通讯机柜 + 楼层标识），层高与人物比例合理
function drawLevel4Floor(ctx: CanvasRenderingContext2D, g: GameState, now: number, floorNo: number) {
  const W = g.worldW;
  // 金属白墙面 + 墙板缝线 + 护腰线 + 踢脚线
  const wall = ctx.createLinearGradient(0, 0, 0, 460);
  wall.addColorStop(0, "#aab4be"); wall.addColorStop(1, "#ccd4dc");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, 460);
  ctx.strokeStyle = "rgba(88,98,108,.35)"; ctx.lineWidth = 2;
  for (let x = 60; x < W; x += 150) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 460); ctx.stroke(); }
  ctx.fillStyle = "#a4aeb8"; ctx.fillRect(0, 300, W, 10);
  ctx.fillStyle = "#96a0aa"; ctx.fillRect(0, 448, W, 12);
  // 高吊顶：井字梁 + 吊杆悬挂长条冷白灯（个别闪烁）+ 地面光锥
  ctx.fillStyle = "#8b96a0"; ctx.fillRect(0, 0, W, 40);
  ctx.fillStyle = "#7e8892";
  for (let x = 0; x < W; x += 320) ctx.fillRect(x, 36, 16, 14);
  for (let x = 120; x < W; x += 320) {
    ctx.strokeStyle = "#6c767f"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 20, 40); ctx.lineTo(x + 20, 14); ctx.moveTo(x + 100, 40); ctx.lineTo(x + 100, 14); ctx.stroke();
    const flicker = Math.floor(x / 320) % 4 === 2 ? 0.6 + Math.sin(now / 90 + x) * 0.18 : 1;
    ctx.fillStyle = `rgba(240,248,255,${0.92 * flicker})`;
    ctx.fillRect(x, 14, 120, 12);
    ctx.fillStyle = `rgba(215,232,248,${0.10 * flicker})`;
    ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x + 120, 26); ctx.lineTo(x + 170, 448); ctx.lineTo(x - 50, 448); ctx.closePath(); ctx.fill();
  }
  // 墙面侧门（通讯机房入口，门牌）与绿色疏散指示
  for (let x = 420; x < W - 160; x += 840) {
    ctx.fillStyle = "#6b7680"; ctx.fillRect(x, 210, 76, 240);
    ctx.strokeStyle = "#4a545e"; ctx.lineWidth = 4; ctx.strokeRect(x, 210, 76, 240);
    ctx.fillStyle = "#39414a"; ctx.fillRect(x + 8, 350, 14, 4);
    ctx.fillStyle = "#3f8f5f"; ctx.fillRect(x + 10, 186, 56, 20);
    drawText(ctx, "机房", x + 38, 202, 13, "#eef6ee", "center");
  }
  // 通讯机柜：深色柜体 + 闪烁 LED + 顶部线缆槽
  for (let x = 200; x < W - 160; x += 420) {
    ctx.fillStyle = "#2e3338"; ctx.fillRect(x, 220, 92, 228);
    ctx.strokeStyle = "#1b2025"; ctx.lineWidth = 3; ctx.strokeRect(x, 220, 92, 228);
    for (let ry = 236; ry < 430; ry += 26) {
      ctx.fillStyle = "#3d444c"; ctx.fillRect(x + 8, ry, 76, 16);
      const on = Math.floor(now / 300 + ry + x) % 3 !== 0;
      ctx.fillStyle = on ? "#69e08a" : "#d88a3a";
      ctx.fillRect(x + 70, ry + 5, 6, 6);
    }
    ctx.fillStyle = "#24292e"; ctx.fillRect(x - 6, 206, 104, 14);
  }
  // 地板：浅灰金属 + 拼缝 + 中央导向条纹（纵深空间感）
  const floorG = ctx.createLinearGradient(0, 460, 0, H);
  floorG.addColorStop(0, "#b7bec6"); floorG.addColorStop(1, "#8d959d");
  ctx.fillStyle = floorG; ctx.fillRect(0, 460, W, H - 460);
  ctx.strokeStyle = "rgba(70,80,90,.18)"; ctx.lineWidth = 1.5;
  for (let x = 0; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 460); ctx.lineTo(x + 40, H); ctx.stroke(); }
  ctx.fillStyle = "rgba(70,80,90,.22)"; ctx.fillRect(0, 600, W, 8);
  // 楼层标识与尽头安全门（带闭门器与逃生灯牌）
  drawText(ctx, `${floorNo}F`, 90, 130, 46, "rgba(60,70,80,.75)", "center");
  ctx.fillStyle = "#39414a"; ctx.fillRect(W - 120, 230, 90, 220);
  ctx.strokeStyle = "#22282e"; ctx.lineWidth = 4; ctx.strokeRect(W - 120, 230, 90, 220);
  ctx.strokeStyle = "#2c343c"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W - 116, 244); ctx.lineTo(W - 90, 236); ctx.stroke();
  ctx.fillStyle = "#3f8f5f"; ctx.fillRect(W - 116, 204, 66, 20);
  drawText(ctx, "安全门", W - 83, 220, 12, "#eef6ee", "center");
}

// 场景 4/6：楼梯间——角色沿与模型完全一致的两跑台阶自动升到出口平台。
function drawLevel4Stairwell(ctx: CanvasRenderingContext2D, g: GameState, nextFloor: number) {
  const W = g.worldW;
  const wall = ctx.createLinearGradient(0, 0, 0, 460);
  wall.addColorStop(0, "#9fa9b3"); wall.addColorStop(1, "#c2cad2");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, 460);
  const floorG = ctx.createLinearGradient(0, 460, 0, H);
  floorG.addColorStop(0, "#a8b0b8"); floorG.addColorStop(1, "#7e868e");
  ctx.fillStyle = floorG; ctx.fillRect(0, 460, W, H - 460);
  ctx.fillStyle = "#96a0aa"; ctx.fillRect(0, 448, W, 12);
  // 防火楼梯间结构：楼板梁、墙面分缝、消防立管和高窗。
  ctx.fillStyle = "#7f8993"; ctx.fillRect(0, 36, W, 24); ctx.fillRect(0, 278, W, 18);
  ctx.strokeStyle = "rgba(80,90,100,.34)"; ctx.lineWidth = 2;
  for (let x = 80; x < W; x += 190) { ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, 448); ctx.stroke(); }
  for (let x = 210; x < W - 180; x += 460) {
    ctx.fillStyle = "#65727c"; ctx.fillRect(x, 92, 164, 104);
    ctx.fillStyle = "rgba(183,214,229,.58)"; ctx.fillRect(x + 10, 102, 144, 84);
    ctx.strokeStyle = "#525e68"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 82, 102); ctx.lineTo(x + 82, 186); ctx.moveTo(x + 10, 144); ctx.lineTo(x + 154, 144); ctx.stroke();
  }
  ctx.strokeStyle = "#ad3f35"; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(72, 82); ctx.lineTo(72, 448); ctx.lineTo(124, 448); ctx.stroke();
  ctx.fillStyle = "#c84a3f"; ctx.fillRect(48, 286, 48, 78);
  ctx.fillStyle = "#ece4cf"; ctx.fillRect(58, 300, 28, 24);
  drawText(ctx, "消防", 72, 352, 11, "#f1e8d6", "center");

  // 两跑平台楼梯：完整踏步、踢面、平台、下部承重斜梁和前后两层扶手。
  // 所有水平几何按世界宽度计算，保证极窄屏的动态画布也不会把楼梯或出口挤出世界。
  const lowerStart = W * LEVEL4_STAIR_LOWER_START_FX;
  const landingX = W * LEVEL4_STAIR_LANDING_FX;
  const landingW = W * LEVEL4_STAIR_LANDING_W_FX;
  const steps = 10;
  const stepW = (landingX - lowerStart) / steps;
  const stepH = (LEVEL4_STAIR_BOTTOM_Y - LEVEL4_STAIR_LANDING_Y) / steps;
  ctx.fillStyle = "#68727c";
  ctx.beginPath();
  ctx.moveTo(lowerStart - 24, LEVEL4_STAIR_BOTTOM_Y + 10);
  ctx.lineTo(landingX + 28, LEVEL4_STAIR_LANDING_Y + 10);
  ctx.lineTo(landingX + 28, LEVEL4_STAIR_LANDING_Y + 54);
  ctx.lineTo(lowerStart - 24, LEVEL4_STAIR_BOTTOM_Y + 60);
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < steps; i++) {
    const sx = lowerStart + i * stepW;
    const sy = LEVEL4_STAIR_BOTTOM_Y - i * stepH;
    ctx.fillStyle = i % 2 ? "#a5afb8" : "#b5bdc5";
    ctx.fillRect(sx, sy, stepW + 2, stepH);
    ctx.fillStyle = "#7d8790"; ctx.fillRect(sx, sy + stepH - 6, stepW + 2, 6);
  }
  ctx.fillStyle = "#aeb7bf"; ctx.fillRect(landingX, LEVEL4_STAIR_LANDING_Y, landingW, 42);
  ctx.fillStyle = "#747e87"; ctx.fillRect(landingX, LEVEL4_STAIR_LANDING_Y + 38, landingW, 10);
  // 上层梯在背景中继续抬升至出口平台。
  const upperStart = landingX + landingW * .82;
  const upperEnd = W * LEVEL4_STAIR_UPPER_END_FX;
  const upperStepH = (LEVEL4_STAIR_LANDING_Y - LEVEL4_STAIR_EXIT_Y) / steps;
  ctx.fillStyle = "#737e87";
  ctx.beginPath(); ctx.moveTo(upperStart, LEVEL4_STAIR_LANDING_Y); ctx.lineTo(upperEnd, LEVEL4_STAIR_EXIT_Y); ctx.lineTo(upperEnd, LEVEL4_STAIR_EXIT_Y + 52); ctx.lineTo(upperStart, LEVEL4_STAIR_LANDING_Y + 48); ctx.closePath(); ctx.fill();
  const upperSpan = upperEnd - upperStart;
  const upperStepW = upperSpan / steps;
  for (let i = 0; i < steps; i++) {
    const sx = upperStart + i * upperStepW;
    const sy = LEVEL4_STAIR_LANDING_Y - i * upperStepH;
    ctx.fillStyle = i % 2 ? "#9ca7b0" : "#b0b9c1";
    ctx.fillRect(sx, sy, upperStepW + 2, upperStepH);
    ctx.fillStyle = "#737d86"; ctx.fillRect(sx, sy + upperStepH - 5, upperStepW + 2, 5);
  }
  // 扶手立柱与连续扶手。
  ctx.strokeStyle = "#59656f"; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(lowerStart, LEVEL4_STAIR_BOTTOM_Y - 54); ctx.lineTo(landingX + 10, LEVEL4_STAIR_LANDING_Y - 54); ctx.lineTo(upperStart, LEVEL4_STAIR_LANDING_Y - 54);
  ctx.lineTo(upperEnd, LEVEL4_STAIR_EXIT_Y - 54);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 0; i <= steps; i += 2) {
    const x = lowerStart + i * stepW;
    const stepY = LEVEL4_STAIR_BOTTOM_Y - i * stepH;
    ctx.beginPath(); ctx.moveTo(x, stepY - 54); ctx.lineTo(x, stepY); ctx.stroke();
  }
  for (let i = 0; i <= steps; i += 2) {
    const x = upperStart + i * upperStepW;
    const stepY = LEVEL4_STAIR_LANDING_Y - i * upperStepH;
    ctx.beginPath(); ctx.moveTo(x, stepY - 54); ctx.lineTo(x, stepY); ctx.stroke();
  }
  // 楼层平台安全门、应急灯、层号与上行指示。
  const exitDoorW = Math.max(84, Math.min(118, W * .09));
  const exitDoorX = W - exitDoorW - Math.max(24, W * .025);
  const exitDoorY = LEVEL4_STAIR_EXIT_Y - 240;
  ctx.fillStyle = "#4d5862"; ctx.fillRect(exitDoorX, exitDoorY, exitDoorW, 240);
  ctx.strokeStyle = "#343d45"; ctx.lineWidth = 5; ctx.strokeRect(exitDoorX, exitDoorY, exitDoorW, 240);
  ctx.fillStyle = "#242b31"; ctx.fillRect(exitDoorX + 20, LEVEL4_STAIR_EXIT_Y - 122, 18, 5);
  const exitSignW = Math.max(118, Math.min(164, W * .13));
  ctx.fillStyle = "#3f8f5f"; ctx.fillRect(W - exitSignW - 18, exitDoorY - 38, exitSignW, 32);
  const stairExitLabel = g.level?.levelId === LEVEL6_ID ? "中央大厅 →" : nextFloor >= 3 ? "天台出口 →" : `↑ 前往 ${nextFloor}F`;
  drawText(ctx, stairExitLabel, W - exitSignW / 2 - 18, exitDoorY - 15, 17, "#eef6ee", "center");
  ctx.fillStyle = "rgba(60,70,80,.72)"; ctx.fillRect(120, 104, 92, 70);
  drawText(ctx, `${nextFloor - 1}F`, 166, 154, 38, "#d6dde1", "center");
  drawText(ctx, "楼梯间", 166, 194, 18, "rgba(60,70,80,.78)", "center");
  ctx.fillStyle = "rgba(235,245,236,.22)";
  ctx.beginPath(); ctx.moveTo(exitDoorX, LEVEL4_STAIR_EXIT_Y); ctx.lineTo(exitDoorX + exitDoorW, LEVEL4_STAIR_EXIT_Y); ctx.lineTo(W, 640); ctx.lineTo(Math.max(0, exitDoorX - W * .14), 640); ctx.closePath(); ctx.fill();
}

// 场景 7：天台——白天天空 + 女儿墙 + 通风箱与天线杆（重甲僵尸出现处）
function drawLevel4Roof(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 24);
  sky.addColorStop(0, "#83b4da"); sky.addColorStop(1, "#d6dee2");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 24);
  // 远景城市剪影
  ctx.fillStyle = "rgba(115,130,140,.45)";
  for (let x = 40; x < W; x += 230) ctx.fillRect(x, ROAD_TOP - 70 - (x % 4) * 18, 110, 70 + (x % 4) * 18);
  // 女儿墙（护栏矮墙）
  ctx.fillStyle = "#99a1aa"; ctx.fillRect(0, ROAD_TOP - 26, W, 50);
  ctx.fillStyle = "#878f98"; ctx.fillRect(0, ROAD_TOP - 32, W, 10);
  // 屋面：碎石沥青 + 女儿墙阴影
  const ground = ctx.createLinearGradient(0, ROAD_TOP + 24, 0, H);
  ground.addColorStop(0, "#7c8187"); ground.addColorStop(1, "#5f646a");
  ctx.fillStyle = ground; ctx.fillRect(0, ROAD_TOP + 24, W, H - ROAD_TOP - 24);
  ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(0, ROAD_TOP + 24, W, 26);
  // 通风箱与天线杆
  for (const vx of [W * 0.24, W * 0.52]) {
    ctx.fillStyle = "#8d959d"; ctx.fillRect(vx, 360, 120, 90);
    ctx.strokeStyle = "#6c747c"; ctx.lineWidth = 3; ctx.strokeRect(vx, 360, 120, 90);
    ctx.strokeStyle = "#767e86";
    for (let ly = 374; ly < 440; ly += 14) { ctx.beginPath(); ctx.moveTo(vx + 10, ly); ctx.lineTo(vx + 110, ly); ctx.stroke(); }
  }
  ctx.strokeStyle = "#5a646d"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(W * 0.4, 340); ctx.lineTo(W * 0.4, 180); ctx.stroke();
  const blink = Math.floor(now / 520) % 2 === 0;
  ctx.fillStyle = blink ? "#ff5a4a" : "#7a2620";
  ctx.beginPath(); ctx.arc(W * 0.4, 176, 5, 0, Math.PI * 2); ctx.fill();
}

// 场景 7：天台通讯设备区——机柜列 + 天线桅杆 + 设备 HP / 维修进度 / 维修火花（参照第三关围墙承伤体系）
function drawLevel4RoofDefense(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  drawLevel4Roof(ctx, g, now);
  const level = g.level;
  const equipX = LEVEL4_EQUIP_FX * g.worldW;
  // 通讯机柜列（覆盖路面高度，与判定段对应）：柜体 + 指示灯 + 顶部馈线
  for (const cy of [280, 400, 520, 620]) {
    ctx.fillStyle = "#3a4046"; ctx.fillRect(equipX - 30, cy - 70, 60, 120);
    ctx.strokeStyle = "#23282d"; ctx.lineWidth = 3; ctx.strokeRect(equipX - 30, cy - 70, 60, 120);
    ctx.fillStyle = "#2c3136"; ctx.fillRect(equipX - 22, cy - 58, 44, 30);
    const on = Math.floor(now / 260 + cy) % 2 === 0;
    ctx.fillStyle = on ? "#69e08a" : "#c84a3a";
    ctx.fillRect(equipX - 22, cy - 64, 8, 8);
  }
  // 天线桅杆 + 横担 + 红色障碍灯
  ctx.strokeStyle = "#565e66"; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(equipX, 240); ctx.lineTo(equipX, 40); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(equipX - 40, 90); ctx.lineTo(equipX + 40, 90); ctx.moveTo(equipX - 30, 130); ctx.lineTo(equipX + 30, 130); ctx.stroke();
  ctx.strokeStyle = "rgba(40,45,50,.6)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(equipX, 240); ctx.lineTo(equipX - 12, 300); ctx.moveTo(equipX, 240); ctx.lineTo(equipX + 12, 340); ctx.stroke();
  const blink = Math.floor(now / 500) % 2 === 0;
  ctx.fillStyle = blink ? "#ff5a4a" : "#7a2620";
  ctx.beginPath(); ctx.arc(equipX, 34, 7, 0, Math.PI * 2); ctx.fill();
  if (!level) return;
  // 设备 HP 条（共享池，同第三关围墙换算）
  const hpRatio = Math.max(0, level.wallHp / LEVEL4_EQUIP_HP);
  ctx.fillStyle = "rgba(12,14,16,.72)"; ctx.fillRect(equipX - 90, 96, 180, 16);
  ctx.fillStyle = hpRatio > 0.35 ? "#72ef9a" : "#e0a03a";
  ctx.fillRect(equipX - 88, 98, 176 * hpRatio, 12);
  drawText(ctx, `通讯设备 ${Math.ceil(level.wallHp)} HP`, equipX, 88, 15, "#e8e2d2", "center");
  if (level.eventStage !== "repair") return;
  // 维修进度条（20 秒）+ 维修点火花
  const prog = Math.min(1, (now - level.eventAt) / LEVEL4_REPAIR_MS);
  ctx.fillStyle = "rgba(12,14,16,.72)"; ctx.fillRect(equipX - 90, 132, 180, 14);
  ctx.fillStyle = "#6ec8f2"; ctx.fillRect(equipX - 88, 134, 176 * prog, 10);
  drawText(ctx, `维修进度 ${Math.floor(prog * 100)}%`, equipX, 126, 14, "#cfe8f8", "center");
  if (Math.floor(now / 120) % 2 === 0) {
    ctx.fillStyle = "#ffe08a";
    for (let i = 0; i < 5; i++) {
      const a = (now / 130 + i) * 2.1;
      ctx.fillRect(equipX - 52 + Math.cos(a) * 14, 410 + Math.sin(a) * 18, 3, 3);
    }
  }
}

// ===== 第五关「解救行动」场景绘制 =====

function drawMilitaryHelicopter(ctx: CanvasRenderingContext2D, x: number, groundY: number, flying: boolean, now: number) {
  const scale = LEVEL5_HELICOPTER_SCALE;
  const bob = flying ? Math.sin(now / 90) * 3 : 0;
  const rotor = now / (flying ? 22 : 34);
  const altitude = flying ? Math.max(0, 500 - groundY) : 0;
  const shadowScale = flying ? Math.max(.56, 1 - altitude / 720) : 1;
  const shadowGroundY = flying ? 510 : groundY + 10;
  ctx.save();
  // 阴影固定在落地区地面，只随飞行高度缩小/变淡；机体再按真实人物比例整体放大。
  ctx.fillStyle = `rgba(0,0,0,${flying ? .1 + shadowScale * .1 : .24})`;
  ctx.beginPath(); ctx.ellipse(x, shadowGroundY, 210 * scale * shadowScale, (flying ? 14 : 22) * scale * shadowScale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, groundY - 88 * scale + bob);
  ctx.scale(scale, scale);
  // 尾梁、垂尾与尾桨
  const tailGradient = ctx.createLinearGradient(-250, -80, -60, 42);
  tailGradient.addColorStop(0, "#343f34"); tailGradient.addColorStop(.5, "#526049"); tailGradient.addColorStop(1, "#3c493a");
  ctx.fillStyle = tailGradient;
  ctx.beginPath(); ctx.moveTo(-82, -8); ctx.lineTo(-244, -52); ctx.lineTo(-250, -30); ctx.lineTo(-78, 34); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#273129"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-231, -45); ctx.lineTo(-84, 7); ctx.stroke();
  ctx.fillStyle = "#394635";
  ctx.beginPath(); ctx.moveTo(-228, -42); ctx.lineTo(-248, -112); ctx.lineTo(-214, -82); ctx.lineTo(-192, -26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#55624a";
  ctx.beginPath(); ctx.moveTo(-224, -35); ctx.lineTo(-260, -4); ctx.lineTo(-208, -18); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#252d28"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(-245, -48, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(-245, -48); ctx.rotate(rotor * .72); ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, 0); ctx.stroke(); }
  ctx.restore();
  // 机身与驾驶舱
  const bodyGradient = ctx.createLinearGradient(0, -72, 0, 72);
  bodyGradient.addColorStop(0, "#69765b"); bodyGradient.addColorStop(.45, "#4f5d43"); bodyGradient.addColorStop(1, "#303c31");
  ctx.fillStyle = bodyGradient;
  ctx.beginPath(); ctx.ellipse(0, 0, 116, 70, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#283128"; ctx.lineWidth = 3; ctx.stroke();
  // 涡轴发动机舱、进气口与排气管
  ctx.fillStyle = "#3d493b"; ctx.beginPath(); ctx.roundRect(-68, -86, 128, 38, 15); ctx.fill();
  ctx.strokeStyle = "#242c25"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#151b18"; ctx.beginPath(); ctx.ellipse(42, -68, 17, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#242b26"; ctx.fillRect(-82, -78, 30, 13);
  ctx.strokeStyle = "#171d19"; ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-68, -67); ctx.lineTo(-95, -66); ctx.stroke(); ctx.lineCap = "butt";
  // 分片式驾驶舱风挡与窗框
  ctx.fillStyle = "#253130";
  ctx.beginPath(); ctx.moveTo(64, -52); ctx.quadraticCurveTo(124, -26, 112, 18); ctx.lineTo(60, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(139,176,182,.68)";
  ctx.beginPath(); ctx.moveTo(70, -42); ctx.quadraticCurveTo(108, -20, 102, 8); ctx.lineTo(68, 10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#1e2827"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(82, -44); ctx.lineTo(82, 11); ctx.moveTo(67, -14); ctx.lineTo(108, -13); ctx.stroke();
  ctx.fillStyle = "rgba(190,218,220,.18)";
  ctx.beginPath(); ctx.moveTo(74, -38); ctx.lineTo(87, -31); ctx.lineTo(70, 4); ctx.closePath(); ctx.fill();
  // 开启的侧滑舱门与可见座舱（飞行中关闭，落地后打开供小队下机）
  ctx.fillStyle = "#151b18"; ctx.fillRect(-54, -45, 78, 82);
  if (flying) {
    ctx.fillStyle = "#394638"; ctx.fillRect(-54, -45, 78, 82);
    ctx.strokeStyle = "#202821"; ctx.lineWidth = 3; ctx.strokeRect(-54, -45, 78, 82);
    ctx.fillStyle = "#75847b"; ctx.fillRect(-38, -30, 43, 26);
  } else {
    ctx.fillStyle = "#343d34";
    ctx.beginPath(); ctx.roundRect(-40, -19, 20, 29, 4); ctx.roundRect(-13, -19, 20, 29, 4); ctx.fill();
    ctx.strokeStyle = "#8a917f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-36, -16); ctx.lineTo(-24, 7); ctx.moveTo(-9, -16); ctx.lineTo(3, 7); ctx.stroke();
    ctx.fillStyle = "#596150"; ctx.fillRect(-45, 15, 58, 7);
    ctx.strokeStyle = "#879080"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-42, -29); ctx.lineTo(13, -29); ctx.moveTo(-42, 12); ctx.lineTo(-42, 30); ctx.stroke();
    ctx.fillStyle = "#273027"; ctx.fillRect(-72, -45, 14, 82);
  }
  // 舱门导轨、检修面板、编号与军徽
  ctx.strokeStyle = "#242c25"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-62, -50); ctx.lineTo(31, -50); ctx.moveTo(-62, 43); ctx.lineTo(31, 43); ctx.stroke();
  ctx.strokeRect(30, 27, 35, 23);
  ctx.fillStyle = "#b7b397";
  for (const px of [-70, -28, 16, 55]) { ctx.beginPath(); ctx.arc(px, 52, 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#d8d3a9";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 4 / 5;
    const r = i % 2 ? 7 : 15;
    const px = 44 + Math.cos(a) * r; const py = 1 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  drawText(ctx, "DR-05", -10, 64, 12, "#d7d1a6", "center");
  // 起落架
  ctx.strokeStyle = "#202723"; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(-68, 48); ctx.lineTo(-84, 82); ctx.moveTo(42, 50); ctx.lineTo(58, 82); ctx.stroke();
  ctx.lineWidth = 8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-112, 86); ctx.lineTo(25, 86); ctx.moveTo(36, 86); ctx.lineTo(137, 86); ctx.stroke(); ctx.lineCap = "butt";
  // 主旋翼桅杆、旋翼毂与飞行时的旋转残影
  ctx.strokeStyle = "#1f2723"; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, -68); ctx.lineTo(0, -92); ctx.stroke();
  ctx.fillStyle = "#171d19"; ctx.beginPath(); ctx.ellipse(0, -94, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(0, -96); ctx.rotate(rotor);
  if (flying) {
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 4); ctx.strokeStyle = `rgba(27,34,30,${.26 + i * .1})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-260, 0); ctx.lineTo(260, 0); ctx.stroke();
    }
  } else {
    ctx.strokeStyle = "#1f2723"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-260, 0); ctx.lineTo(260, 0); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
  }
  ctx.restore();
  // 航行灯
  ctx.fillStyle = Math.floor(now / 360) % 2 ? "#ef4f42" : "#7c2925";
  ctx.beginPath(); ctx.arc(-205, -31, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#77d7a0"; ctx.beginPath(); ctx.arc(111, 7, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawLevel5MonitoringRoom(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const wall = ctx.createLinearGradient(0, 0, 0, 460);
  wall.addColorStop(0, "#66717a"); wall.addColorStop(1, "#8a949c");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, 460);
  ctx.fillStyle = "#444b51"; ctx.fillRect(0, 460, W, H - 460);
  ctx.fillStyle = "#353c42"; ctx.fillRect(0, 0, W, 54); ctx.fillRect(0, 448, W, 14);
  // 吸音墙板与吊灯
  for (let x = 30; x < W; x += 96) {
    ctx.fillStyle = x % 192 ? "#59646d" : "#505b64"; ctx.fillRect(x, 72, 78, 122);
    ctx.strokeStyle = "rgba(30,38,44,.35)"; ctx.lineWidth = 2; ctx.strokeRect(x, 72, 78, 122);
  }
  for (let x = 180; x < W; x += 360) {
    ctx.fillStyle = "rgba(225,239,241,.86)"; ctx.fillRect(x, 66, 180, 12);
    ctx.fillStyle = "rgba(210,230,235,.09)"; ctx.beginPath(); ctx.moveTo(x, 78); ctx.lineTo(x + 180, 78); ctx.lineTo(x + 230, 450); ctx.lineTo(x - 50, 450); ctx.closePath(); ctx.fill();
  }
  // 无线电监听席：频谱屏、接收机、录音机与天线馈线
  const deskX = W * .38;
  ctx.fillStyle = "#31383e"; ctx.fillRect(deskX - 260, 286, 520, 144);
  ctx.fillStyle = "#20272d"; ctx.fillRect(deskX - 232, 214, 464, 92);
  for (let i = 0; i < 4; i++) {
    const sx = deskX - 216 + i * 112;
    ctx.fillStyle = "#0d171c"; ctx.fillRect(sx, 228, 96, 62);
    ctx.strokeStyle = "#51606a"; ctx.lineWidth = 3; ctx.strokeRect(sx, 228, 96, 62);
    ctx.strokeStyle = i === 2 ? "#df8d45" : "#71d48c"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let p = 0; p <= 80; p += 8) {
      const py = 260 + Math.sin(now / 190 + p * .34 + i) * (5 + i * 2);
      if (p === 0) ctx.moveTo(sx + 8 + p, py); else ctx.lineTo(sx + 8 + p, py);
    }
    ctx.stroke();
  }
  for (let x = deskX - 220; x < deskX + 220; x += 72) {
    ctx.fillStyle = "#4e5961"; ctx.fillRect(x, 326, 58, 62);
    ctx.fillStyle = Math.floor(now / 300 + x) % 2 ? "#72e193" : "#d55a45"; ctx.fillRect(x + 8, 336, 7, 7);
    ctx.fillStyle = "#222a2f"; ctx.beginPath(); ctx.arc(x + 38, 358, 10, 0, Math.PI * 2); ctx.fill();
  }
  drawText(ctx, "无线电监听室 · 04", deskX, 206, 20, "#d8e0e3", "center");
  // 求救信号主屏
  const signalX = Math.min(W - 260, deskX + 390);
  ctx.fillStyle = "#182126"; ctx.fillRect(signalX - 150, 196, 300, 176);
  ctx.strokeStyle = "#3f4b52"; ctx.lineWidth = 6; ctx.strokeRect(signalX - 150, 196, 300, 176);
  drawText(ctx, "隧道紧急频段", signalX, 228, 18, "#d9d7bd", "center");
  ctx.strokeStyle = "#e45d49"; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = -122; x <= 122; x += 6) {
    const y = 292 + Math.sin(x * .12 + now / 170) * 10 + (Math.abs(x) < 28 ? Math.sin(x * .55) * 24 : 0);
    if (x === -122) ctx.moveTo(signalX + x, y); else ctx.lineTo(signalX + x, y);
  }
  ctx.stroke();
  drawText(ctx, "SOS · 信号重复中", signalX, 348, 16, "#ef8a72", "center");
}

function drawLevel5Helipad(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  drawLevel4Roof(ctx, g, now);
  const hx = LEVEL5_HELIPAD_FX * g.worldW;
  ctx.strokeStyle = "#e6dfc2"; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(hx, 500, 300, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(hx - 74, 398); ctx.lineTo(hx - 74, 602); ctx.moveTo(hx + 74, 398); ctx.lineTo(hx + 74, 602); ctx.moveTo(hx - 74, 500); ctx.lineTo(hx + 74, 500); ctx.stroke();
  drawText(ctx, "H-05 · 救援起降区", hx, 682, 18, "#e5dfc8", "center");
  drawMilitaryHelicopter(ctx, hx, 500, false, now);
}

function drawLevel5TunnelEntrance(ctx: CanvasRenderingContext2D, g: GameState) {
  const W = g.worldW;
  const sky = ctx.createLinearGradient(0, 0, 0, 240);
  sky.addColorStop(0, "#7f9eb2"); sky.addColorStop(1, "#bec8ca");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 260);
  ctx.fillStyle = "#545a56";
  ctx.beginPath(); ctx.moveTo(W * .42, 260); ctx.lineTo(W * .58, 64); ctx.lineTo(W * .76, 260); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#6b706a"; ctx.fillRect(0, 260, W, H - 260);
  // 隧道口混凝土门楼
  const portalX = W * .76;
  ctx.fillStyle = "#9ca1a0"; ctx.fillRect(portalX - 250, 138, 500, 332);
  ctx.fillStyle = "#171b1c"; ctx.beginPath(); ctx.roundRect(portalX - 168, 212, 336, 258, 132); ctx.fill();
  ctx.strokeStyle = "#777d7d"; ctx.lineWidth = 18; ctx.stroke();
  ctx.fillStyle = "#d6c650"; ctx.fillRect(portalX - 236, 166, 472, 30);
  drawText(ctx, "17 号公路隧道 · 救援入口", portalX, 190, 20, "#282e30", "center");
  // 降落区与通向洞口的道路
  ctx.strokeStyle = "rgba(236,230,201,.75)"; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(LEVEL5_HELI_STOP_FX * W, 520, 150, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "rgba(238,228,190,.55)";
  for (let x = W * .45; x < portalX - 190; x += 180) ctx.fillRect(x, 586, 90, 7);
}

function drawLevel5Tunnel(ctx: CanvasRenderingContext2D, g: GameState, now: number, powered: boolean, mode: "power" | "rescue" | "road") {
  const W = g.worldW;
  ctx.fillStyle = powered ? "#596168" : "#15191c"; ctx.fillRect(0, 0, W, H);
  // 拱形隧道壳体与连续肋拱
  ctx.fillStyle = powered ? "#747c82" : "#242a2e";
  ctx.fillRect(0, 150, W, 330);
  ctx.fillStyle = powered ? "#454b50" : "#101416";
  ctx.fillRect(0, 480, W, H - 480);
  ctx.strokeStyle = powered ? "#8d9498" : "#30363a"; ctx.lineWidth = 14;
  for (let x = 80; x < W; x += 360) {
    ctx.beginPath(); ctx.moveTo(x, 480); ctx.lineTo(x, 230); ctx.quadraticCurveTo(x + 140, 94, x + 280, 230); ctx.lineTo(x + 280, 480); ctx.stroke();
  }
  // 双车道路面、排水沟与里程牌
  ctx.strokeStyle = powered ? "rgba(232,222,178,.58)" : "rgba(110,106,86,.28)"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, 584); ctx.lineTo(W, 584); ctx.stroke();
  ctx.fillStyle = powered ? "rgba(235,227,190,.7)" : "rgba(130,124,92,.2)";
  for (let x = 120; x < W; x += 260) ctx.fillRect(x, 578, 120, 9);
  ctx.fillStyle = "#282d31"; ctx.fillRect(0, 688, W, 10);
  for (let x = 380; x < W; x += 900) {
    ctx.fillStyle = powered ? "#d5d8cf" : "#555b59"; ctx.fillRect(x, 286, 94, 50);
    drawText(ctx, `K${Math.floor(x / 1000) + 17}+${String(x % 1000).padStart(3, "0")}`, x + 47, 317, 13, powered ? "#343a3e" : "#171c1f", "center");
  }
  // 顶灯：维修前全部熄灭；通电后沿长隧道连续亮起。
  for (let x = 170; x < W; x += 320) {
    ctx.fillStyle = powered ? "#f0e5b2" : "#30363a"; ctx.fillRect(x, 198, 150, 13);
    if (powered) {
      const glow = ctx.createRadialGradient(x + 75, 212, 2, x + 75, 212, 160);
      glow.addColorStop(0, "rgba(242,229,173,.23)"); glow.addColorStop(1, "rgba(242,229,173,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x + 75, 250, 160, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (mode === "power") {
    const powerX = LEVEL5_POWER_FX * W;
    ctx.fillStyle = "#30383d"; ctx.fillRect(powerX - 180, 258, 300, 198);
    ctx.strokeStyle = "#11171a"; ctx.lineWidth = 6; ctx.strokeRect(powerX - 180, 258, 300, 198);
    for (let x = powerX - 158; x < powerX + 96; x += 82) {
      ctx.fillStyle = "#465158"; ctx.fillRect(x, 280, 64, 142);
      ctx.fillStyle = Math.floor(now / 240 + x) % 2 ? "#d65a45" : "#6bd18a"; ctx.fillRect(x + 10, 296, 8, 8);
      ctx.fillStyle = "#20272b"; ctx.beginPath(); ctx.arc(x + 32, 346, 15, 0, Math.PI * 2); ctx.fill();
    }
    drawText(ctx, "电力配置室", powerX - 30, 246, 20, "#bdc5c8", "center");
    const fenceX = LEVEL5_FENCE_FX * W;
    ctx.strokeStyle = "#626d71"; ctx.lineWidth = 7;
    for (let y = 228; y <= 650; y += 42) { ctx.beginPath(); ctx.moveTo(fenceX - 18, y); ctx.lineTo(fenceX + 18, y); ctx.stroke(); }
    ctx.lineWidth = 4;
    for (let y = 228; y < 650; y += 26) { ctx.beginPath(); ctx.moveTo(fenceX - 18, y); ctx.lineTo(fenceX + 18, y + 26); ctx.moveTo(fenceX + 18, y); ctx.lineTo(fenceX - 18, y + 26); ctx.stroke(); }
    if (g.level?.eventStage === "power") {
      const ratio = Math.max(0, g.level.wallHp / LEVEL5_FENCE_HP);
      ctx.fillStyle = "rgba(8,11,12,.78)"; ctx.fillRect(fenceX - 92, 172, 184, 16);
      ctx.fillStyle = ratio > .35 ? "#d9ba48" : "#d24a42"; ctx.fillRect(fenceX - 90, 174, 180 * ratio, 12);
      drawText(ctx, `防护围栏 ${Math.ceil(g.level.wallHp)} HP`, fenceX, 164, 15, "#ddd9c4", "center");
      const prog = Math.min(1, (now - g.level.eventAt) / LEVEL5_REPAIR_MS);
      ctx.fillStyle = "rgba(8,11,12,.78)"; ctx.fillRect(powerX - 120, 464, 220, 14);
      ctx.fillStyle = "#69c7ef"; ctx.fillRect(powerX - 118, 466, 216 * prog, 10);
    }
  }
  if (mode === "rescue") {
    const sx = LEVEL5_SURVIVOR_FX * W;
    ctx.fillStyle = "#292d2c"; ctx.fillRect(sx - 120, 330, 220, 150);
    ctx.fillStyle = "#e4d8be"; ctx.fillRect(sx - 92, 352, 164, 36);
    drawText(ctx, "紧急避险间", sx - 10, 378, 17, "#3b4142", "center");
    // 求救人员：靠墙挥手的静态识别模型
    ctx.save(); ctx.translate(sx, 520);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 5, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3f4f5c"; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(-8, -18); ctx.moveTo(-8, -18); ctx.lineTo(-18, 0); ctx.moveTo(-8, -18); ctx.lineTo(8, 0); ctx.stroke();
    ctx.strokeStyle = "#c89b75"; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-2, -62); ctx.lineTo(-34, -104); ctx.moveTo(2, -62); ctx.lineTo(28, -80 - Math.sin(now / 220) * 16); ctx.stroke();
    ctx.fillStyle = "#c89b75"; ctx.beginPath(); ctx.arc(0, -92, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#342f2c"; ctx.beginPath(); ctx.arc(-2, -98, 14, Math.PI, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawText(ctx, "求救人员", sx, 396, 18, "#8df3ad", "center");
  }
  if (mode === "road") {
    const vehicleX = LEVEL5_VEHICLE_FX * W;
    drawMilitaryTruck(ctx, vehicleX, 500, false, now);
    drawText(ctx, "救援车队", vehicleX, 302, 18, "#e5dfbd", "center");
  }
}

// ===== 第六关「攻占大楼」场景绘制 =====

function drawLevel6CityHallExterior(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const doorX = LEVEL6_BUILDING_DOOR_FX * W;
  const sky = ctx.createLinearGradient(0, 0, 0, 260);
  sky.addColorStop(0, "#536878"); sky.addColorStop(1, "#c4cbd0");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 260);
  const plaza = ctx.createLinearGradient(0, 240, 0, H);
  plaza.addColorStop(0, "#858a8c"); plaza.addColorStop(1, "#64696b");
  ctx.fillStyle = plaza; ctx.fillRect(0, 240, W, H - 240);
  ctx.strokeStyle = "rgba(35,39,41,.2)"; ctx.lineWidth = 2;
  for (let y = 548; y < H; y += 58) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let x = 40; x < W; x += 180) { ctx.beginPath(); ctx.moveTo(x, 500); ctx.lineTo(x + 86, H); ctx.stroke(); }

  // 主体约 13 个成人肩宽、近 4 个人物身高，入口门高约为人物的两倍；不再像远景贴片。
  const bw = Math.min(1680, W - 120);
  const bx = Math.max(60, Math.min(W - bw - 60, doorX - bw * .7));
  const facadeTop = 24;
  const facadeBottom = 500;
  ctx.fillStyle = "#aaa69b"; ctx.fillRect(bx, facadeTop, bw, facadeBottom - facadeTop);
  ctx.fillStyle = "#918e86"; ctx.fillRect(bx - 24, facadeTop + 18, bw + 48, 24);
  ctx.fillStyle = "#c5c0b4"; ctx.fillRect(bx - 32, facadeBottom - 24, bw + 64, 30);
  ctx.fillStyle = "#77756f"; ctx.fillRect(bx + 18, facadeTop + 54, bw - 36, 8);
  ctx.fillRect(bx + 18, facadeTop + 194, bw - 36, 7);
  ctx.fillRect(bx + 18, facadeTop + 334, bw - 36, 7);

  // 三层侧翼窗：石质窗套、横竖框和轻微室内反光，建立真实楼层尺度。
  const porticoW = 660;
  const porticoX = doorX - porticoW / 2;
  for (const floorY of [88, 228, 368]) {
    for (let x = bx + 52; x < bx + bw - 50; x += 108) {
      if (x > porticoX - 42 && x < porticoX + porticoW + 12) continue;
      ctx.fillStyle = "#817e76"; ctx.fillRect(x - 7, floorY - 8, 72, 104);
      ctx.fillStyle = "#9eb2bc"; ctx.fillRect(x, floorY, 58, 88);
      ctx.fillStyle = "rgba(220,232,236,.32)"; ctx.fillRect(x + 5, floorY + 5, 22, 34);
      ctx.strokeStyle = "#626a6d"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 29, floorY); ctx.lineTo(x + 29, floorY + 88); ctx.moveTo(x, floorY + 44); ctx.lineTo(x + 58, floorY + 44); ctx.stroke();
    }
  }

  // 中央柱廊与三角山花：六根通高石柱、两层门厅和成比例双开大门。
  ctx.fillStyle = "#c9c3b6"; ctx.fillRect(porticoX, 102, porticoW, 398);
  ctx.fillStyle = "#ded7c8";
  ctx.beginPath(); ctx.moveTo(porticoX - 38, 116); ctx.lineTo(doorX, 20); ctx.lineTo(porticoX + porticoW + 38, 116); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#8d8981"; ctx.fillRect(porticoX - 38, 112, porticoW + 76, 22);
  const columnXs = [38, 132, 226, 434, 528, 622].map((offset) => porticoX + offset);
  for (const px of columnXs) {
    ctx.fillStyle = "#b9b3a7"; ctx.fillRect(px - 23, 140, 46, 342);
    ctx.fillStyle = "rgba(255,255,245,.22)"; ctx.fillRect(px - 17, 146, 8, 330);
    ctx.fillStyle = "#d5cec0"; ctx.fillRect(px - 32, 130, 64, 22); ctx.fillRect(px - 34, 474, 68, 20);
    ctx.strokeStyle = "rgba(92,88,82,.35)"; ctx.lineWidth = 2;
    for (let flute = -12; flute <= 12; flute += 8) { ctx.beginPath(); ctx.moveTo(px + flute, 154); ctx.lineTo(px + flute, 472); ctx.stroke(); }
  }
  drawText(ctx, "市 政 大 楼", doorX, 92, 32, "#44443f", "center");
  drawText(ctx, "CITY HALL", doorX, 122, 14, "#5c5c55", "center");
  ctx.fillStyle = "#171d21"; ctx.fillRect(doorX - 96, 250, 192, 250);
  ctx.strokeStyle = "#555e62"; ctx.lineWidth = 7; ctx.strokeRect(doorX - 96, 250, 192, 250);
  ctx.beginPath(); ctx.moveTo(doorX, 252); ctx.lineTo(doorX, 498); ctx.stroke();
  ctx.fillStyle = "rgba(145,178,190,.28)"; ctx.fillRect(doorX - 80, 272, 66, 94); ctx.fillRect(doorX + 14, 272, 66, 94);
  ctx.fillStyle = "#b89a52";
  ctx.beginPath(); ctx.arc(doorX - 18, 390, 5, 0, Math.PI * 2); ctx.arc(doorX + 18, 390, 5, 0, Math.PI * 2); ctx.fill();

  // 宽台阶、旗杆、花坛和防撞柱共同形成可读的市政广场入口。
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i % 2 ? "#97948d" : "#aaa69d";
    ctx.fillRect(doorX - 240 - i * 28, facadeBottom + i * 18, 480 + i * 56, 19);
  }
  ctx.strokeStyle = "#50575b"; ctx.lineWidth = 7;
  for (const poleX of [doorX - 470, doorX + 470]) { ctx.beginPath(); ctx.moveTo(poleX, 118); ctx.lineTo(poleX, 510); ctx.stroke(); }
  const flagWave = Math.sin(now / 280) * 9;
  ctx.fillStyle = "#a93332"; ctx.beginPath(); ctx.moveTo(doorX - 466, 132); ctx.lineTo(doorX - 330 + flagWave, 154); ctx.lineTo(doorX - 466, 204); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#405d72"; ctx.beginPath(); ctx.moveTo(doorX + 474, 132); ctx.lineTo(doorX + 610 - flagWave, 156); ctx.lineTo(doorX + 474, 204); ctx.closePath(); ctx.fill();
  for (const planterX of [doorX - 650, doorX + 650]) {
    ctx.fillStyle = "#565c57"; ctx.fillRect(planterX - 70, 494, 140, 48);
    ctx.fillStyle = "#3d5944";
    for (let leaf = -50; leaf <= 50; leaf += 20) { ctx.beginPath(); ctx.ellipse(planterX + leaf, 486 - Math.abs(leaf) * .18, 24, 12, leaf * .01, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = "rgba(190,190,178,.62)";
  for (let x = doorX - 430; x <= doorX + 430; x += 86) { ctx.beginPath(); ctx.arc(x, 646, 9, 0, Math.PI * 2); ctx.fill(); }
}

function drawLevel6Corridor(ctx: CanvasRenderingContext2D, g: GameState, now: number, powered: boolean, label: string) {
  const W = g.worldW;
  const wall = ctx.createLinearGradient(0, 0, 0, 460);
  wall.addColorStop(0, powered ? "#a9afb0" : "#444a4d");
  wall.addColorStop(1, powered ? "#d0d0c8" : "#62676a");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, 460);
  ctx.fillStyle = powered ? "#e1ddd2" : "#77776f"; ctx.fillRect(0, 460, W, H - 460);
  ctx.fillStyle = powered ? "#8b8d89" : "#34393c"; ctx.fillRect(0, 0, W, 42); ctx.fillRect(0, 444, W, 16);
  ctx.strokeStyle = powered ? "rgba(70,72,70,.3)" : "rgba(24,27,29,.48)"; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 180) { ctx.beginPath(); ctx.moveTo(x, 42); ctx.lineTo(x, 444); ctx.stroke(); }
  for (let x = 300; x < W - 180; x += 620) {
    ctx.fillStyle = powered ? "#595f62" : "#343a3d"; ctx.fillRect(x, 190, 104, 254);
    ctx.strokeStyle = "#292e31"; ctx.lineWidth = 4; ctx.strokeRect(x, 190, 104, 254);
    ctx.fillStyle = "#326f51"; ctx.fillRect(x + 8, 162, 88, 22);
    drawText(ctx, x % 1240 ? "办公室" : "会议室", x + 52, 179, 12, "#e7eee9", "center");
    ctx.fillStyle = powered ? "#a23d35" : "#642b28"; ctx.fillRect(x + 130, 288, 42, 74);
    drawText(ctx, "消防", x + 151, 350, 10, "#eadfd7", "center");
  }
  for (let x = 120; x < W; x += 360) {
    ctx.fillStyle = powered ? "rgba(246,243,218,.96)" : "#23282b"; ctx.fillRect(x, 18, 150, 12);
    if (powered) {
      const flicker = Math.floor((x + now) / 900) % 7 === 0 ? .55 : 1;
      ctx.fillStyle = `rgba(255,246,210,${(.12 * flicker).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x + 150, 30); ctx.lineTo(x + 220, 444); ctx.lineTo(x - 70, 444); ctx.closePath(); ctx.fill();
    }
  }
  ctx.fillStyle = powered ? "rgba(65,68,66,.2)" : "rgba(25,28,30,.32)"; ctx.fillRect(0, 604, W, 8);
  for (let x = 90; x < W; x += 240) {
    ctx.strokeStyle = powered ? "rgba(80,80,76,.18)" : "rgba(30,34,36,.3)";
    ctx.beginPath(); ctx.moveTo(x, 460); ctx.lineTo(x + 45, H); ctx.stroke();
  }
  drawText(ctx, powered ? `2F · ${label}` : `1F · 断电 · ${label}`, 190, 130, 26, powered ? "#4d5554" : "#b0b5b2", "center");
  ctx.fillStyle = "#384145"; ctx.fillRect(W - 126, 204, 94, 240);
  ctx.fillStyle = "#3a805a"; ctx.fillRect(W - 122, 174, 86, 24);
  drawText(ctx, "出口 →", W - 79, 191, 13, "#edf4ef", "center");
}

function drawLevel6PowerRoom(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const powered = Boolean(g.level?.powerOn);
  ctx.fillStyle = powered ? "#adb2af" : "#464c4f"; ctx.fillRect(0, 0, W, 460);
  ctx.fillStyle = powered ? "#8d918e" : "#353a3d"; ctx.fillRect(0, 460, W, H - 460);
  ctx.fillStyle = "#2d3336"; ctx.fillRect(0, 0, W, 52);
  for (let x = 160; x < W - 260; x += 300) {
    ctx.fillStyle = "#343b3f"; ctx.fillRect(x, 146, 210, 300);
    ctx.strokeStyle = "#202629"; ctx.lineWidth = 4; ctx.strokeRect(x, 146, 210, 300);
    for (let row = 0; row < 5; row++) {
      ctx.fillStyle = "#475055"; ctx.fillRect(x + 16, 168 + row * 51, 178, 36);
      ctx.fillStyle = powered ? (row % 2 ? "#63d486" : "#e0b34c") : "#532d2a";
      ctx.beginPath(); ctx.arc(x + 176, 186 + row * 51, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#d6c36d"; ctx.beginPath(); ctx.moveTo(x + 92, 242); ctx.lineTo(x + 118, 288); ctx.lineTo(x + 70, 288); ctx.closePath(); ctx.fill();
  }
  const switchX = LEVEL6_POWER_SWITCH_FX * W;
  ctx.fillStyle = "#252b2e"; ctx.fillRect(switchX - 84, 180, 168, 266);
  ctx.strokeStyle = "#596269"; ctx.lineWidth = 5; ctx.strokeRect(switchX - 84, 180, 168, 266);
  ctx.fillStyle = powered ? "#5acb79" : "#9b3d35"; ctx.beginPath(); ctx.arc(switchX, 242, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#c5c8c5"; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(switchX, 330); ctx.lineTo(switchX + (powered ? 38 : -30), powered ? 276 : 374); ctx.stroke(); ctx.lineCap = "butt";
  drawText(ctx, powered ? "主电闸 · 已合闸" : "主电闸 · 关闭", switchX, 160, 18, powered ? "#9ae8ad" : "#e4b0a6", "center");
  if (!powered && g.level && g.level.sceneKills >= LEVEL6_POWER_ROOM_TOTAL) {
    const pulse = .55 + Math.sin(now / 180) * .35;
    ctx.strokeStyle = `rgba(241,198,67,${pulse})`; ctx.lineWidth = 5; ctx.strokeRect(switchX - 98, 166, 196, 294);
  }
}

function drawLevel6Archives(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  ctx.fillStyle = "#b6b0a4"; ctx.fillRect(0, 0, W, 460);
  ctx.fillStyle = "#8e887e"; ctx.fillRect(0, 460, W, H - 460);
  ctx.fillStyle = "#615c54"; ctx.fillRect(0, 0, W, 46); ctx.fillRect(0, 444, W, 16);
  for (let x = 170; x < W - 200; x += 320) {
    ctx.fillStyle = "#554a3c"; ctx.fillRect(x, 118, 240, 326);
    ctx.strokeStyle = "#342d25"; ctx.lineWidth = 4; ctx.strokeRect(x, 118, 240, 326);
    for (let row = 0; row < 5; row++) {
      ctx.fillStyle = row % 2 ? "#6f624f" : "#665946"; ctx.fillRect(x + 12, 138 + row * 58, 216, 46);
      for (let f = 0; f < 7; f++) {
        ctx.fillStyle = ["#9a815d", "#6f7b70", "#8b6258"][f % 3];
        ctx.fillRect(x + 20 + f * 28, 144 + row * 58, 20, 34);
      }
    }
  }
  for (let x = 120; x < W; x += 420) {
    ctx.fillStyle = "rgba(248,242,214,.92)"; ctx.fillRect(x, 18, 170, 12);
    ctx.fillStyle = "rgba(248,238,194,.08)"; ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x + 170, 30); ctx.lineTo(x + 230, 444); ctx.lineTo(x - 60, 444); ctx.closePath(); ctx.fill();
  }
  drawText(ctx, "档案室 · ARCHIVES", 220, 92, 26, "#514d45", "center");
  ctx.fillStyle = "#3b4245"; ctx.fillRect(W - 122, 204, 90, 240);
  ctx.fillStyle = "#3c805b"; ctx.fillRect(W - 118, 174, 82, 24);
  drawText(ctx, "楼梯间 →", W - 77, 191, 12, "#edf4ef", "center");
  void now;
}

function drawLevel6CentralHall(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const wall = ctx.createLinearGradient(0, 0, 0, 470);
  wall.addColorStop(0, "#c8c2b5"); wall.addColorStop(1, "#e1ddd2");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, 470);
  ctx.fillStyle = "#918c82"; ctx.fillRect(0, 470, W, H - 470);
  ctx.fillStyle = "#9d978c"; ctx.fillRect(0, 0, W, 48); ctx.fillRect(0, 450, W, 20);
  for (let x = 170; x < W; x += 420) {
    ctx.fillStyle = "#bbb5a9"; ctx.fillRect(x, 82, 54, 368);
    ctx.fillStyle = "#d5cfc2"; ctx.fillRect(x - 12, 70, 78, 24); ctx.fillRect(x - 12, 434, 78, 22);
  }
  const centerX = W * .54;
  ctx.fillStyle = "#8a7962"; ctx.fillRect(centerX - 250, 278, 500, 172);
  ctx.fillStyle = "#a89372"; ctx.fillRect(centerX - 278, 260, 556, 24);
  drawText(ctx, "市民服务中心", centerX, 316, 24, "#e6dfd0", "center");
  ctx.fillStyle = "#8d3030"; ctx.beginPath(); ctx.arc(centerX, 134, 58, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#d2b35a"; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 22 : 48;
    const x = centerX + Math.cos(a) * r; const y = 134 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(72,68,62,.22)"; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 140) { ctx.beginPath(); ctx.moveTo(x, 470); ctx.lineTo(x + 50, H); ctx.stroke(); }
  const boss = g.zombies.find((z) => z.bossKind === "giantMutant" && z.hp > 0);
  if (boss) {
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = "rgba(20,15,15,.82)"; ctx.fillRect(centerX - 210, 34, 420, 26);
    ctx.fillStyle = "#a92f36"; ctx.fillRect(centerX - 207, 37, 414 * ratio, 20);
    drawText(ctx, `巨型变异僵尸 ${Math.ceil(boss.hp)} / ${boss.maxHp} HP`, centerX, 28, 17, "#f1ddd4", "center");
    if (boss.spitAt > now) drawText(ctx, "酸液喷吐蓄力", centerX, 82, 15, "#a9df66", "center");
  }
}

// ===== 第七关「夺取仓库」场景绘制 =====

function drawLevel7WarehouseExterior(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const doorX = LEVEL7_WAREHOUSE_DOOR_FX * W;
  const sky = ctx.createLinearGradient(0, 0, 0, 260);
  sky.addColorStop(0, "#687b86"); sky.addColorStop(1, "#c6c7be");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 260);
  ctx.fillStyle = "#77746a"; ctx.fillRect(0, 250, W, H - 250);
  ctx.strokeStyle = "rgba(30,32,31,.22)"; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 220) { ctx.beginPath(); ctx.moveTo(x, 530); ctx.lineTo(x + 120, H); ctx.stroke(); }

  const bw = Math.min(1700, W - 120);
  const bx = Math.max(60, Math.min(W - bw - 60, doorX - bw * .72));
  ctx.fillStyle = "#666c6d"; ctx.fillRect(bx, 94, bw, 430);
  ctx.fillStyle = "#4d5558";
  ctx.beginPath(); ctx.moveTo(bx - 36, 108); ctx.lineTo(bx + 170, 38); ctx.lineTo(bx + bw - 170, 38); ctx.lineTo(bx + bw + 36, 108); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#818788"; ctx.fillRect(bx - 18, 92, bw + 36, 28);
  ctx.strokeStyle = "rgba(35,40,42,.42)"; ctx.lineWidth = 3;
  for (let x = bx + 24; x < bx + bw; x += 56) { ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, 520); ctx.stroke(); }
  ctx.fillStyle = "#2d3538"; ctx.fillRect(doorX - 180, 218, 360, 306);
  ctx.strokeStyle = "#94999a"; ctx.lineWidth = 8; ctx.strokeRect(doorX - 180, 218, 360, 306);
  ctx.strokeStyle = "#596164"; ctx.lineWidth = 4;
  for (let y = 256; y < 510; y += 46) { ctx.beginPath(); ctx.moveTo(doorX - 174, y); ctx.lineTo(doorX + 174, y); ctx.stroke(); }
  ctx.fillStyle = "rgba(180,205,211,.42)"; ctx.fillRect(doorX - 126, 248, 252, 54);
  drawText(ctx, "17 号物资仓库", doorX, 171, 34, "#e3dfcf", "center");
  drawText(ctx, "MILITARY SUPPLY DEPOT", doorX, 200, 14, "#c3c9c5", "center");
  ctx.fillStyle = "#333a39"; ctx.fillRect(bx + 80, 300, 210, 224); ctx.fillRect(bx + 360, 300, 210, 224);
  ctx.fillStyle = "#d1b95e";
  for (const sx of [bx + 185, bx + 465]) {
    ctx.beginPath(); ctx.moveTo(sx, 334); ctx.lineTo(sx + 54, 430); ctx.lineTo(sx - 54, 430); ctx.closePath(); ctx.fill();
    drawText(ctx, "物资", sx, 462, 20, "#ddd8c6", "center");
  }
  const lampGlow = .65 + Math.sin(now / 320) * .18;
  ctx.fillStyle = `rgba(245,214,128,${lampGlow})`; ctx.fillRect(doorX - 40, 322, 80, 14);
}

function drawLevel7WarehouseInterior(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  const W = g.worldW;
  const level = g.level;
  ctx.fillStyle = "#555d60"; ctx.fillRect(0, 0, W, 470);
  const floor = ctx.createLinearGradient(0, 470, 0, H);
  floor.addColorStop(0, "#777872"); floor.addColorStop(1, "#4f5352");
  ctx.fillStyle = floor; ctx.fillRect(0, 470, W, H - 470);
  ctx.fillStyle = "#30383b"; ctx.fillRect(0, 0, W, 54);
  ctx.strokeStyle = "#242b2e"; ctx.lineWidth = 8;
  for (let x = 80; x < W; x += 520) {
    ctx.beginPath(); ctx.moveTo(x, 52); ctx.lineTo(x + 220, 126); ctx.lineTo(x + 440, 52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 220, 126); ctx.lineTo(x + 220, 470); ctx.stroke();
  }
  for (let x = 110; x < W; x += 390) {
    ctx.fillStyle = "#3e4648"; ctx.fillRect(x, 168, 254, 290);
    ctx.strokeStyle = "#262d30"; ctx.lineWidth = 7; ctx.strokeRect(x, 168, 254, 290);
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = 224 + shelf * 80;
      ctx.fillStyle = "#727067"; ctx.fillRect(x + 10, sy, 234, 9);
      for (let crate = 0; crate < 3; crate++) {
        const cx = x + 18 + crate * 74;
        ctx.fillStyle = (crate + shelf) % 2 ? "#77603c" : "#61705a"; ctx.fillRect(cx, sy - 48, 62, 46);
        ctx.strokeStyle = "rgba(32,34,30,.62)"; ctx.lineWidth = 3; ctx.strokeRect(cx, sy - 48, 62, 46);
        ctx.beginPath(); ctx.moveTo(cx + 5, sy - 43); ctx.lineTo(cx + 57, sy - 7); ctx.moveTo(cx + 57, sy - 43); ctx.lineTo(cx + 5, sy - 7); ctx.stroke();
      }
    }
  }
  ctx.fillStyle = "rgba(235,225,180,.8)";
  for (let x = 140; x < W; x += 480) ctx.fillRect(x, 620, 230, 8);
  drawText(ctx, "物资堆放区", 210, 126, 27, "#d7dad4", "center");

  // 燧石66所在的重点物资箱与装车区域。
  const flintX = LEVEL7_FLINT_FX * W;
  ctx.fillStyle = "#765b36"; ctx.fillRect(flintX - 135, 365, 270, 94);
  ctx.strokeStyle = "#382a1b"; ctx.lineWidth = 6; ctx.strokeRect(flintX - 135, 365, 270, 94);
  drawText(ctx, "穿甲武器", flintX, 438, 17, "#e5d3a5", "center");

  if (level?.eventStage === "warehouse-defense") {
    const truckX = LEVEL7_TRUCK_FX * W;
    drawMilitaryTruck(ctx, truckX, 532, false, now);
    drawText(ctx, "物资装载车", truckX, 348, 17, "#e2dcc0", "center");
    const wallX = LEVEL7_WALL_FX * W;
    ctx.fillStyle = "#656b69"; ctx.fillRect(wallX - 30, 176, 60, 446);
    ctx.strokeStyle = "#333a3b"; ctx.lineWidth = 7; ctx.strokeRect(wallX - 30, 176, 60, 446);
    ctx.fillStyle = "#252d2f";
    for (const holeY of [286, 416, 546]) ctx.fillRect(wallX - 34, holeY - 24, 68, 48);
    ctx.strokeStyle = "rgba(205,209,201,.3)"; ctx.lineWidth = 3;
    for (let y = 206; y < 620; y += 58) { ctx.beginPath(); ctx.moveTo(wallX - 26, y); ctx.lineTo(wallX + 26, y); ctx.stroke(); }
    const hpRatio = Math.max(0, level.wallHp / LEVEL7_WALL_HP);
    ctx.fillStyle = "rgba(18,22,21,.85)"; ctx.fillRect(wallX - 104, 126, 208, 18);
    ctx.fillStyle = hpRatio > .35 ? "#d7b946" : "#c43d38"; ctx.fillRect(wallX - 101, 129, 202 * hpRatio, 12);
    drawText(ctx, `防守围墙 ${Math.ceil(level.wallHp)} HP`, wallX, 116, 15, "#eee8d5", "center");
    drawText(ctx, `物资运输 ${Math.min(2, Math.floor(level.eventCount / 2))}/2`, LEVEL7_SUPPLY_FX * W, 154, 17, "#e8d99f", "center");
  }
}

// 关卡道具：桌子 / 废弃车辆 / 地面武器拾取物（含近旁提示）/ 出口标记
function drawLevelProps(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  for (const ob of g.obstacles) {
    if (ob.kind === "car") { drawWreckedCar(ctx, ob); continue; }
    // 木桌（俯视）
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(ob.x, ob.y + ob.h * 0.34, ob.w * 0.52, ob.h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6d5138";
    ctx.beginPath(); ctx.roundRect(ob.x - ob.w / 2, ob.y - ob.h / 2, ob.w, ob.h, 8); ctx.fill();
    ctx.strokeStyle = "#4a3826"; ctx.lineWidth = 3;
    ctx.strokeRect(ob.x - ob.w / 2 + 8, ob.y - ob.h / 2 + 8, ob.w - 16, ob.h - 16);
  }
  drawLevelPickups(ctx, g, now);
  // 出口标记：当前任务要求抵达场景右端且条件已满足时，门上方脉冲提示
  const level = g.level;
  if (level && level.levelId === LEVEL1_ID && level.sceneIndex < LEVEL1_SCENES.length - 1) {
    const scene = LEVEL1_SCENES[level.sceneIndex];
    const task = scene.tasks[level.taskIndex];
    const exitOpen = task && (task.id === "leave-home" || (task.id === "clear-corridor" && level.sceneKills >= levelZombieCount(scene)));
    if (exitOpen) {
      const pulse = 0.6 + Math.sin(now / 220) * 0.4;
      const ex = g.worldW - 70;
      ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
      ctx.beginPath(); ctx.moveTo(ex - 22, 150); ctx.lineTo(ex + 22, 150); ctx.lineTo(ex, 182); ctx.closePath(); ctx.fill();
      drawText(ctx, "出口", ex, 142, 17, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
    }
  }
  // 第二关场景 2：军营上方脉冲目标标记（军营屋顶 y≈44，标记悬于屋顶上方）
  if (level && level.levelId === LEVEL2_ID && level.sceneIndex === 1) {
    const pulse = 0.6 + Math.sin(now / 220) * 0.4;
    const bx = LEVEL2_BARRACKS_FX * g.worldW + 10;
    ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
    ctx.beginPath(); ctx.moveTo(bx - 22, 26); ctx.lineTo(bx + 22, 26); ctx.lineTo(bx, 40); ctx.closePath(); ctx.fill();
    drawText(ctx, "军营", bx, 20, 17, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
  }
  // 第三关场景 1：起身后宿舍门脉冲提示
  if (level && level.levelId === LEVEL3_ID && level.sceneIndex === 0 && level.eventStage === "none") {
    const pulse = 0.6 + Math.sin(now / 220) * 0.4;
    const ex = g.worldW - 78;
    ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
    ctx.beginPath(); ctx.moveTo(ex - 20, 152); ctx.lineTo(ex + 20, 152); ctx.lineTo(ex, 182); ctx.closePath(); ctx.fill();
    drawText(ctx, "出门", ex, 144, 16, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
  }
  // 第三关场景 2：夜防结束后大门脉冲指引（穿过门洞向右）
  if (level && level.levelId === LEVEL3_ID && level.sceneIndex === 1) {
    const scene = LEVEL3_SCENES[level.sceneIndex];
    if (scene.tasks[level.taskIndex]?.id === "reach-gate") {
      const pulse = 0.6 + Math.sin(now / 220) * 0.4;
      const gx = LEVEL3_WALL_FX * g.worldW;
      ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
      ctx.beginPath(); ctx.moveTo(gx - 24, LEVEL3_GATE_TOP - 34); ctx.lineTo(gx + 24, LEVEL3_GATE_TOP - 34); ctx.lineTo(gx, LEVEL3_GATE_TOP - 6); ctx.closePath(); ctx.fill();
      drawText(ctx, "基地大门", gx, LEVEL3_GATE_TOP - 42, 16, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
    }
  }
  // 第四关：上车点 / 电台入口 / 楼层出口与上楼脉冲指引
  if (level && level.levelId === LEVEL4_ID) {
    const pulse = 0.6 + Math.sin(now / 220) * 0.4;
    const mark = (mx: number, my: number, label: string) => {
      ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
      ctx.beginPath(); ctx.moveTo(mx - 22, my); ctx.lineTo(mx + 22, my); ctx.lineTo(mx, my + 28); ctx.closePath(); ctx.fill();
      drawText(ctx, label, mx, my - 8, 16, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
    };
    const taskId = LEVEL4_SCENES[level.sceneIndex]?.tasks[level.taskIndex]?.id;
    if (level.sceneIndex === 0 && taskId === "leave-briefing") mark(g.worldW - 70, 168, "出门");
    if (level.sceneIndex === 1 && taskId === "board-truck") mark(LEVEL4_GATE_FX * g.worldW, 140, "上车");
    if (level.sceneIndex === 2 && level.eventStage === "none") mark(LEVEL4_STATION_DOOR_FX * g.worldW, 168, "进入电台");
    if ((taskId === "clear-floor-1" && level.sceneKills >= LEVEL4_FLOOR1_TOTAL)
      || (taskId === "clear-floor-2" && level.sceneKills >= LEVEL4_FLOOR2_TOTAL)) mark(g.worldW - 70, 168, "出口");
    if (taskId === "climb-1" || taskId === "climb-2") mark(g.worldW - 70, 168, "上楼");
  }
  // 第五关：队友、停机坪、电力室、求救人员与撤离车辆指引
  if (level && level.levelId === LEVEL5_ID) {
    const pulse = 0.6 + Math.sin(now / 220) * 0.4;
    const mark = (mx: number, my: number, label: string) => {
      ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
      ctx.beginPath(); ctx.moveTo(mx - 22, my); ctx.lineTo(mx + 22, my); ctx.lineTo(mx, my + 28); ctx.closePath(); ctx.fill();
      drawText(ctx, label, mx, my - 8, 16, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
    };
    const taskId = LEVEL5_SCENES[level.sceneIndex]?.tasks[level.taskIndex]?.id;
    if (level.sceneIndex === 0) mark(0.3 * g.worldW, 160, "队友");
    if (level.sceneIndex === 1) mark(LEVEL5_HELIPAD_FX * g.worldW, 180, "直升机");
    if (level.sceneIndex === 3 && level.eventStage === "none") mark(LEVEL5_POWER_FX * g.worldW, 210, "电力室");
    if (level.sceneIndex === 4 && level.sceneKills >= LEVEL5_RESCUE_TOTAL) mark(LEVEL5_SURVIVOR_FX * g.worldW, 300, "求救人员");
    if (level.sceneIndex === 5 && taskId === "board-rescue-vehicle") mark(LEVEL5_VEHICLE_FX * g.worldW, 250, "上车");
  }
  // 第六关：简报队友、基地军车、市政大楼入口、电闸与各场景出口指引。
  if (level && level.levelId === LEVEL6_ID) {
    const pulse = 0.6 + Math.sin(now / 220) * 0.4;
    const mark = (mx: number, my: number, label: string) => {
      ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
      ctx.beginPath(); ctx.moveTo(mx - 22, my); ctx.lineTo(mx + 22, my); ctx.lineTo(mx, my + 28); ctx.closePath(); ctx.fill();
      drawText(ctx, label, mx, my - 8, 16, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
    };
    if (level.sceneIndex === 0 && level.taskIndex === 0) mark((LEVEL6_BRIEFING_TABLE_FX + .05) * g.worldW, 160, "队友");
    if (level.sceneIndex === 0 && level.taskIndex === 1) mark(g.worldW - 70, 168, "出门");
    if (level.sceneIndex === 1) mark(LEVEL6_BASE_GATE_FX * g.worldW, 140, "上车");
    if (level.sceneIndex === 2 && level.eventStage === "none") mark(LEVEL6_BUILDING_DOOR_FX * g.worldW, 164, "进入大楼");
    if (level.sceneIndex === 3 && level.sceneKills >= LEVEL6_CORRIDOR_ONE_TOTAL) mark(g.worldW - 76, 166, "配电室");
    if (level.sceneIndex === 4 && level.sceneKills >= LEVEL6_POWER_ROOM_TOTAL) mark(LEVEL6_POWER_SWITCH_FX * g.worldW, 142, "开启电闸");
    if ((level.sceneIndex === 5 && level.sceneKills >= LEVEL6_CORRIDOR_TWO_TOTAL)
      || (level.sceneIndex === 6 && level.sceneKills >= LEVEL6_ARCHIVE_TOTAL)) mark(g.worldW - 76, 166, level.sceneIndex === 5 ? "档案室" : "楼梯间");
    if (level.sceneIndex === 7) mark(g.worldW - 70, 168, "中央大厅");
  }
  // 第七关：简报、上车、仓库入口、燧石66与防守位置指引。
  if (level && level.levelId === LEVEL7_ID) {
    const pulse = 0.6 + Math.sin(now / 220) * 0.4;
    const mark = (mx: number, my: number, label: string) => {
      ctx.fillStyle = `rgba(240,198,67,${0.35 + pulse * 0.3})`;
      ctx.beginPath(); ctx.moveTo(mx - 22, my); ctx.lineTo(mx + 22, my); ctx.lineTo(mx, my + 28); ctx.closePath(); ctx.fill();
      drawText(ctx, label, mx, my - 8, 16, `rgba(240,198,67,${0.6 + pulse * 0.4})`, "center");
    };
    const taskId = LEVEL7_SCENES[level.sceneIndex]?.tasks[level.taskIndex]?.id;
    if (level.sceneIndex === 0 && taskId === "find-warehouse-team") mark((LEVEL7_BRIEFING_TABLE_FX + .05) * g.worldW, 160, "队友");
    if (level.sceneIndex === 0 && taskId === "board-warehouse-truck") mark(g.worldW - 70, 168, "出门");
    if (level.sceneIndex === 1) mark(LEVEL7_BASE_GATE_FX * g.worldW, 140, "上车");
    if (level.sceneIndex === 2 && level.eventStage === "none") mark(LEVEL7_WAREHOUSE_DOOR_FX * g.worldW, 164, "进入仓库");
    if (level.sceneIndex === 3 && taskId === "take-flint66") mark(LEVEL7_FLINT_FX * g.worldW, 220, "燧石66");
    if (level.sceneIndex === 3 && taskId === "protect-supplies") mark(LEVEL7_WALL_FX * g.worldW - 160, 176, "防守位置");
  }
  // 第八关：队友、装甲车与收费站目标指引。
  if (level && level.levelId === LEVEL8_ID) {
    const pulse = .6 + Math.sin(now / 220) * .4;
    const mark = (mx: number, my: number, label: string) => {
      ctx.fillStyle = `rgba(240,198,67,${.35 + pulse * .3})`;
      ctx.beginPath(); ctx.moveTo(mx - 22, my); ctx.lineTo(mx + 22, my); ctx.lineTo(mx, my + 28); ctx.closePath(); ctx.fill();
      drawText(ctx, label, mx, my - 8, 16, `rgba(240,198,67,${.6 + pulse * .4})`, "center");
    };
    const taskId = LEVEL8_SCENES[level.sceneIndex]?.tasks[level.taskIndex]?.id;
    if (level.sceneIndex === 0 && taskId === "find-highway-team") mark((LEVEL8_BRIEFING_TABLE_FX + .05) * g.worldW, 160, "队友");
    if (level.sceneIndex === 0 && taskId === "board-armored-vehicle") mark(g.worldW - 70, 168, "出门");
    if (level.sceneIndex === 1) mark(LEVEL8_BASE_GATE_FX * g.worldW, 140, "装甲车");
    if (level.sceneIndex === 2 && level.sceneKills >= LEVEL8_HIGHWAY_TOTAL) mark(LEVEL8_TOLL_FX * g.worldW, 150, "收费站");
  }
}

// 地面/桌面武器拾取物：光晕 + 摆放的武器模型 + 走近后的右键提示
function drawLevelPickups(ctx: CanvasRenderingContext2D, g: GameState, now: number) {
  for (const pk of g.pickups) {
    if (pk.taken || pk.sceneIndex !== g.level?.sceneIndex) continue;
    const glow = 0.5 + Math.sin(now / 260 + pk.id) * 0.3;
    ctx.fillStyle = `rgba(240,198,67,${0.10 + glow * 0.10})`;
    ctx.beginPath(); ctx.ellipse(pk.x, pk.y + 8, 46, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.rotate(pk.onTable ? -0.35 : 0.5);
    drawWeaponModel(ctx, pk.weapon, 0.85);
    ctx.restore();
    const dx = g.player.x - pk.x;
    const dy = g.player.y - pk.y;
    if (dx * dx + dy * dy < 130 * 130) {
      const bob = Math.sin(now / 200) * 3;
      drawText(ctx, `右键 拾取 ${WEAPONS[pk.weapon].name}`, pk.x, pk.y - 44 + bob, 16, "#f1c643", "center");
    }
  }
}

type LevelPickup = {
  id: number;
  /** 掉落/预置武器所属场景；跨场景保留，返回该场景时仍可拾取。 */
  sceneIndex: number;
  weapon: WeaponKey;
  x: number;
  y: number;
  /** 摆放在桌面上（贴桌面的展示角度），否则为地面掉落 */
  onTable: boolean;
  taken: boolean;
};

/** 关卡障碍物：不可破坏的碰撞矩形（x/y/w/h 世界坐标，y 为路面脚部高度带），车辆/桌子/保安亭 */
type LevelObstacle = {
  kind: "car" | "table";
  x: number;
  y: number;
  w: number;
  h: number;
  /** 外观种子（车辆配色/破损） */
  seed: number;
};

/** 关卡运行时状态：场景/任务进度、场景内击杀数（任务进度显示）、开始时刻（结算用时） */
type LevelRunState = {
  levelId: string;
  sceneIndex: number;
  taskIndex: number;
  sceneKills: number;
  startedAt: number;
  /** 任务完成提示（✓ 任务完成）显示截止时刻 */
  taskDoneFlashUntil: number;
  completed: boolean;
  /** 事件阶段机（第二关：none → ambush 涌出 → truck 军车驶来 → soldiers 下车清场 → dialog 对话；
      第三关：sleep 睡梦中 → rise 起身 → none 可控 → defend 围墙防守 → boss 重甲现身；
      第四关：talk 商讨对话 → ride 乘车抵达 → disembark 队友下车 → repair 维修防守；
      第五关：talk 求救简报 → flight 直升机进场 → landed 停稳下机 → power 电力维修防守；
      第八关：talk 高速简报 → armored-drive 自主驾驶 → disembark 收费站下车） */
  eventStage: "none" | "ambush" | "truck" | "soldiers" | "dialog" | "sleep" | "rise" | "defend" | "boss" | "talk" | "ride" | "disembark" | "repair" | "flight" | "landed" | "power" | "warehouse-defense" | "armored-drive";
  /** 阶段开始时刻（涌出计时/坚持倒计时/军车行驶计时共用） */
  eventAt: number;
  /** 阶段计数（已涌出僵尸数 / 已下车士兵数） */
  eventCount: number;
  /** 剧情防守刷怪的下一次生成时刻。 */
  nextEventSpawnAt: number;
  /** 军车世界 x（<0 = 未上场）与停靠点（驶入动画终点：玩家近旁、公路上方） */
  truckX: number;
  truckY: number;
  truckStopX: number;
  /** 关卡结构共享 HP：第三关混凝土墙、第四关通讯设备、第五关隧道围栏。 */
  wallHp: number;
  /** 第六关配电状态：开启后后续市政大楼场景保持照明。 */
  powerOn: boolean;
  /** 第六关两名突击队员跨场景保留的生命值（0 表示阵亡）。 */
  squadHp: number[];
  /** 第八关装甲车与车载重机枪运行状态。 */
  vehicleHp: number;
  vehicleAmmo: number;
  vehicleLastShot: number;
  vehicleReloadUntil: number;
  vehicleAimAngle: number;
  /** 对话状态：台词队列与当前句索引（null = 无对话） */
  dialog: { lines: Array<{ speaker: string; text: string }>; index: number } | null;
};
// 穿透豁免：penetration 缺省 1；penBypass = min(.8, (pen-1)/4)——手枪 0 → AWM(3) .5 → 燧石66(15) .8；
// 实际减免 = damageReduction × (1 - penBypass)：重甲基础 70%，AWM 削到 35%，燧石66 削到 14%。
function armorPenBypass(sourceWeapon: WeaponKey) {
  return Math.min(.8, ((WEAPONS[sourceWeapon].penetration ?? 1) - 1) / 4);
}

type Zombie = {
  id: number;
  /** 种类：normal/brute 为既有体系；runner/spitter/helmet/mutant/army/shield/juggernaut 为扩展种类（见 ZOMBIE_KIND_SPECS） */
  kind: ZombieKind;
  /** 第六关中央大厅专属巨型变异体；基础种类仍为 mutant，以复用同一套姿势、损伤与断肢系统。 */
  bossKind?: "giantMutant";
  /** 第七关仓库护甲僵尸：附着重型插板，100 HP、全身基础减伤 99%。 */
  warehouseArmor?: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  attack: number;
  /** 伤害减免基数（0~1）：防弹衣/盔甲类；子弹按武器穿透梯度豁免，爆炸与火焰完全无视 */
  damageReduction: number;
  /** 盾兵僵尸：盾牌完好时子弹只能经观察窗命中；蹬踹可踹落；盾牌 500 HP，击碎后失效 */
  shieldIntact: boolean;
  /** 盾牌独立 HP（SHIELD_HP 起步）：被格挡的子弹与爆炸震伤盾牌，归零碎裂 */
  shieldHp: number;
  /** 盾面弹孔凹陷（盾牌局部坐标，x∈[-9,9]、y∈[-72,72]，中心为盾心）：按真实命中点累积，碎裂/踹落时清空 */
  shieldDents: Array<{ x: number; y: number }>;
  /** 呕吐僵尸：喷吐前摇结束时刻（0=未在蓄力）与下一次可喷吐时刻 */
  spitAt: number;
  nextSpitAt: number;
  lastHit: number;
  attackHitApplied: boolean;
  knockedDownAt: number;
  knockedDownUntil: number;
  knockFacing: number;
  knockStartFactor: number;
  knockStartLift: number;
  knockStartRecoveryProgress: number;
  debuffedUntil: number;
  staggeredUntil: number;
  heldUntil: number;
  /** 磷燃弹点燃时刻（0=未点燃）：持续灼烧掉血直至死亡 */
  ignitedAt: number;
  missingLimbs: Set<ZombieLimb>;
  wounds: Wound[];
  tint: string;
  /** 生成时确定的服装（配色与破损），存活/尸体/断肢渲染全程保持一致 */
  outfit: ZombieOutfit;
  wobble: number;
};

type HitRegion = "head" | "body" | "legs";
type DamageSourceOverride = { penetrationBypass: number; stopping: number };
function giantMutantDamageReduction(zombie: Zombie, region?: HitRegion): number {
  if (zombie.bossKind !== "giantMutant") return 0;
  return region === "body" ? .7 : .5;
}
/** 踹击仍按目标自身护甲结算；燃烧与爆炸由各自路径明确绕过全部减伤。 */
function kickDamageReduction(zombie: Zombie, region?: HitRegion): number {
  return Math.max(zombie.warehouseArmor ? zombie.damageReduction : 0, giantMutantDamageReduction(zombie, region));
}
type Wound = { x: number; y: number; region: HitRegion; size: number; bone?: boolean };
type ZombieHit = { region: HitRegion; t: number; x: number; y: number; localX: number; localY: number };
type Environment = "farmland" | "suburb" | "tunnel" | "city";
type ZombieKnockPose = {
  active: boolean;
  recovering: boolean;
  fallProgress: number;
  recoveryProgress: number;
  refallRecoveryProgress: number;
  rotation: number;
  pivotX: number;
  pivotY: number;
};

type Tracer = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  until: number;
  color: string;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  until: number;
  color: string;
  size: number;
};

type GroundProp = {
  id: number;
  kind: "mag" | "casing" | "shield";
  x: number;
  y: number;
  vx: number;
  vy: number;
  groundY: number;
  rotation: number;
  angularVelocity: number;
  visibleAt: number;
  removeAt: number;
  weapon?: WeaponKey;
  settled: boolean;
};

// 呕吐僵尸的绿色唾沫：抛物线飞行，落地形成绿色污渍（10 秒渐隐），命中玩家造成 20 伤害
type Spit = {
  id: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  createdAt: number;
  landAt: number;
  damage?: number;
  splashRadius?: number;
  arcHeight?: number;
  /** 第六关巨型变异体的连续酸液束：更大液滴与更长尾迹。 */
  burst?: boolean;
};

type BloodStain = { id: number; x: number; y: number; rx: number; removeAt: number; tint?: "blood" | "vomit" };

type ZombieLimb = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

type DetachedLimb = {
  id: number;
  kind: "arm" | "leg";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  angularVelocity: number;
  scale: number;
  tint: string;
  skin: string;
  /** 鞋子/赤脚色（腿部断肢末端脚部用色，与服装一致） */
  shoe: string;
  until: number;
};

/** 盾牌碎裂的金属碎块：不规则多边形（真实碎片而非圆点粒子），受重力、落地弹跳、旋转渐隐，短寿命不留地面遗留 */
type MetalShard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  angularVelocity: number;
  /** 不规则多边形顶点（相对碎片中心，创建时一次性确定形状） */
  points: Array<[number, number]>;
  color: string;
  until: number;
};

type ZombieBodyPose = {
  originX: number;
  originY: number;
  rotation: number;
  rearLeg: Array<[number, number]>;
  frontLeg: Array<[number, number]>;
  leftArm: Array<[number, number]>;
  rightArm: Array<[number, number]>;
};

type ZombieCorpse = {
  zombie: Zombie;
  diedAt: number;
  removeAt: number;
  fallFacing: number;
  startPose: ZombieBodyPose;
};

type ZombieRenderPose = {
  knockPose: ZombieKnockPose;
  poseFacing: number;
  scale: number;
  body: ZombieBodyPose;
};

type Barricade = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
};

type DeployedItem = {
  id: number;
  key: Exclude<ItemKey, "barricade">;
  x: number;
  y: number;
  createdAt: number;
  landAt: number;
  thrownFromX: number;
  thrownFromY: number;
  detonateAt: number | null;
  until: number | null;
  triggered: boolean;
};

type BlastEffect = {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  until: number;
  radius: number;
  kind: BlastKind;
};

type ExplosiveProjectile = {
  id: number;
  weapon: "rpg7" | "m32";
  kind: "rocket" | "grenade";
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  createdAt: number;
  impactAt: number;
  angle: number;
  arcHeight: number;
  radius: number;
  damage: number;
};

type GameState = {
  mode: GameMode;
  day: number;
  coins: number;
  kills: number;
  stats: { shotsHit: number; headshots: number; coinsEarned: number; coinsSpent: number; bonusEarned: number };
  /** 当天击杀累计金币（通关结算奖励以其为基数补足到当天收入区间），每天开局清零 */
  dayKillCoins: number;
  /** 最近一次通关结算奖励（商店标题展示），进入下一天清零 */
  lastDayBonus: number;
  player: Player;
  zombies: Zombie[];
  corpses: ZombieCorpse[];
  tracers: Tracer[];
  particles: Particle[];
  groundProps: GroundProp[];
  bloodStains: BloodStain[];
  detachedLimbs: DetachedLimb[];
  metalShards: MetalShard[];
  barricades: Barricade[];
  deployedItems: DeployedItem[];
  blastEffects: BlastEffect[];
  explosiveProjectiles: ExplosiveProjectile[];
  spits: Spit[];
  /** 靶场生成模式：无尽自动刷 / 按配置批次 */
  rangeSpawnMode: "endless" | "batch";
  /** 批次待生成队列（已打乱），生成时逐个 shift */
  rangeSpawnQueue: ZombieKind[];
  /** 本批次配置总数（HUD 进度显示用） */
  rangeBatchTotal: number;
  /** 动态世界宽度（世界单位 = 位图像素）：720 × 舞台实际宽高比，resize 时更新并重映射实体 */
  worldW: number;
  flashUntil: number;
  selectedItem: ItemKey | null;
  itemInventory: Record<ItemKey, number>;
  owned: Set<WeaponKey>;
  loadout: [WeaponKey, WeaponKey];
  melee: WeaponKey;
  armor: ArmorKey;
  ownedArmors: Set<ArmorKey>;
  ownedPartners: Set<PartnerKey>;
  partner: PartnerKey | null;
  partnerField: PartnerField;
  waveTotal: number;
  spawned: number;
  nextSpawnAt: number;
  startedAt: number;
  screenShakeUntil: number;
  waveClearedAt: number | null;
  /** 摄像机水平偏移（世界坐标）：关卡模式跟随玩家；生存/靶场恒为 0（世界宽 = 画布宽） */
  cameraX: number;
  /** 关卡模式运行时状态（非关卡模式为 null） */
  level: LevelRunState | null;
  /** 关卡地面武器拾取物（关卡结束前不清除） */
  pickups: LevelPickup[];
  /** 关卡障碍物（车辆/桌子碰撞体，不可破坏） */
  obstacles: LevelObstacle[];
  /** 关卡 NPC（救援小队/基地巡逻士兵，复用搭档骨架） */
  npcs: LevelNpc[];
};

const freshState = (mode: GameMode = "survival", worldW: number = DEFAULT_WORLD_W): GameState => ({
  mode,
  worldW,
  day: 1,
  coins: 0,
  kills: 0,
  stats: { shotsHit: 0, headshots: 0, coinsEarned: 0, coinsSpent: 0, bonusEarned: 0 },
  dayKillCoins: 0,
  lastDayBonus: 0,
  player: {
    x: 220,
    y: 410,
    hp: 100,
    maxHp: 100,
    armor: "civilian",
    angle: 0,
    weapon: "glock17",
    ammo: {
      glock17: 17, m1911: 7, pkm: 100, fruitknife: 1, combatknife: 1, crowbar: 1,
      hammer: 1, fireaxe: 1, baseballbat: 1, sawedoff: 2, mac11: 32, mp5k: 30,
      ak47: 30, m4: 30, m16: 30, scarh: 20, saiga12: 8, rem870: 7, awm: 5, m107: 10, flint66: 10,
      m240l: 100, mg42: 100, rpg7: 1, m32: 6, gatling: 180, fists: 1,
    },
    lastShot: 0,
    lastMuzzleFlash: 0,
    recoilAt: 0,
    recoilHeat: 0,
    lastMeleeAttack: 0,
    meleeMode: "slash",
    lastKick: 0,
    emptyReloadLatch: false,
    reloadStartedAt: 0,
    reloadingUntil: 0,
    invulnerableUntil: 0,
    moving: false,
  },
  zombies: [],
  corpses: [],
  tracers: [],
  particles: [],
  groundProps: [],
  bloodStains: [],
  detachedLimbs: [],
  metalShards: [],
  barricades: [],
  deployedItems: [],
  blastEffects: [],
  explosiveProjectiles: [],
  spits: [],
  rangeSpawnMode: "endless",
  rangeSpawnQueue: [],
  rangeBatchTotal: 0,
  flashUntil: 0,
  selectedItem: null,
  itemInventory: EMPTY_ITEM_INVENTORY(),
  owned: new Set<WeaponKey>(["glock17", "sawedoff", "fruitknife"]),
  loadout: ["glock17", "sawedoff"],
  melee: "fruitknife",
  armor: "civilian",
  ownedArmors: new Set<ArmorKey>(["civilian"]),
  ownedPartners: new Set<PartnerKey>(),
  partner: null,
  partnerField: freshPartnerField(),
  waveTotal: 6,
  spawned: 0,
  nextSpawnAt: 0,
  startedAt: performance.now(),
  screenShakeUntil: 0,
  waveClearedAt: null,
  cameraX: 0,
  level: null,
  pickups: [],
  obstacles: [],
  npcs: [],
});

// ESC 暂停恢复时整体平移游戏内时间戳：暂停期间不计时，恢复后所有冷却/粒子/弹道/击退姿态不发生跳变
function shiftTimeline(g: GameState, delta: number) {
  if (delta <= 0) return;
  g.startedAt += delta;
  g.nextSpawnAt += delta;
  g.screenShakeUntil += delta;
  g.flashUntil += delta;
  if (g.waveClearedAt !== null) g.waveClearedAt += delta;
  if (g.level) {
    g.level.startedAt += delta;
    g.level.taskDoneFlashUntil += delta;
    g.level.eventAt += delta;
    g.level.nextEventSpawnAt += delta;
    g.level.vehicleLastShot += delta;
    g.level.vehicleReloadUntil += delta;
  }
  const p = g.player;
  p.lastShot += delta;
  p.lastMuzzleFlash += delta;
  p.recoilAt += delta;
  p.lastMeleeAttack += delta;
  p.lastKick += delta;
  p.reloadStartedAt += delta;
  p.reloadingUntil += delta;
  p.invulnerableUntil += delta;
  for (const z of g.zombies) {
    z.lastHit += delta;
    z.knockedDownAt += delta;
    z.knockedDownUntil += delta;
    z.debuffedUntil += delta;
    z.staggeredUntil += delta;
    z.heldUntil += delta;
    z.spitAt += delta;
    z.nextSpitAt += delta;
  }
  g.partnerField.attackAt += delta;
  g.partnerField.cycleAt += delta;
  g.partnerField.muzzleAt += delta;
  g.partnerField.recoilAt += delta;
  g.partnerField.reloadStartedAt += delta;
  g.partnerField.reloadingUntil += delta;
  g.partnerField.nextRoamAt += delta;
  for (const corpse of g.corpses) { corpse.diedAt += delta; corpse.removeAt += delta; }
  for (const t of g.tracers) t.until += delta;
  for (const pt of g.particles) pt.until += delta;
  for (const limb of g.detachedLimbs) limb.until += delta;
  for (const shard of g.metalShards) shard.until += delta;
  for (const prop of g.groundProps) { prop.visibleAt += delta; prop.removeAt += delta; }
  for (const stain of g.bloodStains) stain.removeAt += delta;
  for (const blast of g.blastEffects) { blast.startedAt += delta; blast.until += delta; }
  for (const projectile of g.explosiveProjectiles) { projectile.createdAt += delta; projectile.impactAt += delta; }
  for (const spit of g.spits) { spit.createdAt += delta; spit.landAt += delta; }
  for (const item of g.deployedItems) {
    item.createdAt += delta;
    item.landAt += delta;
    if (item.detonateAt !== null) item.detonateAt += delta;
    if (item.until !== null) item.until += delta;
  }
}

function shopCost(mode: GameMode, listedPrice: number) {
  return mode === "range" ? 0 : listedPrice;
}

function canPurchase(mode: GameMode, coins: number, listedPrice: number) {
  return coins >= shopCost(mode, listedPrice);
}

function completePurchase(game: GameState, listedPrice: number) {
  const cost = shopCost(game.mode, listedPrice);
  if (game.coins < cost) return false;
  game.coins -= cost;
  game.stats.coinsSpent += cost;
  return true;
}

function shopPriceLabel(mode: GameMode, listedPrice: number, detailed = false) {
  if (mode === "range") return "靶场免费";
  if (listedPrice === 0) return "免费";
  return detailed ? `◉ ${listedPrice} 金币` : `◉ ${listedPrice}`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = "#fff", align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.font = `900 ${size}px Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawBarricadeModel(ctx: CanvasRenderingContext2D, ghost = false) {
  ctx.save();
  ctx.globalAlpha = ghost ? .52 : 1;
  ctx.fillStyle = ghost ? "rgba(86,232,129,.18)" : "rgba(0,0,0,.4)";
  ctx.beginPath(); ctx.ellipse(0, 7, 34, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ghost ? "#72ef9a" : "#484f49"; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(-24, 12); ctx.lineTo(-17, -45); ctx.moveTo(24, 12); ctx.lineTo(17, -45); ctx.stroke();
  ctx.fillStyle = ghost ? "rgba(100,235,142,.22)" : "#a16c36";
  ctx.strokeStyle = ghost ? "#72ef9a" : "#d1a45b"; ctx.lineWidth = 2;
  ctx.save(); ctx.rotate(.16); roundedRect(ctx, -34, -38, 68, 15, 3); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.rotate(-.16); roundedRect(ctx, -34, -18, 68, 15, 3); ctx.fill(); ctx.stroke(); ctx.restore();
  if (!ghost) { ctx.fillStyle = "#d5b343"; ctx.fillRect(-25, -33, 14, 6); ctx.fillRect(9, -12, 14, 6); }
  ctx.restore();
}

function drawClaymoreModel(ctx: CanvasRenderingContext2D, ghost = false) {
  ctx.save();
  ctx.globalAlpha = ghost ? .55 : 1;
  ctx.fillStyle = ghost ? "rgba(93,236,136,.2)" : "#65705e";
  ctx.strokeStyle = ghost ? "#72ef9a" : "#1c211d"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, 8); ctx.lineTo(12, 8); ctx.lineTo(8, -13); ctx.lineTo(-8, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ghost ? "#72ef9a" : "#d8c957"; ctx.fillRect(-7, -7, 14, 3);
  ctx.strokeStyle = ghost ? "#72ef9a" : "#41463e";
  ctx.beginPath(); ctx.moveTo(-7, 8); ctx.lineTo(-12, 19); ctx.moveTo(7, 8); ctx.lineTo(12, 19); ctx.stroke();
  ctx.restore();
}

function drawThrowableModel(ctx: CanvasRenderingContext2D, key: "molotov" | "frag" | "flashbang" | "impact", now: number) {
  ctx.save();
  if (key === "molotov") {
    ctx.rotate(-.38 + Math.sin(now / 75) * .08);
    ctx.fillStyle = "#49311d"; roundedRect(ctx, -6, -16, 12, 30, 4); ctx.fill();
    ctx.strokeStyle = "#b5854e"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#dcc796"; ctx.fillRect(-3, -22, 6, 8);
    ctx.fillStyle = "#ce4d2a"; ctx.fillRect(1, -24, 17, 4);
  } else if (key === "flashbang") {
    ctx.fillStyle = "#d9d7c6"; roundedRect(ctx, -8, -13, 16, 27, 4); ctx.fill();
    ctx.strokeStyle = "#3d4641"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#777e76"; ctx.fillRect(-7, -7, 14, 3); ctx.fillRect(-7, 2, 14, 3);
    ctx.fillStyle = "#242a27"; ctx.fillRect(-3, -19, 7, 7);
  } else if (key === "impact") {
    // 冲击手榴弹：橙色球形弹体 + 碰炸引信头（顶部撞针帽），红色识别带
    ctx.fillStyle = "#b26a30"; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3a2413"; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "#d89a58"; ctx.lineWidth = 1;
    for (let a = 0; a < Math.PI; a += Math.PI / 3) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9); ctx.stroke(); }
    ctx.fillStyle = "#8c2f24"; ctx.fillRect(-9, -3, 18, 5);
    ctx.fillStyle = "#2b2f2b"; ctx.fillRect(-3, -17, 7, 8);
    ctx.fillStyle = "#c9cdd2"; ctx.fillRect(-1, -20, 3, 4);
  } else {
    ctx.fillStyle = "#66755d"; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#202722"; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "#87947e"; ctx.lineWidth = 1;
    for (let a = 0; a < Math.PI; a += Math.PI / 3) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9); ctx.stroke(); }
    ctx.fillStyle = "#202722"; ctx.fillRect(-3, -16, 7, 8);
  }
  ctx.restore();
}

// 柔边烟团：径向渐变大团块（中心浓、边缘消散），多团叠加形成连续体积感烟云，而非离散圆点。
function softPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  if (alpha <= 0.012 || r <= 0.6) return;
  const gradient = ctx.createRadialGradient(x, y, r * 0.14, x, y, r);
  gradient.addColorStop(0, `rgba(${rgb},${Math.min(1, alpha)})`);
  gradient.addColorStop(0.62, `rgba(${rgb},${(alpha * 0.52).toFixed(3)})`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// 确定性哈希：同一爆点/火焰的烟团湍流参数随时间连续、逐团不同，无需存状态
function puffHash(seed: number) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawBlastEffect(ctx: CanvasRenderingContext2D, blast: BlastEffect, now: number) {
  const duration = blast.until - blast.startedAt;
  const progress = Math.max(0, Math.min(1, (now - blast.startedAt) / duration));
  const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  const smokeProgress = Math.min(1, progress / 0.85);
  const mixC = (a: number, b: number) => Math.round(a + (b - a) * smokeProgress);
  const warm = `${mixC(104, 56)},${mixC(89, 54)},${mixC(70, 49)}`;
  const cool = `${mixC(70, 44)},${mixC(68, 43)},${mixC(62, 40)}`;
  const seedBase = blast.id * 0.017;
  ctx.save(); ctx.translate(blast.x, blast.y);

  // 体积烟云：大团柔边渐变团互相叠加，自爆心向外翻滚膨胀、湍流形变、上升；
  // 起始于火球位置（初始聚拢在爆心），火球熄灭时无缝接管画面
  const puffCount = blast.kind === "airstrike" ? 13 : blast.kind === "rocket" ? 11 : blast.kind === "grenade" ? 9 : 8;
  const smokeIn = Math.min(1, progress / 0.12);
  const smokeOut = 1 - easeInOut(Math.max(0, (progress - 0.62) / 0.38));
  for (let index = 0; index < puffCount; index++) {
    const h1 = puffHash(seedBase + index * 3.7);
    const h2 = puffHash(seedBase + index * 5.1 + 17);
    const h3 = puffHash(seedBase + index * 7.3 + 41);
    const angle = index * 2.399 + h1 * 1.1;
    // 烟团从爆心（火球原位）向外扩散，外圈更早变大
    const spread = blast.radius * (0.08 + smokeProgress * (0.72 + h2 * 0.4)) * (0.5 + h1 * 0.75);
    const rise = Math.pow(smokeProgress, 1.5) * (blast.kind === "airstrike" ? 120 : 82) * (0.45 + h3 * 0.8);
    // 湍流形变：位置低频摆动 + 团块半径呼吸
    const wobbleX = Math.sin(now / 300 + index * 2.13) * (2 + smokeProgress * 4.5);
    const wobbleY = Math.cos(now / 260 + index * 1.71) * (1.5 + smokeProgress * 3);
    const radius = blast.radius * (0.3 + h2 * 0.3) * (0.5 + smokeProgress * 0.85) * (1 + Math.sin(now / 340 + index * 2.6) * 0.09);
    const alpha = 0.34 * smokeIn * smokeOut * (0.62 + h3 * 0.55);
    softPuff(
      ctx,
      Math.cos(angle) * spread + wobbleX,
      Math.sin(angle) * spread * 0.4 - rise + wobbleY,
      radius,
      h1 > 0.45 ? warm : cool,
      alpha,
    );
  }
  // central smoke column：数团堆叠翻滚并明显向上抬升，避免爆炸像贴在路面的平面贴纸。
  if (blast.kind === "airstrike" || blast.kind === "rocket" || blast.kind === "grenade") {
    const smokeScale = blast.kind === "airstrike" ? 1 : blast.kind === "rocket" ? .72 : .48;
    const columnTop = smokeProgress * blast.radius * 1.15 * smokeScale;
    for (let cloud = 0; cloud < 6; cloud++) {
      const h = puffHash(seedBase + cloud * 9.4 + 83);
      const t = cloud / 5;
      const cloudY = (-blast.radius * 0.12 * smokeScale) - columnTop * t - Math.sin(now / 420 + cloud * 1.9) * 3;
      const cloudX = Math.sin(blast.id * 0.03 + cloud * 1.7 + now / 900) * blast.radius * (0.06 + t * 0.14) * smokeScale;
      const cloudR = blast.radius * (0.2 + t * 0.16 + h * 0.06) * smokeScale * (0.6 + smokeProgress * 0.6);
      softPuff(ctx, cloudX, cloudY, cloudR, t > 0.55 ? cool : warm, 0.36 * smokeIn * smokeOut * (1 - t * 0.45));
    }
  }

  // 火球：前 35% 急速膨胀（白炽核心→黄→橙径向分层），随后收缩黯淡，烟尘同步接管
  const fireFade = progress < 0.35 ? 1 : Math.max(0, 1 - (progress - 0.35) / 0.3);
  const fireballRadius = blast.radius * (progress < 0.35
    ? easeOut(progress / 0.35)
    : Math.max(0, 1 - (progress - 0.35) / 0.3));
  if (fireballRadius > 0.5 && fireFade > 0) {
    const glow = ctx.createRadialGradient(0, -fireballRadius * .18, 1, 0, -fireballRadius * .18, fireballRadius);
    glow.addColorStop(0, `rgba(255,252,224,${.98 * fireFade})`);
    glow.addColorStop(.3, `rgba(255,196,64,${.92 * fireFade})`);
    glow.addColorStop(.62, `rgba(226,90,32,${.78 * fireFade})`);
    glow.addColorStop(1, "rgba(60,40,30,0)");
    ctx.save(); ctx.scale(.94, 1.22); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -fireballRadius * .12, fireballRadius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // 向上卷起的高温焰柱，重型火箭弹比榴弹更高、更窄。
    const plumeHeight = fireballRadius * (blast.kind === "rocket" || blast.kind === "airstrike" ? 1.25 : .88);
    ctx.fillStyle = `rgba(242,119,36,${(.62 * fireFade).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(-fireballRadius * .38, 5); ctx.quadraticCurveTo(-fireballRadius * .28, -plumeHeight * .55, -fireballRadius * .08, -plumeHeight);
    ctx.quadraticCurveTo(fireballRadius * .35, -plumeHeight * .48, fireballRadius * .42, 5); ctx.closePath(); ctx.fill();
  }
  // 冲击环：起爆瞬间快速扩张并消散的薄压环
  if (progress < 0.3) {
    const ringT = progress / 0.3;
    const ringRadius = blast.radius * (0.25 + 1.5 * easeOut(ringT));
    ctx.strokeStyle = `rgba(255,238,170,${(1 - ringT) * .85})`;
    ctx.lineWidth = 1.5 + 6 * (1 - ringT) + (blast.kind === "airstrike" ? 3 : 0);
    ctx.beginPath(); ctx.ellipse(0, 5, ringRadius, ringRadius * .28, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawExplosiveProjectile(ctx: CanvasRenderingContext2D, projectile: ExplosiveProjectile, now: number) {
  const duration = Math.max(1, projectile.impactAt - projectile.createdAt);
  const t = Math.max(0, Math.min(1, (now - projectile.createdAt) / duration));
  const x = projectile.startX + (projectile.targetX - projectile.startX) * t;
  const groundY = projectile.startY + (projectile.targetY - projectile.startY) * t;
  const y = groundY - Math.sin(t * Math.PI) * projectile.arcHeight;
  const travelAngle = Math.atan2(projectile.targetY - projectile.startY, projectile.targetX - projectile.startX);
  ctx.save(); ctx.translate(x, y);
  if (projectile.kind === "rocket") {
    // 火箭弹实体：弹头、推进段、尾翼和连续体积尾烟；不使用子弹曳光线。
    for (let puff = 1; puff <= 5; puff++) {
      const trailT = Math.max(0, t - puff * .018);
      const trailX = (projectile.startX + (projectile.targetX - projectile.startX) * trailT) - x;
      const trailGroundY = projectile.startY + (projectile.targetY - projectile.startY) * trailT;
      const trailY = trailGroundY - Math.sin(trailT * Math.PI) * projectile.arcHeight - y;
      softPuff(ctx, trailX, trailY, 9 + puff * 2.8, "78,76,68", .2 * (1 - puff / 7));
    }
    ctx.rotate(travelAngle);
    ctx.fillStyle = "#3f4939"; roundedRect(ctx, -26, -6, 38, 12, 5); ctx.fill();
    ctx.fillStyle = "#7a8054"; ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(10, -8); ctx.lineTo(10, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2b312a"; ctx.beginPath(); ctx.moveTo(-23, -5); ctx.lineTo(-32, -12); ctx.lineTo(-28, 0); ctx.lineTo(-32, 12); ctx.lineTo(-23, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f0a33a"; ctx.beginPath(); ctx.moveTo(-29, 0); ctx.lineTo(-42, -5); ctx.lineTo(-38, 0); ctx.lineTo(-42, 5); ctx.closePath(); ctx.fill();
  } else {
    // 40mm 榴弹实体沿抛物线旋转飞行，短粗弹体清晰可见。
    ctx.rotate(travelAngle + t * Math.PI * 5);
    ctx.fillStyle = "#54604a"; ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#232a24"; ctx.fillRect(-10, -6, 5, 12);
    ctx.fillStyle = "#b08a43"; ctx.fillRect(5, -5, 3, 10);
  }
  ctx.restore();
}

function emitExplosionVisuals(
  game: GameState,
  x: number,
  y: number,
  now: number,
  radius: number,
  kind: BlastKind,
  _particleCount: number,
  duration: number,
  shakeMs: number,
) {
  game.blastEffects.push({ id: Math.floor(now * 1000 + Math.random() * 999), x, y, startedAt: now, until: now + duration, radius, kind });
  game.screenShakeUntil = Math.max(game.screenShakeUntil, now + shakeMs);
}

type ExplosionDamageApplier = (
  game: GameState,
  zombie: Zombie,
  damage: number,
  now: number,
  blastX: number,
  blastY: number,
  distance: number,
  radius: number,
  kind: BlastKind,
) => void;

function detonateExplosiveProjectile(game: GameState, projectile: ExplosiveProjectile, now: number, applyDamage: ExplosionDamageApplier) {
  const blastX = projectile.targetX;
  const blastY = projectile.targetY;
  for (const zombie of game.zombies) {
    const distance = Math.hypot(zombie.x - blastX, zombieBodyY(zombie) - blastY);
    if (distance > projectile.radius) continue;
    const falloff = .45 + .55 * (1 - distance / projectile.radius);
    applyDamage(game, zombie, projectile.damage * falloff, now, blastX, blastY, distance, projectile.radius, projectile.kind);
    const blastAngle = Math.atan2(zombie.y - blastY, zombie.x - blastX);
    zombie.x += Math.cos(blastAngle) * (projectile.kind === "rocket" ? 54 : 38);
    zombie.y += Math.sin(blastAngle) * (projectile.kind === "rocket" ? 34 : 24);
  }
  emitExplosionVisuals(
    game,
    blastX,
    blastY,
    now,
    projectile.radius,
    projectile.kind,
    0,
    projectile.kind === "rocket" ? 1550 : 1250,
    projectile.kind === "rocket" ? 500 : 350,
  );
  sound.explosion(projectile.kind);
}

function detachZombieLimb(game: GameState, zombie: Zombie, limb: ZombieLimb, blastX: number, blastY: number, now: number) {
  if (zombie.missingLimbs.has(limb)) return;
  zombie.missingLimbs.add(limb);
  const scale = (zombie.radius / 25) * CHARACTER_SCALE;
  const arm = limb.endsWith("Arm");
  const left = limb.startsWith("left");
  const socketX = zombie.x + (left ? -1 : 1) * (arm ? 12 : 5) * scale;
  const socketY = zombie.y - (arm ? 95 : 62) * scale;
  const forceAngle = Math.atan2(socketY - blastY, socketX - blastX) + (Math.random() - .5) * .65;
  const force = 250 + Math.random() * 230;
  game.detachedLimbs.push({
    id: Math.floor(now * 1000 + Math.random() * 999),
    kind: arm ? "arm" : "leg",
    x: socketX,
    y: socketY,
    vx: Math.cos(forceAngle) * force,
    vy: Math.sin(forceAngle) * force - 210,
    rotation: forceAngle,
    angularVelocity: (Math.random() - .5) * 12,
    scale,
    tint: arm ? zombie.outfit.sleeve : left ? zombie.outfit.pantsRear : zombie.outfit.pantsFront,
    skin: zombie.radius > 29 ? "#6e7c52" : "#7e8c60",
    shoe: zombie.outfit.shoes,
    until: now + 1900,
  });
  for (let index = 0; index < 15; index++) {
    const sprayAngle = forceAngle + Math.PI + (Math.random() - .5) * 1.4;
    const speed = 70 + Math.random() * 230;
    game.particles.push({ x: socketX, y: socketY, vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed - 45, until: now + 420 + Math.random() * 300, color: index % 3 ? "#971721" : "#541015", size: 3 + Math.random() * 6 });
  }
}

/** 盾牌 HP 归零 → 金属盾碎裂：不规则金属碎块四散飞溅（受重力/落地弹跳/旋转渐隐，短寿命、不产生地面遗留物——
 *  与踹落的完整盾牌落地是两条不同路径），此后僵尸按无盾处理 */
function shatterZombieShield(g: GameState, z: Zombie, now: number, angle: number) {
  z.shieldIntact = false;
  z.shieldHp = 0;
  z.shieldDents = [];
  const scale = (z.radius / 25) * CHARACTER_SCALE;
  const faceDir = g.player.x < z.x ? -1 : 1;
  const cx = z.x + faceDir * 22 * scale;
  const cy = z.y - 70 * scale;
  const colors = ["#7d8b9b", "#6b7887", "#4a545e", "#333a43", "#9aa8b5"];
  for (let i = 0; i < 12; i++) {
    // 一半碎块沿冲击方向（子弹/爆炸冲击波）飞出，一半向四周迸溅
    const a = i % 2 === 0 ? angle + (Math.random() - .5) * 1.2 : Math.random() * Math.PI * 2;
    const speed = 140 + Math.random() * 320;
    const size = (2.5 + Math.random() * 6.5) * scale;
    const corners = 3 + Math.floor(Math.random() * 2);
    const points: Array<[number, number]> = [];
    for (let k = 0; k < corners; k++) {
      const pa = (k / corners) * Math.PI * 2 + (Math.random() - .5) * .9;
      const pr = size * (.6 + Math.random() * .8);
      points.push([Math.cos(pa) * pr, Math.sin(pa) * pr * .55]);
    }
    g.metalShards.push({
      x: cx + (Math.random() - .5) * 16 * scale,
      y: cy + (Math.random() - .5) * 110 * scale,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 130,
      rotation: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - .5) * 26,
      points,
      color: colors[i % colors.length],
      until: now + 750 + Math.random() * 550,
    });
  }
  if (g.metalShards.length > 72) g.metalShards.splice(0, g.metalShards.length - 72);
  // 碎裂瞬间的火花迸溅与白色闪点
  emitArmorSpark(g, cx, cy, now, angle);
  g.particles.push({ x: cx, y: cy, vx: 0, vy: 0, until: now + 90, color: "#ffffff", size: 8 });
  sound.shieldShatter({ volume: distanceVolume(z.x, g.player.x) });
}

/** 金属碎块渲染：不规则多边形钢板碎片 + 断口亮边，末段 300ms 渐隐 */
function drawMetalShard(ctx: CanvasRenderingContext2D, shard: MetalShard, now: number) {
  ctx.save();
  ctx.translate(shard.x, shard.y);
  ctx.rotate(shard.rotation);
  ctx.globalAlpha = Math.max(0, Math.min(1, (shard.until - now) / 300));
  ctx.fillStyle = shard.color;
  ctx.beginPath();
  shard.points.forEach(([px, py], index) => { if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(214,228,238,.55)";
  ctx.lineWidth = .8;
  ctx.stroke();
  ctx.restore();
}

function drawDetachedLimb(ctx: CanvasRenderingContext2D, limb: DetachedLimb) {
  ctx.save(); ctx.translate(limb.x, limb.y); ctx.rotate(limb.rotation);
  const length = limb.kind === "arm" ? 55 : 64;
  const bend = limb.kind === "arm" ? 12 : -10;
  drawLimb(ctx, [[0, 0], [length * .52 * limb.scale, bend * limb.scale], [length * limb.scale, 0]], (limb.kind === "arm" ? 6.5 : 7) * limb.scale, limb.tint, limb.skin);
  ctx.fillStyle = "#651018"; ctx.beginPath(); ctx.arc(0, 0, 5.2 * limb.scale, 0, Math.PI * 2); ctx.fill();
  if (limb.kind === "leg") drawFoot(ctx, [length * limb.scale, 0], 1, 14 * limb.scale, limb.shoe);
  else drawHand(ctx, [length * limb.scale, 0], [length * .52 * limb.scale, bend * limb.scale], 7 * limb.scale, limb.skin);
  ctx.restore();
}

const ENVIRONMENT_LABELS: Record<Environment, string> = {
  farmland: "农田公路",
  suburb: "郊区公路",
  tunnel: "封锁隧道",
  city: "沦陷城市",
};

function environmentForDay(day: number): Environment {
  if (day <= 5) return "farmland";
  if (day <= 10) return "suburb";
  if (day <= 15) return "tunnel";
  return "city";
}

function backgroundName(day: number) {
  return ENVIRONMENT_LABELS[environmentForDay(day)];
}

function drawBackground(ctx: CanvasRenderingContext2D, day: number, worldW: number) {
  // 背景全程按动态世界宽度平铺（W 为本函数内的宽度别名，保留既有绘制坐标不变）
  const W = worldW;
  const environment = environmentForDay(day);
  const farmland = environment === "farmland";
  const suburb = environment === "suburb";
  const tunnel = environment === "tunnel";
  const city = environment === "city";

  if (farmland) {
    const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 25);
    sky.addColorStop(0, "#6e8580");
    sky.addColorStop(.62, "#c2a36f");
    sky.addColorStop(1, "#8e7444");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 25);
    ctx.fillStyle = "#4e653b";
    ctx.beginPath(); ctx.moveTo(0, 125); ctx.quadraticCurveTo(190, 70, 370, 127); ctx.quadraticCurveTo(600, 75, 825, 125); ctx.quadraticCurveTo(1040, 78, W, 122); ctx.lineTo(W, 176); ctx.lineTo(0, 176); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8c7136"; ctx.fillRect(0, 127, W, 42);
    ctx.strokeStyle = "#c19b46"; ctx.lineWidth = 3;
    for (let x = -100; x < W + 100; x += 42) { ctx.beginPath(); ctx.moveTo(x, 169); ctx.lineTo(x + 85, 128); ctx.stroke(); }
    ctx.fillStyle = "#6d2f28"; ctx.fillRect(935, 85, 78, 64);
    ctx.fillStyle = "#d1c2a0"; ctx.beginPath(); ctx.moveTo(924, 87); ctx.lineTo(974, 55); ctx.lineTo(1024, 87); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#34251d"; ctx.fillRect(966, 116, 20, 33);
    ctx.fillStyle = "#aeb5a3"; ctx.fillRect(1050, 75, 24, 73);
    ctx.fillStyle = "#c8c6b1"; ctx.beginPath(); ctx.arc(1062, 76, 12, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "#403d33"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(210, 70); ctx.lineTo(210, 150); ctx.stroke();
    ctx.lineWidth = 2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) { ctx.beginPath(); ctx.moveTo(210, 78); ctx.lineTo(210 + Math.cos(a) * 37, 78 + Math.sin(a) * 37); ctx.stroke(); }
  } else if (suburb) {
    const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 30);
    sky.addColorStop(0, "#536268"); sky.addColorStop(1, "#a29278");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 30);
    const houseColors = ["#75584d", "#667064", "#82745e", "#5a6262"];
    for (let i = 0; i < 7; i++) {
      const x = -45 + i * 205;
      const houseW = 130 + (i % 2) * 24;
      ctx.fillStyle = houseColors[i % houseColors.length]; ctx.fillRect(x, 84 + (i % 2) * 13, houseW, 70);
      ctx.fillStyle = "#353a37"; ctx.beginPath(); ctx.moveTo(x - 10, 88 + (i % 2) * 13); ctx.lineTo(x + houseW / 2, 50 + (i % 2) * 13); ctx.lineTo(x + houseW + 10, 88 + (i % 2) * 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b6a263"; ctx.fillRect(x + 22, 105, 18, 18); ctx.fillRect(x + houseW - 43, 105, 18, 18);
      ctx.fillStyle = "#262d29"; ctx.fillRect(x + houseW / 2 - 10, 120, 20, 34);
    }
    ctx.strokeStyle = "#252b2a"; ctx.lineWidth = 5;
    for (let x = 80; x < W; x += 300) { ctx.beginPath(); ctx.moveTo(x, 38); ctx.lineTo(x, 168); ctx.stroke(); ctx.fillStyle = "#252b2a"; ctx.fillRect(x - 22, 52, 44, 5); }
    ctx.strokeStyle = "#343a38"; ctx.lineWidth = 2;
    for (let x = 80; x < W - 300; x += 300) { ctx.beginPath(); ctx.moveTo(x - 20, 56); ctx.bezierCurveTo(x + 80, 82, x + 190, 82, x + 280, 56); ctx.stroke(); }
    ctx.fillStyle = "#31594d"; ctx.fillRect(0, 148, W, 20);
    ctx.fillStyle = "#ddd0aa"; ctx.fillRect(1115, 78, 95, 48); ctx.fillStyle = "#9f3030"; ctx.fillRect(1122, 85, 81, 34); drawText(ctx, "补给站", 1162, 107, 14, "#f3e9ca", "center");
  } else if (tunnel) {
    ctx.fillStyle = "#161a19"; ctx.fillRect(0, 0, W, H);
    const ceiling = ctx.createLinearGradient(0, 0, 0, 205);
    ceiling.addColorStop(0, "#090b0b"); ceiling.addColorStop(1, "#363b39");
    ctx.fillStyle = ceiling; ctx.fillRect(0, 0, W, 205);
    ctx.strokeStyle = "#4a504d"; ctx.lineWidth = 5;
    for (let x = -120; x < W + 180; x += 230) { ctx.beginPath(); ctx.arc(x + 110, 190, 135, Math.PI, 0); ctx.stroke(); }
    for (let x = 65; x < W; x += 215) {
      ctx.fillStyle = "#d8cc91"; ctx.fillRect(x, 52, 105, 9);
      ctx.fillStyle = "rgba(222,205,137,.09)"; ctx.beginPath(); ctx.moveTo(x - 20, 61); ctx.lineTo(x + 125, 61); ctx.lineTo(x + 175, 250); ctx.lineTo(x - 70, 250); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#303633"; ctx.fillRect(0, 112, W, 58);
    ctx.strokeStyle = "#565e59"; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 75) { ctx.beginPath(); ctx.moveTo(x, 112); ctx.lineTo(x, 170); ctx.stroke(); }
    ctx.fillStyle = "#b7bbad"; ctx.fillRect(1030, 125, 126, 34); ctx.fillStyle = "#1b5f48"; ctx.fillRect(1037, 131, 112, 22); drawText(ctx, "出口 2.4 KM", 1093, 147, 11, "#e9f2e9", "center");
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP + 40);
    sky.addColorStop(0, "#111823"); sky.addColorStop(1, "#4f4546");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, ROAD_TOP + 30);
    const buildings = [62, 108, 82, 145, 96, 126, 74, 158, 102, 136, 88, 116, 150];
    for (let i = 0, x = -20; x < W; i++, x += 100) {
      const height = buildings[i % buildings.length];
      ctx.fillStyle = i % 3 === 0 ? "#1c252c" : i % 3 === 1 ? "#25282d" : "#20232a";
      ctx.fillRect(x, ROAD_TOP - height, 82, height);
      ctx.fillStyle = "#b79b57";
      for (let wy = ROAD_TOP - height + 14; wy < ROAD_TOP - 14; wy += 22) for (let wx = x + 12; wx < x + 70; wx += 22) if ((wx + wy + i) % 3) ctx.fillRect(wx, wy, 8, 6);
      ctx.fillStyle = "#11171c"; ctx.fillRect(x + 15, ROAD_TOP - height - 20, 5, 20);
    }
    ctx.fillStyle = "rgba(152,49,43,.75)"; ctx.fillRect(720, 49, 150, 31); drawText(ctx, "市中心封锁", 795, 70, 14, "#f1d0b1", "center");
    ctx.fillStyle = "#2d3435"; ctx.fillRect(0, 148, W, 22);
  }

  const road = ctx.createLinearGradient(0, ROAD_TOP, 0, ROAD_BOTTOM);
  road.addColorStop(0, tunnel ? "#292d2c" : "#444641");
  road.addColorStop(1, tunnel ? "#171a19" : city ? "#252a2b" : "#30322f");
  ctx.fillStyle = road; ctx.fillRect(0, ROAD_TOP, W, ROAD_BOTTOM - ROAD_TOP);
  ctx.fillStyle = tunnel ? "#202422" : "#282b29";
  for (let i = 0; i < 42; i++) {
    const x = (i * 191) % W;
    const y = ROAD_TOP + 20 + ((i * 83) % (ROAD_BOTTOM - ROAD_TOP - 35));
    ctx.fillRect(x, y, 42 + (i % 4) * 16, 3);
  }
  if (city) {
    ctx.fillStyle = "rgba(116,146,154,.13)";
    for (let x = 35; x < W; x += 210) ctx.fillRect(x, 188 + (x % 260), 128, 20);
  }
  ctx.fillStyle = tunnel ? "#d4c978" : "#e3b735";
  for (let x = 0; x < W; x += 155) ctx.fillRect(x, 390, 88, 8);
  ctx.fillStyle = tunnel ? "#0c0e0d" : "#191d1a";
  ctx.fillRect(0, ROAD_TOP, W, 13); ctx.fillRect(0, ROAD_BOTTOM - 8, W, 25);

  if (!tunnel) {
    ctx.fillStyle = city ? "#6d7470" : "#78302f"; ctx.fillRect(0, 112, W, 7);
    ctx.fillStyle = "#7a8677"; for (let x = 24; x < W; x += 90) ctx.fillRect(x, 105, 7, 32);
    ctx.fillStyle = city ? "#753b37" : "#b13434";
    for (let x = 36; x < W; x += 270) {
      ctx.save(); ctx.translate(x, 126); ctx.rotate(-.05); ctx.fillRect(0, 0, 68, 36);
      drawText(ctx, city ? "封锁" : "撤离", 34, 25, 15, "#f4ddb0", "center"); ctx.restore();
    }
  } else {
    ctx.fillStyle = "#555b57"; ctx.fillRect(0, 151, W, 18);
    ctx.fillStyle = "#c1a732"; for (let x = 0; x < W; x += 90) ctx.fillRect(x, 154, 45, 8);
  }
}

// 视口宽度变化时按比例重映射场上所有实体 x 坐标：相对战斗布局保持不变，拖拽窗口平滑过渡
function remapWorldX(g: GameState, factor: number) {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
  g.player.x *= factor;
  for (const z of g.zombies) z.x *= factor;
  for (const corpse of g.corpses) corpse.zombie.x *= factor;
  for (const barricade of g.barricades) barricade.x *= factor;
  for (const pickup of g.pickups) pickup.x *= factor;
  for (const obstacle of g.obstacles) obstacle.x *= factor;
  for (const npc of g.npcs) {
    npc.field.x *= factor;
    npc.field.roamX *= factor;
    npc.anchorX *= factor;
  }
  for (const item of g.deployedItems) { item.x *= factor; item.thrownFromX *= factor; }
  for (const stain of g.bloodStains) stain.x *= factor;
  for (const particle of g.particles) particle.x *= factor;
  for (const limb of g.detachedLimbs) limb.x *= factor;
  for (const shard of g.metalShards) shard.x *= factor;
  for (const blast of g.blastEffects) blast.x *= factor;
  for (const projectile of g.explosiveProjectiles) {
    projectile.startX *= factor;
    projectile.targetX *= factor;
  }
  for (const spit of g.spits) { spit.fromX *= factor; spit.targetX *= factor; }
  for (const prop of g.groundProps) prop.x *= factor;
  for (const tracer of g.tracers) { tracer.x1 *= factor; tracer.x2 *= factor; }
  const f = g.partnerField;
  f.x *= factor;
  f.roamX *= factor;
  if (g.level) {
    if (g.level.truckX >= 0) g.level.truckX *= factor;
    if (g.level.truckStopX !== 0) g.level.truckStopX *= factor;
  }
}

/** 两点间的锥形肢体段：直线边、近端宽远端窄（有棱角，非圆棍）。 */
function drawTaperedSegment(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], w0: number, w1: number, color: string) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || .001;
  const nx = -dy / length;
  const ny = dx / length;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a[0] + nx * w0 / 2, a[1] + ny * w0 / 2);
  ctx.lineTo(b[0] + nx * w1 / 2, b[1] + ny * w1 / 2);
  ctx.lineTo(b[0] - nx * w1 / 2, b[1] - ny * w1 / 2);
  ctx.lineTo(a[0] - nx * w0 / 2, a[1] - ny * w0 / 2);
  ctx.closePath();
  ctx.fill();
}

/** 关节：小八边形（有棱角，非圆形）。 */
function drawJoint(ctx: CanvasRenderingContext2D, p: [number, number], radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = p[0] + Math.cos(angle) * radius;
    const y = p[1] + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** 护肘垫片：戴在肘关节（IK 链中间点），垫片沿小臂方向贴合，附束带与上缘受光。 */
function drawElbowPad(ctx: CanvasRenderingContext2D, arm: Array<[number, number]>, color: string) {
  const elbow = arm[1];
  const angle = Math.atan2(arm[2][1] - elbow[1], arm[2][0] - elbow[0]);
  ctx.save();
  ctx.translate(elbow[0], elbow[1]);
  ctx.rotate(angle);
  // 束带（垫片上下两端）
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.fillRect(-5.4, -3.4, 2.2, 6.8);
  ctx.fillRect(3.2, -3.4, 2.2, 6.8);
  // 垫片主体：横向椭圆硬壳
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0.4, 0, 5, 4.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = .8; ctx.stroke();
  // 上缘受光面
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0.4, -0.4, 3.4, 2.4, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.restore();
}

/** 脚踝处的靴子：脚跟位于鞋后端（小腿下端止于踝部、与鞋跟衔接），鞋底向趾尖延伸。 */
function drawFoot(ctx: CanvasRenderingContext2D, ankle: [number, number], facing: number, size: number, color: string, solePitch = 0) {
  const s = size / 13;
  ctx.fillStyle = color;
  ctx.save();
  // solePitch > 0：鞋绕踝部向后旋转（趾尖上抬、鞋底平面朝前），用于蹬踹顶点的踹击状
  if (solePitch > 0) {
    ctx.translate(ankle[0], ankle[1]);
    ctx.rotate(-facing * solePitch * 1.15);
    ctx.translate(-ankle[0], -ankle[1]);
  }
  ctx.beginPath();
  ctx.moveTo(ankle[0] - facing * 3 * s, ankle[1] - 5 * s);
  ctx.lineTo(ankle[0] + facing * 2.5 * s, ankle[1] - 5.5 * s);
  ctx.lineTo(ankle[0] + facing * 12.5 * s, ankle[1] - 1.5 * s);
  ctx.lineTo(ankle[0] + facing * 13 * s, ankle[1] + 2 * s);
  ctx.lineTo(ankle[0] - facing * 3.5 * s, ankle[1] + 2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 手掌：沿小臂方向延伸的直线多边形块状。 */
function drawHand(ctx: CanvasRenderingContext2D, wrist: [number, number], elbow: [number, number], size: number, color: string) {
  const dx = wrist[0] - elbow[0];
  const dy = wrist[1] - elbow[1];
  const length = Math.hypot(dx, dy) || .001;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const half = size / 2;
  const tip = size * .9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(wrist[0] + nx * half, wrist[1] + ny * half);
  ctx.lineTo(wrist[0] + ux * tip + nx * half * .8, wrist[1] + uy * tip + ny * half * .8);
  ctx.lineTo(wrist[0] + ux * (tip + half * .5), wrist[1] + uy * (tip + half * .5));
  ctx.lineTo(wrist[0] + ux * tip - nx * half * .8, wrist[1] + uy * tip - ny * half * .8);
  ctx.lineTo(wrist[0] - nx * half, wrist[1] - ny * half);
  ctx.closePath();
  ctx.fill();
}

/** 直线化分段肢体：大腿/小腿（或大臂/小臂）两段锥形段 + 八边形关节。 */
function drawLimb(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, width: number, color: string, jointColor = color) {
  drawTaperedSegment(ctx, points[0], points[1], width, width * .8, color);
  if (points.length > 2) drawTaperedSegment(ctx, points[1], points[2], width * .8, width * .6, color);
  for (let i = 1; i < points.length - 1; i++) drawJoint(ctx, points[i], width * .42, jointColor);
}

// 战斗站姿屈膝下沉量：上半身整体上移，腿部在站姿下保持自然弯曲
const BODY_LIFT = 4;
const HIP_Y = -66 + BODY_LIFT;
const SHOULDER_Y = -99 + BODY_LIFT;
const TORSO_TOP_Y = -104 + BODY_LIFT;
const THIGH_LEN = 32;
const SHIN_LEN = 33;
const UPPER_ARM_LEN = 20;
const FOREARM_LEN = 20;

// 站立持枪站姿：双脚前后错开（后脚 -20 / 前脚 +9）；后腿大腿微向后倾、膝部自然后扣（膝略落后于髋、
// 腿部接近伸直但仍为前屈关节），前腿保持前顶微屈。人物与僵尸共用此骨架与姿势逻辑。
function standingLegPose(facing: number, hipX: number): Array<[number, number]> {
  const hip: [number, number] = [hipX, HIP_Y];
  const stagger = hipX < 0 ? -20 : 9;
  const foot: [number, number] = [hipX + facing * stagger, -1];
  const preferredKnee: [number, number] = hipX < 0
    ? [hipX + facing * 1, HIP_Y + 30]
    : [hipX + facing * 12, HIP_Y + 27];
  return solveTwoBoneLeg(hip, foot, preferredKnee);
}

// 真实交替步态（单腿周期 cycle∈[0,1)，两腿调用相位差 0.5 = 180° 严格交替）：
// 支撑相（0~0.62）：全掌贴地，脚相对髋部由前向后匀速后扫（脚跟触地→全掌滚动→蹬离），膝保持承重微屈；
// 摆动相（0.62~1）：摆动腿屈膝前迈（小腿收起→前伸），脚尖离地抬起后脚跟着地。
// stride/lift 可调：僵尸用更小步幅与更低抬脚呈现拖沓感（同一骨架逻辑）。
function gaitLegPose(cycle: number, facing: number, hipX: number, stride = 10, lift = 7): Array<[number, number]> {
  const home = hipX < 0 ? -8 : 8;
  const hip: [number, number] = [hipX, HIP_Y];
  let foot: [number, number];
  let preferredKnee: [number, number];
  if (cycle < 0.62) {
    const t = cycle / 0.62;
    foot = [hipX + facing * (home + stride * (1 - t * 2)), -1];
    preferredKnee = [hipX + facing * (home * 0.4 + 7), HIP_Y + 28];
  } else {
    const u = (cycle - 0.62) / 0.38;
    foot = [hipX + facing * (home - stride + stride * 2 * easeInOut(u)), -1 - Math.sin(u * Math.PI) * lift];
    preferredKnee = [hipX + facing * (home + 4 + 14 * Math.sin(u * Math.PI)), HIP_Y + 24];
  }
  return solveTwoBoneLeg(hip, foot, preferredKnee);
}

// 步态脚部俯仰（配合 drawFoot solePitch）：脚跟着地趾尖微抬 → 全掌 → 蹬离时脚跟提起；摆动相保持微背屈
function gaitFootPitch(cycle: number) {
  if (cycle < 0.62) {
    const t = cycle / 0.62;
    return t < 0.18 ? 0.3 * (1 - t / 0.18) : t > 0.82 ? -0.35 * (t - 0.82) / 0.18 : 0;
  }
  return 0.25 * Math.sin(((cycle - 0.62) / 0.38) * Math.PI);
}

function scalePoints(points: Array<[number, number]>, scale: number): Array<[number, number]> {
  return points.map(([x, y]) => [x * scale, y * scale]);
}

function easeInOut(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function mixPoint(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function mixPose(from: Array<[number, number]>, to: Array<[number, number]>, progress: number) {
  return from.map((point, index) => mixPoint(point, to[index], progress));
}

// 栓动循环分解：approach 右手探向栓柄 → lift 上抬开锁 → pull 后拉（抛壳）→ 前推 → 下压 → leave 回握把
function boltCycleMotion(t: number) {
  const seg = (a: number, b: number) => easeInOut(Math.max(0, Math.min(1, (t - a) / (b - a))));
  return {
    lift: seg(0.12, 0.26) - seg(0.6, 0.76),
    pull: seg(0.26, 0.44) - seg(0.44, 0.62),
    approach: seg(0, 0.12),
    leave: seg(0.76, 1),
  };
}

function solveTwoBoneLeg(
  hip: [number, number],
  requestedFoot: [number, number],
  preferredKnee: [number, number],
  thighLength = THIGH_LEN,
  shinLength = SHIN_LEN,
): Array<[number, number]> {
  let dx = requestedFoot[0] - hip[0];
  let dy = requestedFoot[1] - hip[1];
  let distance = Math.hypot(dx, dy) || .001;
  const maximumReach = thighLength + shinLength - .25;
  const minimumReach = Math.abs(thighLength - shinLength) + .25;
  const clampedDistance = Math.max(minimumReach, Math.min(maximumReach, distance));
  dx *= clampedDistance / distance;
  dy *= clampedDistance / distance;
  distance = clampedDistance;
  const foot: [number, number] = [hip[0] + dx, hip[1] + dy];
  const along = (thighLength ** 2 - shinLength ** 2 + distance ** 2) / (2 * distance);
  const perpendicular = Math.sqrt(Math.max(0, thighLength ** 2 - along ** 2));
  const baseX = hip[0] + (dx / distance) * along;
  const baseY = hip[1] + (dy / distance) * along;
  const offsetX = (-dy / distance) * perpendicular;
  const offsetY = (dx / distance) * perpendicular;
  const kneeA: [number, number] = [baseX + offsetX, baseY + offsetY];
  const kneeB: [number, number] = [baseX - offsetX, baseY - offsetY];
  const distanceA = Math.hypot(kneeA[0] - preferredKnee[0], kneeA[1] - preferredKnee[1]);
  const distanceB = Math.hypot(kneeB[0] - preferredKnee[0], kneeB[1] - preferredKnee[1]);
  return [hip, distanceA <= distanceB ? kneeA : kneeB, foot];
}

// 手臂两骨 IK：大臂/小臂固定骨长，preferredElbow 决定肘部弯曲方向（持枪手位由枪模实际握把/护木点驱动）。
function solveTwoBoneArm(shoulder: [number, number], hand: [number, number], preferredElbow: [number, number]): Array<[number, number]> {
  return solveTwoBoneLeg(shoulder, hand, preferredElbow, UPPER_ARM_LEN, FOREARM_LEN);
}

// 现实踢蹬四阶段（左腿踢出、右腿支撑）：①支撑腿承重、踢腿屈膝抬膝蓄力（膝抬高、小腿收起）
// ②髋部前送、膝关节伸直向前蹬踹（顶点短暂滞留）③屈膝收回 ④落地还原站架。全程固定骨长两段 IK，骨长不得拉伸。
function kickLegPose(progress: number, facing: number): Array<[number, number]> {
  const hip: [number, number] = [-5, HIP_Y];
  const restFoot: [number, number] = [-5 - facing * 6, -1];
  const restKnee: [number, number] = [-5 + facing * 12, HIP_Y + 27];
  const chamberFoot: [number, number] = [-5 + facing * 11, -25];
  const chamberKnee: [number, number] = [-5 + facing * 29, HIP_Y + 8];
  const strikeFoot: [number, number] = [-5 + facing * 63, -38];
  const strikeKnee: [number, number] = [-5 + facing * 35, HIP_Y + 14];
  let fromFoot = restFoot;
  let toFoot = chamberFoot;
  let fromKnee = restKnee;
  let toKnee = chamberKnee;
  let local = easeInOut(progress / .28);
  if (progress >= .28 && progress < .5) {
    fromFoot = chamberFoot; toFoot = strikeFoot; fromKnee = chamberKnee; toKnee = strikeKnee;
    local = easeInOut((progress - .28) / .22);
  } else if (progress >= .5 && progress < .58) {
    fromFoot = strikeFoot; toFoot = strikeFoot; fromKnee = strikeKnee; toKnee = strikeKnee;
    local = 1;
  } else if (progress >= .58 && progress < .78) {
    fromFoot = strikeFoot; toFoot = chamberFoot; fromKnee = strikeKnee; toKnee = chamberKnee;
    local = easeInOut((progress - .58) / .2);
  } else if (progress >= .78) {
    fromFoot = chamberFoot; toFoot = restFoot; fromKnee = chamberKnee; toKnee = restKnee;
    local = easeInOut((progress - .78) / .22);
  }
  return solveTwoBoneLeg(hip, mixPoint(fromFoot, toFoot, local), mixPoint(fromKnee, toKnee, local));
}

function zombieSmashArmPose(progress: number, facing: number, side: number): Array<[number, number]> {
  const rest: Array<[number, number]> = [[side * 12, SHOULDER_Y], [facing * 18 + side * 2, -79], [facing * 38 + side * 2, -67]];
  const raised: Array<[number, number]> = [[side * 12, SHOULDER_Y], [-facing * 8 + side * 3, -107], [facing * 2 + side * 5, -121]];
  const impact: Array<[number, number]> = [[side * 12, SHOULDER_Y], [facing * 19 + side * 2, -87], [facing * 42 + side * 3, -63]];
  let from = rest;
  let to = raised;
  let local = easeInOut(progress / .36);
  if (progress >= .36 && progress < .62) {
    from = raised; to = impact; local = easeInOut((progress - .36) / .26);
  } else if (progress >= .62) {
    from = impact; to = rest; local = easeInOut((progress - .62) / .38);
  }
  return from.map((point, index) => mixPoint(point, to[index], local));
}

function zombieRecoveryLegPose(progress: number, facing: number, hipX: number): Array<[number, number]> {
  const crouch = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
  return [
    [hipX, HIP_Y],
    [hipX + facing * (7 + 15 * crouch), -30 + 16 * crouch],
    [hipX + facing * (3 + 9 * crouch), -1],
  ];
}

function zombieRecoveryArmPose(progress: number, facing: number, side: number): Array<[number, number]> {
  const support: Array<[number, number]> = [[side * 12, SHOULDER_Y], [facing * 24 + side * 5, -71], [facing * 34 + side * 9, -42]];
  const push: Array<[number, number]> = [[side * 12, SHOULDER_Y], [facing * 19 + side * 7, -68], [facing * 28 + side * 10, -31]];
  const rest = zombieSmashArmPose(0, facing, side);
  if (progress < .55) return support.map((point, index) => mixPoint(point, push[index], easeInOut(progress / .55)));
  return push.map((point, index) => mixPoint(point, rest[index], easeInOut((progress - .55) / .45)));
}

function zombieDeathLegPose(progress: number, facing: number, hipX: number): Array<[number, number]> {
  const standing = standingLegPose(facing, hipX);
  const kneeling: Array<[number, number]> = [[hipX, HIP_Y], [hipX + facing * 18, -27], [hipX + facing * 9, -6]];
  const slack: Array<[number, number]> = [[hipX, HIP_Y], [hipX - facing * 7, -33], [hipX - facing * 23, -13]];
  if (progress < .5) return mixPose(standing, kneeling, easeInOut(progress / .5));
  return mixPose(kneeling, slack, easeInOut((progress - .5) / .5));
}

function zombieDeathArmPose(progress: number, facing: number, side: number): Array<[number, number]> {
  const rest = zombieSmashArmPose(0, facing, side);
  const brace: Array<[number, number]> = [[side * 12, SHOULDER_Y], [facing * 24 + side * 3, -72], [facing * 41 + side * 5, -44]];
  const slack: Array<[number, number]> = [[side * 12, SHOULDER_Y], [facing * 15 + side * 5, -79], [facing * 27 + side * 8, -63]];
  if (progress < .62) return mixPose(rest, brace, easeInOut(progress / .62));
  return mixPose(brace, slack, easeInOut((progress - .62) / .38));
}

// 僵尸服装套系：低饱和写实配色；bareArms=无袖（袖子取肤色），bareFeet=赤脚（鞋子取肤色）
const ZOMBIE_OUTFITS: Array<{ style: ZombieOutfitStyle; top: string; pantsRear: string; pantsFront: string; shoes: string; bareArms?: boolean; bareFeet?: boolean }> = [
  { style: "shirt", top: "#5d6b74", pantsRear: "#2c3029", pantsFront: "#3c4038", shoes: "#241f1a" },       // 灰蓝衬衫 + 深灰长裤
  { style: "tee", top: "#6b4f4a", pantsRear: "#2e3a46", pantsFront: "#3d4c5b", shoes: "#2a2622" },         // 暗红 T 恤 + 牛仔裤
  { style: "suit", top: "#3b3f45", pantsRear: "#2b2e33", pantsFront: "#3a3e44", shoes: "#1c1a18" },        // 炭灰破损西装
  { style: "work", top: "#5c5642", pantsRear: "#3a382c", pantsFront: "#4c493a", shoes: "#262019" },        // 卡其工装
  { style: "vest", top: "#8a8578", pantsRear: "#33352d", pantsFront: "#464840", shoes: "#2b241d", bareArms: true }, // 脏白汗背心（露臂）
  { style: "patient", top: "#8d9ba0", pantsRear: "#6e7c82", pantsFront: "#829099", shoes: "#8a8578", bareFeet: true }, // 病号服（赤脚）
  { style: "police", top: "#2c3a4c", pantsRear: "#232c38", pantsFront: "#303c4b", shoes: "#1a1c1e" },      // 警服残片
  { style: "jacket", top: "#4c4a3a", pantsRear: "#2d2f2a", pantsFront: "#3f4239", shoes: "#211d19" },      // 连帽夹克
];

// 十六进制色小幅明度抖动：同一套系内每只僵尸配色略有差异
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = channel((n >> 16) & 255), g = channel((n >> 8) & 255), b = channel(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// 确定性伪随机（按僵尸 id 取裂口位置等，避免逐帧闪烁）
function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// 生成时确定一套服装：随机套系 + 各通道明度抖动 + 随机破损程度，此后不再变化
function randomZombieOutfit(skin: string): ZombieOutfit {
  const base = ZOMBIE_OUTFITS[Math.floor(Math.random() * ZOMBIE_OUTFITS.length)];
  const jitter = () => 0.88 + Math.random() * 0.24;
  const top = shade(base.top, jitter());
  return {
    style: base.style,
    top,
    sleeve: base.bareArms ? skin : shade(base.top, jitter() * 0.94),
    pantsRear: shade(base.pantsRear, jitter()),
    pantsFront: shade(base.pantsFront, jitter()),
    shoes: base.bareFeet ? skin : shade(base.shoes, jitter()),
    wear: 0.3 + Math.random() * 0.7,
  };
}

function drawZombieLegAssembly(ctx: CanvasRenderingContext2D, zombie: Zombie, rearLeg: Array<[number, number]>, frontLeg: Array<[number, number]>, scale: number) {
  const outfit = zombie.outfit;
  // 突变/重甲腿更粗壮；重甲腿覆甲片色
  const legWidth = (zombie.kind === "mutant" ? 8.6 : zombie.kind === "juggernaut" ? 8.2 : 7) * scale;
  const pantsRear = zombie.kind === "juggernaut" ? "#31383c" : outfit.pantsRear;
  const pantsFront = zombie.kind === "juggernaut" ? "#3d4448" : outfit.pantsFront;
  if (!zombie.missingLimbs.has("leftLeg")) drawLimb(ctx, scalePoints(rearLeg, scale), legWidth, pantsRear, "#171b17");
  if (!zombie.missingLimbs.has("rightLeg")) drawLimb(ctx, scalePoints(frontLeg, scale), legWidth, pantsFront, "#1d211d");
  if (!zombie.missingLimbs.has("leftLeg")) drawFoot(ctx, [rearLeg[2][0] * scale, rearLeg[2][1] * scale], 1, 13 * scale, outfit.shoes);
  if (!zombie.missingLimbs.has("rightLeg")) drawFoot(ctx, [frontLeg[2][0] * scale, frontLeg[2][1] * scale], 1, 13 * scale, outfit.shoes);
  ctx.fillStyle = "#5f3632";
  if (!zombie.missingLimbs.has("leftLeg")) { roundedRect(ctx, (rearLeg[1][0] - 5) * scale, (rearLeg[1][1] - 4) * scale, 9 * scale, 7 * scale, 2 * scale); ctx.fill(); }
  ctx.fillStyle = "#651018";
  if (zombie.missingLimbs.has("leftLeg")) { ctx.beginPath(); ctx.arc(-5 * scale, HIP_Y * scale, 5.6 * scale, 0, Math.PI * 2); ctx.fill(); }
  if (zombie.missingLimbs.has("rightLeg")) { ctx.beginPath(); ctx.arc(5 * scale, HIP_Y * scale, 5.6 * scale, 0, Math.PI * 2); ctx.fill(); }
}

/** 磷燃灼烧火焰：附着躯干/肩头的 5 簇分层泪滴焰，90ms 步进抖动 + 连续正弦摇摆，仅活僵尸调用（尸体不烧） */
function drawZombieIgnition(ctx: CanvasRenderingContext2D, zombie: Zombie, scale: number, now: number) {
  const anchors: Array<[number, number, number]> = [
    [0, -72, 15], [-9, -88, 12], [8, -60, 11], [2, -100, 10], [-4, -116, 8],
  ];
  const step = Math.floor(now / 90);
  ctx.save();
  for (let k = 0; k < anchors.length; k++) {
    const [ax, ay, base] = anchors[k];
    const flick = .7 + .55 * hash01(step + zombie.id * 13.7 + k * 41.3);
    const h = base * flick * scale;
    const w = h * .52;
    const sway = Math.sin(now / 130 + k * 2.1 + zombie.id) * 1.6 * scale;
    const x = ax * scale + sway;
    const y = ay * scale;
    // 外层橙焰
    ctx.fillStyle = "rgba(227,106,47,.78)";
    ctx.beginPath();
    ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * .9, y - h * .62, x + sway * .6, y - h);
    ctx.quadraticCurveTo(x + w * .9, y - h * .62, x + w, y); ctx.closePath(); ctx.fill();
    // 中层金焰
    ctx.fillStyle = "rgba(240,160,46,.85)";
    ctx.beginPath();
    ctx.moveTo(x - w * .62, y); ctx.quadraticCurveTo(x - w * .55, y - h * .42, x + sway * .4, y - h * .68);
    ctx.quadraticCurveTo(x + w * .55, y - h * .42, x + w * .62, y); ctx.closePath(); ctx.fill();
    // 内芯亮黄
    ctx.fillStyle = "rgba(246,209,70,.9)";
    ctx.beginPath();
    ctx.moveTo(x - w * .3, y); ctx.quadraticCurveTo(x - w * .26, y - h * .22, x + sway * .2, y - h * .36);
    ctx.quadraticCurveTo(x + w * .26, y - h * .22, x + w * .3, y); ctx.closePath(); ctx.fill();
  }
  // 两缕余烬烟
  for (let k = 0; k < 2; k++) {
    const t = (now / 1400 + k * .5 + hash01(zombie.id * 7.7)) % 1;
    ctx.fillStyle = `rgba(72,70,66,${.3 * (1 - t)})`;
    ctx.beginPath();
    ctx.arc((Math.sin(now / 500 + k * 3) * 6) * scale, (-104 - t * 34) * scale, (3 + t * 5) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 全身金属盾牌（脚到头）：手持与地面遗留共用同一几何（中心原点），保证任何状态尺寸一致 */
function drawMetalShieldBody(ctx: CanvasRenderingContext2D, scale: number) {
  // 盾体：18 宽 × 144 高的拉丝钢板
  const steel = ctx.createLinearGradient(-9 * scale, 0, 9 * scale, 0);
  steel.addColorStop(0, "#3a424b");
  steel.addColorStop(.45, "#6b7887");
  steel.addColorStop(.55, "#7d8b9b");
  steel.addColorStop(1, "#333a43");
  ctx.fillStyle = steel;
  roundedRect(ctx, -9 * scale, -72 * scale, 18 * scale, 144 * scale, 4 * scale); ctx.fill();
  // 纵向拉丝纹理
  ctx.strokeStyle = "rgba(200,214,226,.16)"; ctx.lineWidth = 1 * scale;
  for (let x = -5; x <= 5; x += 5) { ctx.beginPath(); ctx.moveTo(x * scale, -68 * scale); ctx.lineTo(x * scale, 68 * scale); ctx.stroke(); }
  // 金属包边 + 四角铆钉
  ctx.strokeStyle = "#22282e"; ctx.lineWidth = 2.4 * scale;
  roundedRect(ctx, -9 * scale, -72 * scale, 18 * scale, 144 * scale, 4 * scale); ctx.stroke();
  ctx.fillStyle = "#15191d";
  for (const [rx, ry] of [[-6, -66], [6, -66], [-6, 66], [6, 66]] as Array<[number, number]>) { ctx.beginPath(); ctx.arc(rx * scale, ry * scale, 1.6 * scale, 0, Math.PI * 2); ctx.fill(); }
  // 横向加强筋
  ctx.strokeStyle = "rgba(24,30,36,.85)"; ctx.lineWidth = 1.6 * scale;
  ctx.beginPath();
  ctx.moveTo(-8 * scale, -30 * scale); ctx.lineTo(8 * scale, -30 * scale);
  ctx.moveTo(-8 * scale, 20 * scale); ctx.lineTo(8 * scale, 20 * scale);
  ctx.stroke();
  // 观察窗（中心 y = -47·scale；手持平移 -70 后恰与僵尸眼部 y=-117 平行）：深色防弹玻璃 + 上缘反光
  ctx.fillStyle = "#0d1319";
  roundedRect(ctx, -5 * scale, -50 * scale, 10 * scale, 6 * scale, 1.5 * scale); ctx.fill();
  ctx.strokeStyle = "#1f262d"; ctx.lineWidth = 1.2 * scale;
  roundedRect(ctx, -5 * scale, -50 * scale, 10 * scale, 6 * scale, 1.5 * scale); ctx.stroke();
  ctx.fillStyle = "rgba(214,228,238,.4)";
  ctx.fillRect(-3.5 * scale, -49 * scale, 4 * scale, 1.4 * scale);
}

/** 盾牌战损 overlay：弹孔凹陷按真实命中点累积；裂纹/崩边按剩余 HP 分四档（0 完好 → 3 濒临碎裂）。
 *  形状由 hash01(zombie.id …) 确定性生成，逐帧渲染不闪烁；新增弹孔会让裂纹自然"生长" */
function drawShieldDamage(ctx: CanvasRenderingContext2D, zombie: Zombie, scale: number) {
  // 弹孔：深色凹坑 + 上缘金属翻边高光
  for (const dent of zombie.shieldDents) {
    ctx.fillStyle = "rgba(10,13,17,.85)";
    ctx.beginPath();
    ctx.ellipse(dent.x * scale, dent.y * scale, 2.4 * scale, 1.9 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(208,220,230,.5)";
    ctx.lineWidth = .7 * scale;
    ctx.beginPath();
    ctx.arc(dent.x * scale, dent.y * scale, 3 * scale, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
  }
  const tier = zombie.shieldHp > SHIELD_HP * .75 ? 0 : zombie.shieldHp > SHIELD_HP * .5 ? 1 : zombie.shieldHp > SHIELD_HP * .25 ? 2 : 3;
  if (tier === 0) return;
  // 裂纹：从既有弹孔（无弹孔则取盾面伪随机点）向外辐射的折线
  const crackCount = tier + 1;
  ctx.strokeStyle = "rgba(12,16,20,.8)";
  ctx.lineWidth = 1 * scale;
  for (let i = 0; i < crackCount; i++) {
    const anchor = zombie.shieldDents.length > 0
      ? zombie.shieldDents[i % zombie.shieldDents.length]
      : { x: (hash01(zombie.id * 3.7 + i) - .5) * 10, y: -50 + hash01(zombie.id * 8.9 + i * 7) * 100 };
    let cx = anchor.x;
    let cy = anchor.y;
    let a = hash01(zombie.id * 13.37 + i * 7.1) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx * scale, cy * scale);
    const segments = 3 + Math.floor(hash01(zombie.id * 5.1 + i * 31) * 3);
    for (let s = 0; s < segments; s++) {
      const len = (5 + hash01(zombie.id * 3.3 + i * 11 + s * 5) * 8) * (1 + tier * .3);
      a += (hash01(zombie.id * 7.7 + i * 3 + s * 13) - .5) * 1.3;
      cx = Math.max(-8.4, Math.min(8.4, cx + Math.cos(a) * len));
      cy = Math.max(-70, Math.min(70, cy + Math.sin(a) * len));
      ctx.lineTo(cx * scale, cy * scale);
    }
    ctx.stroke();
  }
  // 二档起：盾缘崩缺（暗色缺口三角）
  if (tier >= 2) {
    ctx.fillStyle = "rgba(14,18,22,.9)";
    for (let i = 0; i < tier; i++) {
      const side = hash01(zombie.id * 3.1 + i * 17) > .5 ? 1 : -1;
      const ey = -62 + hash01(zombie.id * 9.4 + i * 23) * 124;
      const depth = 2 + tier + hash01(zombie.id + i * 5) * 2;
      ctx.beginPath();
      ctx.moveTo(side * 9 * scale, (ey - 4) * scale);
      ctx.lineTo(side * (9 - depth) * scale, ey * scale);
      ctx.lineTo(side * 9 * scale, (ey + 4.5) * scale);
      ctx.closePath();
      ctx.fill();
    }
  }
  // 三档（濒临碎裂）：整体压暗 + 观察窗防弹玻璃龟裂
  if (tier >= 3) {
    ctx.fillStyle = "rgba(18,22,26,.22)";
    roundedRect(ctx, -9 * scale, -72 * scale, 18 * scale, 144 * scale, 4 * scale);
    ctx.fill();
    ctx.strokeStyle = "rgba(190,205,215,.5)";
    ctx.lineWidth = .6 * scale;
    ctx.beginPath();
    ctx.moveTo(-4 * scale, -49 * scale);
    ctx.lineTo(-1 * scale, -47 * scale);
    ctx.lineTo(2.5 * scale, -49.5 * scale);
    ctx.moveTo(-1 * scale, -47 * scale);
    ctx.lineTo(1 * scale, -45 * scale);
    ctx.stroke();
  }
}

/** 盾兵僵尸的全身金属盾牌：手持于迎敌侧，脚到头（y≈+2 ~ -142）全覆盖；观察窗与眼部 (facing*22, -117) 平行，为唯一可命中位置 */
function drawZombieShield(ctx: CanvasRenderingContext2D, zombie: Zombie, scale: number, facing: number) {
  ctx.save();
  ctx.translate(facing * 22 * scale, -70 * scale);
  ctx.rotate(facing * .04);
  drawMetalShieldBody(ctx, scale);
  drawShieldDamage(ctx, zombie, scale);
  ctx.restore();
}

function drawZombieTorso(ctx: CanvasRenderingContext2D, zombie: Zombie, scale: number) {
  const outfit = zombie.outfit;
  const skin = zombie.radius > 29 ? "#6e7c52" : "#7e8c60";
  // 突变强壮僵尸：赤膊的夸张肌肉躯干（胸肌/腹肌阴影分块），不穿服装
  if (zombie.kind === "mutant") {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-17 * scale, TORSO_TOP_Y * scale); ctx.lineTo(17 * scale, TORSO_TOP_Y * scale);
    ctx.lineTo(15.5 * scale, -86 * scale); ctx.lineTo(11.5 * scale, -75 * scale); ctx.lineTo(12 * scale, HIP_Y * scale);
    ctx.lineTo(-12 * scale, HIP_Y * scale); ctx.lineTo(-11.5 * scale, -75 * scale); ctx.lineTo(-15.5 * scale, -86 * scale);
    ctx.closePath(); ctx.fill();
    // 胸肌分块与背光侧压暗
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(-6.5 * scale, -94 * scale, 6.5 * scale, 4.6 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6.5 * scale, -94 * scale, 6.5 * scale, 4.6 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(20,26,16,.6)"; ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.moveTo(0, -98 * scale); ctx.lineTo(0, -72 * scale);
    for (const ay of [-84, -78, -72]) { ctx.moveTo(-6 * scale, ay * scale); ctx.quadraticCurveTo(0, (ay + 2.4) * scale, 6 * scale, ay * scale); }
    ctx.stroke();
    ctx.fillStyle = "rgba(91,24,27,.55)";
    ctx.beginPath(); ctx.moveTo(-14 * scale, -92 * scale); ctx.lineTo(5 * scale, -82 * scale); ctx.lineTo(-6 * scale, -70 * scale); ctx.closePath(); ctx.fill();
    return;
  }
  ctx.fillStyle = outfit.top;
  // 肩—胸—腰—髋轮廓（含腰点，非直边梯形）
  ctx.beginPath();
  ctx.moveTo(-14 * scale, TORSO_TOP_Y * scale); ctx.lineTo(14 * scale, TORSO_TOP_Y * scale);
  ctx.lineTo(13 * scale, -86 * scale); ctx.lineTo(9.5 * scale, -75 * scale); ctx.lineTo(10 * scale, HIP_Y * scale);
  ctx.lineTo(-10 * scale, HIP_Y * scale); ctx.lineTo(-9.5 * scale, -75 * scale); ctx.lineTo(-13 * scale, -86 * scale);
  ctx.closePath(); ctx.fill();
  // 背光侧明度阶压暗
  ctx.fillStyle = "rgba(0,0,0,.15)";
  ctx.beginPath();
  ctx.moveTo(-13 * scale, TORSO_TOP_Y * scale); ctx.lineTo(-7 * scale, TORSO_TOP_Y * scale); ctx.lineTo(-5.5 * scale, HIP_Y * scale);
  ctx.lineTo(-10 * scale, HIP_Y * scale); ctx.lineTo(-9.5 * scale, -75 * scale); ctx.lineTo(-13 * scale, -86 * scale);
  ctx.closePath(); ctx.fill();
  // 款式细节（低饱和、平面化贴合现有骨架，不做卡通描边）
  if (outfit.style === "suit") {
    // 残存衬衫 V 领 + 领带残条 + 翻驳领斜线
    ctx.fillStyle = "#9aa0a2";
    ctx.beginPath(); ctx.moveTo(-4.5 * scale, TORSO_TOP_Y * scale); ctx.lineTo(4.5 * scale, TORSO_TOP_Y * scale); ctx.lineTo(0, (TORSO_TOP_Y + 11) * scale); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#4a3038";
    ctx.beginPath(); ctx.moveTo(-1.2 * scale, (TORSO_TOP_Y + 10) * scale); ctx.lineTo(1.4 * scale, (TORSO_TOP_Y + 10) * scale); ctx.lineTo(1 * scale, (TORSO_TOP_Y + 21) * scale); ctx.lineTo(-1.6 * scale, (TORSO_TOP_Y + 21) * scale); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(outfit.top, 0.68); ctx.lineWidth = 1.1 * scale;
    ctx.beginPath(); ctx.moveTo(-5.5 * scale, (TORSO_TOP_Y + 1) * scale); ctx.lineTo(-1.5 * scale, -86 * scale); ctx.moveTo(5.5 * scale, (TORSO_TOP_Y + 1) * scale); ctx.lineTo(1.5 * scale, -86 * scale); ctx.stroke();
  } else if (outfit.style === "work") {
    // 工装胸袋 ×2（同色系压暗）
    ctx.fillStyle = shade(outfit.top, 0.76);
    roundedRect(ctx, -11 * scale, -96 * scale, 8 * scale, 7 * scale, 1 * scale); ctx.fill();
    roundedRect(ctx, 3 * scale, -96 * scale, 8 * scale, 7 * scale, 1 * scale); ctx.fill();
  } else if (outfit.style === "police") {
    // 警徽残片 + 肩章
    ctx.fillStyle = "#8f8348";
    ctx.beginPath(); ctx.arc(6.5 * scale, -93 * scale, 1.9 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(outfit.top, 0.7);
    roundedRect(ctx, -15 * scale, (TORSO_TOP_Y - 1) * scale, 6 * scale, 2.6 * scale, 1 * scale); ctx.fill();
    roundedRect(ctx, 9 * scale, (TORSO_TOP_Y - 1) * scale, 6 * scale, 2.6 * scale, 1 * scale); ctx.fill();
  } else if (outfit.style === "patient") {
    // 病号服 V 领与系带
    ctx.strokeStyle = shade(outfit.top, 0.72); ctx.lineWidth = 1.1 * scale;
    ctx.beginPath(); ctx.moveTo(-4 * scale, TORSO_TOP_Y * scale); ctx.lineTo(0, (TORSO_TOP_Y + 8) * scale); ctx.lineTo(4 * scale, TORSO_TOP_Y * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2 * scale, -78 * scale); ctx.lineTo(2 * scale, -76 * scale); ctx.stroke();
  } else if (outfit.style === "tee") {
    // T 恤领口罗纹
    ctx.strokeStyle = shade(outfit.top, 0.7); ctx.lineWidth = 1.2 * scale;
    ctx.beginPath(); ctx.ellipse(0, (TORSO_TOP_Y + 1) * scale, 4.5 * scale, 2 * scale, 0, 0, Math.PI); ctx.stroke();
  } else if (outfit.style === "shirt") {
    // 衬衫领 V + 门襟扣
    ctx.strokeStyle = shade(outfit.top, 0.7); ctx.lineWidth = 1.1 * scale;
    ctx.beginPath(); ctx.moveTo(-4 * scale, TORSO_TOP_Y * scale); ctx.lineTo(0, (TORSO_TOP_Y + 6) * scale); ctx.lineTo(4 * scale, TORSO_TOP_Y * scale); ctx.stroke();
    ctx.fillStyle = shade(outfit.top, 0.58);
    for (const by of [-95, -87, -79]) { ctx.beginPath(); ctx.arc(0, by * scale, 0.9 * scale, 0, Math.PI * 2); ctx.fill(); }
  } else if (outfit.style === "jacket") {
    // 夹克拉链 + 垂在颈后的兜帽
    ctx.fillStyle = shade(outfit.top, 0.8);
    roundedRect(ctx, -7 * scale, (TORSO_TOP_Y - 3) * scale, 14 * scale, 5 * scale, 2 * scale); ctx.fill();
    ctx.strokeStyle = shade(outfit.top, 0.62); ctx.lineWidth = 1.1 * scale;
    ctx.beginPath(); ctx.moveTo(0, (TORSO_TOP_Y + 2) * scale); ctx.lineTo(0, HIP_Y * scale); ctx.stroke();
  } else if (outfit.style === "vest") {
    // 汗背心罗纹
    ctx.strokeStyle = shade(outfit.top, 0.82); ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    for (const ry of [-92, -84, -76]) { ctx.moveTo(-11 * scale, ry * scale); ctx.lineTo(11 * scale, ry * scale); }
    ctx.stroke();
  }
  // 破损裂口：按 id 确定性取位，wear 越高裂口越多越深，重度破损露出肤色
  const tearCount = 1 + Math.floor(outfit.wear * 2.99);
  for (let i = 0; i < tearCount; i++) {
    const tx = (hash01(zombie.id * 3 + i * 7) - 0.5) * 18;
    const ty = -100 + hash01(zombie.id * 5 + i * 11) * 28;
    ctx.fillStyle = "rgba(18,20,17,.85)";
    ctx.beginPath();
    ctx.moveTo((tx - 2.4) * scale, ty * scale); ctx.lineTo((tx + 2.2) * scale, (ty + 1) * scale); ctx.lineTo((tx - 0.5) * scale, (ty + 4 + outfit.wear * 3.5) * scale);
    ctx.closePath(); ctx.fill();
    if (outfit.wear > 0.55) {
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse((tx - 0.3) * scale, (ty + 2.4) * scale, 1.3 * scale, 1.9 * scale, 0.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = "rgba(91,24,27,.7)";
  ctx.beginPath(); ctx.moveTo(-13 * scale, -95 * scale); ctx.lineTo(7 * scale, -85 * scale); ctx.lineTo(-5 * scale, -70 * scale); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(25,31,26,.75)"; ctx.lineWidth = 1.2 * scale;
  ctx.beginPath(); ctx.moveTo(0, -97 * scale); ctx.lineTo(0, -65 * scale); ctx.moveTo(-10 * scale, -76 * scale); ctx.lineTo(-3 * scale, -74 * scale); ctx.moveTo(10 * scale, -76 * scale); ctx.lineTo(3 * scale, -74 * scale); ctx.stroke();
  ctx.fillStyle = "#262b25"; ctx.fillRect(-11 * scale, -65 * scale, 22 * scale, 3 * scale);
  // 军队/盾兵僵尸：防弹衣（深色插板背心 + 三联弹匣袋）
  if (zombie.kind === "army" || zombie.kind === "armyRunner" || zombie.kind === "shield") {
    ctx.fillStyle = "#2e3a2c";
    ctx.beginPath();
    ctx.moveTo(-12.5 * scale, (TORSO_TOP_Y + 2) * scale); ctx.lineTo(12.5 * scale, (TORSO_TOP_Y + 2) * scale);
    ctx.lineTo(11 * scale, -74 * scale); ctx.lineTo(-11 * scale, -74 * scale);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#222b21";
    for (const px of [-9.5, -3, 3.5]) { roundedRect(ctx, px * scale, -84 * scale, 5.5 * scale, 8 * scale, 1 * scale); ctx.fill(); }
    ctx.strokeStyle = "rgba(190,200,175,.28)"; ctx.lineWidth = 1 * scale;
    ctx.beginPath(); ctx.moveTo(-12 * scale, (TORSO_TOP_Y + 4) * scale); ctx.lineTo(12 * scale, (TORSO_TOP_Y + 4) * scale); ctx.stroke();
    ctx.fillStyle = "#1a211a"; ctx.fillRect(-11 * scale, -76 * scale, 22 * scale, 2.4 * scale);
  }
  // 第七关护甲僵尸：在军队防弹衣外附着整块陶瓷复合装甲，正面与侧缘清晰可见。
  if (zombie.warehouseArmor) {
    ctx.fillStyle = "#596168";
    roundedRect(ctx, -15 * scale, -104 * scale, 30 * scale, 39 * scale, 3 * scale); ctx.fill();
    ctx.strokeStyle = "#252c31"; ctx.lineWidth = 2.2 * scale; ctx.stroke();
    ctx.fillStyle = "#333b40";
    roundedRect(ctx, -13 * scale, -101 * scale, 26 * scale, 17 * scale, 2 * scale); ctx.fill();
    roundedRect(ctx, -12 * scale, -81 * scale, 24 * scale, 13 * scale, 2 * scale); ctx.fill();
    ctx.strokeStyle = "rgba(205,215,218,.35)"; ctx.lineWidth = 1.1 * scale;
    ctx.beginPath(); ctx.moveTo(-11 * scale, -83 * scale); ctx.lineTo(11 * scale, -83 * scale); ctx.stroke();
    ctx.fillStyle = "#848b8e";
    for (const [rx, ry] of [[-11, -100], [11, -100], [-10, -70], [10, -70]] as Array<[number, number]>) {
      ctx.beginPath(); ctx.arc(rx * scale, ry * scale, 1.3 * scale, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 重甲僵尸：全身厚重装甲板；只有上胸的受损胸甲可伤，腹部仍完全覆甲。
  if (zombie.kind === "juggernaut") {
    ctx.fillStyle = "#3d4448";
    ctx.beginPath();
    ctx.moveTo(-15.5 * scale, TORSO_TOP_Y * scale); ctx.lineTo(15.5 * scale, TORSO_TOP_Y * scale);
    ctx.lineTo(14 * scale, -84 * scale); ctx.lineTo(11 * scale, -70 * scale); ctx.lineTo(-11 * scale, -70 * scale); ctx.lineTo(-14 * scale, -84 * scale);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2b3134";
    ctx.fillRect(-15.5 * scale, (TORSO_TOP_Y + 3) * scale, 31 * scale, 3 * scale);
    ctx.fillRect(-13 * scale, -78 * scale, 26 * scale, 2.6 * scale);
    // 肩甲
    ctx.fillStyle = "#474f54";
    ctx.beginPath(); ctx.ellipse(-14 * scale, (TORSO_TOP_Y - 1) * scale, 6.5 * scale, 4.5 * scale, -.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14 * scale, (TORSO_TOP_Y - 1) * scale, 6.5 * scale, 4.5 * scale, .3, 0, Math.PI * 2); ctx.fill();
    // 腹部装甲板完全覆盖：独立下腹插板、加固横梁与铆钉，命中仍触发金属格挡。
    ctx.fillStyle = "#252b2f";
    roundedRect(ctx, -12.5 * scale, -78 * scale, 25 * scale, 11 * scale, 2.5 * scale); ctx.fill();
    ctx.strokeStyle = "#596166"; ctx.lineWidth = 1.2 * scale; ctx.stroke();
    ctx.fillStyle = "#747b7e";
    for (const px of [-9, 9]) { ctx.beginPath(); ctx.arc(px * scale, -72.5 * scale, 1.2 * scale, 0, Math.PI * 2); ctx.fill(); }
    // 上胸受损装甲板：视觉椭圆与实际可受伤判定共用边界，外观仍是附着在身体上的金属胸甲。
    const weakCenterY = (JUGGERNAUT_CHEST_WEAK_TOP_Y + JUGGERNAUT_CHEST_WEAK_BOTTOM_Y) / 2;
    const weakRadiusY = (JUGGERNAUT_CHEST_WEAK_BOTTOM_Y - JUGGERNAUT_CHEST_WEAK_TOP_Y) / 2;
    ctx.fillStyle = "#596267";
    ctx.beginPath(); ctx.ellipse(0, weakCenterY * scale, JUGGERNAUT_CHEST_WEAK_HALF_WIDTH * scale, weakRadiusY * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#858d90"; ctx.lineWidth = 1.4 * scale; ctx.stroke();
    ctx.fillStyle = "rgba(25,29,31,.36)";
    ctx.beginPath(); ctx.ellipse(0, weakCenterY * scale, 10.5 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#31191b"; ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.moveTo(-12 * scale, -97 * scale); ctx.lineTo(-5 * scale, -91 * scale); ctx.lineTo(-9 * scale, -84 * scale); ctx.lineTo(-4 * scale, -78 * scale);
    ctx.moveTo(12 * scale, -97 * scale); ctx.lineTo(5 * scale, -92 * scale); ctx.lineTo(9 * scale, -85 * scale); ctx.lineTo(4 * scale, -78 * scale);
    ctx.moveTo(-5 * scale, -91 * scale); ctx.lineTo(4 * scale, -88 * scale); ctx.lineTo(-2 * scale, -82 * scale);
    ctx.stroke();
    ctx.strokeStyle = "rgba(200,210,215,.3)"; ctx.lineWidth = 1 * scale;
    ctx.beginPath(); ctx.moveTo(-12 * scale, -101 * scale); ctx.lineTo(12 * scale, -101 * scale); ctx.stroke();
  }
}

function drawZombieArmAssembly(ctx: CanvasRenderingContext2D, zombie: Zombie, leftArm: Array<[number, number]>, rightArm: Array<[number, number]>, scale: number, skin: string) {
  // 突变/重甲手臂更粗壮；重甲手臂覆甲片色
  const armWidth = (zombie.kind === "mutant" ? 8.6 : zombie.kind === "juggernaut" ? 8 : 6.5) * scale;
  const sleeve = zombie.kind === "juggernaut" ? "#3d4448" : zombie.outfit.sleeve;
  if (!zombie.missingLimbs.has("leftArm")) {
    drawLimb(ctx, scalePoints(leftArm, scale), armWidth, sleeve, skin);
    drawHand(ctx, [leftArm[2][0] * scale, leftArm[2][1] * scale], [leftArm[1][0] * scale, leftArm[1][1] * scale], 7 * scale, skin);
  }
  if (!zombie.missingLimbs.has("rightArm")) {
    drawLimb(ctx, scalePoints(rightArm, scale), armWidth, sleeve, skin);
    drawHand(ctx, [rightArm[2][0] * scale, rightArm[2][1] * scale], [rightArm[1][0] * scale, rightArm[1][1] * scale], 7 * scale, skin);
  }
  ctx.fillStyle = "#651018";
  if (zombie.missingLimbs.has("leftArm")) { ctx.beginPath(); ctx.arc(-12 * scale, SHOULDER_Y * scale, 5.2 * scale, 0, Math.PI * 2); ctx.fill(); }
  if (zombie.missingLimbs.has("rightArm")) { ctx.beginPath(); ctx.arc(12 * scale, SHOULDER_Y * scale, 5.2 * scale, 0, Math.PI * 2); ctx.fill(); }
}

function drawZombieHeadAndWounds(ctx: CanvasRenderingContext2D, zombie: Zombie, scale: number, facing: number, alive: boolean) {
  const skin = zombie.radius > 29 ? "#6e7c52" : "#7e8c60";
  // 颈部：连接躯干与头部的短柱段（明确宽度、有棱角，非圆球接头）
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-5 * scale, -100 * scale); ctx.lineTo(5 * scale, -100 * scale); ctx.lineTo(3.8 * scale, -110 * scale); ctx.lineTo(-3.8 * scale, -110 * scale);
  ctx.closePath(); ctx.fill();
  // 头部：颅形多边形（颅顶—前额—鼻梁—松垂下颌—后脑），面部朝 facing
  ctx.beginPath();
  ctx.moveTo(facing * -9 * scale, -118 * scale);
  ctx.lineTo(facing * -7.5 * scale, -125 * scale);
  ctx.lineTo(facing * -1 * scale, -128 * scale);
  ctx.lineTo(facing * 5.5 * scale, -126 * scale);
  ctx.lineTo(facing * 8.5 * scale, -121 * scale);
  ctx.lineTo(facing * 9 * scale, -117 * scale);
  ctx.lineTo(facing * 7.5 * scale, -114.5 * scale);
  ctx.lineTo(facing * 8 * scale, -112 * scale);
  ctx.lineTo(facing * 5 * scale, -108.5 * scale);
  ctx.lineTo(0, -107 * scale);
  ctx.lineTo(facing * -5 * scale, -109.5 * scale);
  ctx.closePath(); ctx.fill();
  const fullHelmet = zombie.kind === "helmet" || zombie.kind === "helmetRunner";
  const visorHelmet = zombie.kind === "juggernaut";
  const combatHelmet = zombie.kind === "army" || zombie.kind === "armyRunner" || zombie.kind === "shield";
  if (fullHelmet) {
    // 摩托车头盔：全包式盔体只露眼睛观察缝（观察缝为唯一爆头位）
    ctx.fillStyle = "#23272b";
    ctx.beginPath();
    ctx.moveTo(facing * -10 * scale, -111 * scale);
    ctx.lineTo(facing * -9.5 * scale, -126 * scale);
    ctx.lineTo(facing * -2 * scale, -131 * scale);
    ctx.lineTo(facing * 6.5 * scale, -128.5 * scale);
    ctx.lineTo(facing * 10 * scale, -122 * scale);
    ctx.lineTo(facing * 10 * scale, -111 * scale);
    ctx.quadraticCurveTo(facing * 6 * scale, -105.5 * scale, 0, -105.5 * scale);
    ctx.quadraticCurveTo(facing * -6 * scale, -105.5 * scale, facing * -10 * scale, -111 * scale);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(210,220,228,.25)"; ctx.lineWidth = 1.2 * scale;
    ctx.beginPath(); ctx.arc(0, -120 * scale, 8.5 * scale, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
    ctx.fillStyle = "#0c0e10";
    roundedRect(ctx, (facing > 0 ? 0.5 : -11.5) * scale, -121.5 * scale, 11 * scale, 5 * scale, 2 * scale); ctx.fill();
    if (alive) {
      ctx.fillStyle = "#d7b94e"; ctx.beginPath(); ctx.arc(facing * 4.2 * scale, -119 * scale, 1.1 * scale, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = "#352c24"; ctx.lineWidth = 1.1 * scale;
      ctx.beginPath();
      ctx.moveTo(facing * 2.6 * scale, -121 * scale); ctx.lineTo(facing * 6 * scale, -117.5 * scale);
      ctx.moveTo(facing * 6 * scale, -121 * scale); ctx.lineTo(facing * 2.6 * scale, -117.5 * scale);
      ctx.stroke();
    }
  } else if (visorHelmet) {
    // 重甲面甲：整体钢盔 + 一字窄观察缝（ purely 装饰；重甲弱点在胸口）
    ctx.fillStyle = "#454d52";
    ctx.beginPath();
    ctx.moveTo(facing * -10 * scale, -110 * scale);
    ctx.lineTo(facing * -9.5 * scale, -126 * scale);
    ctx.lineTo(facing * -2 * scale, -131 * scale);
    ctx.lineTo(facing * 6.5 * scale, -128.5 * scale);
    ctx.lineTo(facing * 10 * scale, -122 * scale);
    ctx.lineTo(facing * 10 * scale, -110 * scale);
    ctx.lineTo(facing * 6 * scale, -106 * scale);
    ctx.lineTo(facing * -6 * scale, -106 * scale);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#14181b";
    roundedRect(ctx, (facing > 0 ? 0 : -10) * scale, -122 * scale, 10 * scale, 3.2 * scale, 1.4 * scale); ctx.fill();
    if (alive) { ctx.fillStyle = "#e8c85a"; ctx.fillRect((facing > 0 ? 4 : -5.6) * scale, -121.2 * scale, 1.6 * scale, 1.6 * scale); }
    ctx.strokeStyle = "rgba(205,215,222,.3)"; ctx.lineWidth = 1.1 * scale;
    ctx.beginPath(); ctx.moveTo(facing * -8 * scale, -126 * scale); ctx.lineTo(facing * 5 * scale, -128 * scale); ctx.stroke();
    ctx.fillStyle = "#31383c"; ctx.fillRect(facing * -10 * scale, -111 * scale, 20 * scale, 3 * scale);
  } else {
    // 腐坏发际贴颅顶与后侧
    ctx.fillStyle = "#30352c";
    ctx.beginPath();
    ctx.moveTo(facing * -9.5 * scale, -118 * scale);
    ctx.lineTo(facing * -8 * scale, -126 * scale);
    ctx.lineTo(facing * -1 * scale, -129 * scale);
    ctx.lineTo(facing * 5.5 * scale, -127 * scale);
    ctx.lineTo(facing * 8.5 * scale, -122 * scale);
    ctx.lineTo(facing * 5 * scale, -124.5 * scale);
    ctx.lineTo(facing * -2 * scale, -126.5 * scale);
    ctx.lineTo(facing * -7 * scale, -122.5 * scale);
    ctx.closePath(); ctx.fill();
    if (alive) {
      ctx.fillStyle = "#d7b94e"; ctx.beginPath(); ctx.arc(facing * 5.5 * scale, -119 * scale, 1.15 * scale, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = "#352c24"; ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.moveTo(facing * 4 * scale, -121 * scale); ctx.lineTo(facing * 7 * scale, -117 * scale);
      ctx.moveTo(facing * 7 * scale, -121 * scale); ctx.lineTo(facing * 4 * scale, -117 * scale);
      ctx.stroke();
    }
    // 松垂口腔（呕吐僵尸与巨型变异 Boss 为肿胀的绿色毒喉）
    const toxicMouth = zombie.kind === "spitter" || zombie.kind === "largeSpitter" || zombie.bossKind === "giantMutant";
    ctx.fillStyle = toxicMouth ? "#5e9a2e" : "#5d171b";
    ctx.beginPath();
    ctx.moveTo(facing * 4 * scale, -113 * scale); ctx.lineTo(facing * 8 * scale, -112.5 * scale); ctx.lineTo(facing * 5 * scale, -109.5 * scale);
    ctx.closePath(); ctx.fill();
    if (toxicMouth) {
      ctx.fillStyle = "rgba(94,154,46,.75)";
      ctx.beginPath(); ctx.ellipse(facing * 3 * scale, -106.5 * scale, 4.2 * scale, 2.8 * scale, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 军队/盾兵僵尸：军用头盔（穹顶 + 帽檐，面部外露）
    if (combatHelmet) {
      ctx.fillStyle = "#39432f";
      ctx.beginPath();
      ctx.moveTo(facing * -9.8 * scale, -119 * scale);
      ctx.lineTo(facing * -8.5 * scale, -127 * scale);
      ctx.lineTo(facing * -1 * scale, -130.5 * scale);
      ctx.lineTo(facing * 6.5 * scale, -128 * scale);
      ctx.lineTo(facing * 9.8 * scale, -119 * scale);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2c3524";
      ctx.fillRect((facing > 0 ? 4 : -12) * scale, -120.6 * scale, 8 * scale, 2.2 * scale);
      ctx.strokeStyle = "rgba(190,200,175,.22)"; ctx.lineWidth = 1 * scale;
      ctx.beginPath(); ctx.moveTo(facing * -7 * scale, -126 * scale); ctx.lineTo(facing * 4 * scale, -128.2 * scale); ctx.stroke();
    }
  }
  for (const wound of zombie.wounds) {
    const woundX = wound.x * scale;
    const woundY = wound.y * scale;
    const woundSize = wound.size * scale;
    // 凹陷弹孔：暗红创缘外圈 + 近黑凹陷中心，中心偏下以表现深度
    ctx.fillStyle = wound.region === "head" ? "#3d0a10" : "#4a0d13";
    ctx.beginPath(); ctx.ellipse(woundX, woundY, woundSize, woundSize * .68, .3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#14060a";
    ctx.beginPath(); ctx.ellipse(woundX, woundY + woundSize * .1, woundSize * .55, woundSize * .4, .3, 0, Math.PI * 2); ctx.fill();
    // 创缘翻卷受光侧
    ctx.strokeStyle = "rgba(140,22,32,.75)"; ctx.lineWidth = Math.max(.8, .9 * scale);
    ctx.beginPath(); ctx.ellipse(woundX, woundY - woundSize * .12, woundSize * .8, woundSize * .5, .3, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    if (wound.bone) {
      // 同区域多次命中后露出骨骼：白茬从凹陷中心向外支棱
      const jitter = (Math.abs(wound.x * 7 + wound.y * 13) % 10) / 10;
      ctx.strokeStyle = "#d8d4c4"; ctx.lineWidth = Math.max(1, 1.4 * scale); ctx.lineCap = "round";
      for (let s = 0; s < 3; s++) {
        const a = -1.15 + s * 0.85 + jitter * 0.5;
        ctx.beginPath();
        ctx.moveTo(woundX, woundY);
        ctx.lineTo(woundX + Math.cos(a) * woundSize * 1.25, woundY + Math.sin(a) * woundSize * 1.25);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    }
    ctx.strokeStyle = "rgba(24,8,8,.92)"; ctx.lineWidth = Math.max(1, 1.15 * scale);
    ctx.beginPath(); ctx.moveTo(woundX - woundSize * .8, woundY - woundSize * .15); ctx.lineTo(woundX + woundSize * .85, woundY + woundSize * .2);
    if (wound.region === "head") {
      ctx.moveTo(woundX, woundY); ctx.lineTo(woundX + woundSize * .7, woundY - woundSize * .85);
      ctx.moveTo(woundX, woundY); ctx.lineTo(woundX - woundSize * .55, woundY + woundSize * .75);
    } else if (wound.region === "legs") {
      ctx.moveTo(woundX - woundSize * .55, woundY + woundSize * .55); ctx.lineTo(woundX + woundSize * .45, woundY - woundSize * .65);
    }
    ctx.stroke();
  }
}

function zombieDogLunge(zombie: Zombie, now: number) {
  const attackAge = now - zombie.lastHit;
  return attackAge >= 0 && attackAge < 560 ? Math.sin(Math.min(1, attackAge / 560) * Math.PI) : 0;
}

function drawZombieDog(ctx: CanvasRenderingContext2D, zombie: Zombie, scale: number, facing: number, now: number) {
  const gait = Math.sin(now / 68 + zombie.wobble * Math.PI * 2);
  const lunge = zombieDogLunge(zombie, now);
  const skin = "#667150";
  const dark = "#30372d";
  ctx.save();
  ctx.translate(facing * lunge * 13 * scale, -lunge * 5 * scale);
  // 四足骨架：前后腿交替摆动；断肢字段继续复用公共结构损伤系统。
  const legs: Array<{ limb: ZombieLimb; x: number; phase: number }> = [
    { limb: "leftLeg", x: -20, phase: gait }, { limb: "rightLeg", x: -11, phase: -gait },
    { limb: "leftArm", x: 13, phase: -gait }, { limb: "rightArm", x: 22, phase: gait },
  ];
  ctx.strokeStyle = dark; ctx.lineWidth = 7 * scale; ctx.lineCap = "round";
  for (const leg of legs) {
    if (zombie.missingLimbs.has(leg.limb)) continue;
    const kneeX = leg.x + facing * leg.phase * 4;
    const pawX = leg.x - facing * leg.phase * 7;
    ctx.beginPath(); ctx.moveTo(leg.x * scale, -45 * scale); ctx.lineTo(kneeX * scale, -23 * scale); ctx.lineTo(pawX * scale, -3 * scale); ctx.stroke();
    ctx.fillStyle = "#1d211c"; ctx.beginPath(); ctx.ellipse((pawX + facing * 4) * scale, -2 * scale, 7 * scale, 3 * scale, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 水平胸腔与突出的肩胛，保留低饱和感染皮肤和破损血肉。
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(0, -54 * scale, 31 * scale, 17 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(-8 * scale, -49 * scale, 20 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(35,44,30,.7)"; ctx.lineWidth = 1.4 * scale;
  for (let rib = -12; rib <= 10; rib += 7) { ctx.beginPath(); ctx.moveTo(rib * scale, -64 * scale); ctx.quadraticCurveTo((rib - 4) * scale, -54 * scale, rib * scale, -45 * scale); ctx.stroke(); }
  // 尾部与犬首：攻击时前探张嘴，区别于人形僵尸但继续使用同一受击、血液和倒地链。
  ctx.strokeStyle = skin; ctx.lineWidth = 6 * scale; ctx.beginPath(); ctx.moveTo(-27 * scale, -58 * scale); ctx.quadraticCurveTo(-43 * scale, -70 * scale, -48 * scale, -52 * scale); ctx.stroke();
  const headX = facing * (31 + lunge * 7);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(headX * scale, -65 * scale, 15 * scale, 13 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo((headX - facing * 9) * scale, -74 * scale); ctx.lineTo((headX - facing * 4) * scale, -90 * scale); ctx.lineTo((headX + facing * 2) * scale, -75 * scale); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#151915"; ctx.beginPath(); ctx.ellipse((headX + facing * 13) * scale, -62 * scale, 10 * scale, (5 + lunge * 4) * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c54b3c"; ctx.beginPath(); ctx.ellipse((headX + facing * 10) * scale, (-59 + lunge * 3) * scale, 6 * scale, 2.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#d5b65a"; ctx.beginPath(); ctx.arc((headX + facing * 4) * scale, -69 * scale, 2.2 * scale, 0, Math.PI * 2); ctx.fill();
  for (const wound of zombie.wounds) {
    // 犬首伤口以“面向前方”的规范坐标保存，渲染时随当前朝向镜像，转身后仍贴在头上。
    const woundX = wound.region === "head" ? facing * wound.x : wound.x;
    ctx.fillStyle = "#33070b";
    ctx.beginPath(); ctx.ellipse(woundX * scale, wound.y * scale, wound.size * scale, wound.size * .65 * scale, .2, 0, Math.PI * 2); ctx.fill();
    if (wound.bone) { ctx.strokeStyle = "#d5d0bd"; ctx.lineWidth = 1.2 * scale; ctx.beginPath(); ctx.moveTo((woundX - 3) * scale, wound.y * scale); ctx.lineTo((woundX + 4) * scale, (wound.y - 2) * scale); ctx.stroke(); }
  }
  ctx.restore();
}

function drawZombieCorpse(ctx: CanvasRenderingContext2D, corpse: ZombieCorpse, now: number) {
  const zombie = corpse.zombie;
  const scale = (zombie.radius / 25) * CHARACTER_SCALE;
  const progress = Math.max(0, Math.min(1, (now - corpse.diedAt) / ZOMBIE_DEATH_FALL_MS));
  const stagger = easeInOut(Math.min(1, progress / .2));
  const collapse = easeInOut(Math.max(0, Math.min(1, (progress - .12) / .34)));
  const fall = easeInOut(Math.max(0, Math.min(1, (progress - .36) / .55)));
  const facing = corpse.fallFacing;
  const skin = zombie.radius > 29 ? "#6e7c52" : "#7e8c60";
  const poseBlend = easeInOut(Math.min(1, progress / .62));
  const rearLeg = mixPose(corpse.startPose.rearLeg, zombieDeathLegPose(collapse, facing, -5), poseBlend);
  const frontLeg = mixPose(corpse.startPose.frontLeg, zombieDeathLegPose(Math.max(0, collapse - .08), facing, 5), poseBlend);
  const leftArm = mixPose(corpse.startPose.leftArm, zombieDeathArmPose(fall, facing, -1), poseBlend);
  const rightArm = mixPose(corpse.startPose.rightArm, zombieDeathArmPose(Math.max(0, fall - .08), facing, 1), poseBlend);
  const transformBlend = easeInOut(progress);
  const targetOriginX = zombie.x - facing * (10 * stagger + 58 * fall) * scale;
  const targetOriginY = zombie.y + (13 * collapse * (1 - fall) - 6 * fall) * scale;
  const originX = corpse.startPose.originX + (targetOriginX - corpse.startPose.originX) * transformBlend;
  const originY = corpse.startPose.originY + (targetOriginY - corpse.startPose.originY) * transformBlend;
  const targetRotation = facing * Math.PI / 2 * fall;
  const rotation = corpse.startPose.rotation + (targetRotation - corpse.startPose.rotation) * transformBlend;
  const horizontalFactor = Math.abs(Math.sin(rotation));

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath(); ctx.ellipse(zombie.x - facing * 29 * scale * horizontalFactor, zombie.y + 5, (24 + 49 * horizontalFactor) * scale, (7 + 3 * horizontalFactor) * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(originX, originY);
  ctx.rotate(rotation);

  if (zombie.kind === "zombieDog") drawZombieDog(ctx, zombie, scale, facing, now);
  else {
    drawZombieLegAssembly(ctx, zombie, rearLeg, frontLeg, scale);
    drawZombieTorso(ctx, zombie, scale);
    drawZombieArmAssembly(ctx, zombie, leftArm, rightArm, scale, skin);
    drawZombieHeadAndWounds(ctx, zombie, scale, facing, false);
  }
  ctx.restore();
}

function zombieKnockPose(zombie: Zombie, now: number): ZombieKnockPose {
  const scale = (zombie.radius / 25) * CHARACTER_SCALE;
  if (zombie.knockedDownAt <= 0 || now >= zombie.knockedDownUntil + ZOMBIE_RECOVER_MS) {
    return { active: false, recovering: false, fallProgress: 0, recoveryProgress: 0, refallRecoveryProgress: 0, rotation: 0, pivotX: zombie.x, pivotY: zombie.y };
  }
  const fallProgress = Math.max(0, Math.min(1, (now - zombie.knockedDownAt) / ZOMBIE_FALL_MS));
  const recovering = now >= zombie.knockedDownUntil;
  const recoveryProgress = recovering ? Math.max(0, Math.min(1, (now - zombie.knockedDownUntil) / ZOMBIE_RECOVER_MS)) : 0;
  const rotationFactor = recovering
    ? 1 - easeInOut(recoveryProgress)
    : zombie.knockStartFactor + (1 - zombie.knockStartFactor) * easeInOut(fallProgress);
  const fallEase = easeInOut(fallProgress);
  const lift = recovering
    ? Math.sin(recoveryProgress * Math.PI) * 8 * scale
    : (zombie.knockStartLift * (1 - fallEase) + Math.sin(fallProgress * Math.PI) * 5) * scale;
  return {
    active: true,
    recovering,
    fallProgress,
    recoveryProgress,
    refallRecoveryProgress: zombie.knockStartRecoveryProgress,
    rotation: zombie.knockFacing * Math.PI / 2 * rotationFactor,
    pivotX: zombie.x - zombie.knockFacing * 58 * scale * rotationFactor,
    pivotY: zombie.y - 6 * scale * rotationFactor - lift,
  };
}

function zombieRenderPose(zombie: Zombie, now: number, playerX: number): ZombieRenderPose {
  const knockPose = zombieKnockPose(zombie, now);
  // 僵尸步态：与人物同一 gaitLegPose 骨架，步频更慢、步幅/抬脚更小（拖沓感），相位 180° 交替
  const gaitCycle = (((now / 300 + zombie.wobble) % 1) + 1) % 1;
  const zFacing = playerX < zombie.x ? -1 : 1;
  const poseFacing = knockPose.active ? zombie.knockFacing : zFacing;
  const scale = (zombie.radius / 25) * CHARACTER_SCALE;
  const missingLegCount = Number(zombie.missingLimbs.has("leftLeg")) + Number(zombie.missingLimbs.has("rightLeg"));
  const zombieAttackAge = now - zombie.lastHit;
  const zombieAttackDuration = now < zombie.debuffedUntil ? 1020 : 560;
  const zombieAttackProgress = !knockPose.active && zombieAttackAge >= 0 && zombieAttackAge < zombieAttackDuration ? zombieAttackAge / zombieAttackDuration : 0;
  let rearLeg = knockPose.recovering
    ? zombieRecoveryLegPose(knockPose.recoveryProgress, poseFacing, -5)
    : knockPose.active
      ? standingLegPose(poseFacing, -5)
      : gaitLegPose((gaitCycle + 0.5) % 1, poseFacing, -5, 7, 3.5);
  let frontLeg = knockPose.recovering
    ? zombieRecoveryLegPose(knockPose.recoveryProgress, poseFacing, 5)
    : knockPose.active
      ? standingLegPose(poseFacing, 5)
      : gaitLegPose(gaitCycle, poseFacing, 5, 7, 3.5);
  let leftArm = knockPose.recovering ? zombieRecoveryArmPose(knockPose.recoveryProgress, poseFacing, -1) : zombieSmashArmPose(zombieAttackProgress, poseFacing, -1);
  let rightArm = knockPose.recovering ? zombieRecoveryArmPose(Math.max(0, knockPose.recoveryProgress - .04), poseFacing, 1) : zombieSmashArmPose(Math.max(0, zombieAttackProgress - .035), poseFacing, 1);
  if (!knockPose.recovering && knockPose.refallRecoveryProgress > 0) {
    const refallBlend = easeInOut(knockPose.fallProgress);
    rearLeg = mixPose(zombieRecoveryLegPose(knockPose.refallRecoveryProgress, poseFacing, -5), standingLegPose(poseFacing, -5), refallBlend);
    frontLeg = mixPose(zombieRecoveryLegPose(knockPose.refallRecoveryProgress, poseFacing, 5), standingLegPose(poseFacing, 5), refallBlend);
    leftArm = mixPose(zombieRecoveryArmPose(knockPose.refallRecoveryProgress, poseFacing, -1), zombieSmashArmPose(0, poseFacing, -1), refallBlend);
    rightArm = mixPose(zombieRecoveryArmPose(Math.max(0, knockPose.refallRecoveryProgress - .04), poseFacing, 1), zombieSmashArmPose(0, poseFacing, 1), refallBlend);
  }
  return {
    knockPose,
    poseFacing,
    scale,
    body: {
      originX: knockPose.active ? knockPose.pivotX : zombie.x,
      originY: knockPose.active ? knockPose.pivotY : zombie.y + (missingLegCount === 2 ? 58 * scale : 0),
      rotation: knockPose.active ? knockPose.rotation : 0,
      rearLeg,
      frontLeg,
      leftArm,
      rightArm,
    },
  };
}

function drawWeaponModel(ctx: CanvasRenderingContext2D, key: WeaponKey, scale = 1, hideMagazine = false, cycleOffset = 0, cylinderSpin = 0, boltCycle = 0) {
  // 拳脚：不绘制任何武器模型（赤手空拳，手臂由人物骨架绘制）
  if (key === "fists") return;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const metal = "#171c1a";
  const steel = "#48504b";
  const highlight = "#7b847d";
  const polymer = "#242a27";
  const wood = "#7c5133";
  const accent = WEAPONS[key].color;

  if (KNIFE_WEAPONS.has(key)) {
    const combat = key === "combatknife";
    const bladeEnd = combat ? 74 : 58;
    ctx.fillStyle = "#333a36";
    roundedRect(ctx, combat ? -7 : -5, combat ? -6 : -5, combat ? 27 : 22, combat ? 12 : 10, 3);
    ctx.fill();
    ctx.fillStyle = "#c6cec9";
    ctx.beginPath();
    ctx.moveTo(combat ? 18 : 14, combat ? -7 : -5);
    ctx.lineTo(bladeEnd - 8, combat ? -4 : -2);
    ctx.lineTo(bladeEnd, 0);
    ctx.lineTo(bladeEnd - 10, combat ? 7 : 6);
    ctx.lineTo(combat ? 18 : 14, combat ? 6 : 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f1f4ee";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(combat ? 29 : 24, 2);
    ctx.lineTo(bladeEnd - 6, 2);
    ctx.stroke();
    if (combat) {
      ctx.strokeStyle = "#515a54"; ctx.lineWidth = 1;
      for (let x = 25; x < 44; x += 5) { ctx.beginPath(); ctx.moveTo(x, -7); ctx.lineTo(x + 3, -3); ctx.stroke(); }
    }
    ctx.fillStyle = accent;
    ctx.fillRect(combat ? 15 : 11, combat ? -9 : -7, combat ? 5 : 4, combat ? 18 : 14);
    ctx.restore();
    return;
  }

  if (key === "baseballbat") {
    const woodGradient = ctx.createLinearGradient(-8, -5, 90, 5);
    woodGradient.addColorStop(0, "#4d2c1c");
    woodGradient.addColorStop(.22, "#98613a");
    woodGradient.addColorStop(.65, "#c28b55");
    woodGradient.addColorStop(1, "#835033");
    ctx.fillStyle = woodGradient;
    ctx.beginPath();
    ctx.moveTo(-8, -4); ctx.lineTo(15, -5); ctx.lineTo(67, -10); ctx.quadraticCurveTo(90, -11, 92, 0);
    ctx.quadraticCurveTo(90, 11, 67, 10); ctx.lineTo(15, 5); ctx.lineTo(-8, 4); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(240,211,172,.45)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(16, -3); ctx.lineTo(78, -7); ctx.stroke();
    ctx.fillStyle = "#211b16"; roundedRect(ctx, -10, -6, 24, 12, 4); ctx.fill();
    ctx.strokeStyle = "#6e5d4b"; ctx.lineWidth = 1;
    for (let x = -6; x < 12; x += 4) { ctx.beginPath(); ctx.moveTo(x, -5); ctx.lineTo(x + 3, 5); ctx.stroke(); }
    ctx.restore();
    return;
  }

  if (key === "crowbar") {
    const barGradient = ctx.createLinearGradient(-8, -7, 92, 7);
    barGradient.addColorStop(0, "#4a1114"); barGradient.addColorStop(.5, "#a62f32"); barGradient.addColorStop(1, "#551518");
    ctx.strokeStyle = barGradient; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(77, 0); ctx.quadraticCurveTo(90, -1, 91, -14); ctx.stroke();
    ctx.strokeStyle = "#d26460"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(77, -3); ctx.stroke();
    ctx.fillStyle = "#2d0c0e"; roundedRect(ctx, -9, -4, 18, 12, 3); ctx.fill();
    ctx.restore();
    return;
  }

  if (key === "hammer") {
    const handleGradient = ctx.createLinearGradient(-10, -4, 76, 4);
    handleGradient.addColorStop(0, "#47301f"); handleGradient.addColorStop(.55, "#9b6a3d"); handleGradient.addColorStop(1, "#5b3922");
    ctx.strokeStyle = handleGradient; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(69, 0); ctx.stroke();
    ctx.fillStyle = "#313735"; roundedRect(ctx, 62, -18, 24, 36, 4); ctx.fill();
    ctx.fillStyle = "#69716c"; roundedRect(ctx, 64, -16, 20, 7, 2); ctx.fill();
    ctx.fillStyle = "#242927"; roundedRect(ctx, -11, -6, 22, 12, 3); ctx.fill();
    ctx.restore();
    return;
  }

  if (key === "fireaxe") {
    const handleGradient = ctx.createLinearGradient(-12, -4, 91, 4);
    handleGradient.addColorStop(0, "#4b1615"); handleGradient.addColorStop(.5, "#d43f35"); handleGradient.addColorStop(1, "#6f1f1b");
    ctx.strokeStyle = handleGradient; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(89, 0); ctx.stroke();
    ctx.fillStyle = "#3c4440";
    ctx.beginPath(); ctx.moveTo(82,-22);ctx.lineTo(101,-17);ctx.lineTo(95,0);ctx.lineTo(101,17);ctx.lineTo(82,22);ctx.lineTo(76,7);ctx.lineTo(76,-7);ctx.closePath();ctx.fill();
    ctx.strokeStyle = "#9aa39d";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(84,-19);ctx.lineTo(96,-15);ctx.moveTo(84,19);ctx.lineTo(96,15);ctx.stroke();
    ctx.fillStyle="#2a1110";roundedRect(ctx,-13,-6,24,12,3);ctx.fill();
    ctx.restore();
    return;
  }

  if (key === "glock17") {
    // 套筒（换弹拉栓时整体后坐，露出枪管节套）
    ctx.fillStyle = metal;
    roundedRect(ctx, -4 * cycleOffset, -8, 39, 12, 2);
    ctx.fill();
    ctx.fillStyle = steel;
    ctx.fillRect(5 - 4 * cycleOffset, -6, 25, 2);
    if (cycleOffset > 0.05) { ctx.fillStyle = "#3a423d"; ctx.fillRect(33, -4, 9, 5); }
    // 握把（弹匣内藏其中）：相对套筒轴线后倾约 107°（Glock 真实握把角），底部为弹匣底板
    ctx.fillStyle = polymer;
    ctx.beginPath();
    ctx.moveTo(10, 3);
    ctx.lineTo(22, 3);
    ctx.lineTo(16, 22);
    ctx.lineTo(5, 21);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0d100e";
    ctx.fillRect(4, 20.5, 14, 3.2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(30, -5, 6, 4);
    ctx.fillStyle = "#080a09";
    ctx.fillRect(38, -5, 7, 4);
  }

  if (key === "m1911") {
    ctx.fillStyle = "#555d58";
    roundedRect(ctx, -4 * cycleOffset, -8, 42, 11, 2);
    ctx.fill();
    ctx.fillStyle = highlight;
    ctx.fillRect(5 - 4 * cycleOffset, -6, 29, 2);
    if (cycleOffset > 0.05) { ctx.fillStyle = "#39413c"; ctx.fillRect(36, -4, 8, 5); }
    // 握把后倾约 107°（1911 与 Glock 同为后倾握把，并非与套筒垂直）
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(11, 2); ctx.lineTo(23, 2); ctx.lineTo(17, 22); ctx.lineTo(6, 21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0d100e";
    ctx.fillRect(5, 20.5, 14, 3.2);
    ctx.fillStyle = metal;
    ctx.fillRect(41, -5, 7, 4);
    ctx.fillRect(-4, -7, 6, 5); ctx.fillRect(18, 3, 8, 3);
    // 外露击锤（1911 标志性尾锤，待击时翘起）
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(-6.5, -7.5); ctx.lineTo(-5, -10.5); ctx.lineTo(1.5, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(28, -8, 4, 2);
  }

  if (key === "mp5k") {
    ctx.fillStyle = polymer;
    ctx.beginPath();
    ctx.moveTo(-13, -4); ctx.lineTo(1, -9); ctx.lineTo(6, -5); ctx.lineTo(1, 5); ctx.lineTo(-12, 4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metal;
    roundedRect(ctx, 0, -10, 43, 18, 4);
    ctx.fill();
    ctx.fillStyle = steel;
    ctx.fillRect(6, -7, 29, 3);
    if (!hideMagazine) {
      ctx.fillStyle = "#121614";
      ctx.beginPath();
      ctx.moveTo(15, 7); ctx.lineTo(26, 7); ctx.lineTo(28, 28); ctx.lineTo(19, 29); ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = polymer;
    roundedRect(ctx, 35, 5, 8, 19, 2);
    ctx.fill();
    // 后握把（MP5K 无枪托，尾板 + 手枪握把）
    ctx.fillStyle = polymer;
    ctx.beginPath();
    ctx.moveTo(3, 6); ctx.lineTo(14, 6); ctx.lineTo(12, 22); ctx.lineTo(4, 21); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metal;
    ctx.fillRect(42, -5, 22, 6);
    ctx.fillRect(62, -7, 7, 10);
    // 准星护圈与准星柱
    ctx.strokeStyle = steel;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(65, -9, 4, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = steel;
    ctx.fillRect(64, -11, 2, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(28, -10, 5, 3);
  }

  if (key === "mac11") {
    ctx.fillStyle = metal;
    roundedRect(ctx, -4, -11, 47, 20, 3); ctx.fill();
    ctx.fillStyle = steel; ctx.fillRect(2, -8, 32, 3);
    // 顶部拉机钮槽（MAC-11 特征）
    ctx.fillStyle = "#0a0d0b"; ctx.fillRect(-1, -13, 22, 3);
    ctx.fillStyle = "#101311"; ctx.fillRect(42, -5, 24, 6); ctx.fillRect(63, -8, 7, 12);
    // 弹匣内藏于握把
    if (!hideMagazine) { ctx.fillStyle = polymer; ctx.fillRect(10, 7, 12, 29); ctx.fillStyle = "#0d100e"; ctx.fillRect(9, 34, 14, 3); }
    ctx.strokeStyle = highlight; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(-21, -5); ctx.stroke();
    ctx.fillStyle = accent; ctx.fillRect(31, -11, 5, 3);
  }

  if (key === "ak47") {
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(-31, -8); ctx.lineTo(-6, -7); ctx.lineTo(2, -3); ctx.lineTo(-4, 6); ctx.lineTo(-29, 9); ctx.lineTo(-36, 4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metal;
    roundedRect(ctx, -3, -9, 39, 17, 2);
    ctx.fill();
    ctx.fillStyle = highlight;
    ctx.fillRect(3, -6, 23, 2);
    if (!hideMagazine) {
      ctx.fillStyle = "#111513";
      ctx.beginPath();
      ctx.moveTo(9, 7); ctx.lineTo(23, 7); ctx.quadraticCurveTo(29, 21, 20, 29); ctx.lineTo(11, 27); ctx.quadraticCurveTo(19, 18, 9, 7); ctx.fill();
    }
    ctx.fillStyle = wood;
    roundedRect(ctx, 34, -7, 24, 13, 4);
    ctx.fill();
    // 上护木与导气管（长行程导气活塞，官方特征）
    ctx.fillStyle = wood;
    ctx.fillRect(34, -12, 24, 4);
    ctx.fillStyle = steel;
    ctx.fillRect(56, -11, 26, 3);
    ctx.fillStyle = metal;
    ctx.fillRect(57, -4, 30, 5);
    // 准星座（导气箍前）与准星柱
    ctx.fillStyle = metal;
    ctx.fillRect(76, -9, 5, 8);
    ctx.fillRect(77, -15, 2.4, 7);
    // 表尺座与通条
    ctx.fillStyle = steel;
    ctx.fillRect(34, -13, 7, 3);
    ctx.strokeStyle = steel;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(58, 4); ctx.lineTo(86, 4); ctx.stroke();
    // 斜切枪口制退器（AK 标志性右上斜切）
    ctx.fillStyle = "#20261f";
    ctx.beginPath();
    ctx.moveTo(85, -7); ctx.lineTo(94, -10); ctx.lineTo(96, -3); ctx.lineTo(88, 1); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#5a635c";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(89, -8); ctx.lineTo(91, -1); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(37, 3, 18, 2);
  }

  if (key === "m16" || key === "m4") {
    ctx.fillStyle = polymer;
    ctx.beginPath(); ctx.moveTo(-37,-8); ctx.lineTo(-7,-8); ctx.lineTo(2,-3); ctx.lineTo(-6,7); ctx.lineTo(-34,8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = metal; roundedRect(ctx, -4, -9, 43, 17, 2); ctx.fill();
    ctx.strokeStyle = steel; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(3,-10); ctx.lineTo(15,-19); ctx.lineTo(29,-19); ctx.lineTo(36,-9); ctx.stroke();
    if (!hideMagazine) { ctx.fillStyle = "#141816"; ctx.beginPath(); ctx.moveTo(10,7); ctx.lineTo(23,7); ctx.quadraticCurveTo(26.5,18,22,29); ctx.lineTo(11,29); ctx.quadraticCurveTo(16.5,18,10,7); ctx.closePath(); ctx.fill(); }
    // A2 圆护木（筋条）与三角形准星座
    ctx.fillStyle = polymer; roundedRect(ctx, 37,-7,27,13,3); ctx.fill();
    ctx.strokeStyle = "#10140f"; ctx.lineWidth = 1.2;
    for (let x = 42; x < 62; x += 6) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x, 5); ctx.stroke(); }
    ctx.fillStyle = metal; ctx.fillRect(62,-4,34,5);
    ctx.fillStyle = polymer;
    ctx.beginPath(); ctx.moveTo(82,-4); ctx.lineTo(86,-17); ctx.lineTo(90,-4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = metal; ctx.fillRect(85,-16,2,9);
    // A2 鸟笼消焰器（周向开槽、底部封闭）
    ctx.fillStyle = "#23291f";
    roundedRect(ctx, 95, -5, 10, 7, 2); ctx.fill();
    ctx.strokeStyle = "#0b0e0a"; ctx.lineWidth = 1.1;
    for (let x = 97; x < 104; x += 2.6) { ctx.beginPath(); ctx.moveTo(x, -5); ctx.lineTo(x, 1); ctx.stroke(); }
    ctx.fillStyle = "#23291f"; ctx.fillRect(95, 1, 10, 2);
    ctx.fillStyle = accent; ctx.fillRect(43,2,17,2);
  }

  if (key === "scarh") {
    ctx.fillStyle = "#8b7455";
    ctx.beginPath(); ctx.moveTo(-38,-9); ctx.lineTo(-10,-10); ctx.lineTo(1,-4); ctx.lineTo(-5,7); ctx.lineTo(-34,9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#9b835f"; roundedRect(ctx,-5,-11,48,20,3); ctx.fill();
    ctx.fillStyle = metal; ctx.fillRect(2,-8,35,5); ctx.fillRect(41,-5,47,7);
    if (!hideMagazine) { ctx.fillStyle="#171b19"; ctx.beginPath(); ctx.moveTo(11,8);ctx.lineTo(27,8);ctx.quadraticCurveTo(29.5,19,25,30);ctx.lineTo(12,30);ctx.quadraticCurveTo(17,19,11,8);ctx.closePath();ctx.fill(); }
    ctx.strokeStyle=highlight;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-2,-12);ctx.lineTo(64,-12);ctx.stroke();
    // 折叠准星与三叉消焰器
    ctx.fillStyle = metal; ctx.fillRect(82,-11,4,8);
    ctx.fillStyle = "#20261f"; ctx.fillRect(88,-6,10,9);
    ctx.strokeStyle = "#0b0e0a"; ctx.lineWidth = 1.1;
    for (let x = 90; x < 97; x += 2.6) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x, 3); ctx.stroke(); }
    ctx.fillStyle=accent;ctx.fillRect(47,3,18,3);
  }

  if (key === "saiga12") {
    ctx.fillStyle = polymer;
    ctx.beginPath();
    ctx.moveTo(-31, -7); ctx.lineTo(-5, -8); ctx.lineTo(2, -4); ctx.lineTo(-4, 6); ctx.lineTo(-29, 8); ctx.lineTo(-36, 3); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metal;
    roundedRect(ctx, -3, -10, 42, 18, 3);
    ctx.fill();
    if (!hideMagazine) {
      // Saiga-12 弹匣：继承 AK 系明显的前倾弧度
      ctx.fillStyle = "#0e1210";
      ctx.beginPath();
      ctx.moveTo(10, 7); ctx.lineTo(26, 7); ctx.quadraticCurveTo(31, 18, 24, 27); ctx.lineTo(12, 26); ctx.quadraticCurveTo(19, 17, 10, 7);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = polymer;
    roundedRect(ctx, 37, -8, 27, 14, 3);
    ctx.fill();
    ctx.fillStyle = metal;
    ctx.fillRect(63, -4, 34, 6);
    ctx.fillRect(95, -6, 10, 10);
    ctx.strokeStyle = highlight;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(3, -6); ctx.lineTo(31, -6); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(47, 2, 12, 2);
  }

  if (key === "sawedoff") {
    ctx.fillStyle = wood;
    ctx.beginPath(); ctx.moveTo(-31,-9);ctx.lineTo(-5,-8);ctx.lineTo(2,-3);ctx.lineTo(-5,7);ctx.lineTo(-28,10);ctx.closePath();ctx.fill();
    ctx.fillStyle = metal; roundedRect(ctx,-3,-9,34,18,3); ctx.fill();
    ctx.fillStyle = "#202522"; ctx.fillRect(29,-7,43,5); ctx.fillRect(29,2,43,5);
    ctx.fillStyle = "#0a0d0b"; ctx.beginPath();ctx.arc(73,-4.5,3.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(73,4.5,3.5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle = highlight; ctx.lineWidth = 1.5; ctx.beginPath();ctx.moveTo(4,-6);ctx.lineTo(25,-6);ctx.moveTo(4,6);ctx.lineTo(25,6);ctx.stroke();
    ctx.fillStyle = wood; ctx.beginPath();ctx.moveTo(1,7);ctx.lineTo(12,8);ctx.lineTo(9,25);ctx.lineTo(1,23);ctx.closePath();ctx.fill();
  }

  if (key === "rem870") {
    ctx.fillStyle = wood;
    ctx.beginPath(); ctx.moveTo(-38,-8);ctx.lineTo(-5,-7);ctx.lineTo(2,-3);ctx.lineTo(-5,6);ctx.lineTo(-35,9);ctx.closePath();ctx.fill();
    ctx.fillStyle=metal;roundedRect(ctx,-3,-8,38,15,3);ctx.fill();
    // 泵动滑套（前手位，换弹/上膛时后拉 10 单位行程）
    const pumpX = 34 - 10 * cycleOffset;
    ctx.fillStyle=wood;roundedRect(ctx,pumpX,-7,28,13,4);ctx.fill();
    ctx.strokeStyle="#4c2a19";ctx.lineWidth=1.3;
    for (let x = pumpX + 5; x < pumpX + 25; x += 4) { ctx.beginPath(); ctx.moveTo(x, -5); ctx.lineTo(x, 4); ctx.stroke(); }
    ctx.fillStyle=metal;ctx.fillRect(61,-4,51,5);ctx.fillRect(61,3,42,3);
    // 弹仓管帽与枪管珠形准星
    ctx.fillStyle="#0d110e";ctx.fillRect(101,1,5,6);
    ctx.fillStyle=metal;ctx.fillRect(109,-6,8,9);
    ctx.fillStyle="#c9cdd2";ctx.fillRect(112,-8,2.5,3);
    ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pumpX + 5,2);ctx.lineTo(pumpX + 23,2);ctx.stroke();
  }

  if (key === "awm" || key === "m107") {
    ctx.fillStyle="#708064";
    ctx.beginPath();ctx.moveTo(-42,-10);ctx.lineTo(-8,-10);ctx.lineTo(5,-4);ctx.lineTo(-1,8);ctx.lineTo(-18,9);ctx.quadraticCurveTo(-10,20,-24,21);ctx.lineTo(-38,12);ctx.closePath();ctx.fill();
    ctx.fillStyle=metal;roundedRect(ctx,-4,-9,43,17,3);ctx.fill();
    if(!hideMagazine){ctx.fillStyle="#101412";ctx.fillRect(9,7,15,22);}
    ctx.fillStyle="#1b211e";roundedRect(ctx,5,-22,38,8,3);ctx.fill();ctx.fillRect(10,-25,4,14);ctx.fillRect(35,-25,4,14);
    // 凹槽重型枪管（官方 27″ fluted barrel）
    ctx.fillStyle=metal;ctx.fillRect(37,-4,67,5);
    ctx.strokeStyle="#0d110e";ctx.lineWidth=1;
    for(let x=42;x<98;x+=9){ctx.beginPath();ctx.moveTo(x,-4.5);ctx.lineTo(x,0.5);ctx.stroke();}
    // 双室枪口制退器（two-chamber muzzle brake）
    ctx.fillStyle="#20261f";roundedRect(ctx,102,-6,12,9,2);ctx.fill();
    ctx.strokeStyle="#0b0e0a";ctx.lineWidth=1.4;
    ctx.beginPath();ctx.moveTo(106,-6);ctx.lineTo(106,3);ctx.moveTo(110,-6);ctx.lineTo(110,3);ctx.stroke();
    ctx.strokeStyle=steel;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(76,1);ctx.lineTo(66,18);ctx.moveTo(78,1);ctx.lineTo(89,18);ctx.stroke();
    ctx.fillStyle=accent;ctx.fillRect(-1,3,10,3);
  }

  if (key === "flint66") {
    // 燧石66 半自动反器材步枪：加重长枪管 + 双室制退器 + 两脚架 + 大容量弹匣 + 高倍瞄准镜
    ctx.fillStyle = "#3d3a35";
    ctx.beginPath(); ctx.moveTo(-44,-10); ctx.lineTo(-9,-10); ctx.lineTo(4,-4); ctx.lineTo(-2,8); ctx.lineTo(-19,9); ctx.quadraticCurveTo(-11,20,-25,21); ctx.lineTo(-40,12); ctx.closePath(); ctx.fill();
    // 托腮板与橡胶托底板
    ctx.fillStyle = "#2c2a26"; ctx.fillRect(-30,-13,17,4);
    ctx.fillStyle = "#171512"; ctx.fillRect(-46,-9,4,20);
    ctx.fillStyle = metal; roundedRect(ctx,-6,-10,50,19,3); ctx.fill();
    if (!hideMagazine) { ctx.fillStyle = "#101412"; ctx.fillRect(10,8,17,24); ctx.fillStyle = "#1c201d"; ctx.fillRect(9,30,19,3); }
    // 高倍瞄准镜与镜架
    ctx.fillStyle = "#1b211e"; roundedRect(ctx,2,-24,44,9,3); ctx.fill();
    ctx.fillRect(8,-27,5,15); ctx.fillRect(37,-27,5,15);
    ctx.fillStyle = "#2e4a55"; ctx.beginPath(); ctx.arc(46,-19.5,3.4,0,Math.PI*2); ctx.fill();
    // 凹槽重型长枪管（散热筋）
    ctx.fillStyle = metal; ctx.fillRect(42,-5,78,6);
    ctx.strokeStyle = "#0d110e"; ctx.lineWidth = 1;
    for (let x = 48; x < 114; x += 10) { ctx.beginPath(); ctx.moveTo(x,-5.5); ctx.lineTo(x,0.5); ctx.stroke(); }
    // 磷燃标识环（枪口前方橙色识别带，磷燃穿甲弹特征）
    ctx.fillStyle = "#c96f3b"; ctx.fillRect(104,-5.5,5,7);
    // 双室枪口制退器
    ctx.fillStyle = "#20261f"; roundedRect(ctx,118,-7,14,11,2); ctx.fill();
    ctx.strokeStyle = "#0b0e0a"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(123,-7); ctx.lineTo(123,4); ctx.moveTo(127,-7); ctx.lineTo(127,4); ctx.stroke();
    // 两脚架（收放位）
    ctx.strokeStyle = steel; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(86,1); ctx.lineTo(75,19); ctx.moveTo(89,1); ctx.lineTo(101,19); ctx.stroke();
    ctx.fillStyle = accent; ctx.fillRect(-2,3,11,3);
  }

  if (key === "m240l" || key === "mg42") {
    ctx.fillStyle=polymer;ctx.beginPath();ctx.moveTo(-39,-9);ctx.lineTo(-8,-9);ctx.lineTo(2,-3);ctx.lineTo(-4,8);ctx.lineTo(-35,9);ctx.closePath();ctx.fill();
    ctx.fillStyle=metal;roundedRect(ctx,-4,-12,51,22,3);ctx.fill();
    if(!hideMagazine){ctx.fillStyle="#3c4039";roundedRect(ctx,7,8,27,27,3);ctx.fill();}
    // 机匣顶部提把
    ctx.strokeStyle=steel;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(6,-13);ctx.lineTo(14,-19);ctx.lineTo(30,-19);ctx.lineTo(36,-13);ctx.stroke();
    ctx.fillStyle=polymer;roundedRect(ctx,44,-8,31,15,3);ctx.fill();ctx.fillStyle=metal;ctx.fillRect(72,-4,45,6);
    // 消焰器开槽与准星
    ctx.fillStyle="#20261f";ctx.fillRect(115,-7,12,12);
    ctx.strokeStyle="#0b0e0a";ctx.lineWidth=1.2;
    for(let y=-4;y<4;y+=3){ctx.beginPath();ctx.moveTo(116,y);ctx.lineTo(126,y);ctx.stroke();}
    ctx.fillStyle=metal;ctx.fillRect(112,-11,3,6);
    ctx.strokeStyle=steel;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(100,1);ctx.lineTo(88,24);ctx.moveTo(104,1);ctx.lineTo(116,24);ctx.stroke();
    ctx.fillStyle=accent;ctx.fillRect(50,3,19,3);
  }

  if (key === "pkm") {
    ctx.fillStyle = wood;
    ctx.beginPath(); ctx.moveTo(-42,-10);ctx.lineTo(-12,-9);ctx.lineTo(-2,-3);ctx.lineTo(-8,7);ctx.lineTo(-39,10);ctx.lineTo(-31,3);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#c08a55";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-35,-6);ctx.lineTo(-12,-5);ctx.moveTo(-35,6);ctx.lineTo(-12,5);ctx.stroke();
    ctx.fillStyle=metal;roundedRect(ctx,-5,-13,53,23,3);ctx.fill();
    ctx.fillStyle="#555e58";roundedRect(ctx,2,-16,40,7,2);ctx.fill();
    ctx.strokeStyle=highlight;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(5,-12);ctx.lineTo(38,-12);ctx.moveTo(30,-8);ctx.lineTo(43,-3);ctx.stroke();
    if(!hideMagazine){ctx.fillStyle="#3d4038";roundedRect(ctx,9,8,29,29,4);ctx.fill();ctx.strokeStyle="#74786b";ctx.lineWidth=1;for(let y=14;y<33;y+=5){ctx.beginPath();ctx.moveTo(13,y);ctx.lineTo(34,y);ctx.stroke();}}
    ctx.fillStyle=wood;ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(13,8);ctx.lineTo(10,27);ctx.lineTo(1,25);ctx.closePath();ctx.fill();
    ctx.fillStyle="#232926";roundedRect(ctx,45,-8,30,15,3);ctx.fill();
    ctx.fillStyle=metal;ctx.fillRect(72,-5,51,7);ctx.fillRect(119,-8,11,13);
    ctx.fillStyle="#343a36";ctx.fillRect(74,3,45,4);
    ctx.strokeStyle=steel;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(98,1);ctx.lineTo(84,25);ctx.moveTo(101,1);ctx.lineTo(115,25);ctx.stroke();
    ctx.strokeStyle="#858d87";ctx.lineWidth=2;ctx.beginPath();ctx.arc(55,-11,17,Math.PI,0);ctx.stroke();
    ctx.fillStyle=accent;ctx.fillRect(49,3,20,3);
  }

  if (key === "rpg7") {
    // 尾部喇叭喷口（bell nozzle，火箭弹离筒前的燃气扩张段）
    ctx.fillStyle = metal;
    ctx.beginPath(); ctx.moveTo(-44, -9); ctx.lineTo(-30, -5); ctx.lineTo(-30, 5); ctx.lineTo(-44, 9); ctx.closePath(); ctx.fill();
    // 发射筒（筒口止于 66，PG-7V 弹头整体外露于筒口前方，仅尾杆插入筒内）
    ctx.fillStyle="#4d593c";roundedRect(ctx,-30,-7,96,14,5);ctx.fill();
    // PG-7V 弹头锥形装药（换弹时隐藏，由塞入动画道具替代）
    if (!hideMagazine) {
      ctx.fillStyle="#8e9259";ctx.beginPath();ctx.moveTo(66,-10.5);ctx.lineTo(95,-7);ctx.lineTo(108,0);ctx.lineTo(95,7);ctx.lineTo(66,10.5);ctx.closePath();ctx.fill();
      ctx.fillStyle="#6d7442";ctx.fillRect(60,-4,8,8);
    }
    ctx.fillStyle=metal;ctx.fillRect(-40,-5,17,10);
    // 后握把 + 扳机与隔热木护木（前手握持位）
    ctx.fillStyle=wood;roundedRect(ctx,-2,5,15,24,3);ctx.fill();
    ctx.fillStyle=metal;ctx.fillRect(13,7,4,6);
    ctx.fillStyle=wood;roundedRect(ctx,34,-10,16,8,3);ctx.fill();
    ctx.strokeStyle=highlight;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-18,-3);ctx.lineTo(52,-3);ctx.stroke();
  }

  if (key === "m32") {
    ctx.fillStyle=polymer;ctx.beginPath();ctx.moveTo(-36,-8);ctx.lineTo(-7,-8);ctx.lineTo(1,-3);ctx.lineTo(-5,7);ctx.lineTo(-34,8);ctx.closePath();ctx.fill();
    // 六发转轮（逐发装填时随 cylinderSpin 分度旋转）
    ctx.fillStyle="#343a36";ctx.beginPath();ctx.arc(17,0,17,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=highlight;ctx.lineWidth=2;for(let i=0;i<6;i++){const a=i*Math.PI/3+cylinderSpin;ctx.beginPath();ctx.arc(17+Math.cos(a)*9,Math.sin(a)*9,3,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle=metal;ctx.fillRect(30,-6,52,12);ctx.fillRect(79,-9,11,18);ctx.fillStyle=polymer;roundedRect(ctx,1,13,14,24,3);ctx.fill();
    // 立式表尺与枪管下前握把
    ctx.strokeStyle=steel;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(38,-8);ctx.lineTo(42,-16);ctx.lineTo(48,-16);ctx.lineTo(52,-8);ctx.stroke();
    ctx.fillStyle=polymer;ctx.beginPath();ctx.moveTo(48,7);ctx.lineTo(58,7);ctx.lineTo(55,21);ctx.lineTo(49,20);ctx.closePath();ctx.fill();
    ctx.fillStyle=accent;ctx.fillRect(41,3,25,3);
  }

  if (key === "gatling") {
    ctx.fillStyle=metal;roundedRect(ctx,-17,-15,45,30,5);ctx.fill();
    if(!hideMagazine){ctx.fillStyle="#4b4435";ctx.beginPath();ctx.arc(-2,20,17,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle=steel;ctx.lineWidth=3;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(25,i*4);ctx.lineTo(112,i*4);ctx.stroke();}
    ctx.fillStyle=metal;ctx.beginPath();ctx.arc(29,0,13,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(110,0,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=polymer;roundedRect(ctx,-27,9,13,27,3);ctx.fill();ctx.fillStyle=accent;ctx.fillRect(42,-9,44,3);
  }

  const pistolKeys: WeaponKey[] = ["glock17", "m1911"];
  const receiverKeys: WeaponKey[] = ["mp5k", "mac11", "ak47", "m4", "m16", "scarh", "saiga12", "awm", "m107", "flint66", "m240l", "mg42", "pkm"];
  const rifleGripKeys: WeaponKey[] = ["ak47", "m4", "m16", "scarh", "saiga12", "awm", "m107", "flint66", "m240l", "mg42", "pkm"];

  if (pistolKeys.includes(key)) {
    const length = key === "m1911" ? 48 : 45;
    ctx.fillStyle = "#090c0a";
    roundedRect(ctx, 21, -7, 11, 5, 1); ctx.fill();
    ctx.strokeStyle = "#89918b";
    ctx.lineWidth = 1;
    for (let x = 4; x <= 10; x += 2) { ctx.beginPath(); ctx.moveTo(x, -7); ctx.lineTo(x + 1, 1); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(22, 5, 7, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = "#0b0e0c";
    ctx.beginPath(); ctx.arc(length - 2, -3, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d8ded7";
    ctx.fillRect(4, -10, 3, 2); ctx.fillRect(length - 9, -10, 3, 2);
    ctx.strokeStyle = "rgba(215,223,215,.35)";
    for (let y = 7; y < 20; y += 4) { ctx.beginPath(); ctx.moveTo(9, y); ctx.lineTo(18, y + 1); ctx.stroke(); }
  }

  if (receiverKeys.includes(key)) {
    ctx.fillStyle = "#090c0b";
    roundedRect(ctx, 17, -7, 14, 6, 1); ctx.fill();
    ctx.strokeStyle = "#89918b";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(29, -9); ctx.lineTo(36, -12); ctx.stroke();
    ctx.fillStyle = "#9aa29c";
    ctx.beginPath(); ctx.arc(36, -12, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#6b736e";
    ctx.beginPath(); ctx.arc(10, 9, 8, 0, Math.PI); ctx.stroke();
    if (!hideMagazine) {
      ctx.strokeStyle = "rgba(210,218,211,.3)";
      for (let y = 12; y <= 24; y += 4) { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(24, y); ctx.stroke(); }
    }
  }

  if (rifleGripKeys.includes(key)) {
    ctx.fillStyle = key === "ak47" ? wood : polymer;
    ctx.beginPath();
    ctx.moveTo(-1, 5); ctx.lineTo(10, 6); ctx.lineTo(8, 25); ctx.lineTo(0, 23); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(230,235,229,.3)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2, 10); ctx.lineTo(8, 11); ctx.moveTo(2, 15); ctx.lineTo(7, 16); ctx.stroke();
  }

  if (["saiga12", "rem870", "m240l", "mg42", "pkm"].includes(key)) {
    const length = WEAPON_GEOMETRY[key].muzzleX;
    ctx.strokeStyle = "#737b76";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(39, -3); ctx.lineTo(length - 8, -3); ctx.stroke();
    ctx.fillStyle = "#0b0e0c";
    ctx.fillRect(length - 8, -7, 8, 11);
    ctx.strokeStyle = "#a5ada7";
    ctx.beginPath(); ctx.moveTo(length - 5, -5); ctx.lineTo(length - 5, 2); ctx.stroke();
  }

  if (key === "rem870") {
    ctx.fillStyle = "#0a0d0b"; roundedRect(ctx, 13, -7, 15, 6, 1); ctx.fill();
    ctx.strokeStyle = "#858d87"; ctx.beginPath(); ctx.arc(6, 7, 8, 0, Math.PI); ctx.stroke();
  }

  if (key === "awm" || key === "m107" || key === "flint66") {
    // 栓柄：静止时位于扳机上方机匣后段（真实栓位，随 WEAPON_HOLD.charge 点位）；拉栓循环时上抬开锁→后拉（枪机尾段外露、抛壳）→前推→下压锁定
    const charge = WEAPON_HOLD[key].charge;
    if (charge) {
      const motion = boltCycleMotion(boltCycle);
      const bx = charge.x + charge.pull[0] * .9 * motion.pull;
      const by = charge.y + 1 - 4 * motion.lift;
      if (motion.pull > 0.02) { ctx.fillStyle = "#39413c"; ctx.fillRect(charge.x - 10 + charge.pull[0] * .9 * motion.pull, charge.y - 1, 12, 5); }
      ctx.strokeStyle = "#aab2ac"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 9, by + 8); ctx.stroke();
      ctx.fillStyle = "#c7cec8"; ctx.beginPath(); ctx.arc(bx + 10, by + 9, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (key === "rpg7") {
    ctx.fillStyle = "#121612"; roundedRect(ctx, 13, -18, 20, 7, 2); ctx.fill();
    ctx.strokeStyle = "#9da59c"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(18, -11); ctx.lineTo(18, -6); ctx.moveTo(29, -11); ctx.lineTo(29, -6); ctx.stroke();
  }

  if (key === "gatling") {
    ctx.strokeStyle = "#9ba29d"; ctx.lineWidth = 1;
    for (let x = 42; x < 104; x += 13) { ctx.beginPath(); ctx.moveTo(x, -11); ctx.lineTo(x, 11); ctx.stroke(); }
    ctx.fillStyle = "#090b0a"; ctx.beginPath(); ctx.arc(112, 0, 5, 0, Math.PI * 2); ctx.fill();
  }

  if (!MELEE_WEAPONS.has(key)) {
    const geometry = WEAPON_GEOMETRY[key];
    const hasConventionalBarrel = !["rpg7", "m32", "gatling"].includes(key);
    const modelSpan = geometry.muzzleX - geometry.stockEnd;
    const measuredBarrel = REAL_BARREL_MM[key];
    const barrelStart = measuredBarrel > 0
      ? geometry.muzzleX - modelSpan * (measuredBarrel / REAL_LENGTH_MM[key])
      : geometry.barrelStart;
    if (hasConventionalBarrel) {
      const barrelGradient = ctx.createLinearGradient(barrelStart, -5, geometry.muzzleX, 4);
      barrelGradient.addColorStop(0, "rgba(142,151,145,.6)");
      barrelGradient.addColorStop(.45, "rgba(22,27,25,.9)");
      barrelGradient.addColorStop(1, "rgba(3,5,4,.98)");
      ctx.strokeStyle = barrelGradient;
      ctx.lineWidth = key === "sawedoff" ? 3.4 : 2.2;
      ctx.beginPath(); ctx.moveTo(barrelStart, -2); ctx.lineTo(geometry.muzzleX - 2, -2); ctx.stroke();
    }
    ctx.fillStyle = "#050706";
    ctx.beginPath();
    ctx.ellipse(geometry.muzzleX - .8, -2, key === "gatling" ? 4 : 2.6, key === "sawedoff" ? 4 : 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(196,204,198,.55)";
    ctx.lineWidth = .8;
    ctx.stroke();
    if (geometry.stockEnd < -10) {
      ctx.strokeStyle = "rgba(211,217,211,.28)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(geometry.stockEnd + 4, -4); ctx.lineTo(geometry.receiverStart - 3, -4); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(196,204,198,.35)";
    ctx.lineWidth = .75;
    ctx.beginPath();
    ctx.moveTo(geometry.receiverStart, -8); ctx.lineTo(geometry.receiverStart, 6);
    ctx.moveTo(geometry.receiverEnd, -8); ctx.lineTo(geometry.receiverEnd, 5);
    if (hasConventionalBarrel) { ctx.moveTo(barrelStart, -5); ctx.lineTo(barrelStart, 2); }
    ctx.stroke();
    if (!["sawedoff", "rem870", "rpg7", "m32", "gatling"].includes(key)) {
      ctx.fillStyle = "rgba(5,8,7,.82)";
      roundedRect(ctx, geometry.receiverStart + (geometry.receiverEnd - geometry.receiverStart) * .48, -7, Math.max(7, (geometry.receiverEnd - geometry.receiverStart) * .28), 5, 1);
      ctx.fill();
      ctx.strokeStyle = "rgba(185,195,188,.55)";
      ctx.lineWidth = .8;
      ctx.stroke();
    }
    // 拉机柄/枪机：换弹时按各枪真实行程后拉（AK 右侧大行程、M16 机匣后方 T 形柄、MP5K 前部拉机柄、AWM 后部栓柄）
    const charge = WEAPON_HOLD[key].charge;
    if (charge && cycleOffset > 0) {
      const hx = charge.x + charge.pull[0] * cycleOffset;
      const hy = charge.y + charge.pull[1] * cycleOffset;
      ctx.fillStyle = "#0a0d0b";
      if (key === "m16" || key === "m4") {
        // T 形拉机柄
        ctx.fillRect(hx - 5, hy - 2, 8, 4); ctx.fillRect(hx - 1, hy - 4, 3, 8);
      } else if (key === "awm" || key === "m107") {
        ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#0a0d0b"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(hx + 2, hy + 2); ctx.lineTo(hx + 6, hy + 7); ctx.stroke();
      } else {
        roundedRect(ctx, hx - 2.5, hy - 2.5, key === "ak47" || key === "saiga12" ? 9 : 7, 5, 2); ctx.fill();
      }
      ctx.strokeStyle = "rgba(160,168,162,.6)"; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.moveTo(charge.x, charge.y + 3); ctx.lineTo(charge.x + charge.pull[0], charge.y + charge.pull[1] + 3); ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(235,240,232,.24)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1, -8);
  ctx.lineTo(key === "glock17" ? 35 : 34, -8);
  ctx.stroke();
  ctx.restore();
}

const WEAPON_GEOMETRY: Record<WeaponKey, { stockEnd: number; receiverStart: number; receiverEnd: number; barrelStart: number; muzzleX: number }> = {
  glock17: { stockEnd: 0, receiverStart: 0, receiverEnd: 31, barrelStart: 31, muzzleX: 45 },
  m1911: { stockEnd: -4, receiverStart: 0, receiverEnd: 34, barrelStart: 34, muzzleX: 48 },
  pkm: { stockEnd: -42, receiverStart: -5, receiverEnd: 48, barrelStart: 72, muzzleX: 130 },
  fruitknife: { stockEnd: -5, receiverStart: -5, receiverEnd: 17, barrelStart: 17, muzzleX: 58 },
  combatknife: { stockEnd: -7, receiverStart: -7, receiverEnd: 20, barrelStart: 20, muzzleX: 74 },
  crowbar: { stockEnd: -9, receiverStart: -9, receiverEnd: 9, barrelStart: 9, muzzleX: 92 },
  hammer: { stockEnd: -11, receiverStart: -11, receiverEnd: 11, barrelStart: 11, muzzleX: 86 },
  fireaxe: { stockEnd: -13, receiverStart: -13, receiverEnd: 11, barrelStart: 11, muzzleX: 101 },
  baseballbat: { stockEnd: -10, receiverStart: -10, receiverEnd: 15, barrelStart: 15, muzzleX: 92 },
  fists: { stockEnd: -4, receiverStart: -4, receiverEnd: 8, barrelStart: 8, muzzleX: 20 },
  sawedoff: { stockEnd: -31, receiverStart: -3, receiverEnd: 31, barrelStart: 29, muzzleX: 76 },
  mac11: { stockEnd: -21, receiverStart: -4, receiverEnd: 43, barrelStart: 43, muzzleX: 70 },
  mp5k: { stockEnd: -13, receiverStart: 0, receiverEnd: 43, barrelStart: 42, muzzleX: 69 },
  ak47: { stockEnd: -36, receiverStart: -3, receiverEnd: 36, barrelStart: 57, muzzleX: 91 },
  m4: { stockEnd: -34, receiverStart: -4, receiverEnd: 39, barrelStart: 58, muzzleX: 96 },
  m16: { stockEnd: -37, receiverStart: -4, receiverEnd: 39, barrelStart: 62, muzzleX: 104 },
  scarh: { stockEnd: -38, receiverStart: -5, receiverEnd: 43, barrelStart: 41, muzzleX: 97 },
  saiga12: { stockEnd: -36, receiverStart: -3, receiverEnd: 39, barrelStart: 63, muzzleX: 105 },
  rem870: { stockEnd: -38, receiverStart: -3, receiverEnd: 35, barrelStart: 61, muzzleX: 117 },
  awm: { stockEnd: -42, receiverStart: -4, receiverEnd: 39, barrelStart: 37, muzzleX: 114 },
  m107: { stockEnd: -46, receiverStart: -5, receiverEnd: 48, barrelStart: 56, muzzleX: 140 },
  flint66: { stockEnd: -44, receiverStart: -6, receiverEnd: 44, barrelStart: 44, muzzleX: 132 },
  m240l: { stockEnd: -39, receiverStart: -4, receiverEnd: 47, barrelStart: 72, muzzleX: 127 },
  mg42: { stockEnd: -42, receiverStart: -5, receiverEnd: 50, barrelStart: 70, muzzleX: 132 },
  rpg7: { stockEnd: -40, receiverStart: -30, receiverEnd: 56, barrelStart: -30, muzzleX: 108 },
  m32: { stockEnd: -36, receiverStart: -7, receiverEnd: 34, barrelStart: 30, muzzleX: 90 },
  gatling: { stockEnd: -27, receiverStart: -17, receiverEnd: 29, barrelStart: 25, muzzleX: 120 },
};

const REAL_LENGTH_MM: Record<WeaponKey, number> = {
  glock17: 204, m1911: 216, pkm: 1192, fruitknife: 180, combatknife: 300,
  crowbar: 760, hammer: 700, fireaxe: 900, baseballbat: 860, sawedoff: 500,
  mac11: 248, mp5k: 325, ak47: 880, m4: 838, m16: 1006, scarh: 969,
  saiga12: 1145, rem870: 978, awm: 1270, m107: 1448, flint66: 1450, m240l: 1115, mg42: 1220,
  rpg7: 950, m32: 813, gatling: 801, fists: 620,
};

const REAL_BARREL_MM: Record<WeaponKey, number> = {
  glock17: 114, m1911: 127, pkm: 658, fruitknife: 0, combatknife: 0,
  crowbar: 0, hammer: 0, fireaxe: 0, baseballbat: 0, sawedoff: 300,
  mac11: 129, mp5k: 115, ak47: 415, m4: 368, m16: 508, scarh: 406.4,
  saiga12: 430, rem870: 457, awm: 686, m107: 737, flint66: 860, m240l: 551, mg42: 533,
  rpg7: 0, m32: 305, gatling: 559, fists: 0,
};

// 持枪姿势点位（模型坐标系，与 drawWeaponModel 中各配件严格对齐）：
// grip = 后手握把点，fore = 前手护木点，magWell = 弹匣井，charge = 拉机柄/枪机位置与拉动行程，
// feed = 装填口（管状弹仓/转轮/筒口）。左右手由两段 IK 按这些实际点位求解。
type WeaponStance = "pistol" | "rifle" | "rpg" | "melee1h" | "melee2h";
type ReloadKind = "none" | "mag" | "shells" | "cylinder" | "rocket";
type WeaponHold = {
  stance: WeaponStance;
  grip: [number, number];
  fore: [number, number];
  reloadKind: ReloadKind;
  magWell?: [number, number];
  charge?: { x: number; y: number; pull: [number, number] };
  feed?: [number, number];
};

const WEAPON_HOLD: Record<WeaponKey, WeaponHold> = {
  // 手枪：弹匣内藏于握把；拉栓 = 套筒整体后拉
  glock17: { stance: "pistol", grip: [11, 9], fore: [15, 12], reloadKind: "mag", magWell: [12, 16], charge: { x: 4, y: -5, pull: [-7, 0] } },
  m1911: { stance: "pistol", grip: [13, 9], fore: [17, 12], reloadKind: "mag", magWell: [13, 16], charge: { x: 5, y: -5, pull: [-7, 0] } },
  // 冲锋枪：MAC-11 弹匣内藏握把、顶部拉机钮；MP5K 前握把 + 前部拉机柄
  mac11: { stance: "rifle", grip: [15, 13], fore: [40, 5], reloadKind: "mag", magWell: [16, 18], charge: { x: 8, y: -12, pull: [-13, 0] } },
  mp5k: { stance: "rifle", grip: [9, 12], fore: [39, 15], reloadKind: "mag", magWell: [21, 20], charge: { x: 45, y: -8, pull: [-11, 0] } },
  // 步枪：AK 系右侧大行程拉机柄；M16 拉机柄在机匣后方
  ak47: { stance: "rifle", grip: [4, 12], fore: [45, 1], reloadKind: "mag", magWell: [16, 12], charge: { x: 23, y: -1, pull: [-19, 0] } },
  m4: { stance: "rifle", grip: [4, 12], fore: [47, 0], reloadKind: "mag", magWell: [17, 14], charge: { x: -1, y: -7, pull: [-10, 0] } },
  m16: { stance: "rifle", grip: [4, 12], fore: [50, 0], reloadKind: "mag", magWell: [17, 14], charge: { x: -1, y: -7, pull: [-10, 0] } },
  scarh: { stance: "rifle", grip: [5, 13], fore: [54, 1], reloadKind: "mag", magWell: [19, 15], charge: { x: 36, y: -9, pull: [-15, 0] } },
  saiga12: { stance: "rifle", grip: [4, 12], fore: [49, 0], reloadKind: "mag", magWell: [18, 13], charge: { x: 24, y: -1, pull: [-19, 0] } },
  awm: { stance: "rifle", grip: [4, 12], fore: [50, 2], reloadKind: "mag", magWell: [16, 14], charge: { x: 20, y: -3, pull: [-11, -1] } },
  m107: { stance: "rifle", grip: [4, 12], fore: [60, 2], reloadKind: "mag", magWell: [20, 15], charge: { x: 31, y: -4, pull: [-16, 0] } },
  // 燧石66：半自动反器材步枪，长枪管 + 两脚架，前手握持点相应前移
  flint66: { stance: "rifle", grip: [4, 12], fore: [56, 2], reloadKind: "mag", magWell: [18, 14], charge: { x: 26, y: -3, pull: [-13, 0] } },
  // 霰弹枪：管状弹仓逐发装填 + 泵动上膛
  rem870: { stance: "rifle", grip: [4, 10], fore: [47, 2], reloadKind: "shells", feed: [14, 9] },
  sawedoff: { stance: "rifle", grip: [4, 12], fore: [40, 0], reloadKind: "shells", feed: [12, 9] },
  // 机枪：弹箱/弹鼓挂于机匣下方，右侧拉机柄
  m240l: { stance: "rifle", grip: [4, 12], fore: [58, 3], reloadKind: "mag", magWell: [20, 20], charge: { x: 26, y: 3, pull: [-21, 0] } },
  mg42: { stance: "rifle", grip: [4, 12], fore: [60, 3], reloadKind: "mag", magWell: [23, 20], charge: { x: 31, y: 3, pull: [-22, 0] } },
  pkm: { stance: "rifle", grip: [4, 12], fore: [57, 3], reloadKind: "mag", magWell: [22, 20], charge: { x: 28, y: 3, pull: [-21, 0] } },
  gatling: { stance: "rifle", grip: [-21, 18], fore: [22, 13], reloadKind: "mag", magWell: [-2, 18] },
  // RPG-7：肩扛式，弹头从筒口塞入
  rpg7: { stance: "rpg", grip: [5, 16], fore: [42, -3], reloadKind: "rocket", feed: [104, 0] },
  // M32：逐发按入转轮后合膛
  m32: { stance: "rifle", grip: [6, 13], fore: [56, 4], reloadKind: "cylinder", feed: [26, -6] },
  // 近战：短刀单手、重型双手持握
  fruitknife: { stance: "melee1h", grip: [4, 1], fore: [4, 1], reloadKind: "none" },
  combatknife: { stance: "melee1h", grip: [4, 1], fore: [4, 1], reloadKind: "none" },
  baseballbat: { stance: "melee2h", grip: [1, 0], fore: [14, 0], reloadKind: "none" },
  crowbar: { stance: "melee2h", grip: [1, 0], fore: [14, 0], reloadKind: "none" },
  hammer: { stance: "melee2h", grip: [1, 0], fore: [14, 0], reloadKind: "none" },
  fireaxe: { stance: "melee2h", grip: [1, 0], fore: [14, 0], reloadKind: "none" },
  fists: { stance: "melee1h", grip: [4, 1], fore: [4, 1], reloadKind: "none" },
};

// Two standing figures exactly span the usable road width.
const BASE_HUMAN_HEIGHT = 127;
const CHARACTER_SCALE = (ROAD_BOTTOM - ROAD_TOP) / (BASE_HUMAN_HEIGHT * 2);
const REFERENCE_HUMAN_HEIGHT_MM = 1780;
const WORLD_PX_PER_MM = (BASE_HUMAN_HEIGHT * CHARACTER_SCALE) / REFERENCE_HUMAN_HEIGHT_MM;

function playerWeaponScale(key: WeaponKey) {
  const geometry = WEAPON_GEOMETRY[key];
  return (REAL_LENGTH_MM[key] * WORLD_PX_PER_MM) / (geometry.muzzleX - geometry.stockEnd) / CHARACTER_SCALE;
}

function weaponMuzzleOffset(key: WeaponKey) {
  return WEAPON_GEOMETRY[key].muzzleX * playerWeaponScale(key) * CHARACTER_SCALE;
}

function playerGunOrigin(player: Player) {
  // 站姿扛枪高度：普通枪械贴肩 -88；RPG-7 肩扛于右肩之上 -100 且前移避开筒尾；
  // 手枪双臂前伸射击式，枪位前移 +12；长枪贴腮瞄准 +8。
  const stance = WEAPON_HOLD[player.weapon].stance;
  const shoulderY = stance === "rpg" ? 100 : 88;
  const forward = stance === "pistol" ? 12 : stance === "rpg" ? 14 : 8;
  return {
    x: player.x + Math.cos(player.angle) * forward * CHARACTER_SCALE,
    y: player.y - shoulderY * CHARACTER_SCALE + Math.sin(player.angle) * 6 * CHARACTER_SCALE,
  };
}

function zombieBodyY(zombie: Zombie) {
  return zombie.y - (zombie.kind === "zombieDog" ? 55 : 79) * (zombie.radius / 25) * CHARACTER_SCALE;
}

function zombieInClaymoreCone(item: DeployedItem, zombie: Zombie, radius: number) {
  const dx = zombie.x - item.x;
  const dy = zombie.y - item.y;
  if (dx < 0 || Math.hypot(dx, dy) > radius) return false;
  return Math.abs(Math.atan2(dy, dx)) <= .55;
}

function itemTargetInFront(game: GameState, pointer: { x: number; y: number }, key: ItemKey) {
  const fixedPlacement = ITEMS[key].delivery === "place";
  const minimumX = game.player.x + (fixedPlacement ? 90 : 120);
  const maximumX = Math.min(game.worldW - 55, game.player.x + (fixedPlacement ? 290 : 540));
  return {
    x: Math.max(minimumX, Math.min(maximumX, pointer.x)),
    y: Math.max(ROAD_TOP + 55, Math.min(ROAD_BOTTOM - 40, pointer.y)),
  };
}

function densestZombiePoint(zombies: Zombie[], clusterRadius = 235) {
  const living = zombies.filter((zombie) => zombie.hp > 0);
  if (living.length === 0) return null;
  let best = living[0];
  let bestCluster = [best];
  for (const candidate of living) {
    const cluster = living.filter((zombie) => Math.hypot(zombie.x - candidate.x, zombie.y - candidate.y) <= clusterRadius);
    if (cluster.length > bestCluster.length) {
      best = candidate;
      bestCluster = cluster;
    }
  }
  return {
    x: bestCluster.reduce((sum, zombie) => sum + zombie.x, 0) / bestCluster.length,
    y: bestCluster.reduce((sum, zombie) => sum + zombie.y, 0) / bestCluster.length,
  };
}

function deployedItemPosition(item: DeployedItem, now: number) {
  if (now >= item.landAt || item.landAt <= item.createdAt) return { x: item.x, y: item.y, progress: 1 };
  const progress = Math.max(0, Math.min(1, (now - item.createdAt) / (item.landAt - item.createdAt)));
  const eased = easeInOut(progress);
  return {
    x: item.thrownFromX + (item.x - item.thrownFromX) * eased,
    y: item.thrownFromY + (item.y - item.thrownFromY) * eased - Math.sin(progress * Math.PI) * 92,
    progress,
  };
}

// 换弹视觉状态：左手位（玩家局部坐标）、枪机行程、隐藏弹匣、转轮角度，以及需绘制的活动道具（模型坐标系）。
// 旧弹匣不再在枪内绘制——换弹开始时作为地面道具抛出，落地后留存一段时间。
type ReloadVisual = {
  lead: [number, number] | null;
  bolt: number;
  hideMag: boolean;
  cylinderSpin: number;
  newMag: { x: number; y: number; rot: number; alpha: number } | null;
  shell: { x: number; y: number; alpha: number } | null;
  warhead: { x: number; y: number; alpha: number } | null;
  warheadGrip: { x: number; y: number } | null;
};

const EMPTY_RELOAD_VISUAL = (): ReloadVisual => ({
  lead: null, bolt: 0, hideMag: false, cylinderSpin: 0, newMag: null, shell: null, warhead: null, warheadGrip: null,
});

// 弹匣式（手枪/冲锋枪/步枪/机枪）：①拔下旧弹匣（可见下落）②探向腰间取新匣 ③插入并按/拍到位 ④拉栓上膛（各枪拉机柄行程不同）。
// 管状弹仓（870/短截）：逐发按入装填口 ×3，随后泵动滑套后拉前推上膛。
// 转轮（M32）：逐发按入弹巢 ×3，转轮分度旋转，最后合膛。RPG-7：弹头从筒口塞入后待发。
function computeReloadVisual(
  key: WeaponKey,
  progress: number,
  toLocal: (m: [number, number]) => [number, number],
  facing: number,
): ReloadVisual {
  const hold = WEAPON_HOLD[key];
  const visual = EMPTY_RELOAD_VISUAL();
  const belt: [number, number] = [facing * 3, -64];
  const step = (a: [number, number], b: [number, number], t: number): [number, number] => mixPoint(a, b, easeInOut(Math.max(0, Math.min(1, t))));
  const magWell = hold.magWell ?? hold.grip;

  if (hold.reloadKind === "mag") {
    visual.hideMag = progress > 0.06 && progress < 0.62;
    if (progress >= 0.46 && progress < 0.62) {
      const t = easeInOut((progress - 0.46) / 0.16);
      visual.newMag = { x: magWell[0] + (1 - t) * 3, y: magWell[1] + 6 + (1 - t) * 26, rot: (1 - t) * 0.18, alpha: 1 };
    }
    const patPoint = toLocal([magWell[0] + 2, magWell[1] + 5]);
    const chargePoint = hold.charge ? toLocal([hold.charge.x + hold.charge.pull[0] * 0.4, hold.charge.y + hold.charge.pull[1] * 0.4]) : null;
    if (progress < 0.16) visual.lead = step(toLocal(hold.fore), toLocal(magWell), progress / 0.16);
    else if (progress < 0.34) visual.lead = step(toLocal(magWell), belt, (progress - 0.16) / 0.18);
    else if (progress < 0.48) visual.lead = step(belt, toLocal(magWell), (progress - 0.34) / 0.14);
    else if (progress < 0.60) visual.lead = step(toLocal(magWell), patPoint, (progress - 0.48) / 0.12);
    else if (chargePoint) {
      if (progress < 0.72) visual.lead = step(patPoint, chargePoint, (progress - 0.60) / 0.12);
      else if (progress < 0.88) {
        visual.lead = chargePoint;
        visual.bolt = progress < 0.80 ? easeInOut((progress - 0.72) / 0.08) : 1 - easeInOut((progress - 0.80) / 0.08);
      } else visual.lead = step(chargePoint, toLocal(hold.fore), (progress - 0.88) / 0.12);
    } else if (progress < 0.74) {
      visual.lead = patPoint;
    } else {
      visual.lead = step(patPoint, toLocal(hold.fore), (progress - 0.74) / 0.2);
    }
    return visual;
  }

  if (hold.reloadKind === "shells") {
    const feed = hold.feed ?? hold.grip;
    if (progress < 0.72) {
      const cycle = Math.min(2, Math.floor(progress / 0.24));
      const local = (progress - cycle * 0.24) / 0.24;
      const port = toLocal(feed);
      if (local < 0.38) visual.lead = step(port, belt, local / 0.38);
      else if (local < 0.72) visual.lead = step(belt, port, (local - 0.38) / 0.34);
      else visual.lead = step(port, toLocal([feed[0], feed[1] - 3]), (local - 0.72) / 0.28);
      if (local > 0.6) visual.shell = { x: feed[0], y: feed[1] - (local - 0.6) * 8, alpha: 1 };
    } else if (progress < 0.94) {
      const t = (progress - 0.72) / 0.22;
      visual.bolt = t < 0.5 ? easeInOut(t / 0.5) : 1 - easeInOut((t - 0.5) / 0.5);
      visual.lead = toLocal([hold.fore[0] - visual.bolt * 9, hold.fore[1]]);
    } else {
      visual.lead = toLocal(hold.fore);
    }
    return visual;
  }

  if (hold.reloadKind === "cylinder") {
    const feed = hold.feed ?? [17, -10];
    if (progress < 0.68) {
      const cycle = Math.min(2, Math.floor(progress / 0.2266));
      const local = (progress - cycle * 0.2266) / 0.2266;
      const port = toLocal(feed);
      if (local < 0.4) visual.lead = step(port, belt, local / 0.4);
      else if (local < 0.75) visual.lead = step(belt, port, (local - 0.4) / 0.35);
      else visual.lead = port;
      if (local > 0.55) visual.shell = { x: feed[0], y: feed[1] - (local - 0.55) * 6, alpha: 1 };
      visual.cylinderSpin = (cycle + easeInOut(Math.max(0, (local - 0.75) / 0.25))) * (Math.PI / 3);
    } else {
      visual.cylinderSpin = Math.PI * (1 - easeInOut((progress - 0.68) / 0.2));
      visual.lead = step(toLocal(feed), toLocal(hold.fore), (progress - 0.68) / 0.26);
    }
    return visual;
  }

  if (hold.reloadKind === "rocket") {
    // RPG-7 装弹：左手先握住弹体（手包住弹体），托弹至筒口，再从筒口前方引导塞入发射筒，塞入后松手回托筒位
    const muzzle = WEAPON_GEOMETRY[key].muzzleX;
    if (progress < 0.62) {
      visual.hideMag = true;
      const carry: [number, number] = [46, 14];
      const seat: [number, number] = [muzzle - 40, 3];
      if (progress < 0.12) {
        visual.lead = step(toLocal(hold.fore), toLocal(carry), progress / 0.12);
      } else {
        const t = easeInOut(Math.min(1, (progress - 0.12) / 0.36));
        const grip = mixPoint(carry, seat, t);
        visual.lead = toLocal(grip);
        visual.warhead = { x: grip[0] + 40, y: grip[1] - 3, alpha: 1 };
        visual.warheadGrip = { x: grip[0] + 8, y: grip[1] - 2 };
      }
    } else {
      visual.lead = step(toLocal([muzzle - 40, 3]), toLocal(hold.fore), (progress - 0.62) / 0.3);
    }
    return visual;
  }

  return visual;
}

function drawReloadProps(ctx: CanvasRenderingContext2D, key: WeaponKey, visual: ReloadVisual) {
  const drawMagShape = (x: number, y: number, rot: number, alpha: number, fill: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    if (["m240l", "mg42", "pkm", "gatling"].includes(key)) {
      roundedRect(ctx, -8, -7, 26, 25, 3); ctx.fill();
    } else if (key === "ak47" || key === "saiga12") {
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(8, -6); ctx.quadraticCurveTo(13, 8, 5, 21); ctx.lineTo(-4, 19); ctx.quadraticCurveTo(4, 8, -6, -6); ctx.fill();
    } else if (key === "glock17" || key === "m1911") {
      roundedRect(ctx, -5, -4, 11, 18, 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(8, -6); ctx.lineTo(10, 20); ctx.lineTo(-3, 22); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };
  if (visual.newMag) drawMagShape(visual.newMag.x, visual.newMag.y, visual.newMag.rot, visual.newMag.alpha, "#1c2320");
  if (visual.shell) {
    ctx.save();
    ctx.globalAlpha = visual.shell.alpha;
    ctx.fillStyle = key === "m32" ? "#7f8b74" : "#a53332";
    ctx.fillRect(visual.shell.x - 2.5, visual.shell.y - 6, 5, 10);
    ctx.fillStyle = "#c9a24e";
    ctx.fillRect(visual.shell.x - 2.5, visual.shell.y + 4, 5, 3);
    ctx.restore();
  }
  if (visual.warhead) {
    ctx.save();
    ctx.globalAlpha = visual.warhead.alpha;
    ctx.translate(0, visual.warhead.y);
    ctx.fillStyle = "#8e9259";
    ctx.beginPath();
    ctx.moveTo(visual.warhead.x - 44, -10.5); ctx.lineTo(visual.warhead.x - 14, -7); ctx.lineTo(visual.warhead.x, 0); ctx.lineTo(visual.warhead.x - 14, 7); ctx.lineTo(visual.warhead.x - 44, 10.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#4d593c"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#4d593c"; ctx.fillRect(visual.warhead.x - 48, -3.5, 5, 7);
    ctx.restore();
  }
  // 左手握持弹体：指节扣在弹体上侧、拇指扣在下侧（与 IK 手掌合成包握姿态）
  if (visual.warheadGrip) {
    ctx.save();
    ctx.fillStyle = "#c58e67";
    for (let i = 0; i < 3; i++) { roundedRect(ctx, visual.warheadGrip.x - 5 + i * 4.2, visual.warheadGrip.y - 9, 3.6, 8, 1.6); ctx.fill(); }
    roundedRect(ctx, visual.warheadGrip.x + 3, visual.warheadGrip.y + 3, 4.5, 6, 1.6); ctx.fill();
    ctx.restore();
  }
}

// 地面留存道具：换弹抛落的旧弹匣（按枪种形状）与击发抛出的弹壳，绘制于道具自身原点。
function drawGroundProp(ctx: CanvasRenderingContext2D, prop: GroundProp) {
  if (prop.kind === "casing") {
    ctx.fillStyle = "#c9a24e";
    ctx.fillRect(-3, -1.2, 6, 2.4);
    ctx.fillStyle = "#8a6a2e";
    ctx.fillRect(1.6, -1.2, 1.4, 2.4);
    return;
  }
  if (prop.kind === "shield") {
    // 被踹落/死亡掉落的全身金属盾牌：与手持同一几何同一世界比例（不缩小），倾倒后躺平落地。
    // 躺平（|rotation|≈90°）时局部 -X 朝向屏幕上方，提前抬升让板面贴地不陷入地面线；
    // 旋转中的偏移让翻滚轨迹更自然。
    ctx.translate(-8 * CHARACTER_SCALE, -9 * CHARACTER_SCALE);
    drawMetalShieldBody(ctx, CHARACTER_SCALE);
    return;
  }
  ctx.save();
  // 与手中枪模一致的世界比例（playerWeaponScale × CHARACTER_SCALE），不再额外放大
  const propScale = playerWeaponScale(prop.weapon ?? "glock17") * CHARACTER_SCALE;
  ctx.scale(propScale, propScale);
  ctx.fillStyle = "#151a18";
  const key = prop.weapon ?? "glock17";
  if (["m240l", "mg42", "pkm", "gatling"].includes(key)) {
    roundedRect(ctx, -8, -7, 26, 25, 3); ctx.fill();
  } else if (key === "ak47" || key === "saiga12") {
    ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(8, -6); ctx.quadraticCurveTo(13, 8, 5, 21); ctx.lineTo(-4, 19); ctx.quadraticCurveTo(4, 8, -6, -6); ctx.fill();
  } else if (key === "glock17" || key === "m1911") {
    roundedRect(ctx, -5, -4, 11, 18, 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(8, -6); ctx.lineTo(10, 20); ctx.lineTo(-3, 22); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 武器模型实际像素包围盒缓存：按各枪模型真实长宽自适应预览区域（含 RPG 弹头、弹鼓等突出件），完整可见且不拉伸
const WEAPON_PREVIEW_BOUNDS = new Map<WeaponKey, { cx: number; cy: number; width: number; height: number }>();

function measureWeaponBounds(weapon: WeaponKey) {
  const cached = WEAPON_PREVIEW_BOUNDS.get(weapon);
  if (cached) return cached;
  const scratch = document.createElement("canvas");
  scratch.width = 480;
  scratch.height = 240;
  const sctx = scratch.getContext("2d");
  if (!sctx) return { cx: 40, cy: 0, width: 140, height: 50 };
  sctx.translate(240, 120);
  drawWeaponModel(sctx, weapon, 1);
  const pixels = sctx.getImageData(0, 0, 480, 240).data;
  let minX = 480;
  let minY = 240;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < 240; y++) {
    for (let x = 0; x < 480; x++) {
      if (pixels[(y * 480 + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bounds = maxX > minX && maxY > minY
    ? { cx: (minX + maxX) / 2 - 240, cy: (minY + maxY) / 2 - 120, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { cx: 40, cy: 0, width: 140, height: 50 };
  WEAPON_PREVIEW_BOUNDS.set(weapon, bounds);
  return bounds;
}

// 商店武器按价格升序排列（卡片顺序与编号共用）
// 商店/装备整备武器列表：按价格升序；拳脚为关卡模式徒手兜底，不进入任何商店与装备列表
const SHOP_WEAPON_KEYS = (Object.keys(WEAPONS) as WeaponKey[]).filter((key) => key !== "fists").sort((a, b) => WEAPONS[a].price - WEAPONS[b].price);

// 射击模式文案：详情面板用（近战/栓动/泵动/全自动/半自动）
function fireModeLabel(key: WeaponKey) {
  if (MELEE_WEAPONS.has(key)) return "挥击";
  if (BOLT_ACTION_WEAPONS.has(key)) return "栓动";
  if (key === "rem870" || key === "sawedoff") return "泵动";
  if (WEAPONS[key].automatic) return "全自动";
  return "半自动";
}

// 警察搭档持枪原点：与玩家手枪站姿一致（贴肩 -88、前移 12）
function officerGunOrigin(f: PartnerField) {
  return {
    x: f.x + Math.cos(f.angle) * 12 * CHARACTER_SCALE,
    y: f.y - 88 * CHARACTER_SCALE + Math.sin(f.angle) * 6 * CHARACTER_SCALE,
  };
}

/** 猎犬：四足棕犬，奔跑时对角腿交替、扑咬时前扑伸展。 */
function drawHound(ctx: CanvasRenderingContext2D, f: PartnerField, now: number) {
  const facing = Math.cos(f.angle) >= 0 ? 1 : -1;
  const biting = now - f.attackAt < 320;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(CHARACTER_SCALE * facing, CHARACTER_SCALE);
  ctx.fillStyle = "rgba(0,0,0,.4)";
  ctx.beginPath(); ctx.ellipse(0, 3, 24, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  // 奔跑起伏 + 扑咬前冲
  if (f.moving) ctx.translate(0, -Math.abs(Math.sin(now / 95)) * 2);
  const lunge = biting ? Math.sin(((now - f.attackAt) / 320) * Math.PI) * 5 : 0;
  // 腿：对角两两同步的小跑步态
  const swing = f.moving ? Math.sin(now / 95) * 6 : 0;
  drawLimb(ctx, [[-9, -13], [-9 + swing * 0.9, 0]], 3.4, "#453019");
  drawLimb(ctx, [[9, -13], [9 - swing * 0.9, 0]], 3.4, "#453019");
  drawLimb(ctx, [[-13, -13], [-13 - swing, 0]], 3.8, "#5c3f24");
  drawLimb(ctx, [[13, -13], [13 + swing, 0]], 3.8, "#5c3f24");
  // 躯干：肩高臀低的犬形轮廓
  ctx.fillStyle = "#6d4c2f";
  ctx.beginPath();
  ctx.moveTo(-17, -25); ctx.lineTo(11, -28); ctx.lineTo(16, -23); ctx.lineTo(15, -13);
  ctx.lineTo(-12, -12); ctx.lineTo(-18, -16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.moveTo(-17, -25); ctx.lineTo(-6, -26.5); ctx.lineTo(-7, -12.5); ctx.lineTo(-12, -12); ctx.lineTo(-18, -16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#7d5c39";
  ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(10, -14.5); ctx.lineTo(9, -12.5); ctx.lineTo(-7, -12); ctx.closePath(); ctx.fill();
  // 尾巴：上卷摇动
  const wag = Math.sin(now / 120) * 4;
  ctx.strokeStyle = "#54391f"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-17, -24); ctx.quadraticCurveTo(-25, -33 + wag, -29, -25 + wag); ctx.stroke();
  // 头颈组：扑咬时整体前送、下颌张开
  ctx.save();
  ctx.translate(lunge, biting ? -1 : 0);
  ctx.fillStyle = "#6d4c2f";
  ctx.beginPath(); ctx.moveTo(9, -26); ctx.lineTo(16, -33); ctx.lineTo(20, -27); ctx.lineTo(14, -22); ctx.closePath(); ctx.fill();
  // 颅部与吻部
  ctx.beginPath(); ctx.arc(20, -33, 5.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(22, -36); ctx.lineTo(31, -32); ctx.lineTo(31, -28.5); ctx.lineTo(22, -29.5); ctx.closePath(); ctx.fill();
  // 张开的下颌
  ctx.fillStyle = "#54391f";
  ctx.beginPath();
  ctx.moveTo(22, -29.5);
  ctx.lineTo(30, biting ? -25.5 : -27.5);
  ctx.lineTo(29, biting ? -24 : -26);
  ctx.lineTo(22, -27.5);
  ctx.closePath(); ctx.fill();
  // 竖耳、鼻头与眼睛
  ctx.beginPath(); ctx.moveTo(15, -37); ctx.lineTo(17.5, -43); ctx.lineTo(20.5, -37.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#1c1310";
  ctx.beginPath(); ctx.arc(31, -30.5, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(21.5, -34, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** 武装警察：与玩家同一骨架/IK，警服蓝 + 大檐帽，双手持 M1911 指向目标。 */
function drawOfficer(ctx: CanvasRenderingContext2D, f: PartnerField, now: number) {
  const uniform = ARMORS.police;
  const facing = Math.cos(f.angle) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(CHARACTER_SCALE, CHARACTER_SCALE);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath(); ctx.ellipse(0, 4, 23, 7, 0, 0, Math.PI * 2); ctx.fill();
  // 与玩家一致的交替步态（步频略慢）
  const cycle = f.moving ? (now / 260) % 1 : 0;
  if (f.moving) ctx.translate(0, Math.sin(cycle * Math.PI * 4) * 1.1);
  const rearLeg = f.moving ? gaitLegPose((cycle + .5) % 1, facing, -5) : standingLegPose(facing, -5);
  const frontLeg = f.moving ? gaitLegPose(cycle, facing, 5) : standingLegPose(facing, 5);
  drawLimb(ctx, rearLeg, 7.5, uniform.pants, "#101513");
  drawLimb(ctx, frontLeg, 7.5, uniform.pants, "#111715");
  drawFoot(ctx, rearLeg[2], facing, 14, "#101513", f.moving ? gaitFootPitch((cycle + .5) % 1) : 0);
  drawFoot(ctx, frontLeg[2], facing, 14, "#101513", f.moving ? gaitFootPitch(cycle) : 0);
  // 躯干：警服蓝 + 执勤腰带 + 警徽
  ctx.fillStyle = "#18263a";
  ctx.beginPath();
  ctx.moveTo(-12.5, -103); ctx.lineTo(12.5, -103); ctx.lineTo(12, -88); ctx.lineTo(9.5, -78); ctx.lineTo(10.5, -63);
  ctx.lineTo(-10.5, -63); ctx.lineTo(-9.5, -78); ctx.lineTo(-12, -88);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = uniform.torso;
  ctx.beginPath();
  ctx.moveTo(-15, -102); ctx.lineTo(15, -102); ctx.lineTo(14, -88); ctx.lineTo(11.5, -78); ctx.lineTo(12.5, -66);
  ctx.lineTo(-12.5, -66); ctx.lineTo(-11.5, -78); ctx.lineTo(-14, -88);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.beginPath();
  ctx.moveTo(-facing * 15, -102); ctx.lineTo(-facing * 8, -102); ctx.lineTo(-facing * 7, -66); ctx.lineTo(-facing * 12.5, -66); ctx.lineTo(-facing * 11.5, -78); ctx.lineTo(-facing * 14, -88);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#111820"; roundedRect(ctx, -10, -72, 20, 7, 2); ctx.fill();
  ctx.fillStyle = "#d4be5c"; ctx.beginPath(); ctx.arc(7, -93, 2.4, 0, Math.PI * 2); ctx.fill();
  // 双手持枪：与玩家手枪位一致的两骨 IK
  const hold = WEAPON_HOLD.m1911;
  const gunScale = playerWeaponScale("m1911");
  // 后坐力：枪组随枪口上跳微仰、沿瞄准线后挫（纯视觉；490ms 半速射击天然低热度累积）
  const recoilSpec = WEAPON_RECOIL.m1911;
  const recoilAge = now - f.recoilAt;
  const recoilHeat = f.recoilHeat * Math.max(0, 1 - Math.max(0, recoilAge) / RECOIL_HEAT_COOL_MS);
  const recoilKick = recoilImpulse(recoilAge);
  const recoilRise = recoilSpec.rise * recoilKick * (1 + recoilHeat * 1.5);
  const recoilBack = recoilSpec.back * recoilKick * (1 + recoilHeat * .6);
  const gunAngle = f.angle - facing * recoilRise;
  const cosA = Math.cos(gunAngle);
  const sinA = Math.sin(gunAngle);
  const gunRelX = cosA * (12 - recoilBack);
  const gunRelY = -88 + sinA * 6 - recoilBack * .35;
  const toLocal = (m: [number, number]): [number, number] => [
    gunRelX + (cosA * m[0] - sinA * m[1]) * gunScale,
    gunRelY + (sinA * m[0] + cosA * m[1]) * gunScale,
  ];
  const rearShoulder: [number, number] = [-cosA * 11, -99 - sinA * 5];
  const leadShoulder: [number, number] = [cosA * 11, -99 + sinA * 5];
  const rightHand = toLocal(hold.grip);
  let leadHand = toLocal([hold.grip[0] + 4, hold.grip[1] + 3]);
  // 换弹编舞：与玩家完全共用 computeReloadVisual（拔匣→腰间取匣→装匣→拍击→拉套筒）
  const reloadProgress = f.reloadingUntil > now && f.reloadStartedAt > 0
    ? Math.min(1, (now - f.reloadStartedAt) / Math.max(1, f.reloadingUntil - f.reloadStartedAt))
    : 0;
  const reloadVisual = reloadProgress > 0 ? computeReloadVisual("m1911", reloadProgress, toLocal, facing) : null;
  if (reloadVisual?.lead) leadHand = reloadVisual.lead;
  const elbowDown = (s: [number, number], h: [number, number]): [number, number] => [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2 + 16];
  const rightArm = solveTwoBoneArm(rearShoulder, rightHand, elbowDown(rearShoulder, rightHand));
  const leadArm = solveTwoBoneArm(leadShoulder, leadHand, elbowDown(leadShoulder, leadHand));
  drawLimb(ctx, rightArm, 6.5, uniform.sleeves, "#c38e67");
  drawLimb(ctx, leadArm, 6.5, uniform.sleeves, "#c38e67");
  drawHand(ctx, rightArm[2], rightArm[1], 7, "#c58e67");
  drawHand(ctx, leadArm[2], leadArm[1], 7, "#c58e67");
  // 颈部与头部（同玩家颅形），戴警用大檐帽
  ctx.fillStyle = "#c58e67";
  ctx.beginPath();
  ctx.moveTo(-5.5, -102); ctx.lineTo(5.5, -102); ctx.lineTo(4, -112); ctx.lineTo(-4, -112);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d0a079";
  ctx.beginPath();
  ctx.moveTo(facing * -9, -118);
  ctx.lineTo(facing * -7.5, -125);
  ctx.lineTo(facing * -1, -128.5);
  ctx.lineTo(facing * 5.5, -126.5);
  ctx.lineTo(facing * 8.5, -121);
  ctx.lineTo(facing * 9.5, -117.5);
  ctx.lineTo(facing * 8, -115);
  ctx.lineTo(facing * 8.5, -113.5);
  ctx.lineTo(facing * 6.5, -110.5);
  ctx.lineTo(facing * 1, -108.5);
  ctx.lineTo(facing * -5, -110);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#17283d";
  ctx.beginPath();
  ctx.moveTo(facing * -9.5, -120); ctx.lineTo(facing * -7, -127.5); ctx.lineTo(facing * 0, -130); ctx.lineTo(facing * 7, -127.5); ctx.lineTo(facing * 9, -120);
  ctx.lineTo(facing * 17, -118.6); ctx.lineTo(facing * 16.2, -117.1); ctx.lineTo(facing * 2, -118.6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#23282c";
  ctx.beginPath(); ctx.ellipse(facing * 5, -116.6, 1.7, 1.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#6b4f3c"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(facing * 2.8, -118.6); ctx.lineTo(facing * 7.6, -119); ctx.stroke();
  // M1911 枪模（换弹时隐藏旧弹匣、套筒随编舞拉动）与枪口火光
  ctx.save();
  ctx.translate(gunRelX, gunRelY);
  ctx.rotate(gunAngle);
  drawWeaponModel(ctx, "m1911", gunScale, reloadVisual?.hideMag ?? false, reloadVisual?.bolt ?? 0, reloadVisual?.cylinderSpin ?? 0);
  if (reloadVisual) {
    // 换弹道具（新弹匣等）与枪模同一 gunScale，保持真实比例
    ctx.save();
    ctx.scale(gunScale, gunScale);
    drawReloadProps(ctx, "m1911", reloadVisual);
    ctx.restore();
  }
  ctx.restore();
  if (now - f.muzzleAt < 65) {
    const muzzle = weaponMuzzleOffset("m1911") / CHARACTER_SCALE;
    ctx.save();
    ctx.translate(gunRelX, gunRelY);
    ctx.rotate(gunAngle);
    ctx.fillStyle = "#fff2a8";
    ctx.beginPath();
    ctx.moveTo(muzzle - 7, 0);
    ctx.lineTo(muzzle + 17, -9);
    ctx.lineTo(muzzle + 11, 0);
    ctx.lineTo(muzzle + 19, 9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f28a35";
    ctx.beginPath(); ctx.arc(muzzle + 2, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** ZH501 攻击无人机：四旋翼悬停伴飞，机腹枪管指向目标，换弹时红色 LED 闪烁。 */
function drawDrone(ctx: CanvasRenderingContext2D, f: PartnerField, now: number) {
  ctx.save();
  ctx.translate(f.x, f.y);
  // 路面投影（随高度减淡）
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath(); ctx.ellipse(0, 150, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
  // 悬浮起伏
  ctx.translate(0, Math.sin(now / 520) * 3);
  // 射击后坐力：整机沿瞄准线反向顿挫（纯视觉，热度随连射累积放大）
  const recoilAge = now - f.recoilAt;
  const recoilHeat = f.recoilHeat * Math.max(0, 1 - Math.max(0, recoilAge) / RECOIL_HEAT_COOL_MS);
  const recoilKick = recoilImpulse(recoilAge);
  const recoilBack = DRONE_RECOIL.back * recoilKick * (1 + recoilHeat * .6);
  ctx.translate(-Math.cos(f.angle) * recoilBack, -Math.sin(f.angle) * recoilBack * .5 - recoilKick * .6);
  // 旋翼臂与旋转桨
  const hubs: Array<[number, number]> = [[-23, -13], [23, -13], [-23, 13], [23, 13]];
  ctx.strokeStyle = "#3a434d"; ctx.lineWidth = 3; ctx.lineCap = "round";
  for (const [hx, hy] of hubs) {
    ctx.beginPath(); ctx.moveTo(Math.sign(hx) * 10, Math.sign(hy) * 5); ctx.lineTo(hx, hy); ctx.stroke();
  }
  hubs.forEach(([hx, hy], index) => {
    ctx.fillStyle = "rgba(160,180,196,.16)";
    ctx.beginPath(); ctx.ellipse(hx, hy - 2, 13, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    const spin = now / 26 + index * 1.7;
    ctx.strokeStyle = "rgba(210,224,234,.75)"; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - Math.cos(spin) * 11, hy - 2 - Math.sin(spin) * 2.6);
    ctx.lineTo(hx + Math.cos(spin) * 11, hy - 2 + Math.sin(spin) * 2.6);
    ctx.stroke();
    ctx.fillStyle = "#20262d";
    ctx.beginPath(); ctx.arc(hx, hy - 2, 2.2, 0, Math.PI * 2); ctx.fill();
  });
  // 机身
  ctx.fillStyle = "#2b3138";
  roundedRect(ctx, -15, -8, 30, 16, 6); ctx.fill();
  ctx.fillStyle = "#39424c";
  roundedRect(ctx, -10, -11, 20, 6, 3); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.08)";
  roundedRect(ctx, -15, -8, 30, 5, 3); ctx.fill();
  // 机腹枪组随目标角转动（射击时随后坐力微仰）
  const droneFacing = Math.cos(f.angle) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(0, 6);
  ctx.rotate(f.angle - droneFacing * DRONE_RECOIL.rise * recoilKick * (1 + recoilHeat * 1.5));
  ctx.fillStyle = "#161b21";
  roundedRect(ctx, 2, -2.5, 24, 5, 2); ctx.fill();
  ctx.fillStyle = "#0d1116";
  ctx.fillRect(24, -1.5, 6, 3);
  if (now - f.muzzleAt < 65) {
    ctx.fillStyle = "#fff2a8";
    ctx.beginPath();
    ctx.moveTo(28, 0); ctx.lineTo(40, -5); ctx.lineTo(37, 0); ctx.lineTo(40, 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f28a35";
    ctx.beginPath(); ctx.arc(30, 0, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 光电吊舱（前向镜头）
  const sensorFacing = Math.cos(f.angle) >= 0 ? 1 : -1;
  ctx.fillStyle = "#10151b";
  ctx.beginPath(); ctx.arc(sensorFacing * 8, 9, 4.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4d8fb5";
  ctx.beginPath(); ctx.arc(sensorFacing * 9.4, 9, 1.7, 0, Math.PI * 2); ctx.fill();
  // 状态 LED：换弹红色闪烁，正常绿色常亮
  const ledOn = f.reloading ? Math.floor(now / 240) % 2 === 0 : true;
  ctx.fillStyle = f.reloading ? (ledOn ? "#ff4b3e" : "#5c1a14") : "#58d68a";
  ctx.beginPath(); ctx.arc(-sensorFacing * 11, 8, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 搭档建模预览包围盒缓存：与武器预览同一思路，按实际绘制像素自适应、完整可见且不拉伸
const PARTNER_PREVIEW_BOUNDS = new Map<PartnerKey, { cx: number; cy: number; width: number; height: number }>();

function renderPartnerModel(ctx: CanvasRenderingContext2D, partner: PartnerKey, field: PartnerField) {
  if (partner === "hound") drawHound(ctx, field, 1000);
  else if (partner === "officer") drawOfficer(ctx, field, 1000);
  else drawDrone(ctx, field, 1000);
}

function measurePartnerBounds(partner: PartnerKey) {
  const cached = PARTNER_PREVIEW_BOUNDS.get(partner);
  if (cached) return cached;
  const scratch = document.createElement("canvas");
  scratch.width = 480;
  scratch.height = 480;
  const sctx = scratch.getContext("2d");
  if (!sctx) return { cx: 0, cy: 0, width: 120, height: 120 };
  // 静态站姿/悬停 pose（now=1000 避开枪口火光帧），面朝右
  renderPartnerModel(sctx, partner, { ...freshPartnerField(240, 320), angle: 0 });
  const pixels = sctx.getImageData(0, 0, 480, 480).data;
  let minX = 480;
  let minY = 480;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < 480; y++) {
    for (let x = 0; x < 480; x++) {
      if (pixels[(y * 480 + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // cx/cy 存储为相对绘制锚点 (240,320) 的偏移，PartnerPreview 直接用其反推锚点（与武器预览同一约定）
  const bounds = maxX > minX && maxY > minY
    ? { cx: (minX + maxX) / 2 - 240, cy: (minY + maxY) / 2 - 320, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { cx: 0, cy: 0, width: 120, height: 120 };
  PARTNER_PREVIEW_BOUNDS.set(partner, bounds);
  return bounds;
}

function PartnerPreview({ partner }: { partner: PartnerKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bounds = measurePartnerBounds(partner);
    const scale = Math.min((canvas.width - 14) / bounds.width, (canvas.height - 10) / bounds.height);
    ctx.save();
    ctx.scale(scale, scale);
    // 将建模包围盒中心对齐画布中心（不裁切、不拉伸）
    renderPartnerModel(ctx, partner, {
      ...freshPartnerField(canvas.width / (2 * scale) - bounds.cx, canvas.height / (2 * scale) - bounds.cy),
      angle: 0,
    });
    ctx.restore();
  }, [partner]);
  // 竖幅位图（150×200）：契合警察/无人机竖高体型与猎犬，CSS 端按同宽高比等比缩放，不压扁
  return <canvas ref={ref} className="partner-preview" width={150} height={200} aria-hidden="true" />;
}

// 靶场"僵尸生成"页签预览：服装按种类缓存（避免每次渲染换 outfit），站姿固定、朝向左侧（面向玩家一侧）
const PREVIEW_OUTFITS = new Map<ZombieKind, ZombieOutfit>();
function previewZombie(kind: ZombieKind): Zombie {
  const radius = kind === "brute" ? 33 : kind === "normal" ? 25 : ZOMBIE_KIND_SPECS[kind].radius ?? 25;
  const skin = radius > 29 ? "#6e7c52" : "#7e8c60";
  let outfit = PREVIEW_OUTFITS.get(kind);
  if (!outfit) { outfit = randomZombieOutfit(skin); PREVIEW_OUTFITS.set(kind, outfit); }
  return {
    id: 0, kind, warehouseArmor: kind === "armored" || kind === "armoredRunner", x: 0, y: 0, hp: 1, maxHp: 1, speed: 0, radius, attack: 0,
    damageReduction: 0, shieldIntact: kind === "shield", shieldHp: kind === "shield" ? SHIELD_HP : 0, shieldDents: [], spitAt: 0, nextSpitAt: 0,
    lastHit: 0, attackHitApplied: true, knockedDownAt: 0, knockedDownUntil: 0,
    knockFacing: -1, knockStartFactor: 0, knockStartLift: 0, knockStartRecoveryProgress: 0,
    debuffedUntil: 0, staggeredUntil: 0, heldUntil: 0, ignitedAt: 0,
    missingLimbs: new Set<ZombieLimb>(), wounds: [], tint: outfit.top, outfit, wobble: 0,
  };
}

function ZombieKindPreview({ kind, width = 150, height = 200, className = "spawn-preview" }: { kind: ZombieKind; width?: number; height?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const z = previewZombie(kind);
    // 统一缩放：按最大体型（radius 36）自动校准到画布高度，种类间保留相对体型差（突变/重甲明显更高大）
    const fit = (height - 14) / (BASE_HUMAN_HEIGHT * (36 / 25) * CHARACTER_SCALE);
    const scale = (z.radius / 25) * CHARACTER_SCALE * fit;
    const skin = z.radius > 29 ? "#6e7c52" : "#7e8c60";
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height - 6);
    if (z.kind === "zombieDog") drawZombieDog(ctx, z, scale, -1, 0);
    else {
      drawZombieLegAssembly(ctx, z, standingLegPose(-1, -5), standingLegPose(-1, 5), scale);
      drawZombieTorso(ctx, z, scale);
      drawZombieArmAssembly(ctx, z, zombieSmashArmPose(0, -1, -1), zombieSmashArmPose(0, -1, 1), scale, skin);
      drawZombieHeadAndWounds(ctx, z, scale, -1, true);
    }
    if (z.kind === "shield" && z.shieldIntact) drawZombieShield(ctx, z, scale, -1);
    ctx.restore();
  }, [kind, width, height]);
  return <canvas ref={ref} className={className} width={width} height={height} aria-hidden="true" />;
}

function WeaponPreview({ weapon }: { weapon: WeaponKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const bounds = measureWeaponBounds(weapon);
    const scale = Math.min((canvas.width - 18) / bounds.width, (canvas.height - 14) / bounds.height);
    ctx.translate(canvas.width / 2 - bounds.cx * scale, canvas.height / 2 - bounds.cy * scale);
    drawWeaponModel(ctx, weapon, scale);
    ctx.restore();
  }, [weapon]);
  return <canvas ref={ref} className="weapon-preview" width={220} height={92} aria-hidden="true" />;
}

function lineCircleHitT(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, radius: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a === 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  if (near >= 0 && near <= 1) return near;
  if (far >= 0 && far <= 1) return far;
  return null;
}

// 取瞄准线穿过圆形躯干时离圆心最近的位置；用于重甲胸口，使正面瞄准点不会被“圆形外沿首交点”误判为装甲。
function lineCircleClosestT(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, radius: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return null;
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lengthSq));
  const closestX = x1 + dx * t;
  const closestY = y1 + dy * t;
  return (closestX - cx) ** 2 + (closestY - cy) ** 2 <= radius * radius ? t : null;
}

function hitZombieRegion(x1: number, y1: number, x2: number, y2: number, zombie: Zombie, now: number, facingTargetX = x1): ZombieHit | null {
  const scale = (zombie.radius / 25) * CHARACTER_SCALE;
  const pose = zombieKnockPose(zombie, now);
  const rotation = pose.rotation;
  const pivotX = pose.pivotX;
  const pivotY = pose.pivotY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dogFacing = pose.active ? zombie.knockFacing : facingTargetX >= zombie.x ? 1 : -1;
  const dogLunge = zombie.kind === "zombieDog" ? zombieDogLunge(zombie, now) : 0;
  const dogShiftX = dogFacing * dogLunge * 13;
  const dogShiftY = -dogLunge * 5;
  const regions: Array<{ region: HitRegion; localX: number; localY: number; radius: number }> = zombie.kind === "zombieDog"
    ? [
      { region: "head", localX: dogShiftX + dogFacing * (31 + dogLunge * 7), localY: dogShiftY - 65, radius: 15 * scale },
      { region: "body", localX: dogShiftX, localY: dogShiftY - 54, radius: 25 * scale },
      { region: "legs", localX: dogShiftX, localY: dogShiftY - 18, radius: 18 * scale },
    ]
    : [
      { region: "head", localX: 0, localY: -114, radius: 10.5 * scale },
      { region: "body", localX: 0, localY: -80, radius: (zombie.kind === "juggernaut" ? JUGGERNAUT_BODY_HIT_RADIUS : 18) * scale },
      { region: "legs", localX: 0, localY: -29, radius: 17 * scale },
    ];
  let nearest: ZombieHit | null = null;
  for (const region of regions) {
    const regionX = pivotX + (cos * region.localX - sin * region.localY) * scale;
    const regionY = pivotY + (sin * region.localX + cos * region.localY) * scale;
    const juggernautBody = zombie.kind === "juggernaut" && region.region === "body";
    // 排序仍使用身体圆外沿的首次交点，保证前方重甲可以挡住后方目标；仅用最近点采样玩家实际瞄准的胸口位置。
    const orderT = lineCircleHitT(x1, y1, x2, y2, regionX, regionY, region.radius);
    const sampleT = juggernautBody
      ? lineCircleClosestT(x1, y1, x2, y2, regionX, regionY, region.radius)
      : orderT;
    if (orderT === null || sampleT === null || (nearest && orderT >= nearest.t)) continue;
    const x = x1 + (x2 - x1) * sampleT;
    const y = y1 + (y2 - y1) * sampleT;
    const relativeX = x - pivotX;
    const relativeY = y - pivotY;
    let hitLocalX = (cos * relativeX + sin * relativeY) / scale;
    let hitLocalY = (-sin * relativeX + cos * relativeY) / scale;
    // 命中盒跟随犬首前探；伤口则还原到稳定的模型局部坐标，避免攻击动画结束后漂移。
    if (zombie.kind === "zombieDog") {
      hitLocalX -= dogShiftX + (region.region === "head" ? dogFacing * dogLunge * 7 : 0);
      hitLocalY -= dogShiftY;
      if (region.region === "head") hitLocalX *= dogFacing;
    }
    nearest = {
      region: region.region,
      t: orderT,
      x,
      y,
      localX: hitLocalX,
      localY: hitLocalY,
    };
  }
  return nearest;
}

/** 盔甲/盾牌格挡火花：子弹被挡下时的短促亮橙色溅射 + 中心白亮闪点（不造成血液效果） */
function emitArmorSpark(g: GameState, x: number, y: number, now: number, angle: number) {
  for (let i = 0; i < 8; i++) {
    const a = angle + Math.PI + (Math.random() - .5) * 1.7;
    const speed = 170 + Math.random() * 260;
    g.particles.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 45,
      until: now + 90 + Math.random() * 110,
      color: i % 3 === 0 ? "#fff3b0" : i % 2 ? "#ffb84d" : "#ff8a2a",
      size: 1.5 + Math.random() * 2,
    });
  }
  g.particles.push({ x, y, vx: 0, vy: 0, until: now + 70, color: "#fffbe0", size: 5 });
}

/** 僵尸音效随与玩家的水平距离衰减。 */
function distanceVolume(fromX: number, playerX: number) {
  const distance = Math.abs(fromX - playerX);
  return Math.max(0.15, Math.min(1, 1 - distance / 1350));
}

export function DeadRoadGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const stateRef = useRef<GameState>(freshState());
  const screenRef = useRef<Screen>("menu");
  const keysRef = useRef(new Set<string>());
  const mouseRef = useRef({ x: 880, y: 400, down: false });
  const reloadRef = useRef<(now: number) => void>(() => {});
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  // 动态世界宽度：画布位图宽度（世界单位）跟随舞台实际宽高比；worldWRef 供各回调免闭包读取
  const [canvasW, setCanvasW] = useState(DEFAULT_WORLD_W);
  const worldWRef = useRef(DEFAULT_WORLD_W);
  const [screen, setScreen] = useState<Screen>("menu");
  const [majorMode, setMajorMode] = useState<MajorMode>("classic");
  const [explorationCoins] = useState(0);
  const [explorationExperience] = useState(0);
  const [explorationNotice, setExplorationNotice] = useState<string | null>(null);
  const [explorationClearedTasks, setExplorationClearedTasks] = useState<number[]>([]);
  const [recruitTickets] = useState(0);
  const [lotteryPhase, setLotteryPhase] = useState<LotteryPhase>("idle");
  const [lotteryKilled, setLotteryKilled] = useState(0);
  const [lotteryRewards, setLotteryRewards] = useState<LotteryRarity[]>([]);
  const [lotteryDrawCount, setLotteryDrawCount] = useState<1 | 10>(1);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setExplorationClearedTasks(readExplorationClearedTasks()); });
    return () => { active = false; };
  }, []);
  const [shopTab, setShopTab] = useState<ShopTab>("weapons");
  // 靶场"僵尸生成"页签：各品种配置数量（0~30），纯 UI state，不进游戏快照
  const [spawnCounts, setSpawnCounts] = useState<Record<ZombieKind, number>>({
    normal: 6, brute: 0, runner: 0, spitter: 0, largeSpitter: 0, zombieDog: 0,
    helmet: 0, helmetRunner: 0, armored: 0, armoredRunner: 0,
    mutant: 0, army: 0, armyRunner: 0, shield: 0, juggernaut: 0,
  });
  // 商店详情视图：点击商品卡先展开详情面板，确认后再购买/装备
  const [shopDetail, setShopDetail] = useState<{ kind: "weapon" | "armor" | "partner" | "item"; key: string } | null>(null);
  // 装备整备：null=主视图（五栏当前装备）；非 null=二级选择界面（选择主/副武器/近战/战斗服/搭档）
  const [loadoutOpen, setLoadoutOpen] = useState<string | null>(null);
  // ESC 键分层处理需要同步读取（键盘监听为 ref 回调，避免闭包捕获旧 state）
  const loadoutOpenRef = useRef<string | null>(null);
  useEffect(() => { loadoutOpenRef.current = loadoutOpen; }, [loadoutOpen]);
  // 僵尸图鉴：见过的种类（localStorage 持久化；queueMicrotask 延迟到水合后读取，避免 SSR 不一致）、当前页码、来源界面（菜单/暂停）
  const [seenKinds, setSeenKinds] = useState<ZombieKind[]>([]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setSeenKinds(readSeenZombies()); });
    return () => { active = false; };
  }, []);
  const [codexPage, setCodexPage] = useState(0);
  const [codexCategory, setCodexCategory] = useState<CodexCategory>("regular");
  const [codexReturn, setCodexReturn] = useState<"menu" | "pause" | "exploration">("menu");
  // 已通关关卡（localStorage 持久化，独立键 dead-road-levels-cleared；queueMicrotask 延迟到水合后读取，避免 SSR 不一致）
  const [clearedLevels, setClearedLevels] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setClearedLevels(readClearedLevels()); });
    return () => { active = false; };
  }, []);
  const [bestDay, setBestDay] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(85);
  const [paused, setPaused] = useState(false);
  const [saveInfo, setSaveInfo] = useState<{ nextDay: number } | null>(null);
  const pausedRef = useRef(false);
  const pausedAtRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState({
    mode: "survival" as GameMode, day: 1, coins: 0, kills: 0, hp: 100, maxHp: 100, weapon: "glock17" as WeaponKey,
    owned: ["glock17", "sawedoff", "fruitknife"] as WeaponKey[],
    loadout: ["glock17", "sawedoff"] as [WeaponKey, WeaponKey],
    melee: "fruitknife" as WeaponKey,
    armor: "civilian" as ArmorKey,
    ownedArmors: ["civilian"] as ArmorKey[],
    ownedPartners: [] as PartnerKey[],
    partner: null as PartnerKey | null,
    itemInventory: EMPTY_ITEM_INVENTORY(),
    stats: { shotsHit: 0, headshots: 0, coinsEarned: 0, coinsSpent: 0, bonusEarned: 0 },
    lastDayBonus: 0,
    rangeSpawnMode: "endless" as "endless" | "batch",
    rangeSpawnPending: 0,
    rangeBatchTotal: 0,
    levelId: null as string | null,
  });

  // 浏览器标签页隐藏时 RAF 会暂停。恢复可见时整体平移游戏时间轴，确保“坚持 20 秒”
  // 只计算实际游玩时间，也避免隐藏期间跳过刷怪、冷却、投掷物与动画过程。
  useEffect(() => {
    const onVisibilityChange = () => {
      const now = performance.now();
      if (document.hidden) {
        hiddenAtRef.current = now;
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      // 手动暂停期间由 resumeGame 统一平移完整暂停时长，避免隐藏时长被重复计算。
      if (hiddenAt !== null && screenRef.current === "playing" && !pausedRef.current) shiftTimeline(stateRef.current, now - hiddenAt);
      lastFrameRef.current = now;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const changeScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    if (next === "playing") {
      sound.ambience(environmentForDay(stateRef.current.day));
    } else {
      sound.stopAmbience();
      sound.setHeartbeat(null);
      sound.setGatlingSpin(false);
    }
    setScreen(next);
  }, []);

  const switchMajorMode = useCallback((next: MajorMode) => {
    sound.uiClick();
    setMajorMode(next);
    setExplorationNotice(null);
    changeScreen(next === "classic" ? "menu" : "exploration");
  }, [changeScreen]);

  const openLottery = useCallback(() => {
    sound.uiClick();
    setLotteryPhase("idle");
    setLotteryKilled(0);
    setLotteryRewards([]);
    changeScreen("lottery");
  }, [changeScreen]);

  const closeLottery = useCallback(() => {
    if (lotteryPhase === "firing" || lotteryPhase === "flash") return;
    sound.uiClick();
    setLotteryPhase("idle");
    changeScreen("exploration");
  }, [changeScreen, lotteryPhase]);

  const startLotteryDraw = useCallback((count: 1 | 10) => {
    sound.uiClick();
    setLotteryDrawCount(count);
    setLotteryRewards(Array.from({ length: count }, () => rollLotteryRarity()));
    setLotteryKilled(0);
    setLotteryPhase("firing");
  }, []);

  useEffect(() => {
    if (screen !== "lottery" || lotteryPhase !== "firing") return;
    let nextKill = 0;
    let finishTimer: number | undefined;
    const firingTimer = window.setInterval(() => {
      nextKill += 1;
      setLotteryKilled(nextKill);
      sound.gunshot("mg42", { fireRateMs: WEAPONS.mg42.fireRate, volume: .72 });
      if (nextKill >= LOTTERY_ZOMBIES.length) {
        window.clearInterval(firingTimer);
        finishTimer = window.setTimeout(() => setLotteryPhase("flash"), 260);
      }
    }, LOTTERY_KILL_INTERVAL_MS);
    return () => {
      window.clearInterval(firingTimer);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [lotteryPhase, screen]);

  useEffect(() => {
    if (screen !== "lottery" || lotteryPhase !== "flash") return;
    const revealTimer = window.setTimeout(() => setLotteryPhase("reveal"), LOTTERY_WHITE_FLASH_MS);
    return () => window.clearTimeout(revealTimer);
  }, [lotteryPhase, screen]);

  // 僵尸图鉴：只列出"见过"的种类（生存模式生成上场即登记），一页一种翻页浏览；ESC 返回来源界面
  const codexSeenList = ZOMBIE_CONFIG_KINDS.filter((kind) => seenKinds.includes(kind));
  const activeCodexList = codexCategory === "regular" ? codexSeenList : [];
  const openCodex = useCallback((from: "menu" | "pause" | "exploration") => {
    sound.uiClick();
    setCodexReturn(from);
    setCodexCategory("regular");
    setCodexPage(0);
    changeScreen("codex");
  }, [changeScreen]);
  const closeCodex = useCallback(() => {
    sound.uiClick();
    changeScreen(codexReturn === "pause" ? "playing" : codexReturn === "exploration" ? "exploration" : "menu");
  }, [changeScreen, codexReturn]);
  const flipCodex = useCallback((delta: number) => {
    sound.uiClick();
    setCodexPage((current) => Math.max(0, Math.min(Math.max(0, activeCodexList.length - 1), current + delta)));
  }, [activeCodexList.length]);

  // 关卡模式：占位页（内容制作中），ESC/按钮返回主菜单；后续在此接入关卡选择与玩法
  const openLevels = useCallback(() => {
    sound.uiClick();
    changeScreen("levels");
  }, [changeScreen]);
  const closeLevels = useCallback(() => {
    sound.uiClick();
    changeScreen("menu");
  }, [changeScreen]);

  // 关卡模式结算（通关用时/击杀数），levelComplete 面板读取
  const [levelResult, setLevelResult] = useState<{ levelId: string; timeMs: number; kills: number } | null>(null);

  // 动态世界宽度：监听舞台实际尺寸 → 位图宽 = 720 × 实际宽高比（精确比例，不夹取 → 零拉伸）。
  // 仅在真实窗口/视口尺寸变化时触发：界面切换不改变舞台几何，worldW 稳定、实体不跳变。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const applyStageSize = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nextW = Math.max(1, Math.round((H * rect.width) / rect.height));
      if (nextW === worldWRef.current) return;
      const g = stateRef.current;
      if (g.mode === "level" && g.level) {
        // 关卡模式：世界宽 = 画布宽 + 场景余量；resize 时按新世界宽比例重映射实体，保持场景布局
        const nextWorldW = levelSceneWorldWidth(g.level.levelId, g.level.sceneIndex, nextW);
        remapWorldX(g, nextWorldW / g.worldW);
        g.worldW = nextWorldW;
        g.cameraX = 0;
      } else {
        remapWorldX(g, nextW / g.worldW);
        g.worldW = nextW;
      }
      worldWRef.current = nextW;
      setCanvasW(nextW);
    };
    applyStageSize();
    const observer = new ResizeObserver(applyStageSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setMuted(sound.isMuted());
      setVolume(Math.round(sound.getMasterVolume() * 100));
      const saved = Number(window.localStorage.getItem(SAVE_KEY) || 0);
      setBestDay(Number.isFinite(saved) ? saved : 0);
      const progress = readProgressSave();
      setSaveInfo(progress ? { nextDay: progress.nextDay } : null);
    });
    return () => { active = false; };
  }, []);

  const saveBest = useCallback((day: number) => {
    setBestDay((current) => {
      const next = Math.max(current, day);
      window.localStorage.setItem(SAVE_KEY, String(next));
      notifyLocalSaveChanged();
      return next;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(sound.toggleMuted());
  }, []);

  const changeVolume = useCallback((value: number) => {
    const next = Math.min(100, Math.max(0, Math.round(value)));
    setVolume(next);
    sound.setMasterVolume(next / 100);
  }, []);

  const syncSnapshot = useCallback(() => {
    const g = stateRef.current;
    setSnapshot({
      mode: g.mode, day: g.day, coins: g.coins, kills: g.kills, hp: g.player.hp, maxHp: g.player.maxHp,
      weapon: g.player.weapon, owned: Array.from(g.owned), loadout: [...g.loadout] as [WeaponKey, WeaponKey], melee: g.melee,
      armor: g.armor, ownedArmors: Array.from(g.ownedArmors),
      ownedPartners: Array.from(g.ownedPartners), partner: g.partner,
      itemInventory: { ...g.itemInventory },
      stats: { ...g.stats },
      lastDayBonus: g.lastDayBonus,
      rangeSpawnMode: g.rangeSpawnMode,
      rangeSpawnPending: g.rangeSpawnQueue.length,
      rangeBatchTotal: g.rangeBatchTotal,
      levelId: g.level?.levelId ?? null,
    });
  }, []);

  // 关卡模式：开始指定关卡——按关卡配置初始武器与护甲，fists 始终作为空槽兜底
  const startLevel = useCallback((levelId: string) => {
    if (levelId !== LEVEL1_ID && levelId !== LEVEL2_ID && levelId !== LEVEL3_ID && levelId !== LEVEL4_ID && levelId !== LEVEL5_ID && levelId !== LEVEL6_ID && levelId !== LEVEL7_ID && levelId !== LEVEL8_ID) return;
    // 解锁守卫：未通关上一关不可进入（卡片锁定态已拦截，此为其后多一重保险）
    if (!isLevelUnlocked(levelId, readClearedLevels())) return;
    sound.uiClick();
    const now = performance.now();
    const g = freshState("level", worldWRef.current);
    g.day = 1;
    g.waveTotal = 0;
    g.armor = "civilian";
    g.ownedArmors = new Set<ArmorKey>(["civilian"]);
    g.player.armor = "civilian";
    if (levelId === LEVEL1_ID) {
      // 第一关：空手出门（单槽携带，fists 兜底），全程靠拾取武装
      g.owned = new Set<WeaponKey>(["fists"]);
      g.loadout = ["fists", "fists"];
      g.melee = "fists";
      g.player.weapon = "fists";
    } else if (levelId === LEVEL2_ID) {
      // 第二关：格洛克 17 + 水果刀开局
      g.owned = new Set<WeaponKey>(["fists", "glock17", "fruitknife"]);
      g.loadout = ["glock17", "glock17"];
      g.melee = "fruitknife";
      g.player.weapon = "glock17";
      g.player.ammo.glock17 = WEAPONS.glock17.magazine;
    } else if (levelId === LEVEL3_ID) {
      // 第三关：M16 + 格洛克 17 + 破片手榴弹 ×3，战斗服为军队服
      g.owned = new Set<WeaponKey>(["fists", "m16", "glock17"]);
      g.loadout = ["m16", "glock17"];
      g.melee = "fists";
      g.player.weapon = "m16";
      g.player.ammo.m16 = WEAPONS.m16.magazine;
      g.player.ammo.glock17 = WEAPONS.glock17.magazine;
      g.itemInventory.frag = 3;
      g.armor = "army";
      g.ownedArmors = new Set<ArmorKey>(["army"]);
      g.player.armor = "army";
      g.player.maxHp = ARMORS.army.maxHp;
      g.player.hp = g.player.maxHp;
    } else if (levelId === LEVEL4_ID) {
      // 第四关：SCAR-H + 格洛克 17 开局，战斗服为军队服
      g.owned = new Set<WeaponKey>(["fists", "scarh", "glock17"]);
      g.loadout = ["scarh", "glock17"];
      g.melee = "fists";
      g.player.weapon = "scarh";
      g.player.ammo.scarh = WEAPONS.scarh.magazine;
      g.player.ammo.glock17 = WEAPONS.glock17.magazine;
      g.armor = "army";
      g.ownedArmors = new Set<ArmorKey>(["army"]);
      g.player.armor = "army";
      g.player.maxHp = ARMORS.army.maxHp;
      g.player.hp = g.player.maxHp;
    } else if (levelId === LEVEL7_ID || levelId === LEVEL8_ID) {
      // 第七、八关：AK-47 + 格洛克 17 开局，战斗服为军队服
      g.owned = new Set<WeaponKey>(["fists", "ak47", "glock17"]);
      g.loadout = ["ak47", "glock17"];
      g.melee = "fists";
      g.player.weapon = "ak47";
      g.player.ammo.ak47 = WEAPONS.ak47.magazine;
      g.player.ammo.glock17 = WEAPONS.glock17.magazine;
      g.armor = "army";
      g.ownedArmors = new Set<ArmorKey>(["army"]);
      g.player.armor = "army";
      g.player.maxHp = ARMORS.army.maxHp;
      g.player.hp = g.player.maxHp;
    } else {
      // 第五、六关：M16 + 格洛克 17 开局，战斗服为军队服
      g.owned = new Set<WeaponKey>(["fists", "m16", "glock17"]);
      g.loadout = ["m16", "glock17"];
      g.melee = "fists";
      g.player.weapon = "m16";
      g.player.ammo.m16 = WEAPONS.m16.magazine;
      g.player.ammo.glock17 = WEAPONS.glock17.magazine;
      g.armor = "army";
      g.ownedArmors = new Set<ArmorKey>(["army"]);
      g.player.armor = "army";
      g.player.maxHp = ARMORS.army.maxHp;
      g.player.hp = g.player.maxHp;
    }
    g.level = { levelId, sceneIndex: 0, taskIndex: 0, sceneKills: 0, startedAt: now, taskDoneFlashUntil: 0, completed: false, eventStage: "none", eventAt: 0, eventCount: 0, nextEventSpawnAt: 0, truckX: -1, truckY: -1, truckStopX: 0, wallHp: 0, powerOn: false, squadHp: [], vehicleHp: 0, vehicleAmmo: 0, vehicleLastShot: 0, vehicleReloadUntil: 0, vehicleAimAngle: 0, dialog: null };
    loadLevelScene(g, 0, now, worldWRef.current);
    if (levelId === LEVEL3_ID) {
      // 开场演出：睡梦中 → 警报渐强 + 屏幕渐亮 → 起身
      g.level.eventStage = "sleep";
      g.level.eventAt = now;
      sound.alarmCrescendo(LEVEL3_WAKE_MS / 1000);
    }
    stateRef.current = g;
    lastFrameRef.current = now;
    setLevelResult(null);
    syncSnapshot();
    changeScreen("playing");
    canvasRef.current?.focus({ preventScroll: true });
  }, [changeScreen, syncSnapshot]);

  // 关卡任务链：条件达成 → 下一任务 / 下一场景 / 通关结算
  const updateLevelTasks = useCallback((g: GameState, now: number) => {
    const level = g.level;
    if (!level || level.completed) return;
    const scene = levelScenesFor(level.levelId)[level.sceneIndex];
    const task = scene.tasks[level.taskIndex];
    if (!task) return;
    const advance = () => {
      level.taskIndex += 1;
      level.taskDoneFlashUntil = now + 1600;
      sound.taskComplete();
    };
    const goScene = (next: number) => {
      level.taskDoneFlashUntil = now + 1600;
      sound.taskComplete();
      loadLevelScene(g, next, now, worldWRef.current);
      level.sceneIndex = next;
      level.taskIndex = 0;
      level.sceneKills = 0;
      syncSnapshot();
    };
    const completeLevel = () => {
      level.completed = true;
      // 登记通关记录（解锁下一关），与结算界面提示联动
      setClearedLevels(markLevelCleared(level.levelId));
      setLevelResult({ levelId: level.levelId, timeMs: now - level.startedAt, kills: g.kills });
      sound.taskComplete();
      syncSnapshot();
      changeScreen("levelComplete");
    };
    // 任务失败（第三关：围墙被攻破）→ 失败界面可重试本关
    const failLevel = () => {
      level.completed = true;
      sound.gameOver();
      syncSnapshot();
      changeScreen("gameover");
    };
    // ===== 第八关「清理高速」事件流 =====
    if (level.levelId === LEVEL8_ID) {
      if (level.sceneIndex === 0) {
        const teammateX = (LEVEL8_BRIEFING_TABLE_FX + .05) * g.worldW;
        if (task.id === "find-highway-team" && level.eventStage === "none"
          && Math.abs(g.player.x - teammateX) < 170 && Math.abs(g.player.y - 350) < 150) {
          level.eventStage = "talk";
          level.dialog = { lines: [{ speaker: "队友", text: "我们需要清理高速并占领收费站，扫清障碍" }], index: 0 };
          return;
        }
        if (level.eventStage === "talk" && !level.dialog) {
          level.eventStage = "none";
          advance();
          return;
        }
        if (task.id === "board-armored-vehicle" && g.player.x >= g.worldW - 120) goScene(1);
        return;
      }
      if (level.sceneIndex === 1) {
        if (g.player.x >= LEVEL8_BASE_GATE_FX * g.worldW - 90) {
          goScene(2);
          level.eventStage = "armored-drive";
          level.eventAt = now;
          level.truckX = LEVEL8_VEHICLE_START_X;
          level.truckY = 500;
          level.vehicleHp = LEVEL8_VEHICLE_HP;
          level.vehicleAmmo = LEVEL8_HMG_MAGAZINE;
          level.vehicleLastShot = 0;
          level.vehicleReloadUntil = 0;
          g.player.x = level.truckX;
          g.player.y = level.truckY;
        }
        return;
      }
      if (level.sceneIndex === 2) {
        if (level.vehicleHp <= 0) { failLevel(); return; }
        const tollX = LEVEL8_TOLL_FX * g.worldW;
        if (level.eventStage === "armored-drive"
          && level.sceneKills >= LEVEL8_HIGHWAY_TOTAL && level.truckX >= tollX - 260) {
          level.eventStage = "disembark";
          level.eventAt = now;
          level.eventCount = 0;
          level.truckX = tollX - 220;
          return;
        }
        if (level.eventStage === "disembark") {
          if (now >= level.eventAt + 700) {
            g.player.x = level.truckX + 130;
            g.player.y = 500;
          }
          if (level.eventCount < LEVEL8_TOLL_SQUAD_SIZE && now >= level.eventAt + 900 + level.eventCount * 420) {
            g.npcs.push(makeLevelNpc(level.truckX + 55, 390 + level.eventCount * 100, true, false, "m16"));
            level.eventCount += 1;
          }
          if (level.eventCount >= LEVEL8_TOLL_SQUAD_SIZE && now >= level.eventAt + 2100) {
            goScene(3);
            level.squadHp = Array(LEVEL8_TOLL_SQUAD_SIZE).fill(100);
            for (let i = 0; i < LEVEL8_TOLL_SQUAD_SIZE; i++) {
              g.npcs.push(makeLevelNpc(g.player.x - 70 - i * 55, g.player.y + (i === 0 ? -60 : 60), true, false, "m16", { followPlayer: true, targetable: true, squadIndex: i }));
            }
          }
        }
        return;
      }
      if (level.sceneIndex === 3 && task.id === "clear-toll-station" && level.sceneKills >= LEVEL8_TOLL_TOTAL) completeLevel();
      return;
    }
    // ===== 第七关「夺取仓库」事件流 =====
    if (level.levelId === LEVEL7_ID) {
      // 场景 0 · 商讨室：找到队友，完成仓库行动简报后出门。
      if (level.sceneIndex === 0) {
        const teammateX = (LEVEL7_BRIEFING_TABLE_FX + .05) * g.worldW;
        if (task.id === "find-warehouse-team" && level.eventStage === "none"
          && Math.abs(g.player.x - teammateX) < 170 && Math.abs(g.player.y - 350) < 150) {
          level.eventStage = "talk";
          level.dialog = { lines: [{ speaker: "队友", text: "我们要夺取仓库，获得更多物资" }], index: 0 };
          return;
        }
        if (level.eventStage === "talk" && !level.dialog) {
          level.eventStage = "none";
          advance();
          return;
        }
        if (task.id === "board-warehouse-truck" && g.player.x >= g.worldW - 120) goScene(1);
        return;
      }
      // 场景 1 · 基地集合区：走到基地大门登车。
      if (level.sceneIndex === 1) {
        if (g.player.x >= LEVEL7_BASE_GATE_FX * g.worldW - 90) {
          goScene(2);
          level.eventStage = "ride";
          level.eventAt = now;
          level.truckStopX = LEVEL7_TRUCK_STOP_FX * g.worldW;
          level.truckY = 380;
          level.truckX = level.truckStopX - 1500;
          sound.truckEngine();
        }
        return;
      }
      // 场景 2 · 仓库大门：军车完全停稳后，玩家与四名 M16 队友依次下车警戒。
      if (level.sceneIndex === 2) {
        if (level.eventStage === "ride") {
          const t = Math.min(1, (now - level.eventAt) / 2800);
          const ease = 1 - (1 - t) * (1 - t);
          level.truckX = level.truckStopX - 1500 * (1 - ease);
          g.player.x = level.truckX + 150;
          g.player.y = level.truckY + 140;
          if (t >= 1) {
            level.eventStage = "disembark";
            level.eventAt = now;
            level.eventCount = 0;
            g.player.invulnerableUntil = now + 1200;
            sound.truckBrake();
          }
          return;
        }
        if (level.eventStage === "disembark") {
          if (now < level.eventAt + LEVEL7_PLAYER_EXIT_DELAY_MS) return;
          g.player.x = level.truckX + 115;
          g.player.y = Math.max(ROAD_TOP + 80, Math.min(ROAD_BOTTOM - 30, level.truckY + 132));
          if (level.eventCount < LEVEL7_SQUAD_SIZE
            && now >= level.eventAt + LEVEL7_PLAYER_EXIT_DELAY_MS + 300 + level.eventCount * 420) {
            const disembarkY = Math.max(ROAD_TOP + 60, Math.min(ROAD_BOTTOM - 30, level.truckY + 54 + level.eventCount * 46));
            g.npcs.push(makeLevelNpc(level.truckX + 70, disembarkY, true, true, "m16"));
            level.eventCount += 1;
          }
          if (level.eventCount >= LEVEL7_SQUAD_SIZE) level.eventStage = "none";
          return;
        }
        if (level.eventStage === "none" && g.player.x >= LEVEL7_WAREHOUSE_DOOR_FX * g.worldW - 40) goScene(3);
        return;
      }
      // 场景 3 · 物资堆放区：先取得高穿透燧石66，再清除 2 重甲、5 盾兵与 10 护甲僵尸。
      if (task.id === "take-flint66") {
        if (g.player.weapon === "flint66" || g.loadout.includes("flint66")) advance();
        return;
      }
      if (task.id === "clear-warehouse") {
        if (level.sceneKills >= LEVEL7_INITIAL_TOTAL) {
          advance();
          level.eventStage = "warehouse-defense";
          level.eventAt = now;
          level.eventCount = 0;
          level.nextEventSpawnAt = now + 350;
          level.wallHp = LEVEL7_WALL_HP;
          const wallX = LEVEL7_WALL_FX * g.worldW;
          for (const y of [286, 416, 546]) {
            g.barricades.push({ id: LEVEL7_WALL_ID + y, x: wallX, y, hp: LEVEL7_WALL_HP, maxHp: LEVEL7_WALL_HP });
          }
          for (let i = 0; i < LEVEL7_DEFENDERS; i++) {
            g.npcs.push(makeLevelNpc(wallX - 170 - (i % 2) * 78, 278 + i * 92, true, true, "m16"));
          }
          const carrier = makeLevelNpc(LEVEL7_TRUCK_FX * g.worldW, 540, false, false, "fists", { scripted: true, carryingCrate: false });
          carrier.field.angle = 0;
          carrier.field.moving = true;
          g.npcs.push(carrier);
        }
        return;
      }
      if (task.id === "protect-supplies" && level.eventStage === "warehouse-defense") {
        if (level.wallHp <= 0) { failLevel(); return; }
        // 护甲僵尸在运输完成前持续从右侧压向左侧围墙；同屏数量设上限避免无限堆积。
        const activeAttackers = g.zombies.reduce((count, zombie) => count + Number(zombie.hp > 0), 0);
        if (now >= level.nextEventSpawnAt && activeAttackers < LEVEL7_MAX_ACTIVE_ATTACKERS) {
          const wallX = LEVEL7_WALL_FX * g.worldW;
          // 仓库是长场景，但尸潮必须在本次运输期间抵达：出生点固定在围墙右侧，而不是世界最右端。
          const spawnX = Math.min(g.worldW - 90, wallX + LEVEL7_ATTACKER_SPAWN_OFFSET);
          const attacker = makeLevelZombie(970000 + Math.floor(now), "army", spawnX, 250 + Math.random() * 350, now);
          g.zombies.push(applyLevel7ArmorZombie(attacker));
          level.nextEventSpawnAt = now + LEVEL7_DEFEND_SPAWN_MS;
        }
        // 一次往返 = 卡车 → 仓库物资区（空手）→ 卡车（抱箱），总计执行两次。
        const totalMs = LEVEL7_TRANSPORT_LEG_MS * LEVEL7_TRANSPORT_LEGS;
        const elapsed = Math.min(totalMs, now - level.eventAt);
        const completedLegs = Math.min(LEVEL7_TRANSPORT_LEGS, Math.floor(elapsed / LEVEL7_TRANSPORT_LEG_MS));
        level.eventCount = completedLegs;
        const legIndex = Math.min(LEVEL7_TRANSPORT_LEGS - 1, Math.floor(elapsed / LEVEL7_TRANSPORT_LEG_MS));
        const legT = Math.min(1, (elapsed - legIndex * LEVEL7_TRANSPORT_LEG_MS) / LEVEL7_TRANSPORT_LEG_MS);
        const smoothT = legT * legT * (3 - 2 * legT);
        const supplyX = LEVEL7_SUPPLY_FX * g.worldW;
        const truckX = LEVEL7_TRUCK_FX * g.worldW;
        const headingToSupply = legIndex % 2 === 0;
        const fromX = headingToSupply ? truckX : supplyX;
        const toX = headingToSupply ? supplyX : truckX;
        const carrier = g.npcs.find((npc) => npc.scripted);
        if (carrier) {
          carrier.field.x = fromX + (toX - fromX) * smoothT;
          carrier.field.y = 540;
          carrier.field.angle = toX < fromX ? Math.PI : 0;
          carrier.field.moving = elapsed < totalMs && legT < .98;
          carrier.carryingCrate = !headingToSupply && elapsed < totalMs;
        }
        if (elapsed >= totalMs && level.wallHp > 0) completeLevel();
        return;
      }
      return;
    }
    // ===== 第六关「攻占大楼」事件流 =====
    if (level.levelId === LEVEL6_ID) {
      // 场景 0 · 商讨室：找到队友并完成两句行动简报，随后任务切换为上车。
      if (level.sceneIndex === 0) {
        const teammateX = (LEVEL6_BRIEFING_TABLE_FX + .05) * g.worldW;
        if (task.id === "find-assault-team" && level.eventStage === "none"
          && Math.abs(g.player.x - teammateX) < 170 && Math.abs(g.player.y - 350) < 150) {
          level.eventStage = "talk";
          level.dialog = {
            lines: [
              { speaker: "队友", text: "我们要参加攻占市政大楼的任务" },
              { speaker: "队友", text: "这次任务很危险，大家小心点" },
            ],
            index: 0,
          };
          return;
        }
        if (level.eventStage === "talk" && !level.dialog) {
          level.eventStage = "none";
          advance();
          return;
        }
        if (task.id === "board-assault-truck" && g.player.x >= g.worldW - 120) goScene(1);
        return;
      }
      // 场景 1 · 基地大门：上车后转到市政大楼大门，军车驶入并完全停稳。
      if (level.sceneIndex === 1) {
        if (task.id === "board-assault-truck" && g.player.x >= LEVEL6_BASE_GATE_FX * g.worldW - 90) {
          goScene(2);
          level.eventStage = "ride";
          level.eventAt = now;
          level.truckStopX = LEVEL6_TRUCK_STOP_FX * g.worldW;
          level.truckY = 380;
          level.truckX = level.truckStopX - 1500;
          level.squadHp = Array.from({ length: LEVEL6_SQUAD_SIZE }, () => LEVEL6_SQUAD_HP);
          sound.truckEngine();
        }
        return;
      }
      // 场景 2 · 市政大楼大门：车辆停稳后玩家与两名持 M16 队友下车，随后共同进入大楼。
      if (level.sceneIndex === 2) {
        if (level.eventStage === "ride") {
          const t = Math.min(1, (now - level.eventAt) / 2800);
          const ease = 1 - (1 - t) * (1 - t);
          level.truckX = level.truckStopX - 1500 * (1 - ease);
          g.player.x = level.truckX + 150;
          g.player.y = level.truckY + 140;
          if (t >= 1) {
            level.eventStage = "disembark";
            level.eventAt = now;
            level.eventCount = 0;
            g.player.invulnerableUntil = now + 1200;
            sound.truckBrake();
          }
          return;
        }
        if (level.eventStage === "disembark") {
          if (now < level.eventAt + LEVEL6_PLAYER_EXIT_DELAY_MS) return;
          g.player.x = level.truckX + 115;
          g.player.y = Math.max(ROAD_TOP + 80, Math.min(ROAD_BOTTOM - 30, level.truckY + 132));
          if (level.eventCount < LEVEL6_SQUAD_SIZE
            && now >= level.eventAt + LEVEL6_PLAYER_EXIT_DELAY_MS + 300 + level.eventCount * 420) {
            const squadIndex = level.eventCount;
            const disembarkY = Math.max(ROAD_TOP + 60, Math.min(ROAD_BOTTOM - 30, level.truckY + 70 + squadIndex * 72));
            g.npcs.push(makeLevelNpc(
              level.truckX + 70,
              disembarkY,
              true,
              false,
              "m16",
              { hp: LEVEL6_SQUAD_HP, followPlayer: true, targetable: true, squadIndex },
            ));
            level.eventCount += 1;
          }
          if (level.eventCount >= LEVEL6_SQUAD_SIZE) level.eventStage = "none";
          return;
        }
        if (level.eventStage === "none" && g.player.x >= LEVEL6_BUILDING_DOOR_FX * g.worldW - 40) goScene(3);
        return;
      }
      // 场景 3 · 断电长走廊：10 军队奔跑 + 3 重甲 + 10 军队，全清后进入配电室。
      if (level.sceneIndex === 3) {
        if (level.sceneKills >= LEVEL6_CORRIDOR_ONE_TOTAL && g.player.x >= g.worldW - 130) goScene(4);
        return;
      }
      // 场景 4 · 配电室：清剿 10 军队 + 5 盾兵，走到主电闸后恢复整栋楼照明并进入新走廊。
      if (level.sceneIndex === 4) {
        if (level.sceneKills >= LEVEL6_POWER_ROOM_TOTAL && g.player.x >= LEVEL6_POWER_SWITCH_FX * g.worldW - 120) {
          level.powerOn = true;
          g.flashUntil = now + 360;
          goScene(5);
        }
        return;
      }
      // 场景 5 · 二层走廊：5 盾兵 + 5 重甲，全清后进入档案室。
      if (level.sceneIndex === 5) {
        if (level.sceneKills >= LEVEL6_CORRIDOR_TWO_TOTAL && g.player.x >= g.worldW - 130) goScene(6);
        return;
      }
      // 场景 6 · 档案室：击杀 2 只重甲并从尽头离开，完成占领档案室任务。
      if (level.sceneIndex === 6) {
        if (level.sceneKills >= LEVEL6_ARCHIVE_TOTAL && g.player.x >= g.worldW - 130) goScene(7);
        return;
      }
      // 场景 7 · 楼梯间：沿与台阶共用的轨迹上楼，抵达中央大厅门槛。
      if (level.sceneIndex === 7) {
        if (g.player.x >= g.worldW - 120 && g.player.y <= LEVEL4_STAIR_EXIT_Y + 4) goScene(8);
        return;
      }
      // 场景 8 · 中央大厅：巨型变异 Boss + 两只突变强壮僵尸全部击杀即通关。
      if (level.sceneIndex === 8) {
        if (level.sceneKills >= LEVEL6_CENTRAL_HALL_TOTAL) completeLevel();
        return;
      }
      return;
    }
    // ===== 第五关「解救行动」事件流 =====
    if (level.levelId === LEVEL5_ID) {
      // 场景 0 · 无线电监听室：找到队友并确认隧道求救信号。
      if (level.sceneIndex === 0) {
        const teammateX = 0.3 * g.worldW;
        if (task.id === "find-radio-teammate" && level.eventStage === "none"
          && Math.abs(g.player.x - teammateX) < 170 && Math.abs(g.player.y - 360) < 150) {
          level.eventStage = "talk";
          level.dialog = {
            lines: [{ speaker: "队友", text: "隧道里有求救信号，我们得去看看。" }],
            index: 0,
          };
          return;
        }
        if (level.eventStage === "talk" && !level.dialog) goScene(1);
        return;
      }
      // 场景 1 · 通讯基地天台：走到停机坪并登机，转到隧道入口飞行演出。
      if (level.sceneIndex === 1) {
        if (task.id === "board-helicopter" && g.player.x >= LEVEL5_HELIPAD_FX * g.worldW - 120) {
          goScene(2);
          level.eventStage = "flight";
          level.eventAt = now;
          level.truckStopX = LEVEL5_HELI_STOP_FX * g.worldW;
          level.truckX = level.truckStopX - 1400;
          level.truckY = 180;
          sound.truckEngine();
        }
        return;
      }
      // 场景 2 · 隧道入口：直升机飞入并落稳，玩家与 4 名 M16 队友依次下机警戒。
      if (level.sceneIndex === 2) {
        if (level.eventStage === "flight") {
          const t = Math.min(1, (now - level.eventAt) / 3200);
          const ease = 1 - (1 - t) * (1 - t);
          level.truckX = level.truckStopX - 1400 * (1 - ease);
          level.truckY = 180 + 320 * ease;
          g.player.x = level.truckX + 40;
          g.player.y = level.truckY;
          if (t >= 1) {
            level.eventStage = "landed";
            level.eventAt = now;
            level.eventCount = 0;
            g.player.invulnerableUntil = now + 1800;
            sound.truckBrake();
          }
          return;
        }
        if (level.eventStage === "landed") {
          if (now < level.eventAt + LEVEL5_PLAYER_EXIT_DELAY_MS) return;
          g.player.x = level.truckX + 180;
          g.player.y = 520;
          if (level.eventCount < LEVEL5_SQUAD
            && now >= level.eventAt + LEVEL5_PLAYER_EXIT_DELAY_MS + 300 + level.eventCount * 420) {
            const squadIndex = level.eventCount;
            g.npcs.push(makeLevelNpc(level.truckX + 270 + squadIndex * 120, 360 + ((squadIndex * 97) % 180), true, true));
            level.eventCount += 1;
          }
          const exitFinishedAt = level.eventAt + LEVEL5_PLAYER_EXIT_DELAY_MS + 300 + LEVEL5_SQUAD * 420 + 800;
          if (level.eventCount >= LEVEL5_SQUAD && now >= exitFinishedAt) {
            level.eventStage = "talk";
            level.dialog = {
              lines: [{ speaker: "队友", text: "里面太黑了，我们需要维修电力" }],
              index: 0,
            };
          }
          return;
        }
        if (level.eventStage === "talk" && !level.dialog) goScene(3);
        return;
      }
      // 场景 3 · 未通电隧道：抵达电力配置室后，维修队友工作 15 秒；玩家与 3 名队友守住 500 HP 围栏。
      if (level.sceneIndex === 3) {
        const powerX = LEVEL5_POWER_FX * g.worldW;
        const fenceX = LEVEL5_FENCE_FX * g.worldW;
        if (level.eventStage === "none") {
          if (task.id === "repair-power" && g.player.x >= powerX - 150) {
            level.eventStage = "power";
            level.eventAt = now;
            level.eventCount = 0;
            level.wallHp = LEVEL5_FENCE_HP;
            // 纵向判定段构成同一共享 HP 围栏；视觉由隧道场景绘制。
            for (let y = 240; y <= 640; y += 52) {
              g.barricades.push({ id: LEVEL5_FENCE_ID + y, x: fenceX, y, hp: LEVEL5_FENCE_HP, maxHp: LEVEL5_FENCE_HP });
            }
            g.npcs.push(makeLevelNpc(powerX - 34, 430, false, true));
            for (const ny of [310, 430, 550]) g.npcs.push(makeLevelNpc(fenceX - 150, ny, true, true));
            sound.alarmCrescendo(2);
          }
          return;
        }
        if (level.eventStage === "power") {
          if (level.eventCount < LEVEL5_DEFEND_TOTAL
            && now >= level.eventAt + 300 + level.eventCount * LEVEL5_DEFEND_EVERY_MS) {
            g.zombies.push(makeLevelZombie(9000 + level.eventCount, "armyRunner", fenceX + 650 + Math.random() * 250, 280 + ((level.eventCount * 73) % 300), now));
            level.eventCount += 1;
            if (level.eventCount % 6 === 1) sound.zombieGrowl({ volume: .85 });
          }
          if (level.wallHp <= 0) { failLevel(); return; }
          if (level.wallHp > 0 && now - level.eventAt >= LEVEL5_REPAIR_MS) {
            g.flashUntil = now + 280;
            goScene(4);
          }
          return;
        }
        return;
      }
      // 场景 4 · 隧道通电：单人清剿 10 军队 + 5 奔跑军队 + 5 盾兵，抵达避险间找到求救人员。
      if (level.sceneIndex === 4) {
        if (task.id === "find-survivor" && level.sceneKills >= LEVEL5_RESCUE_TOTAL
          && g.player.x >= LEVEL5_SURVIVOR_FX * g.worldW - 130) {
          goScene(5);
          g.owned.add("m240l");
          g.loadout = ["m240l", "m240l"];
          g.player.weapon = "m240l";
          g.player.ammo.m240l = WEAPONS.m240l.magazine;
          syncSnapshot();
        }
        return;
      }
      // 场景 5 · 撤离道路：M240L 清掉 50 只军队僵尸，再走到救援车辆上车通关。
      if (level.sceneIndex === 5) {
        if (task.id === "clear-rescue-road" && level.sceneKills >= LEVEL5_ROAD_TOTAL) {
          advance();
          return;
        }
        if (task.id === "board-rescue-vehicle" && g.player.x >= LEVEL5_VEHICLE_FX * g.worldW - 150) completeLevel();
        return;
      }
      return;
    }
    // ===== 第三关「防守基地」事件流 =====
    if (level.levelId === LEVEL3_ID) {
      // 场景 1 · 军营宿舍：睡梦（警报渐强 + 屏幕渐亮）→ 起身 → 走出军营
      if (level.sceneIndex === 0) {
        if (level.eventStage === "sleep" && now >= level.eventAt + LEVEL3_WAKE_MS) {
          level.eventStage = "rise";
          level.eventAt = now;
          advance(); // 任务「醒来」完成
          return;
        }
        if (level.eventStage === "rise" && now >= level.eventAt + LEVEL3_RISE_MS) {
          level.eventStage = "none";
          g.player.x = 350;
          g.player.y = 520;
          return;
        }
        if (level.eventStage === "none" && task.id === "leave-barracks" && g.player.x >= g.worldW - 130) goScene(1);
        return;
      }
      // 场景 2 · 基地外墙夜防：就位 → 队友进场 + 围墙判定段 + 第一波攻势（围墙 HP 归零即失败）→ 走到基地大门
      if (level.sceneIndex === 1) {
        const wallX = LEVEL3_WALL_FX * g.worldW;
        if (level.eventStage === "none") {
          if (task.id === "take-position" && g.player.x >= wallX - 240) {
            advance();
            level.eventStage = "defend";
            level.eventAt = now;
            level.eventCount = 0;
            level.wallHp = LEVEL3_WALL_HP;
            // 6 名队友在围墙射击孔后就位（钉点射击）：4 × M16 士兵 + PKM 机枪手（中路压制扫射）+ 燧石66 狙击手（靠后半个身位，优先狙杀高价值目标）
            const defenseSquad: Array<[number, number, WeaponKey]> = [
              [-66, 280, "m16"], [-66, 400, "m16"], [-66, 460, "pkm"],
              [-66, 520, "m16"], [-66, 600, "m16"], [-150, 340, "flint66"],
            ];
            for (const [dx, ny, squadWeapon] of defenseSquad) {
              g.npcs.push(makeLevelNpc(wallX + dx, ny, true, true, squadWeapon));
            }
            // 围墙判定段：纵向铺满路面的共享 HP 池（复用路障承伤机制，视觉为混凝土墙不渲染路障模型）
            for (let y = 240; y <= 640; y += 52) {
              g.barricades.push({ id: LEVEL3_WALL_ID + y, x: wallX, y, hp: LEVEL3_WALL_HP, maxHp: LEVEL3_WALL_HP });
            }
            sound.alarmCrescendo(3);
          }
          // 过渡任务：夜防结束后从围墙走到基地大门（穿门洞向右）→ 进入土路场景
          if (task.id === "reach-gate" && g.player.x >= g.worldW - 130) goScene(2);
          return;
        }
        if (level.eventStage === "defend") {
          // 65 只：盾兵先锋 10 只最先上场（间隔略密形成盾墙），出完后按原节奏接 55 只奔跑系（20+20+15，本关 HP 统一 500）
          const vanguard = level.eventCount < LEVEL3_VANGUARD_TOTAL;
          const spawnDue = vanguard
            ? level.eventAt + 900 + level.eventCount * LEVEL3_VANGUARD_EVERY_MS
            : level.eventAt + 900 + LEVEL3_VANGUARD_TOTAL * LEVEL3_VANGUARD_EVERY_MS + (level.eventCount - LEVEL3_VANGUARD_TOTAL) * LEVEL3_WAVE_EVERY_MS;
          if (level.eventCount < LEVEL3_DEFEND_TOTAL && now >= spawnDue) {
            const kind: ZombieKind = vanguard ? "shield" : LEVEL3_WAVE_KINDS[(level.eventCount - LEVEL3_VANGUARD_TOTAL) % LEVEL3_WAVE_KINDS.length];
            g.zombies.push(applyLevel3ZombieHp(makeLevelZombie(6000 + level.eventCount, kind, g.worldW + 60 + Math.random() * 120, 300 + ((level.eventCount * 97) % 250), now)));
            level.eventCount += 1;
            if (level.eventCount % 5 === 1) sound.zombieGrowl({ volume: 0.85 });
          }
          // 围墙共享 HP：各判定段累计承伤换算剩余；归零即围墙被攻破 → 任务失败
          let segDamage = 0;
          for (const seg of g.barricades) if (isLevel3WallSegment(seg.id)) segDamage += LEVEL3_WALL_HP - seg.hp;
          level.wallHp = Math.max(0, LEVEL3_WALL_HP - segDamage);
          if (level.wallHp <= 0) { failLevel(); return; }
          // 全数击杀 → 大门闸板升起（门洞判定段移除），任务推进到「走到基地大门」
          if (level.eventCount >= LEVEL3_DEFEND_TOTAL && g.zombies.length === 0) {
            advance();
            level.eventStage = "none";
            g.barricades = g.barricades.filter((seg) => !(isLevel3WallSegment(seg.id) && seg.y >= LEVEL3_GATE_TOP + 20 && seg.y <= LEVEL3_GATE_BOTTOM - 20));
          }
          return;
        }
        return;
      }
      // 场景 3 · 城外土路：清掉拦路突变僵尸并走到尽头 → 重甲僵尸现身 → 击杀通关
      if (level.eventStage === "none") {
        if (task.id === "scout" && level.sceneKills >= LEVEL3_MUTANTS && g.player.x >= g.worldW - 300) {
          advance();
          level.eventStage = "boss";
          level.eventAt = now;
          const bossX = Math.min(g.worldW - 130, g.player.x + 460);
          g.zombies.push(makeLevelZombie(6999, "juggernaut", bossX, Math.max(300, Math.min(560, g.player.y)), now));
          sound.zombieGrowl({ volume: 1 });
        }
        return;
      }
      if (level.eventStage === "boss" && level.sceneKills >= LEVEL3_MUTANTS + 1) completeLevel();
      return;
    }
    // ===== 第四关「占领电台」事件流 =====
    if (level.levelId === LEVEL4_ID) {
      // 场景 0 · 军事基地商讨室：找到队友并完成简报 → 走到房门，切换到独立室外集合区
      if (level.sceneIndex === 0) {
        if (task.id === "find-teammate") {
          const tableX = LEVEL4_TABLE_FX * g.worldW;
          if (level.eventStage === "none" && Math.abs(g.player.x - tableX) < 180 && Math.abs(g.player.y - 400) < 150) {
            level.eventStage = "talk";
            level.dialog = {
              lines: [
                { speaker: "队友", text: "我们接到一个任务，占领电台。" },
                { speaker: "队友", text: "10 分钟后集合。" },
              ],
              index: 0,
            };
          }
          if (level.eventStage === "talk" && !level.dialog) {
            level.eventStage = "none";
            advance();
          }
          return;
        }
        if (task.id === "leave-briefing" && g.player.x >= g.worldW - 120) goScene(1);
        return;
      }
      // 场景 1 · 基地集合区：走到大门上车，再转场到电台门口
      if (level.sceneIndex === 1) {
        if (task.id === "board-truck" && g.player.x >= LEVEL4_GATE_FX * g.worldW - 90) {
          // 上车 → 转场电台门口：军车自左侧驶入，停稳后玩家与 4 名队友依次下车
          goScene(2);
          level.eventStage = "ride";
          level.eventAt = now;
          level.truckStopX = LEVEL4_TRUCK_STOP_FX * g.worldW;
          level.truckY = 380;
          level.truckX = level.truckStopX - 1500;
          sound.truckEngine();
        }
        return;
      }
      // 场景 2 · 电台门口：军车完全刹停 → 玩家下车 → 4 名 M16 队友下车留守 → 单人进入电台
      if (level.sceneIndex === 2) {
        if (level.eventStage === "ride") {
          // 军车行驶动画（2.8s 缓出刹车）：玩家模型藏在车内，停稳前不会提前出现在车外
          const t = Math.min(1, (now - level.eventAt) / 2800);
          const ease = 1 - (1 - t) * (1 - t);
          level.truckX = level.truckStopX - 1500 * (1 - ease);
          g.player.x = level.truckX + 150;
          g.player.y = level.truckY + 140;
          if (t >= 1) {
            level.eventStage = "disembark";
            level.eventAt = now;
            level.eventCount = 0;
            g.player.invulnerableUntil = now + 1200;
            sound.truckBrake();
          }
          return;
        }
        if (level.eventStage === "disembark") {
          // 刹车声结束后玩家先从车门落地，再由 4 名持 M16 队友依次下车警戒。
          if (now < level.eventAt + LEVEL4_PLAYER_EXIT_DELAY_MS) return;
          g.player.x = level.truckX + 115;
          g.player.y = Math.max(ROAD_TOP + 80, Math.min(ROAD_BOTTOM - 30, level.truckY + 132));
          if (level.eventCount < LEVEL4_SQUAD && now >= level.eventAt + LEVEL4_PLAYER_EXIT_DELAY_MS + 300 + level.eventCount * 420) {
            const disembarkY = Math.max(ROAD_TOP + 60, Math.min(ROAD_BOTTOM - 30, level.truckY + 60 + level.eventCount * 42));
            g.npcs.push(makeLevelNpc(level.truckX + 70, disembarkY, true, true));
            level.eventCount += 1;
          }
          if (level.eventCount >= LEVEL4_SQUAD) level.eventStage = "none";
          return;
        }
        if (task.id === "breach" && g.player.x >= LEVEL4_STATION_DOOR_FX * g.worldW - 40) goScene(3);
        return;
      }
      // 场景 3 · 一层走廊：全清 15 只并走到安全门 → 楼梯间
      if (level.sceneIndex === 3) {
        if (task.id === "clear-floor-1" && level.sceneKills >= LEVEL4_FLOOR1_TOTAL && g.player.x >= g.worldW - 130) goScene(4);
        return;
      }
      // 场景 4 · 楼梯间：角色脚部沿台阶轨迹上升，抵达与门槛同高的出口 → 二层走廊
      if (level.sceneIndex === 4) {
        if (task.id === "climb-1" && g.player.x >= g.worldW - 120 && g.player.y <= LEVEL4_STAIR_EXIT_Y + 4) goScene(5);
        return;
      }
      // 场景 5 · 二层走廊：全清 15 只并走到安全门 → 楼梯间
      if (level.sceneIndex === 5) {
        if (task.id === "clear-floor-2" && level.sceneKills >= LEVEL4_FLOOR2_TOTAL && g.player.x >= g.worldW - 130) goScene(6);
        return;
      }
      // 场景 6 · 楼梯间：沿台阶上行并穿过对齐的天台门
      if (level.sceneIndex === 6) {
        if (task.id === "climb-2" && g.player.x >= g.worldW - 120 && g.player.y <= LEVEL4_STAIR_EXIT_Y + 4) goScene(7);
        return;
      }
      // 场景 7 · 天台：击杀重甲僵尸 → 进入通讯设备区
      if (level.sceneIndex === 7) {
        if (task.id === "kill-juggernaut" && level.sceneKills >= 1) goScene(8);
        return;
      }
      // 场景 8 · 天台通讯设备区：3 名 M16 队友戒备 + 1 名队友维修；设备存活 20 秒 → 通关
      if (level.sceneIndex === 8) {
        if (level.eventStage === "none") {
          level.eventStage = "repair";
          level.eventAt = now;
          level.eventCount = 0;
          level.wallHp = LEVEL4_EQUIP_HP;
          const equipX = LEVEL4_EQUIP_FX * g.worldW;
          // 通讯设备判定段：纵向铺满路面的共享 HP 池（复用路障承伤机制，视觉由场景函数绘制，不渲染路障模型）
          for (let y = 240; y <= 640; y += 52) {
            g.barricades.push({ id: LEVEL4_EQUIP_ID + y, x: equipX, y, hp: LEVEL4_EQUIP_HP, maxHp: LEVEL4_EQUIP_HP });
          }
          // 3 名 M16 队友在设备左前方钉点戒备（面向右侧冲击方向），1 名队友驻守设备旁维修
          for (const ny of [300, 420, 540]) {
            g.npcs.push(makeLevelNpc(equipX - 150, ny, true, true));
          }
          g.npcs.push(makeLevelNpc(equipX - 52, 470, false, true));
          sound.alarmCrescendo(2);
          return;
        }
        if (level.eventStage === "repair") {
          // 30 只军队奔跑僵尸自右向左冲来（0.6s 一只，全程覆盖维修窗口）
          if (level.eventCount < LEVEL4_DEFEND_TOTAL && now >= level.eventAt + 400 + level.eventCount * LEVEL4_DEFEND_EVERY_MS) {
            g.zombies.push(makeLevelZombie(8000 + level.eventCount, "armyRunner", g.worldW + 60 + Math.random() * 120, 280 + ((level.eventCount * 67) % 280), now));
            level.eventCount += 1;
            if (level.eventCount % 5 === 1) sound.zombieGrowl({ volume: 0.85 });
          }
          // 设备共享 HP 在僵尸命中判定段时直接扣除；归零即设备被毁 → 任务失败（可重试）
          if (level.wallHp <= 0) { failLevel(); return; }
          // 唯一胜利条件：维修计时达到 20 秒且通讯设备仍有 HP；不要求清空剩余尸群或等候生成队列结束。
          if (level.wallHp > 0 && now - level.eventAt >= LEVEL4_REPAIR_MS) completeLevel();
          return;
        }
        return;
      }
      return;
    }
    // ===== 第二关「加入军队」事件流 =====
    if (level.levelId === LEVEL2_ID) {
      if (level.sceneIndex === 0) {
        const gasX = LEVEL2_GAS_FX * g.worldW;
        if (level.eventStage === "none") {
          // 任务「到达加油站」：杀够拦路僵尸并抵达加油站 → 触发伏击
          if (level.sceneKills >= LEVEL2_ROAD_KILLS && g.player.x >= gasX - 140) {
            level.eventStage = "ambush";
            level.eventAt = now;
            level.eventCount = 0;
            level.taskIndex = 1;
            level.taskDoneFlashUntil = now + 1600;
            sound.taskComplete();
          }
          return;
        }
        if (level.eventStage === "ambush") {
          // 便利店陆续涌出 30 只僵尸（每 210ms 一只，每 3 只夹 1 只头盔 → 10 头盔 + 20 普通）
          if (level.eventCount < LEVEL2_AMBUSH_TOTAL && now >= level.eventAt + level.eventCount * 210) {
            const kind: ZombieKind = level.eventCount % 3 === 2 ? "helmet" : "normal";
            g.zombies.push(makeLevelZombie(5000 + level.eventCount, kind, gasX + 150 + Math.random() * 40 - 20, 300 + ((level.eventCount * 53) % 180), now));
            level.eventCount += 1;
            if (level.eventCount % 6 === 1) sound.zombieGrowl({ volume: 0.7 });
          }
          // 坚持 10 秒 → 军车自屏幕左侧驶来，终点 = 触发时刻玩家位置上方
          if (now >= level.eventAt + LEVEL2_SURVIVE_MS) {
            level.eventStage = "truck";
            level.eventAt = now;
            level.truckStopX = g.player.x + 30;
            level.truckY = Math.max(300, Math.min(470, g.player.y - 150));
            level.truckX = level.truckStopX - 1100;
            sound.truckEngine();
          }
          return;
        }
        if (level.eventStage === "truck") {
          // 军车行驶动画（2.8s 缓出刹车），停稳后士兵下车
          const stopX = level.truckStopX;
          const t = Math.min(1, (now - level.eventAt) / 2800);
          const ease = 1 - (1 - t) * (1 - t);
          level.truckX = stopX - 1100 * (1 - ease);
          if (t >= 1) {
            level.eventStage = "soldiers";
            level.eventAt = now;
            level.eventCount = 0;
            g.player.invulnerableUntil = now + 2500;
            sound.truckBrake();
          }
          return;
        }
        if (level.eventStage === "soldiers") {
          // 5 名士兵依次下车（战斗型 NPC），清场后进入对话
          if (level.eventCount < LEVEL2_SOLDIERS && now >= level.eventAt + 500 + level.eventCount * 420) {
            // 士兵在停靠军车旁（即玩家近旁）依次下车
            const disembarkY = Math.max(ROAD_TOP + 60, Math.min(ROAD_BOTTOM - 30, level.truckY + 60 + level.eventCount * 38));
            g.npcs.push(makeLevelNpc(level.truckX + 60, disembarkY, true));
            level.eventCount += 1;
          }
          if (level.eventCount >= LEVEL2_SOLDIERS && g.zombies.length === 0) {
            level.eventStage = "dialog";
            level.dialog = {
              lines: [
                { speaker: "士兵", text: "兄弟，我建议你加入我们。" },
                { speaker: "你", text: "行。" },
              ],
              index: 0,
            };
          }
          return;
        }
        if (level.eventStage === "dialog") {
          // 对话被玩家推进完毕 → 完成任务并转场军事基地
          if (!level.dialog) goScene(1);
          return;
        }
        return;
      }
      // 场景 2 · 军事基地：到达军营 → 通关
      if (task.id === "reach-barracks" && g.player.x >= LEVEL2_BARRACKS_FX * g.worldW - 60) completeLevel();
      return;
    }
    switch (task.id) {
      case "take-knife":
        if (g.melee === "fruitknife") advance();
        break;
      case "leave-home":
        if (g.player.x >= g.worldW - 120) goScene(1);
        break;
      case "clear-corridor":
        if (level.sceneKills >= levelZombieCount(scene) && g.player.x >= g.worldW - 130) goScene(2);
        break;
      case "clear-street":
        if (level.sceneKills >= levelZombieCount(scene)) advance();
        break;
      case "take-glock":
        if (g.loadout[0] === "glock17") completeLevel();
        break;
    }
  }, [changeScreen, syncSnapshot]);

  // 关卡模式：G 丢弃当前武器（落在脚边成为拾取物；对应槽位复位拳脚，自动切回剩余持有物）
  const dropWeapon = useCallback(() => {
    const g = stateRef.current;
    if (g.mode !== "level") return;
    const p = g.player;
    const w = p.weapon;
    if (w === "fists") return;
    const nextId = g.pickups.reduce((max, pk) => Math.max(max, pk.id), 0) + 1;
    g.pickups.push({ id: nextId, sceneIndex: g.level?.sceneIndex ?? 0, weapon: w, x: p.x, y: p.y + 12, onTable: false, taken: false });
    if (MELEE_WEAPONS.has(w)) {
      g.melee = "fists";
      p.weapon = g.loadout.find((weapon) => weapon !== "fists") ?? "fists";
    } else {
      // 两个相同槽位表示同一把单武器；不同槽位时只丢掉手里这一把，另一把仍保留。
      if (g.loadout[0] === w && g.loadout[1] === w) {
        g.loadout = ["fists", "fists"];
      } else {
        const droppedSlot = g.loadout[0] === w ? 0 : g.loadout[1] === w ? 1 : -1;
        if (droppedSlot >= 0) g.loadout[droppedSlot] = "fists";
      }
      p.weapon = g.loadout.find((weapon) => weapon !== "fists") ?? (g.melee !== "fists" ? g.melee : "fists");
    }
    p.reloadStartedAt = 0;
    p.reloadingUntil = 0;
    sound.weaponSwitch();
    syncSnapshot();
  }, [syncSnapshot]);

  // 关卡模式：右键拾取 120px 内最近的武器；同槽已有武器时交换（手中武器留在原拾取点）
  const tryPickupWeapon = useCallback(() => {
    const g = stateRef.current;
    if (g.mode !== "level") return;
    const p = g.player;
    let best: LevelPickup | null = null;
    let bestDistSq = 120 * 120;
    for (const pk of g.pickups) {
      if (pk.taken || pk.sceneIndex !== g.level?.sceneIndex) continue;
      const distSq = (p.x - pk.x) * (p.x - pk.x) + (p.y - pk.y) * (p.y - pk.y);
      if (distSq < bestDistSq) { bestDistSq = distSq; best = pk; }
    }
    if (!best) return;
    const w = best.weapon;
    if (MELEE_WEAPONS.has(w)) {
      const prev = g.melee;
      g.melee = w;
      p.weapon = w;
      if (prev !== "fists") best.weapon = prev;
      else best.taken = true;
    } else {
      const currentSlot = !MELEE_WEAPONS.has(p.weapon)
        ? (g.loadout[0] === p.weapon ? 0 : g.loadout[1] === p.weapon ? 1 : -1)
        : -1;
      const emptySlot = g.loadout[0] === "fists" ? 0 : g.loadout[1] === "fists" ? 1 : -1;
      const pickupSlot = currentSlot >= 0 ? currentSlot : emptySlot >= 0 ? emptySlot : 0;
      const prev = g.loadout[pickupSlot];
      if (prev !== "fists" && g.loadout[0] === prev && g.loadout[1] === prev) g.loadout = [w, w];
      else g.loadout[pickupSlot] = w;
      p.weapon = w;
      p.ammo[w] = WEAPONS[w].magazine;
      p.reloadStartedAt = 0;
      p.reloadingUntil = 0;
      if (prev !== "fists") best.weapon = prev;
      else best.taken = true;
    }
    sound.weaponSwitch();
    syncSnapshot();
  }, [syncSnapshot]);

  const setPausedState = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  }, []);

  const resumeGame = useCallback(() => {
    if (!pausedRef.current) return;
    // 暂停期间经过的时间整体平移，恢复后所有计时字段无缝接续
    shiftTimeline(stateRef.current, performance.now() - pausedAtRef.current);
    lastFrameRef.current = performance.now();
    setPausedState(false);
    sound.uiClick();
    canvasRef.current?.focus({ preventScroll: true });
  }, [setPausedState]);

  const togglePause = useCallback(() => {
    if (screenRef.current !== "playing") return;
    if (pausedRef.current) {
      resumeGame();
    } else {
      pausedAtRef.current = performance.now();
      setPausedState(true);
      sound.setHeartbeat(null);
      sound.setGatlingSpin(false);
      sound.uiClick();
    }
  }, [resumeGame, setPausedState]);

  // 保存进度并返回主菜单：战斗中退出保存到"上一天"（当前 day 重打），商店/装备界面退出则当天已完成、下一天继续
  const saveProgressAndMenu = useCallback(() => {
    const g = stateRef.current;
    if (g.mode === "survival") {
      const nextDay = screenRef.current === "playing" ? g.day : g.day + 1;
      writeProgressSave({
        version: PROGRESS_VERSION,
        nextDay: Math.max(1, nextDay),
        coins: g.coins,
        kills: g.kills,
        owned: Array.from(g.owned),
        loadout: [...g.loadout] as [WeaponKey, WeaponKey],
        melee: g.melee,
        weapon: g.player.weapon,
        armor: g.armor,
        ownedArmors: Array.from(g.ownedArmors),
        ownedPartners: Array.from(g.ownedPartners),
        partner: g.partner,
        itemInventory: { ...g.itemInventory },
      });
      setSaveInfo({ nextDay: Math.max(1, nextDay) });
    }
    setPausedState(false);
    sound.uiClick();
    changeScreen("menu");
  }, [changeScreen, setPausedState]);

  // 主菜单"继续"：读取进度档 → 回到商店整备下一天（异常档按无存档处理）
  const continueProgress = useCallback(() => {
    const save = readProgressSave();
    if (!save) {
      setSaveInfo(null);
      return;
    }
    sound.uiClick();
    const g = freshState("survival", worldWRef.current);
    g.day = Math.max(0, save.nextDay - 1);
    g.coins = Math.max(0, Math.floor(save.coins));
    g.kills = Math.max(0, Math.floor(save.kills ?? 0));
    const owned = save.owned.filter((key): key is WeaponKey => typeof key === "string" && key in WEAPONS);
    g.owned = new Set<WeaponKey>(owned.length > 0 ? owned : ["glock17"]);
    const ownedGuns = [...g.owned].filter((key) => !MELEE_WEAPONS.has(key));
    const loadout = save.loadout.filter((key): key is WeaponKey => typeof key === "string" && g.owned.has(key) && !MELEE_WEAPONS.has(key));
    g.loadout = [loadout[0] ?? ownedGuns[0] ?? "glock17", loadout[1] ?? ownedGuns[1] ?? loadout[0] ?? ownedGuns[0] ?? "glock17"];
    g.melee = g.owned.has(save.melee) && MELEE_WEAPONS.has(save.melee) ? save.melee : ([...g.owned].find((key) => MELEE_WEAPONS.has(key)) ?? "fruitknife");
    g.ownedArmors = new Set<ArmorKey>(save.ownedArmors.filter((key): key is ArmorKey => typeof key === "string" && key in ARMORS));
    if (g.ownedArmors.size === 0) g.ownedArmors.add("civilian");
    g.armor = g.ownedArmors.has(save.armor) ? save.armor : "civilian";
    g.player.armor = g.armor;
    g.player.maxHp = ARMORS[g.armor].maxHp;
    g.player.hp = g.player.maxHp;
    g.player.weapon = g.loadout.includes(save.weapon) ? save.weapon : g.loadout[0];
    for (const key of g.owned) g.player.ammo[key] = WEAPONS[key].magazine;
    g.itemInventory = { ...EMPTY_ITEM_INVENTORY() };
    for (const key of ITEM_KEYS) {
      const count = Number(save.itemInventory[key]);
      g.itemInventory[key] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }
    // 搭档进度恢复：仅接受 PARTNERS 内的键，装备中的搭档必须已拥有
    g.ownedPartners = new Set<PartnerKey>((save.ownedPartners ?? []).filter((key): key is PartnerKey => typeof key === "string" && key in PARTNERS));
    g.partner = save.partner !== null && g.ownedPartners.has(save.partner) ? save.partner : null;
    g.partnerField = freshPartnerField(g.player.x - 50, g.player.y + 30);
    stateRef.current = g;
    lastFrameRef.current = performance.now();
    syncSnapshot();
    setShopDetail(null);
    setShopTab("weapons");
    changeScreen("shop");
  }, [changeScreen, syncSnapshot]);

  // 装备界面：主/副武器位调整（重复选择自动交换，保证两位不同枪）
  const assignLoadoutSlot = useCallback((slot: 0 | 1, key: WeaponKey) => {
    const g = stateRef.current;
    if (MELEE_WEAPONS.has(key)) return;
    // 靶场模式：装备界面直接选用任意武器，自动免费入列并补满弹药
    if (!g.owned.has(key)) {
      if (g.mode !== "range") return;
      g.owned.add(key);
      g.player.ammo[key] = WEAPONS[key].magazine;
    }
    sound.uiClick();
    const other = slot === 0 ? 1 : 0;
    if (g.loadout[other] === key) g.loadout[other] = g.loadout[slot];
    g.loadout[slot] = key;
    if (g.player.weapon !== g.loadout[0] && g.player.weapon !== g.loadout[1] && !MELEE_WEAPONS.has(g.player.weapon)) {
      g.player.weapon = g.loadout[0];
    }
    g.player.reloadStartedAt = 0;
    g.player.reloadingUntil = 0;
    syncSnapshot();
  }, [syncSnapshot]);

  const assignMelee = useCallback((key: WeaponKey) => {
    const g = stateRef.current;
    if (!MELEE_WEAPONS.has(key)) return;
    if (!g.owned.has(key)) {
      if (g.mode !== "range") return;
      g.owned.add(key);
      g.player.ammo[key] = WEAPONS[key].magazine;
    }
    sound.uiClick();
    g.melee = key;
    if (MELEE_WEAPONS.has(g.player.weapon)) g.player.weapon = key;
    syncSnapshot();
  }, [syncSnapshot]);

  // 换装血量上限逻辑与商店购买一致：上限差额立即补足，且不超新上限
  const assignArmor = useCallback((key: ArmorKey) => {
    const g = stateRef.current;
    if (!g.ownedArmors.has(key)) {
      if (g.mode !== "range") return;
      g.ownedArmors.add(key);
    }
    sound.uiClick();
    const previousMaxHp = g.player.maxHp;
    g.armor = key;
    g.player.armor = key;
    g.player.maxHp = ARMORS[key].maxHp;
    g.player.hp = Math.min(ARMORS[key].maxHp, g.player.hp + Math.max(0, ARMORS[key].maxHp - previousMaxHp));
    syncSnapshot();
  }, [syncSnapshot]);

  const startGame = useCallback((mode: GameMode) => {
    if (mode === "survival") {
      sound.waveStart();
      clearProgressSave();
      setSaveInfo(null);
    } else {
      sound.uiClick();
    }
    stateRef.current = freshState(mode, worldWRef.current);
    lastFrameRef.current = performance.now();
    stateRef.current.nextSpawnAt = performance.now() + 500;
    syncSnapshot();
    if (mode === "range") {
      // 靶场模式：先进入装备界面（免费选用全部装备），再进入战斗
      setShopDetail(null);
      setShopTab("weapons");
      setLoadoutOpen(null);
      changeScreen("loadout");
    } else {
      changeScreen("playing");
      canvasRef.current?.focus({ preventScroll: true });
    }
  }, [changeScreen, syncSnapshot]);

  const resumeRange = useCallback(() => {
    const g = stateRef.current;
    if (g.mode !== "range") return;
    sound.uiClick();
    g.nextSpawnAt = Math.min(g.nextSpawnAt || Infinity, performance.now() + 350);
    syncSnapshot();
    changeScreen("playing");
    canvasRef.current?.focus({ preventScroll: true });
  }, [changeScreen, syncSnapshot]);

  const openRangeShop = useCallback(() => {
    const g = stateRef.current;
    if (g.mode !== "range") return;
    sound.uiClick();
    g.selectedItem = null;
    syncSnapshot();
    changeScreen("shop");
  }, [changeScreen, syncSnapshot]);

  // 靶场"按配置生成一批"：把 spawnCounts 展开成队列并打乱，清场保证测试确定性，随后回到战斗
  const applyRangeSpawnBatch = useCallback(() => {
    const g = stateRef.current;
    if (g.mode !== "range") return;
    const queue: ZombieKind[] = [];
    for (const kind of ZOMBIE_CONFIG_KINDS) {
      for (let i = 0; i < spawnCounts[kind]; i += 1) queue.push(kind);
    }
    if (!queue.length) return;
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    sound.uiClick();
    g.rangeSpawnMode = "batch";
    g.rangeSpawnQueue = queue;
    g.rangeBatchTotal = queue.length;
    g.zombies = [];
    g.corpses = [];
    g.spits = [];
    resumeRange();
  }, [resumeRange, spawnCounts]);

  // 靶场"恢复无尽模式"：清空批次队列，回到按击杀数解锁的自动刷
  const resumeRangeEndless = useCallback(() => {
    const g = stateRef.current;
    if (g.mode !== "range") return;
    sound.uiClick();
    g.rangeSpawnMode = "endless";
    g.rangeSpawnQueue = [];
    g.rangeBatchTotal = 0;
    resumeRange();
  }, [resumeRange]);

  const startNextDay = useCallback(() => {
    const g = stateRef.current;
    sound.waveStart();
    g.day += 1;
    g.waveTotal = 5 + Math.ceil(g.day * 2.2);
    g.spawned = 0;
    g.zombies = [];
    g.corpses = [];
    g.tracers = [];
    g.particles = [];
    g.detachedLimbs = [];
    g.metalShards = [];
    g.barricades = [];
    g.deployedItems = [];
    g.blastEffects = [];
    g.explosiveProjectiles = [];
    g.flashUntil = 0;
    g.selectedItem = null;
    g.waveClearedAt = null;
    // 新一天击杀累计清零，通关结算奖励重新计算
    g.dayKillCoins = 0;
    g.lastDayBonus = 0;
    g.nextSpawnAt = performance.now() + 600;
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + 28);
    g.player.x = 220;
    g.player.y = 410;
    g.player.reloadStartedAt = 0;
    g.player.reloadingUntil = 0;
    g.player.ammo[g.player.weapon] = WEAPONS[g.player.weapon].magazine;
    // 搭档每天开局回到玩家身边，攻击/换弹计时清零
    g.partnerField = freshPartnerField(g.player.x - 50, g.player.y + 30);
    setLoadoutOpen(null);
    syncSnapshot();
    changeScreen("playing");
    canvasRef.current?.focus({ preventScroll: true });
  }, [changeScreen, syncSnapshot]);

  const buyWeapon = useCallback((key: WeaponKey) => {
    const g = stateRef.current;
    const weapon = WEAPONS[key];
    if (!g.owned.has(key)) {
      if (!completePurchase(g, weapon.price)) {
        sound.purchaseFail();
        return;
      }
      g.owned.add(key);
      g.player.ammo[key] = weapon.magazine;
      sound.purchase();
    } else {
      sound.uiClick();
    }
    if (!g.owned.has(key)) return;
    if (MELEE_WEAPONS.has(key)) {
      g.melee = key;
      g.player.weapon = key;
    } else if (g.loadout.includes(key)) {
      g.player.weapon = key;
    } else {
      const currentSlot = !MELEE_WEAPONS.has(g.player.weapon) ? g.loadout.indexOf(g.player.weapon) : -1;
      const replaceSlot = currentSlot >= 0 ? currentSlot : 1;
      g.loadout[replaceSlot] = key;
      g.player.weapon = key;
    }
    g.player.reloadStartedAt = 0;
    g.player.reloadingUntil = 0;
    syncSnapshot();
  }, [syncSnapshot]);

  const buyArmor = useCallback((key: ArmorKey) => {
    const g = stateRef.current;
    const armor = ARMORS[key];
    if (!g.ownedArmors.has(key)) {
      if (!completePurchase(g, armor.price)) {
        sound.purchaseFail();
        return;
      }
      g.ownedArmors.add(key);
      sound.purchase();
    } else {
      sound.uiClick();
    }
    if (!g.ownedArmors.has(key)) return;
    const previousMaxHp = g.player.maxHp;
    g.armor = key;
    g.player.armor = key;
    g.player.maxHp = armor.maxHp;
    g.player.hp = Math.min(armor.maxHp, g.player.hp + Math.max(0, armor.maxHp - previousMaxHp));
    syncSnapshot();
  }, [syncSnapshot]);

  const buyMedkit = useCallback(() => {
    const g = stateRef.current;
    if (g.player.hp >= g.player.maxHp) return;
    if (!completePurchase(g, MEDKIT_PRICE)) {
      sound.purchaseFail();
      return;
    }
    sound.purchase();
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + MEDKIT_HEAL);
    syncSnapshot();
  }, [syncSnapshot]);

  const buyItem = useCallback((key: ItemKey) => {
    const g = stateRef.current;
    const item = ITEMS[key];
    if (!completePurchase(g, item.price)) {
      sound.purchaseFail();
      return;
    }
    sound.purchase();
    g.itemInventory[key] += 1;
    syncSnapshot();
  }, [syncSnapshot]);

  // 搭档购买：未拥有先扣款，随后自动装备为随行搭档（场上仅 1 个）
  const buyPartner = useCallback((key: PartnerKey) => {
    const g = stateRef.current;
    const partner = PARTNERS[key];
    if (!g.ownedPartners.has(key)) {
      if (!completePurchase(g, partner.price)) {
        sound.purchaseFail();
        return;
      }
      g.ownedPartners.add(key);
      sound.purchase();
    } else {
      sound.uiClick();
    }
    if (!g.ownedPartners.has(key)) return;
    g.partner = key;
    g.partnerField = freshPartnerField(g.player.x - 50, g.player.y + 30);
    syncSnapshot();
  }, [syncSnapshot]);

  // 装备/卸下搭档（生存模式仅允许已拥有的；靶场模式自动免费入列）
  const assignPartner = useCallback((key: PartnerKey | null) => {
    const g = stateRef.current;
    if (key !== null && !g.ownedPartners.has(key)) {
      if (g.mode !== "range") return;
      g.ownedPartners.add(key);
    }
    sound.uiClick();
    g.partner = key;
    g.partnerField = freshPartnerField(g.player.x - 50, g.player.y + 30);
    syncSnapshot();
  }, [syncSnapshot]);

  const selectItem = useCallback((key: Exclude<ItemKey, "airstrike">) => {
    const g = stateRef.current;
    if (g.itemInventory[key] <= 0 || screenRef.current !== "playing") return;
    g.selectedItem = g.selectedItem === key ? null : key;
  }, []);

  const deploySelectedItem = useCallback((now: number) => {
    const g = stateRef.current;
    const key = g.selectedItem;
    if (!key || key === "airstrike" || g.itemInventory[key] <= 0 || screenRef.current !== "playing" || levelInputFrozen(g)) return false;
    const target = itemTargetInFront(g, mouseRef.current, key);
    const id = Math.floor(now * 1000 + Math.random() * 999);
    g.itemInventory[key] -= 1;
    g.selectedItem = null;
    if (key === "barricade") {
      g.barricades.push({ id, x: target.x, y: target.y, hp: 100, maxHp: 100 });
      sound.barricadePlace();
    } else {
      sound.itemThrow();
      const thrown = ITEMS[key].delivery === "throw";
      const landAt = thrown ? now + THROW_FLIGHT_MS : now;
      const definition = ITEMS[key];
      g.deployedItems.push({
        id,
        key,
        x: target.x,
        y: target.y,
        createdAt: now,
        landAt,
        thrownFromX: g.player.x + 25,
        thrownFromY: g.player.y - 95,
        detonateAt: definition.deployDelay === null ? null : landAt + definition.deployDelay,
        until: definition.lifetime === null ? null : landAt + definition.lifetime,
        triggered: false,
      });
    }
    syncSnapshot();
    return true;
  }, [syncSnapshot]);

  const callAirstrike = useCallback((now: number) => {
    const g = stateRef.current;
    if (screenRef.current !== "playing" || g.itemInventory.airstrike <= 0) return;
    const target = densestZombiePoint(g.zombies);
    if (!target) return;
    const definition = ITEMS.airstrike;
    const id = Math.floor(now * 1000 + Math.random() * 999);
    g.itemInventory.airstrike -= 1;
    g.selectedItem = null;
    sound.airstrike();
    g.deployedItems.push({
      id,
      key: "airstrike",
      x: target.x,
      y: target.y,
      createdAt: now,
      landAt: now,
      thrownFromX: target.x,
      thrownFromY: target.y,
      detonateAt: now + (definition.deployDelay ?? 0),
      until: null,
      triggered: false,
    });
    syncSnapshot();
  }, [syncSnapshot]);

  const cycleWeapon = useCallback(() => {
    const g = stateRef.current;
    sound.weaponSwitch();
    const carry: WeaponKey[] = [g.loadout[0], g.loadout[1], g.melee];
    const current = carry.indexOf(g.player.weapon);
    g.player.weapon = carry[(current + 1 + carry.length) % carry.length];
    g.player.emptyReloadLatch = false;
    g.player.reloadStartedAt = 0;
    g.player.reloadingUntil = 0;
    syncSnapshot();
  }, [syncSnapshot]);

  const kick = useCallback((now: number) => {
    const g = stateRef.current;
    if (levelInputFrozen(g)) return;
    const p = g.player;
    if (now - p.lastKick < 760) return;
    p.lastKick = now;
    sound.kick();
    const kickAngle = p.angle;
    window.setTimeout(() => {
      if (stateRef.current.player !== p || screenRef.current !== "playing") return;
      let connected = false;
      for (const z of g.zombies) {
        const dx = z.x - p.x;
        const dy = z.y - p.y;
        const dist = Math.hypot(dx, dy);
        const inFront = Math.cos(Math.atan2(dy, dx) - kickAngle) > .05;
        if (dist < 165 && inFront) {
          const hitTime = performance.now();
          const scale = (z.radius / 25) * CHARACTER_SCALE;
          const impactX = z.x;
          const impactY = z.y - 40 * scale;
          z.hp -= (11 + g.day * 0.75) * (1 - kickDamageReduction(z, "legs"));
          z.wounds.push({ x: 0, y: -40, region: "legs", size: 4.5 });
          if (z.wounds.length > 7) z.wounds.shift();
          z.x += Math.cos(kickAngle) * 82;
          z.y += Math.sin(kickAngle) * 52;
          // 蹬踹可踹落盾兵僵尸的盾牌：全身金属盾向前翻倒落地（保持原尺寸），留存 10 秒后清除，此后按无盾处理
          if (z.kind === "shield" && z.shieldIntact) {
            z.shieldIntact = false;
            const shieldVx = Math.cos(kickAngle) * (140 + Math.random() * 80);
            g.groundProps.push({
              id: Math.floor(hitTime * 1000 + Math.random() * 999),
              kind: "shield",
              x: z.x,
              y: z.y - 60 * scale,
              vx: shieldVx,
              vy: -(160 + Math.random() * 80),
              groundY: Math.min(ROAD_BOTTOM - 8, z.y + 2),
              rotation: 0,
              angularVelocity: Math.sign(shieldVx || 1) * (3.5 + Math.random() * 2),
              visibleAt: hitTime,
              removeAt: hitTime + GROUND_PROP_MS,
              settled: false,
            });
            if (g.groundProps.length > MAX_GROUND_PROPS) g.groundProps.splice(0, g.groundProps.length - MAX_GROUND_PROPS);
            sound.armorClank({ volume: distanceVolume(z.x, p.x) });
          }
          connected = true;
          for (let i = 0; i < 9; i++) {
            g.particles.push({ x: impactX, y: impactY, vx: 70 + Math.random() * 160, vy: -90 + Math.random() * 180, until: hitTime + 420, color: i % 3 ? "#bf292d" : "#701017", size: 3 + Math.random() * 5 });
          }
          // 踹击出血滴落路面形成血迹
          if (Math.random() < 0.5) {
            g.bloodStains.push({
              id: Math.floor(hitTime * 1000 + Math.random() * 999),
              x: Math.max(12, Math.min(g.worldW - 12, z.x + (Math.random() - .5) * 22)),
              y: Math.max(ROAD_TOP + 8, Math.min(ROAD_BOTTOM - 6, z.y + 2 + (Math.random() - .5) * 6)),
              rx: 3 + Math.random() * 4,
              removeAt: hitTime + BLOOD_STAIN_MS,
            });
            if (g.bloodStains.length > MAX_BLOOD_STAINS) g.bloodStains.splice(0, g.bloodStains.length - MAX_BLOOD_STAINS);
          }
        }
      }
      if (connected) {
        g.screenShakeUntil = performance.now() + 90;
        sound.kickHit();
      }
    }, 285);
  }, []);

  const damageZombie = useCallback((g: GameState, z: Zombie, damage: number, now: number, angle: number, hit?: ZombieHit, sourceWeapon?: WeaponKey, bypassReduction = false, sourceOverride?: DamageSourceOverride): boolean => {
    const region = hit?.region ?? "body";
    // 盔甲/盾牌格挡判定（仅枪械实弹；爆炸与火焰不传 sourceWeapon、近战为劈砍，均不经此判定）：
    // 摩托头盔只露眼缝可爆头；盾兵只有观察窗能命中；重甲只有胸口能造成伤害——被挡下时冒金属火花、无伤害
    if (hit && (sourceOverride || (sourceWeapon && !MELEE_WEAPONS.has(sourceWeapon))) && z.hp > 0) {
      const faceDir = g.player.x < z.x ? -1 : 1;
      let blocked = false;
      if ((z.kind === "helmet" || z.kind === "helmetRunner") && region === "head") {
        blocked = Math.hypot(hit.localX - faceDir * 6, hit.localY + 117) > 4.5;
      } else if (z.kind === "shield" && z.shieldIntact) {
        // 全身金属盾：仅眼平观察窗 (faceDir*22, -117) 可命中，判定窗与盾面玻璃窗一致
        blocked = Math.hypot(hit.localX - faceDir * 22, hit.localY + 117) > 6;
      } else if (z.kind === "juggernaut") {
        blocked = !isJuggernautChestWeakHit(region, hit.localX, hit.localY);
      }
      if (blocked) {
        // 燧石66 磷燃弹：格挡只挡直接伤害，挡不住点燃——被头盔/盾牌/重甲挡下同样灼烧致死
        if (sourceWeapon && WEAPONS[sourceWeapon].ignite) z.ignitedAt = now;
        emitArmorSpark(g, hit.x, hit.y, now, angle);
        g.stats.shotsHit += 1;
        if (z.kind === "shield" && z.shieldIntact) {
          // 盾牌独立承伤：吃武器单发原始伤害（不吃部位倍率与僵尸减免；穿透豁免针对身穿护甲、不削盾），
          // 弹孔按真实命中点累积（盾牌局部坐标，供裂纹/凹陷渲染），HP 归零 → 盾牌碎裂
          z.shieldHp -= damage;
          z.shieldDents.push({
            x: Math.max(-8.4, Math.min(8.4, hit.localX - faceDir * 22)),
            y: Math.max(-70, Math.min(70, hit.localY + 70)),
          });
          if (z.shieldDents.length > 14) z.shieldDents.shift();
          if (z.shieldHp <= 0) shatterZombieShield(g, z, now, angle);
          else sound.armorClank({ volume: distanceVolume(z.x, g.player.x) });
        } else {
          sound.armorClank({ volume: distanceVolume(z.x, g.player.x) });
        }
        return true;
      }
    }
    // 结算统计：仅实弹命中计入（近战/爆炸不计入命中率与爆头率）
    if (hit) {
      g.stats.shotsHit += 1;
      if (hit.region === "head") g.stats.headshots += 1;
    }
    const damageMultiplier = region === "head" ? 2.4 : region === "legs" ? .72 : 1;
    const impactX = hit?.x ?? z.x;
    const impactY = hit?.y ?? zombieBodyY(z);
    const scale = (z.radius / 25) * CHARACTER_SCALE;
    // 同区域伤口累计 → 损伤严重时露出骨骼（白色骨茬）
    const regionWounds = z.wounds.filter((wound) => wound.region === region).length;
    z.wounds.push({
      x: hit?.localX ?? (impactX - z.x) / scale,
      y: hit?.localY ?? (impactY - z.y) / scale,
      region,
      size: region === "head" ? 4.8 : region === "legs" ? 4 : 5.5,
      bone: regionWounds >= 2,
    });
    if (z.wounds.length > 7) z.wounds.splice(0, z.wounds.length - 7);
    // 护甲减免：实弹/近战按穿透梯度；第六关 Boss 全身至少减伤 50%，胸腹（body）减伤 70%。
    const penetrationBypass = sourceOverride?.penetrationBypass ?? (sourceWeapon ? armorPenBypass(sourceWeapon) : 0);
    const armorReduction = z.damageReduction > 0
      ? sourceWeapon || sourceOverride
        ? z.damageReduction * (1 - penetrationBypass)
        : z.warehouseArmor ? z.damageReduction : 0
      : 0;
    const bossReduction = giantMutantDamageReduction(z, region);
    const reduction = bypassReduction ? 0 : Math.max(armorReduction, bossReduction);
    z.hp -= damage * damageMultiplier * (1 - reduction);
    // 打腿 50% 概率倒地（重甲僵尸与第六关巨型 Boss 免疫此机制）
    if (region === "legs" && z.kind !== "juggernaut" && z.bossKind !== "giantMutant" && Math.random() < .5) {
      const currentPose = zombieKnockPose(z, now);
      if (!currentPose.active) {
        z.knockedDownAt = now;
        z.knockFacing = Math.cos(angle) >= 0 ? 1 : -1;
        z.knockStartFactor = 0;
        z.knockStartLift = 0;
        z.knockStartRecoveryProgress = 0;
      } else if (currentPose.recovering) {
        z.knockedDownAt = now;
        z.knockStartFactor = Math.abs(currentPose.rotation) / (Math.PI / 2);
        z.knockStartLift = Math.sin(currentPose.recoveryProgress * Math.PI) * 8;
        z.knockStartRecoveryProgress = currentPose.recoveryProgress;
      }
      z.knockedDownUntil = Math.max(z.knockedDownUntil, now + 3000);
      sound.zombieFall({ volume: distanceVolume(z.x, g.player.x) });
    }
    // 制动力：命中武器按 stopping 系数产生击退位移与短暂减速停滞（爆炸类不传 sourceWeapon，由爆炸击退负责）
    const stopping = sourceOverride?.stopping ?? (sourceWeapon ? WEAPON_HANDLING[sourceWeapon].stopping : 0);
    z.x += Math.cos(angle) * (6 + stopping * 20);
    z.y += Math.sin(angle) * (6 + stopping * 20) * 0.65;
    if (stopping > 0) z.staggeredUntil = Math.max(z.staggeredUntil, now + 90 + stopping * 260);
    // 磷燃弹：命中点燃目标（灼烧掉血由帧循环结算，直至死亡）
    if (sourceWeapon && WEAPONS[sourceWeapon].ignite && z.hp > 0) z.ignitedAt = now;
    // 方向性血液喷溅：主束沿弹道穿出方向收束成锥，伴随雾化细滴
    for (let i = 0; i < 13; i++) {
      const sprayAngle = angle + Math.PI + (Math.random() - .5) * (i < 7 ? 0.7 : 1.5);
      const speed = i < 7 ? 130 + Math.random() * 240 : 50 + Math.random() * 140;
      g.particles.push({
        x: impactX,
        y: impactY,
        vx: Math.cos(sprayAngle) * speed,
        vy: Math.sin(sprayAngle) * speed - 30,
        until: now + 300 + Math.random() * 300,
        color: i === 0 && region === "head" ? "#d8c6a0" : i % 4 === 0 ? "#5e0d14" : i % 3 === 0 ? "#8c1620" : "#b21f2c",
        size: i < 7 ? 2.5 + Math.random() * 5.5 : 1.5 + Math.random() * 3,
      });
    }
    // 喷溅血液滴落路面形成血迹：落点为沿喷溅方向投射到路面（僵尸脚踏线）的位置，10 秒后渐隐清除
    if (Math.random() < 0.7) {
      const stainDrops = Math.random() < 0.3 ? 2 : 1;
      for (let drop = 0; drop < stainDrops; drop++) {
        const dripAngle = angle + Math.PI + (Math.random() - .5) * 0.9;
        const travel = 14 + Math.random() * 52;
        g.bloodStains.push({
          id: Math.floor(now * 1000 + Math.random() * 999 + drop),
          x: Math.max(12, Math.min(g.worldW - 12, impactX + Math.cos(dripAngle) * travel)),
          y: Math.max(ROAD_TOP + 8, Math.min(ROAD_BOTTOM - 6, z.y + 2 + (Math.random() - .5) * 6)),
          rx: 3.5 + Math.random() * 6,
          removeAt: now + BLOOD_STAIN_MS,
        });
      }
      if (g.bloodStains.length > MAX_BLOOD_STAINS) g.bloodStains.splice(0, g.bloodStains.length - MAX_BLOOD_STAINS);
    }
    return false;
  }, []);

  const damageZombieFromExplosion = useCallback((
    g: GameState,
    z: Zombie,
    damage: number,
    now: number,
    blastX: number,
    blastY: number,
    distance: number,
    radius: number,
    kind: BlastKind,
  ) => {
    const angle = Math.atan2(z.y - blastY, z.x - blastX);
    // 全模式统一规则：爆炸冲击直接绕过僵尸自身与 Boss 的全部减伤。
    damageZombie(g, z, damage, now, angle, undefined, undefined, true);
    // 爆炸冲击波全额震伤完好盾牌（爆炸是破盾的硬 counter；金属盾不怕火焰，燃烧瓶/点燃不伤盾）；
    // 归零即碎裂——若同一发爆炸同时击杀僵尸，死亡结算时 shieldIntact 已为 false，不会再掉落完整盾牌
    if (z.shieldIntact) {
      z.shieldHp -= damage;
      z.shieldDents.push({ x: (Math.random() - .5) * 12, y: (Math.random() - .5) * 120 });
      if (z.shieldDents.length > 14) z.shieldDents.shift();
      if (z.shieldHp <= 0) shatterZombieShield(g, z, now, angle);
    }
    const proximity = Math.max(0, 1 - distance / Math.max(1, radius));
    const severity = Math.min(1.6, damage / Math.max(1, z.maxHp));
    const heavyBonus = kind === "airstrike" || kind === "rocket" ? .18 : kind === "grenade" || kind === "frag" ? .08 : 0;
    const detachChance = Math.min(.94, .08 + proximity * .42 + severity * .3 + heavyBonus);
    if (Math.random() >= detachChance) return;
    const available: ZombieLimb[] = (["leftArm", "rightArm", "leftLeg", "rightLeg"] as ZombieLimb[]).filter((limb) => !z.missingLimbs.has(limb));
    const detachCount = severity > 1 && proximity > .45 && Math.random() < .48 ? 2 : 1;
    for (let index = 0; index < detachCount && available.length > 0; index++) {
      const choiceIndex = Math.floor(Math.random() * available.length);
      const [limb] = available.splice(choiceIndex, 1);
      detachZombieLimb(g, z, limb, blastX, blastY, now);
    }
    const missingLegs = Number(z.missingLimbs.has("leftLeg")) + Number(z.missingLimbs.has("rightLeg"));
    if (missingLegs > 0 && z.bossKind !== "giantMutant") {
      z.knockedDownAt = now;
      z.knockedDownUntil = Math.max(z.knockedDownUntil, now + 3000 + missingLegs * 900);
      z.knockFacing = Math.cos(angle) >= 0 ? 1 : -1;
      z.knockStartFactor = 0;
      z.knockStartLift = 0;
      z.knockStartRecoveryProgress = 0;
    }
  }, [damageZombie]);

  const attack = useCallback((now: number) => {
    const g = stateRef.current;
    if (levelInputFrozen(g)) return;
    if (isLevel8Driving(g) && g.level) {
      const level = g.level;
      if (now < level.vehicleReloadUntil || now - level.vehicleLastShot < LEVEL8_HMG_FIRE_MS) return;
      if (level.vehicleAmmo <= 0) {
        level.vehicleReloadUntil = now + LEVEL8_HMG_RELOAD_MS;
        sound.reload(LEVEL8_HMG_RELOAD_MS);
        return;
      }
      level.vehicleAmmo -= 1;
      level.vehicleLastShot = now;
      const mountX = level.truckX + LEVEL8_HMG_MOUNT_X;
      const mountY = level.truckY + LEVEL8_HMG_MOUNT_Y;
      const aimAngle = Math.atan2(mouseRef.current.y - mountY, mouseRef.current.x + g.cameraX - mountX);
      level.vehicleAimAngle = aimAngle;
      const muzzleX = mountX + Math.cos(aimAngle) * LEVEL8_HMG_MUZZLE_X;
      const muzzleY = mountY + Math.sin(aimAngle) * LEVEL8_HMG_MUZZLE_X;
      const endX = muzzleX + Math.cos(aimAngle) * LEVEL8_HMG_RANGE;
      const endY = muzzleY + Math.sin(aimAngle) * LEVEL8_HMG_RANGE;
      const hits = g.zombies
        .map((zombie) => ({ zombie, impact: hitZombieRegion(muzzleX, muzzleY, endX, endY, zombie, now, g.player.x) }))
        .filter((entry): entry is { zombie: Zombie; impact: ZombieHit } => entry.impact !== null)
        .sort((a, b) => a.impact.t - b.impact.t)
        .slice(0, LEVEL8_HMG_PENETRATION);
      let tracerX = endX;
      let tracerY = endY;
      for (const { zombie, impact } of hits) {
        tracerX = impact.x; tracerY = impact.y;
        const blocked = damageZombie(g, zombie, LEVEL8_HMG_DAMAGE, now, aimAngle, impact, undefined, false, {
          penetrationBypass: LEVEL8_HMG_PENETRATION_BYPASS, stopping: LEVEL8_HMG_STOPPING,
        });
        if (blocked) break;
      }
      g.tracers.push({ x1: muzzleX, y1: muzzleY, x2: tracerX, y2: tracerY, until: now + 95, color: "#f6d267" });
      g.screenShakeUntil = now + 95;
      sound.gunshot("m240l", { fireRateMs: LEVEL8_HMG_FIRE_MS });
      return;
    }
    const p = g.player;
    const weapon = WEAPONS[p.weapon];
    if (p.emptyReloadLatch) return;
    const origin = playerGunOrigin(p);
    if (now < p.reloadingUntil || now - p.lastShot < weapon.fireRate) return;

    if (MELEE_WEAPONS.has(p.weapon)) {
      p.lastShot = now;
      p.lastMeleeAttack = now;
      if (KNIFE_WEAPONS.has(p.weapon)) p.meleeMode = p.meleeMode === "slash" ? "stab" : "slash";
      const attackAngle = p.angle;
      const attackMode = HEAVY_MELEE_WEAPONS.has(p.weapon) ? "heavy" : p.meleeMode;
      sound.meleeSwing(attackMode);
      window.setTimeout(() => {
        if (stateRef.current.player !== p || screenRef.current !== "playing") return;
        let nearest: Zombie | undefined;
        let nearestDist = Infinity;
        // 判定范围 = 手臂前伸基础距 + 武器真实长度换算的世界像素（长武器范围更大）
        const weaponReach = REAL_LENGTH_MM[p.weapon] * WORLD_PX_PER_MM;
        for (const z of g.zombies) {
          const dist = Math.hypot(z.x - p.x, z.y - p.y);
          const toward = Math.cos(Math.atan2(z.y - p.y, z.x - p.x) - attackAngle);
          const minimumAim = attackMode === "stab" ? .62 : attackMode === "heavy" ? -.18 : .05;
          const reach = attackMode === "stab" ? 94 + weaponReach : attackMode === "heavy" ? 88 + weaponReach : 84 + weaponReach;
          if (dist <= reach && toward > minimumAim && dist < nearestDist) {
            nearest = z;
            nearestDist = dist;
          }
        }
        if (nearest) {
          damageZombie(g, nearest, weaponDamage(p.weapon), performance.now(), attackAngle, undefined, p.weapon);
          sound.meleeHit(attackMode === "heavy");
          if (attackMode === "heavy") nearest.x += Math.cos(attackAngle) * 35;
        }
      }, attackMode === "stab" ? 175 : attackMode === "heavy" ? meleeAttackDuration(p.weapon) * 0.55 : 205);
      return;
    }

    if (p.ammo[p.weapon] <= 0) {
      // 所有模式统一：空弹匣时左键与 R 键都启动换弹；仍有余弹时左键只负责射击。
      p.emptyReloadLatch = true;
      reloadRef.current(now);
      return;
    }
    p.lastShot = now;
    p.ammo[p.weapon] -= 1;
    p.lastMuzzleFlash = now;
    // 后坐力（纯视觉）：记录击发时刻；连发热度先按距上次击发冷却再叠加，自然累积且封顶不过度
    p.recoilHeat = Math.min(1, p.recoilHeat * Math.max(0, 1 - (now - p.recoilAt) / RECOIL_HEAT_COOL_MS) + WEAPON_RECOIL[p.weapon].heat);
    p.recoilAt = now;
    sound.gunshot(p.weapon, { fireRateMs: weapon.fireRate });
    if (BOLT_ACTION_WEAPONS.has(p.weapon)) sound.boltAction(boltCycleMs(p.weapon));
    // 抛壳：弹壳向后上方抛出，落地弹跳后静置留存；栓动枪等到拉栓后拉段才抛出。
    if (!weapon.explosionRadius) {
      const a = p.angle;
      const port = 30 * playerWeaponScale(p.weapon) * CHARACTER_SCALE;
      const back = a + Math.PI * 0.72 + (Math.random() - 0.5) * 0.5;
      g.groundProps.push({
        id: Math.floor(now * 1000 + Math.random() * 999),
        kind: "casing",
        x: origin.x + Math.cos(a) * port,
        y: origin.y + Math.sin(a) * port,
        vx: Math.cos(back) * (50 + Math.random() * 60),
        vy: -(120 + Math.random() * 90),
        groundY: p.y + 2,
        rotation: Math.random() * Math.PI,
        angularVelocity: (Math.random() - 0.5) * 26,
        visibleAt: now + (BOLT_ACTION_WEAPONS.has(p.weapon) ? Math.round(boltCycleMs(p.weapon) * .34) : 0),
        removeAt: now + GROUND_PROP_MS,
        weapon: p.weapon,
        settled: false,
      });
      if (g.groundProps.length > MAX_GROUND_PROPS) g.groundProps.splice(0, g.groundProps.length - MAX_GROUND_PROPS);
    }
    if (weapon.explosionRadius) {
      const blastKind = weapon.blastKind ?? "grenade";
      const angle = p.angle + (Math.random() - .5) * (weapon.spread || 0);
      const pointerWorldX = mouseRef.current.x + g.cameraX;
      const cursorDistance = Math.hypot(pointerWorldX - origin.x, mouseRef.current.y - origin.y);
      const distance = Math.min(weapon.range, Math.max(120, cursorDistance));
      let targetX = origin.x + Math.cos(angle) * distance;
      let targetY = origin.y + Math.sin(angle) * distance;
      let nearest: { zombie: Zombie; impact: ZombieHit } | undefined;
      for (const z of g.zombies) {
        const impact = hitZombieRegion(origin.x, origin.y, targetX, targetY, z, now, g.player.x);
        if (impact && (!nearest || impact.t < nearest.impact.t)) nearest = { zombie: z, impact };
      }
      if (nearest) { targetX = nearest.impact.x; targetY = nearest.impact.y; }
      const muzzle = weaponMuzzleOffset(p.weapon);
      const startX = origin.x + Math.cos(angle) * muzzle;
      const startY = origin.y + Math.sin(angle) * muzzle;
      const travelDistance = Math.hypot(targetX - startX, targetY - startY);
      const flightMs = Math.max(180, travelDistance / (blastKind === "rocket" ? 980 : 610) * 1000);
      g.explosiveProjectiles.push({
        id: Math.floor(now * 1000 + Math.random() * 999),
        weapon: p.weapon === "rpg7" ? "rpg7" : "m32",
        kind: blastKind,
        startX,
        startY,
        targetX,
        targetY,
        createdAt: now,
        impactAt: now + flightMs,
        angle,
        arcHeight: blastKind === "rocket" ? 10 : Math.min(150, 48 + travelDistance * .11),
        radius: weapon.explosionRadius,
        damage: weapon.damage,
      });
      g.screenShakeUntil = now + (blastKind === "rocket" ? 110 : 65);
      return;
    }

    if (weapon.penetration) {
      const angle = p.angle + (Math.random() - .5) * (weapon.spread || 0);
      const endX = origin.x + Math.cos(angle) * weapon.range;
      const endY = origin.y + Math.sin(angle) * weapon.range;
      // 第三关夜防：子弹仅经射击孔越过围墙，否则止于墙面（命中判定只取墙前目标）
      const wallBlock = level3WallBlock(g, origin.x, origin.y, endX, endY);
      const wallT = wallBlock ? (wallBlock.x - origin.x) / (endX - origin.x || 1e-6) : Infinity;
      const hits = g.zombies
        .map((z) => ({ z, impact: hitZombieRegion(origin.x, origin.y, endX, endY, z, now, g.player.x) }))
        .filter((entry): entry is { z: Zombie; impact: ZombieHit } => entry.impact !== null && entry.impact.t < wallT)
        .sort((a, b) => a.impact.t - b.impact.t)
        .slice(0, weapon.penetration);
      // 逐目标结算；子弹被盔甲/盾牌挡下时终止穿透（曳光止于挡下点；无命中时止于围墙/射程）
      let stoppedAt: { x: number; y: number } | null = wallBlock;
      for (const [index, { z, impact }] of hits.entries()) {
        // 旧的 20%/目标衰减保留，但高穿透武器后续目标至少造成 10%，绝不产生负伤害给僵尸回血。
        const penetrationDamageFactor = Math.max(.1, 1 - index * .2);
        const blocked = damageZombie(g, z, weaponDamage(p.weapon) * penetrationDamageFactor, now, angle, impact, p.weapon);
        if (blocked) { stoppedAt = { x: impact.x, y: impact.y }; break; }
      }
      if (wallBlock && stoppedAt === wallBlock) {
        for (let i = 0; i < 4; i++) g.particles.push({ x: wallBlock.x, y: wallBlock.y, vx: -40 - Math.random() * 90, vy: -60 + Math.random() * 120, until: now + 280, color: "#c9c2a8", size: 2 + Math.random() * 2.5 });
      }
      const muzzle = weaponMuzzleOffset(p.weapon);
      g.tracers.push({ x1: origin.x + Math.cos(angle) * muzzle, y1: origin.y + Math.sin(angle) * muzzle, x2: stoppedAt?.x ?? endX, y2: stoppedAt?.y ?? endY, until: now + 130, color: weapon.color });
      g.screenShakeUntil = now + 145;
      return;
    }

    const pellets = weapon.pellets || 1;
    for (let shot = 0; shot < pellets; shot++) {
      const angle = p.angle + (Math.random() - 0.5) * (weapon.spread || 0.035);
      const endX = origin.x + Math.cos(angle) * weapon.range;
      const endY = origin.y + Math.sin(angle) * weapon.range;
      // 第三关夜防：子弹仅经射击孔越过围墙，否则止于墙面
      const wallBlock = level3WallBlock(g, origin.x, origin.y, endX, endY);
      const wallT = wallBlock ? (wallBlock.x - origin.x) / (endX - origin.x || 1e-6) : Infinity;
      let hit: { zombie: Zombie; impact: ZombieHit } | undefined;
      for (const z of g.zombies) {
        const impact = hitZombieRegion(origin.x, origin.y, endX, endY, z, now, g.player.x);
        if (impact && impact.t < wallT && (!hit || impact.t < hit.impact.t)) hit = { zombie: z, impact };
      }
      const tracerEndX = hit ? hit.impact.x : wallBlock?.x ?? endX;
      const tracerEndY = hit ? hit.impact.y : wallBlock?.y ?? endY;
      if (wallBlock && !hit) {
        for (let i = 0; i < 4; i++) g.particles.push({ x: wallBlock.x, y: wallBlock.y, vx: -40 - Math.random() * 90, vy: -60 + Math.random() * 120, until: now + 280, color: "#c9c2a8", size: 2 + Math.random() * 2.5 });
      }
      const muzzle = weaponMuzzleOffset(p.weapon);
      g.tracers.push({ x1: origin.x + Math.cos(angle) * muzzle, y1: origin.y + Math.sin(angle) * muzzle, x2: tracerEndX, y2: tracerEndY, until: now + 75, color: weapon.color });
      if (hit) damageZombie(g, hit.zombie, weaponDamage(p.weapon), now, angle, hit.impact, p.weapon);
    }
    g.screenShakeUntil = now + (weapon.pellets ? 135 : ["scarh", "m240l", "pkm"].includes(p.weapon) ? 92 : ["ak47", "m16"].includes(p.weapon) ? 72 : 45);
  }, [damageZombie]);

  const reload = useCallback((now: number) => {
    const g = stateRef.current;
    if (isLevel8Driving(g) && g.level) {
      if (g.level.vehicleAmmo >= LEVEL8_HMG_MAGAZINE || now < g.level.vehicleReloadUntil) return;
      g.level.vehicleReloadUntil = now + LEVEL8_HMG_RELOAD_MS;
      sound.reload(LEVEL8_HMG_RELOAD_MS);
      return;
    }
    const p = g.player;
    const weapon = WEAPONS[p.weapon];
    if (MELEE_WEAPONS.has(p.weapon) || p.ammo[p.weapon] === weapon.magazine || now < p.reloadingUntil) return;
    p.reloadStartedAt = now;
    p.reloadingUntil = now + weapon.reload;
    sound.reload(weapon.reload);
    // 旧弹匣被拔下后抛落到路面，弹跳后静置留存一段时间（与编舞中 0.06 进度拔匣时机对应）。
    const hold = WEAPON_HOLD[p.weapon];
    if (hold.reloadKind === "mag") {
      const origin = playerGunOrigin(p);
      const a = p.angle;
      const gs = playerWeaponScale(p.weapon) * CHARACTER_SCALE;
      const magWell = hold.magWell ?? hold.grip;
      const lx = magWell[0] * gs;
      const ly = magWell[1] * gs;
      g.groundProps.push({
        id: Math.floor(now * 1000 + Math.random() * 999),
        kind: "mag",
        x: origin.x + lx * Math.cos(a) - ly * Math.sin(a),
        y: origin.y + lx * Math.sin(a) + ly * Math.cos(a),
        vx: -Math.cos(a) * (26 + Math.random() * 30),
        vy: -(70 + Math.random() * 50),
        groundY: p.y + 2,
        rotation: (Math.random() - 0.5) * 0.6,
        angularVelocity: (Math.random() - 0.5) * 14,
        visibleAt: now + Math.min(240, weapon.reload * 0.08),
        removeAt: now + GROUND_PROP_MS,
        weapon: p.weapon,
        settled: false,
      });
      if (g.groundProps.length > MAX_GROUND_PROPS) g.groundProps.splice(0, g.groundProps.length - MAX_GROUND_PROPS);
    }
  }, []);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  // 搭档战斗逻辑：每帧驱动猎犬/警察/无人机的移动与自动攻击；搭档不会死亡、不被僵尸选为目标
  const updatePartner = useCallback((g: GameState, now: number, dt: number) => {
    if (!g.partner) return;
    const p = g.player;
    const f = g.partnerField;
    // 以搭档自身为圆心找最近存活僵尸（hp<=0 的待清理个体不计）
    const nearestZombie = (range: number) => {
      let best: Zombie | undefined;
      let bestDist = Infinity;
      for (const z of g.zombies) {
        if (z.hp <= 0) continue;
        const d = Math.hypot(z.x - f.x, z.y - f.y);
        if (d <= range && d < bestDist) { best = z; bestDist = d; }
      }
      return best ? { zombie: best, dist: bestDist } : null;
    };
    const moveToward = (goalX: number, goalY: number, speed: number, arrive: number) => {
      const dx = goalX - f.x;
      const dy = goalY - f.y;
      const d = Math.hypot(dx, dy);
      f.moving = d > arrive;
      if (d > 1) {
        const step = Math.min(d, speed * dt);
        f.x += (dx / d) * step;
        f.y += (dy / d) * step;
      }
      return d;
    };
    // 自主游走驻守：在玩家附近的环带内自己选点巡逻，到点或超时后换点（不贴身跟随）
    const roam = (ringMin: number, ringMax: number, speed: number) => {
      const arrived = Math.hypot(f.roamX - f.x, f.roamY - f.y) < 16;
      if (arrived || now >= f.nextRoamAt) {
        const ang = Math.random() * Math.PI * 2;
        const r = ringMin + Math.random() * (ringMax - ringMin);
        f.roamX = Math.max(60, Math.min(g.worldW - 60, p.x + Math.cos(ang) * r));
        f.roamY = Math.max(ROAD_TOP + 46, Math.min(ROAD_BOTTOM - 14, p.y + Math.sin(ang) * r * 0.55));
        f.nextRoamAt = now + 1800 + Math.random() * 2400;
      }
      const d = moveToward(f.roamX, f.roamY, speed, 10);
      if (f.moving) f.angle = Math.atan2(f.roamY - f.y, f.roamX - f.x);
      return d;
    };

    if (g.partner === "hound") {
      // 猎犬：自主巡猎——620 内发现僵尸即高速冲上扑咬，将其扑倒（倒地约 3 秒后爬起）；
      // 无目标时在玩家附近游走驻守，目标消灭后自然回到游走
      const target = nearestZombie(620);
      const d = target
        ? moveToward(target.zombie.x - Math.sign(target.zombie.x - f.x || 1) * 14, target.zombie.y + 2, 360, 6)
        : roam(110, 240, 220);
      f.x = Math.max(30, Math.min(g.worldW - 30, f.x));
      f.y = Math.max(ROAD_TOP + 14, Math.min(ROAD_BOTTOM - 8, f.y));
      if (target) f.angle = Math.atan2(target.zombie.y - f.y, target.zombie.x - f.x);
      if (target && d < 30 && now - f.attackAt >= HOUND_INTERVAL_MS) {
        f.attackAt = now;
        damageZombie(g, target.zombie, HOUND_DAMAGE, now, f.angle);
        // 扑倒：与打腿击倒共用 zombieKnockPose 倒地-爬起系统（倒地 3 秒后进入爬起流程）
        const z = target.zombie;
        if (z.hp > 0 && z.bossKind !== "giantMutant") {
          if (!zombieKnockPose(z, now).active) {
            z.knockedDownAt = now;
            z.knockFacing = Math.cos(f.angle) >= 0 ? 1 : -1;
            z.knockStartFactor = 0;
            z.knockStartLift = 0;
            z.knockStartRecoveryProgress = 0;
          }
          z.knockedDownUntil = Math.max(z.knockedDownUntil, now + 3000);
          sound.zombieFall({ volume: distanceVolume(z.x, p.x) });
        }
        sound.dogBark({ volume: distanceVolume(f.x, p.x) });
      }
      return;
    }

    if (g.partner === "officer") {
      // 武装警察：自主走位——760 内发现僵尸即在与目标的连线方向上保持约 330 的中距离射击位；
      // 无目标时在玩家附近游走驻守。M1911 半速射击（fireRate ×2 = 490ms），
      // 7 发弹匣打空后停火换弹（时长/编舞/音效与玩家一致）
      if (f.reloadingUntil !== 0 && now >= f.reloadingUntil) {
        f.ammo = WEAPONS.m1911.magazine;
        f.reloadingUntil = 0;
        f.reloadStartedAt = 0;
        f.reloading = false;
      }
      const target = nearestZombie(760);
      if (target) {
        const side = Math.atan2(f.y - target.zombie.y, f.x - target.zombie.x);
        const goalX = Math.max(40, Math.min(g.worldW - 40, target.zombie.x + Math.cos(side) * 330));
        const goalY = Math.max(ROAD_TOP + 40, Math.min(ROAD_BOTTOM - 10, target.zombie.y + Math.sin(side) * 330 * 0.7));
        moveToward(goalX, goalY, 250, 26);
      } else {
        roam(130, 260, 210);
      }
      f.x = Math.max(40, Math.min(g.worldW - 40, f.x));
      f.y = Math.max(ROAD_TOP + 40, Math.min(ROAD_BOTTOM - 10, f.y));
      if (!target) return;
      const shoulderY = f.y - 88 * CHARACTER_SCALE;
      f.angle = Math.atan2(zombieBodyY(target.zombie) - shoulderY, target.zombie.x - f.x);
      if (f.reloadingUntil > now) return;
      const fireRateMs = WEAPONS.m1911.fireRate * 2;
      if (now - f.attackAt < fireRateMs) return;
      if (f.ammo <= 0) {
        // 弹匣打空：执行换弹（WEAPONS.m1911.reload 时长，sound.reload 音效，绘制复用玩家编舞）
        f.reloading = true;
        f.reloadStartedAt = now;
        f.reloadingUntil = now + WEAPONS.m1911.reload;
        sound.reload(WEAPONS.m1911.reload);
        return;
      }
      f.attackAt = now;
      f.muzzleAt = now;
      f.recoilHeat = Math.min(1, f.recoilHeat * Math.max(0, 1 - (now - f.recoilAt) / RECOIL_HEAT_COOL_MS) + WEAPON_RECOIL.m1911.heat);
      f.recoilAt = now;
      f.ammo -= 1;
      const gunOrigin = officerGunOrigin(f);
      const originX = gunOrigin.x;
      const originY = gunOrigin.y;
      const endX = originX + Math.cos(f.angle) * WEAPONS.m1911.range;
      const endY = originY + Math.sin(f.angle) * WEAPONS.m1911.range;
      let hit: { zombie: Zombie; impact: ZombieHit } | undefined;
      for (const z of g.zombies) {
        if (z.hp <= 0) continue;
        const impact = hitZombieRegion(originX, originY, endX, endY, z, now, g.player.x);
        if (impact && (!hit || impact.t < hit.impact.t)) hit = { zombie: z, impact };
      }
      g.tracers.push({
        x1: originX + Math.cos(f.angle) * 18,
        y1: originY + Math.sin(f.angle) * 18,
        x2: hit ? hit.impact.x : endX,
        y2: hit ? hit.impact.y : endY,
        until: now + 75,
        color: WEAPONS.m1911.color,
      });
      if (hit) damageZombie(g, hit.zombie, weaponDamage("m1911"), now, f.angle, hit.impact, "m1911");
      sound.gunshot("m1911", { fireRateMs, volume: 0.5 * distanceVolume(f.x, p.x) });
      return;
    }

    // ZH501 攻击无人机：平滑跟随玩家头顶悬停位，900 内自动瞄准；弹匣打 10 秒后换弹 3 秒
    const hoverX = p.x + 26;
    const hoverY = p.y - 172;
    const follow = Math.min(1, dt * 3.2);
    f.x += (hoverX - f.x) * follow;
    f.y += (hoverY - f.y) * follow;
    f.x = Math.max(30, Math.min(g.worldW - 30, f.x));
    f.moving = Math.hypot(hoverX - f.x, hoverY - f.y) > 8;
    if (!f.reloading && now - f.cycleAt >= DRONE_FIRE_MS) { f.reloading = true; f.cycleAt = now; }
    else if (f.reloading && now - f.cycleAt >= DRONE_RELOAD_MS) { f.reloading = false; f.cycleAt = now; }
    const target = nearestZombie(900);
    if (!target) return;
    f.angle = Math.atan2(zombieBodyY(target.zombie) - f.y, target.zombie.x - f.x);
    if (f.reloading || now - f.attackAt < DRONE_INTERVAL_MS) return;
    f.attackAt = now;
    f.muzzleAt = now;
    f.recoilHeat = Math.min(1, f.recoilHeat * Math.max(0, 1 - (now - f.recoilAt) / RECOIL_HEAT_COOL_MS) + DRONE_RECOIL.heat);
    f.recoilAt = now;
    const originX = f.x + Math.cos(f.angle) * 16;
    const originY = f.y + 8 + Math.sin(f.angle) * 16;
    const endX = originX + Math.cos(f.angle) * 900;
    const endY = originY + Math.sin(f.angle) * 900;
    // 机载机枪单发穿透 2 个目标
    const hits = g.zombies
      .filter((z) => z.hp > 0)
      .map((z) => ({ z, impact: hitZombieRegion(originX, originY, endX, endY, z, now, g.player.x) }))
      .filter((entry): entry is { z: Zombie; impact: ZombieHit } => entry.impact !== null)
      .sort((a, b) => a.impact.t - b.impact.t)
      .slice(0, 2);
    hits.forEach(({ z, impact }, index) => {
      damageZombie(g, z, DRONE_DAMAGE * (1 - index * .2), now, f.angle, impact);
      // 强制动力：命中额外击退并踉跄 450ms
      z.x += Math.cos(f.angle) * 14;
      z.y += Math.sin(f.angle) * 14 * 0.65;
      z.staggeredUntil = Math.max(z.staggeredUntil, now + 450);
    });
    g.tracers.push({
      x1: originX,
      y1: originY,
      x2: hits.length > 0 ? hits[hits.length - 1].impact.x : endX,
      y2: hits.length > 0 ? hits[hits.length - 1].impact.y : endY,
      until: now + 90,
      color: "#9fd8ff",
    });
    sound.gunshot("m16", { fireRateMs: DRONE_INTERVAL_MS, volume: 0.45 * distanceVolume(f.x, p.x) });
  }, [damageZombie]);

  // 关卡 NPC AI：战斗型（救援小队）复用警察搭档体系——索敌/保持中距离射击位/M16 点射/弹匣打空换弹；
  // 巡逻型（军事基地）在锚点附近自主游走驻守（非战斗）
  const updateLevelNpcs = useCallback((g: GameState, now: number, dt: number) => {
    if (g.mode !== "level" || g.npcs.length === 0) return;
    const p = g.player;
    for (const npc of g.npcs) {
      if (npc.hp <= 0) continue;
      const f = npc.field;
      const wkey = npc.weapon;
      const wspec = WEAPONS[wkey];
      if (f.reloadingUntil !== 0 && now >= f.reloadingUntil) {
        f.ammo = wspec.magazine;
        f.reloadingUntil = 0;
        f.reloadStartedAt = 0;
        f.reloading = false;
      }
      if (npc.scripted) continue;
      const moveToward = (goalX: number, goalY: number, speed: number, arrive: number) => {
        const dx = goalX - f.x;
        const dy = goalY - f.y;
        const d = Math.hypot(dx, dy);
        f.moving = d > arrive;
        if (d > arrive) {
          const step = Math.min(d - arrive, speed * dt);
          f.x += (dx / d) * step;
          f.y += (dy / d) * step;
        }
        return d;
      };
      if (npc.combat) {
        // 索敌：燧石66 狙击手优先高价值目标（当前 HP 最高者，同 HP 取近）；其余就近射击
        let target: Zombie | undefined;
        if (wkey === "flint66") {
          let bestHp = 0;
          let bestHpDist = Infinity;
          for (const z of g.zombies) {
            if (z.hp <= 0) continue;
            const d = Math.hypot(z.x - f.x, z.y - f.y);
            if (z.hp > bestHp || (z.hp === bestHp && d < bestHpDist)) { bestHp = z.hp; bestHpDist = d; target = z; }
          }
        } else {
          let bestDist = 820;
          for (const z of g.zombies) {
            if (z.hp <= 0) continue;
            const d = Math.hypot(z.x - f.x, z.y - f.y);
            if (d < bestDist) { bestDist = d; target = z; }
          }
        }
        if (target) {
          // hold（夜防就位）：钉在锚点不动，只转向射击；否则保持 320 环绕距离机动
          if (!npc.hold) {
            const formationIndex = npc.squadIndex ?? 0;
            const side = Math.atan2(f.y - target.y, f.x - target.x);
            const goalX = npc.followPlayer
              ? Math.max(40, Math.min(g.worldW - 40, p.x - 72 - formationIndex * 54))
              : Math.max(40, Math.min(g.worldW - 40, target.x + Math.cos(side) * 320));
            const goalY = npc.followPlayer
              ? Math.max(ROAD_TOP + 40, Math.min(ROAD_BOTTOM - 10, p.y + (formationIndex === 0 ? -62 : 62)))
              : Math.max(ROAD_TOP + 40, Math.min(ROAD_BOTTOM - 10, target.y + Math.sin(side) * 320 * 0.7));
            moveToward(goalX, goalY, 250, 26);
            f.x = Math.max(40, Math.min(g.worldW - 40, f.x));
            f.y = Math.max(ROAD_TOP + 40, Math.min(ROAD_BOTTOM - 10, f.y));
          }
          const shoulderY = f.y - 88 * CHARACTER_SCALE;
          f.angle = Math.atan2(zombieBodyY(target) - shoulderY, target.x - f.x);
          if (f.reloadingUntil > now) continue;
          if (f.ammo <= 0) {
            f.reloading = true;
            f.reloadStartedAt = now;
            f.reloadingUntil = now + wspec.reload;
            sound.reload(wspec.reload);
            continue;
          }
          // 射速节奏：M16 点射 1.6×、PKM 全自动压制 1.15×、燧石66 栓动 1.4×（射击+拉栓循环）
          const fireRateMs = wspec.fireRate * (wkey === "pkm" ? 1.15 : wkey === "flint66" ? 1.4 : 1.6);
          if (now - f.attackAt < fireRateMs) continue;
          f.attackAt = now;
          f.muzzleAt = now;
          f.recoilHeat = Math.min(1, f.recoilHeat * Math.max(0, 1 - (now - f.recoilAt) / RECOIL_HEAT_COOL_MS) + WEAPON_RECOIL[wkey].heat);
          f.recoilAt = now;
          f.ammo -= 1;
          // PKM 压制扫射：弹道带散布覆盖密集区域；燧石66/M16 为精准单线
          const shotAngle = f.angle + (wkey === "pkm" ? (Math.random() - .5) * .09 : 0);
          const originX = f.x + Math.cos(shotAngle) * 20;
          const originY = shoulderY + Math.sin(shotAngle) * 8;
          const endX = originX + Math.cos(shotAngle) * wspec.range;
          const endY = originY + Math.sin(shotAngle) * wspec.range;
          // 穿透：燧石66 贯穿 15 目标（沿弹道由近及远依次结算，命中点燃由 damageZombie 的 ignite 机制处理），其余武器按各自穿透值取目标
          const pen = wspec.penetration ?? 1;
          const hits: Array<{ zombie: Zombie; impact: ZombieHit }> = [];
          for (const z of g.zombies) {
            if (z.hp <= 0) continue;
            const impact = hitZombieRegion(originX, originY, endX, endY, z, now, g.player.x);
            if (impact) hits.push({ zombie: z, impact });
          }
          hits.sort((a, b) => a.impact.t - b.impact.t);
          const struck = hits.slice(0, pen);
          const lastStruck = struck[struck.length - 1];
          g.tracers.push({
            x1: originX + Math.cos(shotAngle) * 18,
            y1: originY + Math.sin(shotAngle) * 18,
            x2: lastStruck ? lastStruck.impact.x : endX,
            y2: lastStruck ? lastStruck.impact.y : endY,
            until: now + 75,
            color: wspec.color,
          });
          for (const s of struck) damageZombie(g, s.zombie, weaponDamage(wkey), now, shotAngle, s.impact, wkey);
          sound.gunshot(wkey, { fireRateMs, volume: 0.5 * distanceVolume(f.x, p.x) });
        } else {
          // 无目标：第六关突击队回到玩家身后编队，其余士兵回到下车点驻守。
          const formationIndex = npc.squadIndex ?? 0;
          const idleX = npc.followPlayer ? p.x - 72 - formationIndex * 54 : npc.anchorX;
          const idleY = npc.followPlayer ? p.y + (formationIndex === 0 ? -62 : 62) : npc.anchorY;
          const travelAngle = Math.atan2(idleY - f.y, idleX - f.x);
          moveToward(idleX, idleY, npc.followPlayer ? 250 : 190, 12);
          f.angle = f.moving ? travelAngle : -0.2;
        }
        continue;
      }
      // 驻守型（非战斗 hold，如第四关维修通讯设备的队友）：钉在锚点，面向作业对象（右侧）
      if (npc.hold) {
        moveToward(npc.anchorX, npc.anchorY, 190, 6);
        f.angle = 0.12;
        continue;
      }
      // 巡逻型：锚点附近随机选点游走，到点驻留片刻再换点
      const arrived = Math.hypot(f.roamX - f.x, f.roamY - f.y) < 14;
      if (arrived) {
        f.moving = false;
        if (now >= f.nextRoamAt) {
          f.roamX = Math.max(60, Math.min(g.worldW - 60, npc.anchorX + (Math.random() * 2 - 1) * 200));
          f.roamY = Math.max(ROAD_TOP + 60, Math.min(ROAD_BOTTOM - 20, npc.anchorY + (Math.random() * 2 - 1) * 90));
          f.nextRoamAt = now + 1600 + Math.random() * 2600;
        }
      } else {
        const d = moveToward(f.roamX, f.roamY, 150, 12);
        if (d > 4) f.angle = Math.atan2(f.roamY - f.y, f.roamX - f.x);
      }
    }
    g.npcs = g.npcs.filter((npc) => npc.hp > 0);
  }, [damageZombie]);

  // 关卡对话推进（任意键/点击）：台词读完即关闭，后续转场由任务链检测
  const advanceLevelDialog = useCallback(() => {
    const g = stateRef.current;
    const dialog = g.level?.dialog;
    if (!dialog) return;
    dialog.index += 1;
    if (dialog.index >= dialog.lines.length && g.level) g.level.dialog = null;
    sound.uiClick();
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "f", "g", "q", "r", "b", "m", "1", "2", "3", "4", "5", "6", "7", " "].includes(key)) event.preventDefault();
      if (key === "escape") {
        if (screenRef.current === "playing") {
          event.preventDefault();
          if (!event.repeat) togglePause();
        } else if (screenRef.current === "codex") {
          // 图鉴：ESC 返回来源界面（主菜单或暂停面板）
          event.preventDefault();
          if (!event.repeat) closeCodex();
        } else if (screenRef.current === "levels" || screenRef.current === "levelComplete") {
          // 关卡选择/通关结算：ESC 返回主菜单
          event.preventDefault();
          if (!event.repeat) closeLevels();
        } else if (screenRef.current === "lottery") {
          // 抽奖战斗演出期间锁定退出；待机/结果页可返回探索主界面
          event.preventDefault();
          if (!event.repeat) closeLottery();
        } else if (screenRef.current === "loadout" && loadoutOpenRef.current !== null) {
          // 二级选择界面：ESC 返回装备整备主视图（不回主菜单）
          event.preventDefault();
          if (!event.repeat) {
            sound.uiClick();
            setLoadoutOpen(null);
          }
        } else if (screenRef.current === "shop" || screenRef.current === "loadout") {
          event.preventDefault();
          if (!event.repeat) saveProgressAndMenu();
        }
        return;
      }
      // 图鉴翻页：← → 方向键（仅图鉴界面生效）
      if (screenRef.current === "codex" && (key === "arrowleft" || key === "arrowright")) {
        event.preventDefault();
        if (!event.repeat) flipCodex(key === "arrowleft" ? -1 : 1);
        return;
      }
      keysRef.current.add(key);
      if (key === "m" && !event.repeat) {
        toggleMute();
        return;
      }
      if (key === "b" && !event.repeat) {
        if (pausedRef.current) return;
        if (screenRef.current === "playing") openRangeShop();
        else if ((screenRef.current === "shop" || screenRef.current === "loadout") && stateRef.current.mode === "range") resumeRange();
        return;
      }
      if (screenRef.current === "playing" && !pausedRef.current) {
        // 关卡对话中：任意键推进台词，其余操作挂起
        if (stateRef.current.mode === "level" && stateRef.current.level?.dialog) {
          if (!event.repeat) advanceLevelDialog();
          return;
        }
        if (key === "f") kick(performance.now());
        if (key === "g" && !event.repeat && stateRef.current.mode === "level") { dropWeapon(); return; }
        if (key === "q") cycleWeapon();
        if (key === "r") reload(performance.now());
        const itemIndex = Number(key) - 1;
        if (!event.repeat && itemIndex >= 0 && itemIndex < ITEM_KEYS.length) {
          const itemKey = ITEM_KEYS[itemIndex];
          if (ITEMS[itemKey].delivery === "auto") callAirstrike(performance.now());
          else selectItem(itemKey);
        }
      }
    };
    const keyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [advanceLevelDialog, callAirstrike, closeCodex, closeLevels, closeLottery, cycleWeapon, dropWeapon, flipCodex, kick, openRangeShop, reload, resumeRange, saveProgressAndMenu, selectItem, toggleMute, togglePause]);

  const pointerPosition = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    // 以位图实际尺寸（动态 worldW × H）按比例换算：CSS 等比缩放下鼠标映射恒正确
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  }, []);

  const spawnZombie = useCallback((g: GameState, now: number, forcedKind?: ZombieKind) => {
    const brute = forcedKind !== undefined ? forcedKind === "brute" : g.day >= 3 && Math.random() < Math.min(0.12 + g.day * 0.012, 0.32);
    // 生成池：normal/brute 权重恒为 100；扩展种类自 unlockDay 起混入，权重 4 天渐进爬满（不会某天突然全是新种类）。
    // 靶场模式 day 恒为 1，按击杀数折算解锁进度（每 6 杀 ≈ 1 天，封顶第 20 天），逐步混入全部种类。
    // forcedKind（靶场批次配置）跳过 brute roll 与池抽取，直接按指定种类生成。
    const poolDay = g.mode === "range" ? Math.min(20, 1 + Math.floor(g.kills / 6)) : g.day;
    let kind: ZombieKind = forcedKind ?? (brute ? "brute" : "normal");
    if (forcedKind === undefined) {
      const pool: Array<[Exclude<ZombieKind, "normal" | "brute">, number]> = [];
      for (const [kind, spec] of Object.entries(ZOMBIE_KIND_SPECS) as Array<[Exclude<ZombieKind, "normal" | "brute">, (typeof ZOMBIE_KIND_SPECS)[Exclude<ZombieKind, "normal" | "brute">]]>) {
        if (poolDay >= spec.unlockDay) pool.push([kind, spec.weight * Math.min(1, (poolDay - spec.unlockDay + 1) / 4)]);
      }
      const totalWeight = 100 + pool.reduce((sum, entry) => sum + entry[1], 0);
      let roll = Math.random() * totalWeight;
      if (!brute && roll >= 100) {
        roll -= 100;
        for (const [entry, weight] of pool) {
          if (roll < weight) { kind = entry; break; }
          roll -= weight;
        }
      }
    }
    const spec = kind === "normal" || kind === "brute" ? undefined : ZOMBIE_KIND_SPECS[kind];
    const hp = spec?.hp ?? (brute ? 128 : 62) * (1 + (g.day - 1) * 0.18);
    const radius = spec?.radius ?? (brute ? 33 : 25);
    // 僵尸沿整幅路面生成（适配玩家全路自由移动）：上至头顶不出画面上沿（大块头相应下移）、下至路面下缘
    const figureHeight = BASE_HUMAN_HEIGHT * CHARACTER_SCALE * (radius / 25);
    const minimumFootY = figureHeight + 5;
    const maximumFootY = ROAD_BOTTOM - 18;
    const skinTone = radius > 29 ? "#6e7c52" : "#7e8c60";
    // 生成时确定服装套系与破损程度：此后存活/尸体/断肢全程保持同一套外观（纯外观，不影响数值）
    const outfit = randomZombieOutfit(skinTone);
    g.zombies.push({
      id: g.day * 1000 + g.spawned,
      kind,
      warehouseArmor: kind === "armored" || kind === "armoredRunner",
      x: g.worldW + 45 + Math.random() * 130,
      y: minimumFootY + Math.random() * Math.max(1, maximumFootY - minimumFootY),
      hp,
      maxHp: hp,
      speed: (brute ? 25 : 42 + Math.random() * 24) * (1 + (g.day - 1) * 0.045) * (spec?.speedFactor ?? 1),
      radius,
      attack: spec?.attack ?? (brute ? 15 : 8 + g.day * 0.7),
      damageReduction: spec?.damageReduction ?? 0,
      shieldIntact: kind === "shield",
      shieldHp: kind === "shield" ? SHIELD_HP : 0,
      shieldDents: [],
      spitAt: 0,
      nextSpitAt: now + 1200 + Math.random() * 900,
      lastHit: 0,
      attackHitApplied: true,
      knockedDownAt: 0,
      knockedDownUntil: 0,
      knockFacing: -1,
      knockStartFactor: 0,
      knockStartLift: 0,
      knockStartRecoveryProgress: 0,
      debuffedUntil: 0,
      staggeredUntil: 0,
      heldUntil: 0,
      ignitedAt: 0,
      missingLimbs: new Set<ZombieLimb>(),
      wounds: [],
      tint: outfit.top,
      outfit,
      wobble: Math.random() * 8,
    });
    g.spawned += 1;
    g.nextSpawnAt = now + Math.max(320, 1000 - g.day * 45) + Math.random() * 420;
    // 图鉴：生存模式生成上场即登记"见过"（靶场不计入）；首次登记才同步 UI state
    if (g.mode === "survival" && markZombieSeen(kind)) setSeenKinds(readSeenZombies());
  }, []);

  const drawWorld = useCallback((ctx: CanvasRenderingContext2D, g: GameState, now: number) => {
    // HUD/清屏按画布可视宽度；世界实体按世界坐标（摄像机平移后绘制）
    const W = ctx.canvas.width;
    ctx.clearRect(0, 0, W, H);
    const shake = now < g.screenShakeUntil ? 4 : 0;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // 关卡模式：世界比画布宽，摄像机跟随玩家水平平移（生存/靶场 cameraX 恒为 0，无影响）
    ctx.translate(-g.cameraX, 0);

    if (g.mode === "level") drawLevelBackground(ctx, g, now);
    else drawBackground(ctx, g.day, g.worldW);

    // 关卡道具（桌子/废弃车辆/拾取物/出口标记）：背景之后、角色之前
    if (g.mode === "level") drawLevelProps(ctx, g, now);
    // 关卡载具演出：第二/四关军车；第五关隧道入口军用直升机。
    if (g.mode === "level" && g.level && g.level.truckX >= 0) {
      if (g.level.levelId === LEVEL8_ID && g.level.sceneIndex === 2) {
        drawLevel8ArmoredVehicle(ctx, g.level, now);
      } else if (g.level.levelId === LEVEL5_ID && g.level.sceneIndex === 2) {
        drawMilitaryHelicopter(ctx, g.level.truckX, g.level.truckY >= 0 ? g.level.truckY : 500, g.level.eventStage === "flight", now);
      } else {
        drawMilitaryTruck(ctx, g.level.truckX, g.level.truckY >= 0 ? g.level.truckY : 360, g.level.eventStage === "truck" || g.level.eventStage === "ride", now);
      }
    }
    if (g.mode === "level") {
      for (const npc of g.npcs) {
        if (npc.hp <= 0) continue;
        drawLevelSoldier(ctx, npc.field, now, npc.weapon);
        if (npc.carryingCrate) {
          ctx.save(); ctx.translate(npc.field.x, npc.field.y - 88);
          ctx.fillStyle = "#7a5b35"; ctx.fillRect(-34, -24, 68, 48);
          ctx.strokeStyle = "#3d2d1d"; ctx.lineWidth = 4; ctx.strokeRect(-34, -24, 68, 48);
          ctx.strokeStyle = "#b38a4f"; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(-30, -9); ctx.lineTo(30, -9); ctx.moveTo(-30, 11); ctx.lineTo(30, 11); ctx.stroke();
          drawText(ctx, "物资", 0, 5, 13, "#ead8ad", "center");
          ctx.restore();
        }
        if (npc.targetable) {
          const ratio = Math.max(0, npc.hp / npc.maxHp);
          ctx.fillStyle = "rgba(8,12,14,.78)";
          ctx.fillRect(npc.field.x - 28, npc.field.y - 154, 56, 7);
          ctx.fillStyle = ratio > .35 ? "#62d889" : "#e05a45";
          ctx.fillRect(npc.field.x - 27, npc.field.y - 153, 54 * ratio, 5);
        }
      }
    }

    const p = g.player;
    // 第三关开场演出（睡卧/起身阶段）：隐藏玩家模型，由床铺演出人物接管
    const cutsceneHidden = levelPlayerHidden(g, now);
    if (!cutsceneHidden) {
    const armor = ARMORS[p.armor];
    const reloadProgress = p.reloadingUntil > now && p.reloadStartedAt > 0
      ? Math.min(1, (now - p.reloadStartedAt) / Math.max(1, p.reloadingUntil - p.reloadStartedAt))
      : 0;
    const facing = Math.cos(p.angle) >= 0 ? 1 : -1;
    // 真实交替步态：前后腿共用 gaitLegPose、相位差 180°；站立时回到稳固持枪站姿
    const walkCycle = p.moving ? (now / 230) % 1 : 0;
    const rearCycle = (walkCycle + 0.5) % 1;
    const kickAge = now - p.lastKick;
    const kickActive = kickAge >= 0 && kickAge < 560;
    const kickT = kickActive ? kickAge / 560 : 0;
    const meleeAge = now - p.lastMeleeAttack;
    const meleeDuration = meleeAttackDuration(p.weapon);
    const meleeActive = MELEE_WEAPONS.has(p.weapon) && meleeAge >= 0 && meleeAge < meleeDuration;
    const meleeT = meleeActive ? meleeAge / meleeDuration : 0;
    const gun = playerGunOrigin(p);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(CHARACTER_SCALE, CHARACTER_SCALE);
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 23, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // 行走重心平稳过渡：每个步态周期两次轻微起伏（影子保持贴地）
    if (p.moving && !kickActive) ctx.translate(0, Math.sin(walkCycle * Math.PI * 4) * 1.1);
    // 腿部：站立为前后错开的稳固持枪站姿；行走为支撑/摆动相交替的真实步态；踢蹬时右腿（前）支撑、左腿（后）屈膝—蹬伸—收回
    const rearLeg = kickActive ? kickLegPose(kickT, facing) : p.moving ? gaitLegPose(rearCycle, facing, -5) : standingLegPose(facing, -5);
    const frontLeg = kickActive ? standingLegPose(facing, 5) : p.moving ? gaitLegPose(walkCycle, facing, 5) : standingLegPose(facing, 5);
    drawLimb(ctx, rearLeg, 7.5, armor.pants, "#101513");
    drawLimb(ctx, frontLeg, 7.5, armor.pants, "#111715");
    // 蹬踹顶点脚部转为脚底平面朝前的踹击状（趾尖上抬、以鞋底接触），蓄力抬膝时开始旋转、收腿时还原
    const kickSolePitch = kickActive
      ? Math.max(0, Math.min(1, (kickT - 0.1) / 0.18)) - Math.max(0, Math.min(1, (kickT - 0.62) / 0.22))
      : 0;
    drawFoot(ctx, rearLeg[2], facing, 14, "#101513", kickActive ? kickSolePitch : p.moving ? gaitFootPitch(rearCycle) : 0);
    drawFoot(ctx, frontLeg[2], facing, 14, "#101513", kickActive || !p.moving ? 0 : gaitFootPitch(walkCycle));
    ctx.fillStyle = armor.key === "civilian" ? "#34423e" : armor.accent;
    roundedRect(ctx, rearLeg[1][0] - 5, rearLeg[1][1] - 4, 10, 8, 2); ctx.fill();
    roundedRect(ctx, frontLeg[1][0] - 5, frontLeg[1][1] - 4, 10, 8, 2); ctx.fill();

    // 后坐力（纯视觉）：脉冲（快速上跳→弹性复位）× 武器强度 ×（1 + 连发热度增益）；
    // 机枪系高热时叠加高频细颤（加特林持续扫射最明显），停火随热度冷却自然消失
    const recoilSpec = WEAPON_RECOIL[p.weapon];
    const recoilAge = now - p.recoilAt;
    const recoilHeat = p.recoilHeat * Math.max(0, 1 - Math.max(0, recoilAge) / RECOIL_HEAT_COOL_MS);
    const recoilKick = recoilImpulse(recoilAge);
    const recoilRise = recoilSpec.rise * recoilKick * (1 + recoilHeat * 1.5);
    const recoilBack = recoilSpec.back * recoilKick * (1 + recoilHeat * .6);
    const recoilJitter = WEAPONS[p.weapon].automatic && recoilHeat > .45 ? Math.sin(now * .13) * (recoilHeat - .45) * 1.6 : 0;
    // 上半身（躯干/护甲/头盔/手臂/武器同组）：站姿含胸微前倾，踢腿顶点叠加后仰，后坐力再带一点后仰/耸肩联动
    const leanBack = (kickActive ? -facing * Math.sin(kickT * Math.PI) * 0.1 : 0) + facing * 0.045 - facing * recoilRise * .45;
    ctx.save();
    ctx.translate(-facing * recoilBack * .16, -recoilBack * .3);
    ctx.translate(0, HIP_Y);
    ctx.rotate(leanBack);
    ctx.translate(0, -HIP_Y);
    // 躯干底层与主层：肩—胸—腰—髋的人体轮廓（非直边梯形）
    ctx.fillStyle = armor.key === "specialforces" ? "#0b1012" : "#18211f";
    ctx.beginPath();
    ctx.moveTo(-12.5, -103); ctx.lineTo(12.5, -103); ctx.lineTo(12, -88); ctx.lineTo(9.5, -78); ctx.lineTo(10.5, -63);
    ctx.lineTo(-10.5, -63); ctx.lineTo(-9.5, -78); ctx.lineTo(-12, -88);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = armor.torso;
    ctx.beginPath();
    ctx.moveTo(-15, -102); ctx.lineTo(15, -102); ctx.lineTo(14, -88); ctx.lineTo(11.5, -78); ctx.lineTo(12.5, -66);
    ctx.lineTo(-12.5, -66); ctx.lineTo(-11.5, -78); ctx.lineTo(-14, -88);
    ctx.closePath();
    ctx.fill();
    // 明暗分面：背光侧长条压暗、胸前受光提亮（同色系明度阶，非描边卡通感）
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.beginPath();
    ctx.moveTo(-facing * 15, -102); ctx.lineTo(-facing * 8, -102); ctx.lineTo(-facing * 7, -66); ctx.lineTo(-facing * 12.5, -66); ctx.lineTo(-facing * 11.5, -78); ctx.lineTo(-facing * 14, -88);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.05)";
    ctx.beginPath();
    ctx.moveTo(facing * 15, -102); ctx.lineTo(facing * 7, -102); ctx.lineTo(facing * 6, -84); ctx.lineTo(facing * 13, -86);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = armor.sleeves;
    roundedRect(ctx, -12, -71, 24, 10, 4); ctx.fill();
    ctx.fillStyle = "#131c19";
    ctx.fillRect(-12, -67, 24, 3);
    ctx.fillStyle = armor.accent;
    roundedRect(ctx, -3, -69, 6, 5, 1); ctx.fill();
    ctx.strokeStyle = "#17231f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -99); ctx.lineTo(8, -69);
    ctx.moveTo(10, -99); ctx.lineTo(-8, -69);
    ctx.stroke();
    ctx.strokeStyle = armor.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -101); ctx.lineTo(0, -73);
    ctx.moveTo(-10, -80); ctx.lineTo(-3, -78);
    ctx.moveTo(10, -80); ctx.lineTo(3, -78);
    ctx.stroke();
    if (armor.key === "construction") {
      ctx.fillStyle = "#f0d34f"; ctx.fillRect(-13, -91, 26, 4); ctx.fillRect(-11, -75, 22, 3);
    } else if (armor.key === "police") {
      ctx.fillStyle = "#d4be5c"; ctx.beginPath(); ctx.arc(7, -93, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111820"; roundedRect(ctx, -10, -72, 20, 7, 2); ctx.fill();
    } else if (armor.key === "riot" || armor.key === "specialforces") {
      ctx.fillStyle = armor.key === "riot" ? "#11171b" : "#0c1214";
      roundedRect(ctx, -13, -100, 26, 29, 4); ctx.fill();
      ctx.strokeStyle = armor.accent; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = armor.accent; roundedRect(ctx, -16, -101, 7, 10, 2); ctx.fill(); roundedRect(ctx, 9, -101, 7, 10, 2); ctx.fill();
    } else if (armor.key === "army") {
      ctx.fillStyle = "#37422d"; roundedRect(ctx, -12, -98, 24, 24, 3); ctx.fill();
      ctx.fillStyle = "#879260"; ctx.fillRect(-10, -93, 7, 5); ctx.fillRect(3, -83, 8, 5);
    }
    if (["riot", "army", "specialforces"].includes(armor.key)) {
      ctx.fillStyle = "#121815";
      for (let pouchX = -10; pouchX <= 5; pouchX += 8) { roundedRect(ctx, pouchX, -77, 6, 9, 1); ctx.fill(); }
    }
    let gunRelX = (gun.x - p.x) / CHARACTER_SCALE;
    let gunRelY = (gun.y - p.y) / CHARACTER_SCALE;
    let weaponRenderAngle = p.angle;
    if (meleeActive && KNIFE_WEAPONS.has(p.weapon) && p.meleeMode === "stab") {
      const chamber = meleeT < .28 ? -10 * easeInOut(meleeT / .28) : 0;
      const thrust = meleeT >= .28 && meleeT < .58
        ? -10 + 39 * easeInOut((meleeT - .28) / .3)
        : meleeT >= .58 ? 29 * (1 - easeInOut((meleeT - .58) / .42)) : chamber;
      gunRelX += Math.cos(p.angle) * thrust;
      gunRelY += Math.sin(p.angle) * thrust;
    } else if (meleeActive && (KNIFE_WEAPONS.has(p.weapon) || p.weapon === "fists")) {
      const swingOffset = meleeT < .66
        ? -1.05 + 2.05 * easeInOut(meleeT / .66)
        : 1 - easeInOut((meleeT - .66) / .34);
      weaponRenderAngle = p.angle + facing * swingOffset;
      const arcReach = Math.sin(meleeT * Math.PI) * 9;
      gunRelX += Math.cos(weaponRenderAngle) * arcReach;
      gunRelY += Math.sin(weaponRenderAngle) * arcReach;
    } else if (meleeActive && HEAVY_MELEE_WEAPONS.has(p.weapon)) {
      // 双手重武器下砸：自蓄力位继续上举 → 向前下方全力下砸 → 命中滞留 → 收回蓄力位
      const heavyOffset = meleeT < .3
        ? -.95 - .7 * easeInOut(meleeT / .3)
        : meleeT < .58
          ? -1.65 + 2.4 * easeInOut((meleeT - .3) / .28)
          : meleeT < .72
            ? .75
            : .75 - 1.7 * easeInOut((meleeT - .72) / .28);
      weaponRenderAngle = p.angle + facing * heavyOffset;
      const smashReach = Math.sin(Math.min(1, meleeT / .58) * Math.PI * .5) * 6;
      gunRelX += Math.cos(weaponRenderAngle) * smashReach;
      gunRelY += Math.sin(weaponRenderAngle) * smashReach;
    } else if (HEAVY_MELEE_WEAPONS.has(p.weapon)) {
      // 重型近战持握待命：双手握柄、武器上举蓄力姿态（相对瞄准线后抬约 54°）
      weaponRenderAngle = p.angle + facing * -0.95;
    }
    // 后坐力上跳/后挫作用于枪体位姿：绕握把上旋 + 沿枪管轴后移，手臂 IK 随枪回收形成耸肩联动；
    // 近战武器规格为 0 不受影响，换弹道具/拉栓手部动作在同一枪体系内自然跟随，互不抢占
    weaponRenderAngle -= facing * (recoilRise + recoilJitter * .016);
    gunRelX -= Math.cos(weaponRenderAngle) * (recoilBack + Math.abs(recoilJitter) * .35);
    gunRelY -= Math.sin(weaponRenderAngle) * (recoilBack + Math.abs(recoilJitter) * .35);
    // 持枪手位：左右手由每把枪模型上的实际握把/护木点驱动，手臂两段 IK 求解
    const hold = WEAPON_HOLD[p.weapon];
    const gunScale = playerWeaponScale(p.weapon);
    const cosA = Math.cos(weaponRenderAngle);
    const sinA = Math.sin(weaponRenderAngle);
    const toLocal = (m: [number, number]): [number, number] => [
      gunRelX + (cosA * m[0] - sinA * m[1]) * gunScale,
      gunRelY + (sinA * m[0] + cosA * m[1]) * gunScale,
    ];
    // 侧身据枪：双肩沿瞄准线前后错开（后肩抵枪托、前肩引导护木）
    const rearShoulder: [number, number] = [-cosA * 11, -99 - sinA * 5];
    const leadShoulder: [number, number] = [cosA * 11, -99 + sinA * 5];
    let rightHand = toLocal(hold.grip);
    // 栓动步枪（AWM / 燧石66）：击发后右手离握把执行拉栓循环，栓柄随动并抛壳
    const boltAge = now - p.lastShot;
    const cycleMs = boltCycleMs(p.weapon);
    const boltT = BOLT_ACTION_WEAPONS.has(p.weapon) && reloadProgress === 0 && p.lastShot > 0 && boltAge >= 0 && boltAge < cycleMs
      ? boltAge / cycleMs
      : 0;
    if (boltT > 0) {
      const motion = boltCycleMotion(boltT);
      // 栓柄抓取点跟随该枪 charge 点位（与枪模栓柄同行程）
      const charge = WEAPON_HOLD[p.weapon].charge;
      const knob: [number, number] = charge
        ? [charge.x + 4 + charge.pull[0] * motion.pull * .9, charge.y + 5 - 4 * motion.lift]
        : [24 - 10 * motion.pull, 2 - 4 * motion.lift];
      rightHand = toLocal(mixPoint(mixPoint(hold.grip, knob, motion.approach), hold.grip, motion.leave));
    }
    let leadHand = toLocal(hold.fore);
    if (hold.stance === "pistol") {
      // 手枪：双手共同握住握把（双臂前伸射击式）
      leadHand = toLocal([hold.grip[0] + 4, hold.grip[1] + 3]);
    } else if (hold.stance === "melee1h") {
      leadHand = [facing * 10, -70];
    }
    const reloadVisual = reloadProgress > 0 ? computeReloadVisual(p.weapon, reloadProgress, toLocal, facing) : null;
    if (reloadVisual?.lead) leadHand = reloadVisual.lead;
    const elbowDown = (s: [number, number], h: [number, number]): [number, number] => [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2 + 16];
    const rightArm = solveTwoBoneArm(rearShoulder, rightHand, elbowDown(rearShoulder, rightHand));
    const leadArm = solveTwoBoneArm(leadShoulder, leadHand, elbowDown(leadShoulder, leadHand));
    drawLimb(ctx, rightArm, 6.5, armor.sleeves, "#c38e67");
    drawLimb(ctx, leadArm, 6.5, armor.sleeves, "#c38e67");
    // 护肘垫片随肘关节 IK 位姿佩戴（每套服装配色统一）
    drawElbowPad(ctx, rightArm, armor.elbow);
    drawElbowPad(ctx, leadArm, armor.elbow);
    drawHand(ctx, rightArm[2], rightArm[1], 7, "#c58e67");
    drawHand(ctx, leadArm[2], leadArm[1], 7, "#c58e67");
    // RPG-7 肩扛时头部后仰避开筒尾
    const headShiftX = hold.stance === "rpg" ? -facing * 3.5 : 0;
    ctx.save();
    ctx.translate(headShiftX, 0);
    // 颈部：连接躯干与头部的短柱段（明确宽度、有棱角，非圆球接头）
    ctx.fillStyle = "#c58e67";
    ctx.beginPath();
    ctx.moveTo(-5.5, -102); ctx.lineTo(5.5, -102); ctx.lineTo(4, -112); ctx.lineTo(-4, -112);
    ctx.closePath(); ctx.fill();
    // 头部：颅形多边形（颅顶—前额—眉弓—鼻梁—嘴唇—下巴—下颌—后脑），面部朝向 facing
    ctx.fillStyle = "#d0a079";
    ctx.beginPath();
    ctx.moveTo(facing * -9, -118);
    ctx.lineTo(facing * -7.5, -125);
    ctx.lineTo(facing * -1, -128.5);
    ctx.lineTo(facing * 5.5, -126.5);
    ctx.lineTo(facing * 8.5, -121);
    ctx.lineTo(facing * 9.5, -117.5);
    ctx.lineTo(facing * 8, -115);
    ctx.lineTo(facing * 8.5, -113.5);
    ctx.lineTo(facing * 6.5, -110.5);
    ctx.lineTo(facing * 1, -108.5);
    ctx.lineTo(facing * -5, -110);
    ctx.closePath();
    ctx.fill();
    // 头发贴颅顶与后侧
    ctx.fillStyle = "#1a1f1d";
    ctx.beginPath();
    ctx.moveTo(facing * -9.5, -118);
    ctx.lineTo(facing * -8, -126);
    ctx.lineTo(facing * -1, -129.5);
    ctx.lineTo(facing * 6, -127.5);
    ctx.lineTo(facing * 8.5, -122);
    ctx.lineTo(facing * 5, -124.5);
    ctx.lineTo(facing * -2, -126.5);
    ctx.lineTo(facing * -7, -122.5);
    ctx.closePath();
    ctx.fill();
    if (armor.key === "civilian") {
      // 鸭舌帽（便装默认）：帽冠贴合颅形 + 前伸弧形帽檐
      ctx.fillStyle = "#4e5238";
      ctx.beginPath();
      ctx.moveTo(facing * -9.5, -119.5);
      ctx.quadraticCurveTo(facing * -8, -127.5, facing * -1, -129.3);
      ctx.quadraticCurveTo(facing * 6, -128.5, facing * 8.5, -119.5);
      ctx.lineTo(facing * -9.5, -119.5);
      ctx.closePath(); ctx.fill();
      // 帽冠中缝与顶扣
      ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(facing * -1, -129); ctx.lineTo(facing * -0.5, -119.8); ctx.stroke();
      ctx.fillStyle = "#3c402c";
      ctx.beginPath(); ctx.arc(facing * -1, -129.2, 1.1, 0, Math.PI * 2); ctx.fill();
      // 帽檐：加长加宽的鸭舌——自帽冠前缘向前下方弧出，下缘全程位于眉弓/眼睛之上（眼顶 ≈ -117.75）
      ctx.fillStyle = "#3c402c";
      ctx.beginPath();
      ctx.moveTo(facing * 1.5, -121);
      ctx.quadraticCurveTo(facing * 13, -121.6, facing * 21.5, -118.4);
      ctx.quadraticCurveTo(facing * 20.5, -117.6, facing * 18.5, -117.9);
      ctx.quadraticCurveTo(facing * 12, -118.7, facing * 2.5, -119.2);
      ctx.closePath(); ctx.fill();
    } else if (armor.helmet === "cap") {
      ctx.fillStyle = "#17283d";
      ctx.beginPath();
      ctx.moveTo(facing * -9.5, -120); ctx.lineTo(facing * -7, -127.5); ctx.lineTo(facing * 0, -130); ctx.lineTo(facing * 7, -127.5); ctx.lineTo(facing * 9, -120);
      ctx.lineTo(facing * 17, -118.6); ctx.lineTo(facing * 16.2, -117.1); ctx.lineTo(facing * 2, -118.6);
      ctx.closePath(); ctx.fill();
    } else if (armor.helmet === "hardhat") {
      ctx.fillStyle = "#e2b92f";
      ctx.beginPath();
      ctx.moveTo(facing * -10, -119); ctx.lineTo(facing * -7.5, -128); ctx.lineTo(facing * 0, -131); ctx.lineTo(facing * 8, -128); ctx.lineTo(facing * 10, -119);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-12, -121.5, 24, 2.5);
    } else if (["riot", "combat", "tactical"].includes(armor.helmet)) {
      // 盔体：下沿停在眉弓上方（前 -119.2 / 后 -118.4），面部五官完整露出
      ctx.fillStyle = armor.helmet === "combat" ? "#4a563b" : "#141b1e";
      ctx.beginPath();
      ctx.moveTo(facing * -10.5, -118); ctx.lineTo(facing * -8.5, -127.5); ctx.lineTo(facing * 0, -131); ctx.lineTo(facing * 8.5, -127.5); ctx.lineTo(facing * 10.5, -118);
      ctx.lineTo(facing * 9.5, -119.2); ctx.lineTo(facing * -9.5, -118.4);
      ctx.closePath(); ctx.fill();
      if (armor.helmet === "tactical") { ctx.fillStyle = "#27363a"; roundedRect(ctx, -4, -134, 8, 4, 1); ctx.fill(); }
    }
    // 盔沿/帽檐下露出的后发（无盔时与头发同色叠加，无视觉差异）
    ctx.fillStyle = "#1a1f1d";
    ctx.beginPath();
    ctx.moveTo(facing * -9, -121); ctx.lineTo(facing * -10.5, -113.5); ctx.lineTo(facing * -6.5, -111.5); ctx.lineTo(facing * -5.5, -117);
    ctx.closePath(); ctx.fill();
    // 眼睛：仅深色瞳仁（无眼白），位于眉弓与鼻底之间的面部区（y≈-116.6，低于帽檐/盔沿下沿）
    ctx.fillStyle = "#23282c";
    ctx.beginPath(); ctx.ellipse(facing * 5, -116.6, 1.7, 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.beginPath(); ctx.arc(facing * 5.5, -117, 0.45, 0, Math.PI * 2); ctx.fill();
    // 眉弓（贴在盔沿下缘的面部上区）
    ctx.strokeStyle = "#6b4f3c"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(facing * 2.8, -118.6); ctx.lineTo(facing * 7.6, -119); ctx.stroke();
    // 防暴面罩在鼻线之后统一罩上（见下方）
    if (armor.helmet === "tactical") {
      // 战术护目镜：不透光深色镜带完全遮住眼睛，绑带绕至盔后
      ctx.fillStyle = "#0d1319";
      roundedRect(ctx, facing > 0 ? 0 : -11, -120, 11, 5, 2); ctx.fill();
      ctx.strokeStyle = "#2c3a40"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(facing > 0 ? 0 : -11, -117.8); ctx.lineTo(facing * -9.5, -118.4); ctx.stroke();
      ctx.strokeStyle = "rgba(150,170,178,.4)"; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(facing > 0 ? 2 : -9, -119.2); ctx.lineTo(facing > 0 ? 6 : -5, -119.2); ctx.stroke();
    }
    ctx.strokeStyle = "#956b51"; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(facing * 6.5, -116.5); ctx.lineTo(facing * 8, -114.5); ctx.stroke();
    ctx.strokeStyle = "#7d4e3f"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(facing * 3, -112.5); ctx.lineTo(facing * 6, -112.5); ctx.stroke();
    if (armor.helmet === "riot") {
      // 防暴头盔：透明面罩自盔沿垂下罩住整个面前区，五官隐约可见
      ctx.fillStyle = "rgba(126,152,160,.42)";
      ctx.beginPath();
      ctx.moveTo(facing * 10.8, -119.2); ctx.lineTo(facing * 9.2, -109.5); ctx.lineTo(facing * 2, -110.5); ctx.lineTo(facing * 2.5, -119.2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(190,208,214,.55)"; ctx.lineWidth = .9; ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(gunRelX, gunRelY);
    ctx.rotate(weaponRenderAngle);
    drawWeaponModel(ctx, p.weapon, gunScale, reloadVisual?.hideMag ?? false, reloadVisual?.bolt ?? 0, reloadVisual?.cylinderSpin ?? 0, boltT);
    if (reloadVisual) {
      // 换弹道具（弹匣/子弹/火箭弹）与枪模共用同一 gunScale，保持与枪上一致的真实比例
      ctx.save();
      ctx.scale(gunScale, gunScale);
      drawReloadProps(ctx, p.weapon, reloadVisual);
      ctx.restore();
    }
    ctx.restore();
    if (!MELEE_WEAPONS.has(p.weapon) && now - p.lastMuzzleFlash < 65) {
      const muzzle = weaponMuzzleOffset(p.weapon) / CHARACTER_SCALE;
      ctx.save();
      ctx.translate(gunRelX, gunRelY);
      // 枪口火光随后坐力上跳的枪管方向（与枪体同一位姿）
      ctx.rotate(weaponRenderAngle);
      ctx.fillStyle = "#fff2a8";
      ctx.beginPath();
      ctx.moveTo(muzzle - 7, 0);
      ctx.lineTo(muzzle + 17, -9);
      ctx.lineTo(muzzle + 11, 0);
      ctx.lineTo(muzzle + 19, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f28a35";
      ctx.beginPath(); ctx.arc(muzzle + 2, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
    }

    // 搭档绘制：猎犬 / 警察 / 无人机（紧随玩家之后，僵尸与特效在上层）
    if (g.partner === "hound") drawHound(ctx, g.partnerField, now);
    else if (g.partner === "officer") drawOfficer(ctx, g.partnerField, now);
    else if (g.partner === "drone") drawDrone(ctx, g.partnerField, now);

    if (g.selectedItem && g.selectedItem !== "airstrike") {
      const target = itemTargetInFront(g, mouseRef.current, g.selectedItem);
      ctx.save(); ctx.translate(target.x, target.y);
      if (g.selectedItem === "barricade") drawBarricadeModel(ctx, true);
      else if (g.selectedItem === "claymore") {
        ctx.fillStyle = "rgba(78,232,127,.08)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(190, -85); ctx.lineTo(190, 85); ctx.closePath(); ctx.fill();
        drawClaymoreModel(ctx, true);
      } else {
        ctx.strokeStyle = "rgba(91,239,139,.95)"; ctx.lineWidth = 4;
        ctx.fillStyle = "rgba(70,218,119,.12)";
        ctx.beginPath(); ctx.ellipse(0, 0, ITEMS[g.selectedItem].radius * .72, ITEMS[g.selectedItem].radius * .28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.moveTo(0, -13); ctx.lineTo(0, 13); ctx.stroke();
      }
      drawText(ctx, ITEMS[g.selectedItem].delivery === "place" ? "左键放置" : "左键投掷", 0, -82, 15, "#8df3ad", "center");
      ctx.restore();
    }

    for (const item of g.deployedItems) {
      const position = deployedItemPosition(item, now);
      ctx.save();
      ctx.translate(position.x, position.y);
      if (position.progress < 1 && (item.key === "molotov" || item.key === "frag" || item.key === "flashbang" || item.key === "impact")) {
        ctx.rotate(position.progress * Math.PI * 5);
        drawThrowableModel(ctx, item.key, now);
        ctx.restore();
        continue;
      }
      if (item.key === "molotov") {
        if (item.triggered) {
          const flamePulse = .85 + Math.sin(now / 90) * .12;
          const fireGradient = ctx.createRadialGradient(0, 8, 4, 0, 8, 116);
          fireGradient.addColorStop(0, "rgba(241,124,37,.72)"); fireGradient.addColorStop(.48, "rgba(197,58,25,.33)"); fireGradient.addColorStop(1, "rgba(94,25,15,0)");
          ctx.fillStyle = fireGradient; ctx.beginPath(); ctx.ellipse(0, 8, 118 * flamePulse, 54 * flamePulse, 0, 0, Math.PI * 2); ctx.fill();
          // 分层火焰：每根火柱由外焰（大幅低频摆动）→内焰（中摆）→焰心（小幅快摆）三层泪滴火舌叠成
          const flameTongue = (baseX: number, baseY: number, height: number, halfWidth: number, lean: number, color: string, alpha: number) => {
            const tipX = baseX + lean;
            const tipY = baseY - height;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(baseX - halfWidth, baseY);
            ctx.quadraticCurveTo(baseX - halfWidth * 0.55 + lean * 0.4, baseY - height * 0.55, tipX, tipY);
            ctx.quadraticCurveTo(baseX + halfWidth * 0.75 + lean * 0.35, baseY - height * 0.45, baseX + halfWidth, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
          };
          for (let flame = -84; flame <= 84; flame += 21) {
            const seed = flame * 0.37;
            const baseHeight = 30 + ((flame + Math.floor(now / 70)) % 5) * 6;
            const outerLean = Math.sin(now / 210 + seed) * 9;
            const midLean = Math.sin(now / 130 + seed * 1.7) * 5;
            const coreLean = Math.sin(now / 61 + seed * 2.3) * 2.5;
            flameTongue(flame, 18, baseHeight, 11, outerLean, "#d94f1e", .92);
            flameTongue(flame + 1, 16, baseHeight * .68, 7.5, midLean, "#f5a028", .9);
            flameTongue(flame + 1.5, 14, baseHeight * .4, 4, coreLean, "#ffe27a", .95);
          }
          // 根部黑烟：柔边烟团自火焰根部持续生成、翻滚上升、逐渐变淡（连续体积感）
          for (let s = 0; s < 6; s++) {
            const risePhase = ((now / 2100 + s * 0.19) % 1);
            const sway = Math.sin(now / 480 + s * 1.9) * (6 + risePhase * 12);
            const sx = (s - 2.5) * 14 + sway;
            const sy = -26 - risePhase * 74;
            const sr = (8 + risePhase * 17) * (1 + Math.sin(now / 350 + s * 2.4) * 0.08);
            softPuff(ctx, sx, sy, sr, "34,30,27", (1 - risePhase) * 0.34 * Math.min(1, risePhase * 6 + 0.25));
          }
          // 热浪：焰尖上方几道半透明的扭动亮纹，暗示热空气扰动
          ctx.lineWidth = 2.6;
          for (let h = 0; h < 3; h++) {
            const hx = -58 + h * 58 + Math.sin(now / 340 + h * 2.2) * 7;
            ctx.strokeStyle = `rgba(255,236,180,${0.06 + 0.04 * Math.sin(now / 290 + h * 1.4)})`;
            ctx.beginPath();
            ctx.moveTo(hx, -24);
            ctx.quadraticCurveTo(hx + Math.sin(now / 260 + h) * 8, -48, hx + Math.sin(now / 310 + h * 1.3) * 5, -72);
            ctx.stroke();
          }
        } else {
          drawThrowableModel(ctx, "molotov", now);
        }
      } else if (item.key === "claymore") {
        ctx.fillStyle = "rgba(183,62,45,.09)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(190, -85); ctx.lineTo(190, 85); ctx.closePath(); ctx.fill();
        drawClaymoreModel(ctx);
      } else if (item.key === "airstrike") {
        const remaining = Math.max(0, (item.detonateAt ?? now) - now);
        ctx.strokeStyle = item.triggered ? "rgba(216,77,51,.35)" : "#d84d38"; ctx.lineWidth = 3;
        for (const radius of [26, 52, 82]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(-95, 0); ctx.lineTo(95, 0); ctx.moveTo(0, -95); ctx.lineTo(0, 95); ctx.stroke();
        if (!item.triggered) {
          const bombY = -35 - Math.min(220, remaining * .14);
          ctx.fillStyle = "#272e2d"; ctx.beginPath(); ctx.ellipse(0, bombY, 11, 28, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#a43f36"; ctx.beginPath(); ctx.moveTo(-10, bombY - 18); ctx.lineTo(-22, bombY - 33); ctx.lineTo(0, bombY - 26); ctx.lineTo(22, bombY - 33); ctx.lineTo(10, bombY - 18); ctx.closePath(); ctx.fill();
        }
      } else {
        if (!item.triggered) drawThrowableModel(ctx, item.key, now);
        if (!item.triggered) { ctx.strokeStyle = "#e6cc52"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 18 + Math.sin(now / 70) * 4, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.restore();
    }

    for (const barricade of g.barricades) {
      // 剧情结构判定段只承伤不渲染；各场景函数负责围墙、通讯设备与隧道围栏视觉。
      if (isScriptedLevelStructure(barricade.id)) continue;
      ctx.save(); ctx.translate(barricade.x, barricade.y);
      drawBarricadeModel(ctx);
      const ratio = Math.max(0, barricade.hp / barricade.maxHp);
      ctx.fillStyle = "#151816"; ctx.fillRect(-31, -57, 62, 6); ctx.fillStyle = ratio > .45 ? "#d5ad39" : "#c33c36"; ctx.fillRect(-31, -57, 62 * ratio, 6);
      drawText(ctx, `${Math.ceil(barricade.hp)} HP`, 0, -63, 9, "#f0ead8", "center");
      ctx.restore();
    }

    // 路面血迹：暗红椭圆血泊，最后 2 秒渐隐
    for (const stain of g.bloodStains) {
      const fade = Math.min(1, Math.max(0, (stain.removeAt - now) / 2000));
      const vomit = stain.tint === "vomit";
      ctx.fillStyle = vomit ? `rgba(94,142,44,${(0.55 * fade).toFixed(3)})` : `rgba(94,13,20,${(0.55 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(stain.x, stain.y, stain.rx, stain.rx * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = vomit ? `rgba(56,94,24,${(0.4 * fade).toFixed(3)})` : `rgba(60,8,12,${(0.4 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(stain.x - stain.rx * 0.2, stain.y, stain.rx * 0.45, stain.rx * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const corpse of g.corpses) drawZombieCorpse(ctx, corpse, now);

    for (const z of g.zombies) {
      const pose = zombieRenderPose(z, now, p.x);
      const { knockPose, poseFacing, scale } = pose;
      const zombieDebuffed = now < z.debuffedUntil;
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.fillStyle = "rgba(0,0,0,.38)";
      ctx.beginPath();
      const horizontalFactor = Math.abs(Math.sin(knockPose.rotation));
      ctx.ellipse(0, 4, (22 + horizontalFactor * 42) * scale, (7 + horizontalFactor * 3) * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(pose.body.originX - z.x, pose.body.originY - z.y);
      ctx.rotate(pose.body.rotation);
      // 呕吐僵尸与巨型变异体喷吐前摇：上身后仰蓄力，喉部绿光膨胀。
      const spitWindupMs = z.bossKind === "giantMutant" ? LEVEL6_BOSS_SPIT_WINDUP_MS : 550;
      const spitWindup = (z.kind === "spitter" || z.kind === "largeSpitter" || z.bossKind === "giantMutant") && z.spitAt > 0
        ? 1 - Math.max(0, Math.min(1, (z.spitAt - now) / spitWindupMs)) : 0;
      if (spitWindup > 0) ctx.rotate(-poseFacing * spitWindup * .13);
      const skin = z.radius > 29 ? "#6e7c52" : "#7e8c60";
      if (z.kind === "zombieDog") drawZombieDog(ctx, z, scale, poseFacing, now);
      else {
        drawZombieLegAssembly(ctx, z, pose.body.rearLeg, pose.body.frontLeg, scale);
        drawZombieTorso(ctx, z, scale);
        drawZombieArmAssembly(ctx, z, pose.body.leftArm, pose.body.rightArm, scale, skin);
        drawZombieHeadAndWounds(ctx, z, scale, poseFacing, true);
      }
      if (spitWindup > 0) {
        ctx.fillStyle = `rgba(143,206,74,${(.35 + spitWindup * .45).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(poseFacing * 5 * scale, -110 * scale, (3 + spitWindup * 5) * scale, 0, Math.PI * 2); ctx.fill();
        if (spitWindup > .5) { ctx.fillStyle = "#8fce4a"; ctx.beginPath(); ctx.arc(poseFacing * 8 * scale, (-104 + spitWindup * 6) * scale, 1.6 * scale, 0, Math.PI * 2); ctx.fill(); }
      }
      if (z.kind === "shield" && z.shieldIntact) drawZombieShield(ctx, z, scale, poseFacing);
      if (z.ignitedAt > 0) drawZombieIgnition(ctx, z, scale, now);
      if (zombieDebuffed) {
        ctx.strokeStyle = "rgba(232,224,156,.86)"; ctx.lineWidth = 1.5 * scale;
        ctx.beginPath(); ctx.ellipse(0, -130 * scale, 18 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.stroke();
        for (let star = 0; star < 3; star++) {
          const a = now / 420 + star * Math.PI * 2 / 3;
          ctx.fillStyle = star === 0 ? "#f5efc3" : "#d9cc66";
          ctx.beginPath(); ctx.arc(Math.cos(a) * 17 * scale, -130 * scale + Math.sin(a) * 4 * scale, 2.3 * scale, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
      const hpRatio = Math.max(0, z.hp / z.maxHp);
      const headWorldY = knockPose.pivotY + Math.cos(knockPose.rotation) * -114 * scale;
      const hpBarY = Math.min(z.y - 28 * scale, headWorldY - 20 * scale);
      ctx.fillStyle = "#151816";
      ctx.fillRect(z.x - z.radius, hpBarY, z.radius * 2, 5);
      ctx.fillStyle = hpRatio > 0.45 ? "#d8b83f" : "#c23539";
      ctx.fillRect(z.x - z.radius, hpBarY, z.radius * 2 * hpRatio, 5);
    }

    for (const limb of g.detachedLimbs) drawDetachedLimb(ctx, limb);
    for (const shard of g.metalShards) drawMetalShard(ctx, shard, now);

    // 地面留存道具：抛落的弹匣与弹壳（弹跳后静置，约 10 秒后清除）
    for (const prop of g.groundProps) {
      if (now < prop.visibleAt) continue;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.rotation);
      drawGroundProp(ctx, prop);
      ctx.restore();
    }

    // 绿色液体抛物线：普通呕吐物为短尾迹；巨型变异体为连续大液滴酸液束。
    for (const spit of g.spits) {
      if (now < spit.createdAt) continue;
      const t = Math.max(0, Math.min(1, (now - spit.createdAt) / (spit.landAt - spit.createdAt)));
      const trailCount = spit.burst ? 5 : 2;
      for (let k = trailCount; k >= 0; k--) {
        const tk = Math.max(0, t - k * (spit.burst ? .035 : .07));
        const sx = spit.fromX + (spit.targetX - spit.fromX) * tk;
        const sy = spit.fromY + (spit.targetY - spit.fromY) * tk - Math.sin(tk * Math.PI) * (spit.arcHeight ?? 70);
        ctx.fillStyle = k === 0 ? "#a4d957" : `rgba(126,179,60,${Math.max(.08, .55 - k * .09).toFixed(2)})`;
        const headSize = spit.burst ? 9 : 5.5;
        const trailSize = spit.burst ? Math.max(2.4, 6.8 - k * .75) : 3.6 - k * .8;
        ctx.beginPath(); ctx.arc(sx, sy, k === 0 ? headSize : trailSize, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (const t of g.tracers) {
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = Math.max(0, (t.until - now) / 90);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    for (const projectile of g.explosiveProjectiles) drawExplosiveProjectile(ctx, projectile, now);
    ctx.globalAlpha = 1;
    for (const pt of g.particles) {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, (pt.until - now) / 420);
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    for (const blast of g.blastEffects) drawBlastEffect(ctx, blast, now);
    ctx.restore();

    // 第三关黑夜光照：暗色覆盖层 + 枪灯/探照灯/警灯光洞（世界之上、HUD 之下，屏幕坐标）
    drawNightLighting(ctx, g, now);

    if (now < g.flashUntil) {
      const remaining = Math.max(0, (g.flashUntil - now) / 280);
      ctx.fillStyle = `rgba(255,255,247,${Math.min(.96, remaining * 1.2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 关卡模式：任务完成提示（居中渐隐 ✓ 任务完成）
    if (g.mode === "level" && g.level && now < g.level.taskDoneFlashUntil) {
      const remain = (g.level.taskDoneFlashUntil - now) / 1600;
      ctx.globalAlpha = Math.min(1, remain * 2);
      drawText(ctx, "✓ 任务完成", W / 2, 210, 34, "#8df3ad", "center");
      ctx.globalAlpha = 1;
    }

    // HUD 缩放兜底：世界宽度小于 700 时（极端窄屏/手机竖屏），顶栏与快捷栏按比例缩小，避免重叠或溢出画面；
    // 位图比例始终与舞台恒等（不拉伸画布本身），只缩放 HUD 绘制
    const hudScale = Math.min(1, W / 700);
    const itemBarWidth = ITEM_KEYS.length * 106;
    const itemBarScale = Math.min(1, (W - 16) / itemBarWidth);
    const itemBarX = (W - itemBarWidth) / 2;
    // 关卡模式：无道具经济，隐藏底部道具快捷栏
    if (g.mode !== "level") {
    ctx.save();
    ctx.translate(W / 2, H);
    ctx.scale(itemBarScale, itemBarScale);
    ctx.translate(-W / 2, -H);
    for (let index = 0; index < ITEM_KEYS.length; index++) {
      const key = ITEM_KEYS[index];
      const item = ITEMS[key];
      const x = itemBarX + index * 106;
      const selected = g.selectedItem === key;
      ctx.fillStyle = selected ? "rgba(37,92,54,.96)" : "rgba(8,11,9,.91)"; roundedRect(ctx, x, H - 59, 100, 42, 6); ctx.fill();
      ctx.strokeStyle = selected ? "#72ef9a" : g.itemInventory[key] > 0 ? item.color : "#394039"; ctx.lineWidth = selected ? 4 : 2; ctx.stroke();
      ctx.fillStyle = item.color; roundedRect(ctx, x + 5, H - 53, 24, 28, 4); ctx.fill();
      drawText(ctx, item.hotkey, x + 17, H - 34, 13, "#111713", "center");
      drawText(ctx, item.name, x + 35, H - 42, 10, "#e8e4d7");
      drawText(ctx, `库存 ×${g.itemInventory[key]}`, x + 35, H - 27, 9, g.itemInventory[key] > 0 ? "#f1c643" : "#747c74");
    }
    if (g.selectedItem && g.selectedItem !== "airstrike") {
      const selected = ITEMS[g.selectedItem];
      drawText(ctx, `${selected.name} 已就绪 · ${selected.delivery === "place" ? "左键放置" : "左键投掷"}`, W / 2, H - 72, 14, "#8df3ad", "center");
    }
    ctx.restore();
    }

    ctx.save();
    ctx.scale(hudScale, hudScale);
    const hp = Math.max(0, p.hp);
    ctx.fillStyle = "rgba(8,11,9,.9)";
    roundedRect(ctx, 26, 24, 306, 91, 13);
    ctx.fill();
    drawText(ctx, g.mode === "range" ? "靶场模式" : g.mode === "level" ? levelTitleById(g.level?.levelId ?? null) : `第 ${g.day} 天`, 47, 60, 27, "#f1c643");
    // 靶场 HUD：endless 显示无尽文案；batch 显示批次清剿进度，队列与场上全空后提示按 B 配置下一批
    const rangeHudLine = g.rangeSpawnMode === "batch"
      ? g.rangeSpawnQueue.length === 0 && g.zombies.length === 0
        ? `批次已清剿完毕 · 按 B 配置下一批`
        : `配置批次 ${g.rangeBatchTotal - g.rangeSpawnQueue.length - g.zombies.length}/${g.rangeBatchTotal} 已清剿 · 待上场 ${g.rangeSpawnQueue.length}`
      : `无尽目标 · 场上 ${g.zombies.length} · B 免费军需`;
    drawText(ctx, g.mode === "range" ? rangeHudLine : g.mode === "level" ? levelTaskText(g, now) : `${backgroundName(g.day)} · 尸潮 ${Math.min(g.spawned, g.waveTotal)}/${g.waveTotal}`, 47, 91, 15, "#c4c9bf");
    // 第三关：破片手榴弹存量提示（关卡模式隐藏道具快捷栏，需告知快捷键）
    if (g.mode === "level" && g.level?.levelId === LEVEL3_ID && g.itemInventory.frag > 0) {
      drawText(ctx, `破片手榴弹 ×${g.itemInventory.frag}（按 3 选择 · 左键投掷）`, 47, 116, 13, "#9fb38a");
    }
    ctx.fillStyle = "#262b27";
    roundedRect(ctx, 181, 48, 127, 17, 8);
    ctx.fill();
    ctx.fillStyle = hp > 35 ? "#d84c3f" : "#ff332d";
    roundedRect(ctx, 181, 48, 127 * (hp / p.maxHp), 17, 8);
    ctx.fill();
    drawText(ctx, `${Math.ceil(hp)} / ${p.maxHp} HP`, 244, 62, 11, "#fff", "center");
    ctx.restore();

    ctx.save();
    ctx.translate(W * (1 - hudScale), 0);
    ctx.scale(hudScale, hudScale);
    ctx.fillStyle = "rgba(8,11,9,.9)";
    roundedRect(ctx, W - 337, 24, 311, 91, 13);
    ctx.fill();
    if (g.mode === "level" && g.level) {
      // 关卡模式：右面板金币位改为已用时间（m:ss）
      const elapsed = Math.max(0, Math.floor((now - g.level.startedAt) / 1000));
      drawText(ctx, `⏱ ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`, W - 312, 62, 25, "#f1c643");
    } else {
      drawText(ctx, `◉ ${g.coins}`, W - 312, 62, 25, "#f1c643");
    }
    drawText(ctx, `击杀 ${g.kills}`, W - 312, 91, 17, "#c4c9bf");
    const drivingArmoredVehicle = isLevel8Driving(g) && g.level;
    const weapon = WEAPONS[p.weapon];
    const ammoText = drivingArmoredVehicle
      ? `${g.level?.vehicleAmmo ?? 0} / ${LEVEL8_HMG_MAGAZINE}`
      : MELEE_WEAPONS.has(p.weapon) ? "∞" : `${p.ammo[p.weapon]} / ${weapon.magazine}`;
    drawText(ctx, drivingArmoredVehicle ? "车载重机枪" : weapon.name, W - 48, 57, 17, drivingArmoredVehicle ? "#e3c461" : weapon.color, "right");
    drawText(ctx, drivingArmoredVehicle && now < (g.level?.vehicleReloadUntil ?? 0) ? "换弹中…" : now < p.reloadingUntil ? "换弹中…" : ammoText, W - 48, 91, 25, "#fff", "right");
    ctx.restore();

    // 关卡剧情对话框（最顶层，屏幕坐标）
    if (g.mode === "level") drawLevelDialog(ctx, g, W, now);
  }, []);

  useEffect(() => {
    const frame = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const g = stateRef.current;
      const dt = Math.min(0.034, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      if (ctx) {
        if (!pausedRef.current) {
          g.corpses = g.corpses.filter((corpse) => now < corpse.removeAt);
        if (screenRef.current === "playing") {
          const p = g.player;
          sound.setHeartbeat(p.hp > 0 && p.hp <= 35 ? p.hp : null);
          sound.setGatlingSpin(mouseRef.current.down && ((p.weapon === "gatling" && p.ammo.gatling > 0 && now >= p.reloadingUntil)
            || (isLevel8Driving(g) && (g.level?.vehicleAmmo ?? 0) > 0 && now >= (g.level?.vehicleReloadUntil ?? 0))));
          const keys = keysRef.current;
          // 携带重量影响移速：轻装 5kg 内全速，每多 1kg 减 0.7%（最低 72%）
          const speed = 250 * playerSpeedFactor(g);
          let dx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
          let dy = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
          if (dx && dy) { dx *= 0.707; dy *= 0.707; }
          p.moving = dx !== 0 || dy !== 0;
          // 关卡对话中：冻结移动与射击（剧情演出）；第三关开场演出（睡卧/起身）同样挂起操控
          const levelDialogOpen = g.mode === "level" && g.level?.dialog != null;
          const cutsceneFrozen = levelInputFrozen(g);
          if (levelDialogOpen || cutsceneFrozen) { dx = 0; dy = 0; p.moving = false; }
          // 水平仅公路左右两端阻挡；纵向可在整幅路面自由走动（脚踏线上至头顶不出画面上沿、下至路面下缘）
          p.x = Math.max(52, Math.min(g.worldW - 52, p.x + dx * speed * dt));
          const minimumPlayerFootY = BASE_HUMAN_HEIGHT * CHARACTER_SCALE + 5;
          if (isLevel4StairScene(g)) {
            // 楼梯场景锁定到与踏步共用的纵向轨迹：按 D 向右行走即可逐级上楼，门槛与最终脚部高度一致。
            p.y = level4StairFootY(g.worldW, p.x);
          } else {
            p.y = Math.max(minimumPlayerFootY, Math.min(ROAD_BOTTOM - 18, p.y + dy * speed * dt));
          }
          if (isLevel8Driving(g) && g.level) {
            const level = g.level;
            const tollStopX = LEVEL8_TOLL_FX * g.worldW - 220;
            level.truckX = Math.max(LEVEL8_VEHICLE_START_X, Math.min(tollStopX, level.truckX + dx * LEVEL8_VEHICLE_SPEED * dt));
            level.truckY = Math.max(330, Math.min(570, level.truckY + dy * LEVEL8_VEHICLE_SPEED * .72 * dt));
            p.x = level.truckX;
            p.y = level.truckY;
            p.moving = dx !== 0 || dy !== 0;
            level.vehicleAimAngle = Math.atan2(
              mouseRef.current.y - (level.truckY + LEVEL8_HMG_MOUNT_Y),
              mouseRef.current.x + g.cameraX - (level.truckX + LEVEL8_HMG_MOUNT_X),
            );
          }
          // 第三关夜防：混凝土围墙不可越过（玩家始终在墙后防守位；大门开启前往土路时解除）
          if (g.mode === "level" && g.level?.levelId === LEVEL3_ID && g.level.sceneIndex === 1 && g.level.taskIndex < 2) {
            p.x = Math.min(p.x, LEVEL3_WALL_FX * g.worldW - 46);
          }
          // 第四关防守战：玩家在通讯设备后方掩护位（不越过设备线，僵尸冲击设备承伤）
          if (g.mode === "level" && g.level?.levelId === LEVEL4_ID && g.level.sceneIndex === 8) {
            p.x = Math.min(p.x, LEVEL4_EQUIP_FX * g.worldW - 60);
          }
          // 第五关电力维修：玩家留在右侧防护围栏后方，与三名队友共同阻击冲击群。
          if (g.mode === "level" && g.level?.levelId === LEVEL5_ID && g.level.sceneIndex === 3 && g.level.eventStage === "power") {
            p.x = Math.min(p.x, LEVEL5_FENCE_FX * g.worldW - 60);
          }
          // 第七关仓库防守：玩家与 M16 小队留在围墙左侧阻击右侧来袭护甲僵尸。
          if (g.mode === "level" && g.level?.levelId === LEVEL7_ID && g.level.sceneIndex === 3 && g.level.eventStage === "warehouse-defense") {
            p.x = Math.min(p.x, LEVEL7_WALL_FX * g.worldW - 60);
          }
          // 关卡模式：障碍物（车辆/桌子）矩形外推碰撞，然后再钳回世界边界
          if (g.mode === "level" && g.obstacles.length > 0) {
            const [ox, oy] = collideObstacles(g.obstacles, p.x, p.y, 16);
            p.x = Math.max(52, Math.min(g.worldW - 52, ox));
            p.y = Math.max(minimumPlayerFootY, Math.min(ROAD_BOTTOM - 18, oy));
          }
          // 关卡模式：鼠标位需加回摄像机偏移才是世界坐标
          p.angle = Math.atan2(mouseRef.current.y - (p.y - 92 * CHARACTER_SCALE), mouseRef.current.x + g.cameraX - p.x);
          // 关卡模式：跟随镜头（玩家保持在屏幕 42% 处，两端钳住）
          if (g.mode === "level") {
            const viewW = ctx.canvas.width;
            g.cameraX = Math.max(0, Math.min(g.worldW - viewW, p.x - viewW * 0.42));
          }
          if (!levelDialogOpen && !cutsceneFrozen && mouseRef.current.down && (isLevel8Driving(g) || WEAPONS[p.weapon].automatic)) attack(now);
          if (isLevel8Driving(g) && g.level && now >= g.level.vehicleReloadUntil && g.level.vehicleReloadUntil !== 0) {
            g.level.vehicleAmmo = LEVEL8_HMG_MAGAZINE;
            g.level.vehicleReloadUntil = 0;
          }
          if (now >= p.reloadingUntil && p.reloadingUntil !== 0) {
            p.ammo[p.weapon] = WEAPONS[p.weapon].magazine;
            p.reloadingUntil = 0;
            p.reloadStartedAt = 0;
          }

          // 靶场：endless 维持自动刷；batch 仅从配置队列取指定种类，队列耗尽即停（场上 30 上限两种模式共用）
          if (g.mode === "range") {
            if (g.zombies.length < 30 && now >= g.nextSpawnAt) {
              if (g.rangeSpawnMode === "batch") {
                const forcedKind = g.rangeSpawnQueue.shift();
                if (forcedKind !== undefined) spawnZombie(g, now, forcedKind);
              } else {
                spawnZombie(g, now);
              }
            }
          } else if (g.spawned < g.waveTotal && now >= g.nextSpawnAt) {
            spawnZombie(g, now);
          }

          for (const item of g.deployedItems) {
            const itemDefinition = ITEMS[item.key];
            // 碰炸引信：投掷飞行中触及僵尸，立即在当前位置起爆（当帧落入下方通用起爆流）
            if (itemDefinition.impactFuse && now < item.landAt) {
              const pos = deployedItemPosition(item, now);
              const struck = g.zombies.some((z) => z.hp > 0 && Math.hypot(z.x - pos.x, zombieBodyY(z) - pos.y) < z.radius + 14);
              if (struck) {
                item.x = pos.x;
                item.y = pos.y;
                item.landAt = now;
                item.detonateAt = now;
              }
            }
            if (now < item.landAt) continue;
            if (item.key === "claymore" && !item.triggered && item.detonateAt === null) {
              const targetInCone = g.zombies.some((z) => zombieInClaymoreCone(item, z, 125));
              if (targetInCone) item.detonateAt = now;
            }
            if (item.key === "molotov" && item.detonateAt !== null && now >= item.detonateAt) {
              if (!item.triggered) {
                item.triggered = true;
                sound.molotovIgnite(Math.max(0.6, ((item.until ?? now + MOLOTOV_BURN_MS) - now) / 1000));
                g.screenShakeUntil = now + itemDefinition.shakeMs;
                for (let i = 0; i < itemDefinition.particleCount; i++) {
                  const a = Math.random() * Math.PI * 2;
                  g.particles.push({ x: item.x, y: item.y, vx: Math.cos(a) * (35 + Math.random() * 120), vy: -70 - Math.random() * 150, until: now + 500, color: i % 2 ? "#f17b2d" : "#e4c146", size: 4 + Math.random() * 7 });
                }
              }
              for (const z of g.zombies) {
                const distance = Math.hypot(z.x - item.x, z.y - item.y);
                if (distance <= itemDefinition.radius) {
                  const burnDamage = itemDefinition.damage * dt * (1 - distance / (itemDefinition.radius * 2));
                  // 全模式统一规则：燃烧伤害直接绕过所有护甲与 Boss 减伤。
                  z.hp -= burnDamage;
                }
              }
              if (Math.random() < .72) g.particles.push({ x: item.x - 82 + Math.random() * 164, y: item.y + 25 - Math.random() * 45, vx: -14 + Math.random() * 28, vy: -85 - Math.random() * 110, until: now + 620, color: Math.random() > .45 ? "#ef6a27" : "#e5c346", size: 5 + Math.random() * 9 });
              continue;
            }
            if (item.triggered || item.detonateAt === null || now < item.detonateAt) continue;
            item.triggered = true;
            const isFlash = item.key === "flashbang";
            for (const z of g.zombies) {
              const distance = Math.hypot(z.x - item.x, z.y - item.y);
              const inClaymoreCone = item.key !== "claymore" || zombieInClaymoreCone(item, z, itemDefinition.radius);
              if (distance > itemDefinition.radius || !inClaymoreCone) continue;
              if (isFlash) {
                z.debuffedUntil = Math.max(z.debuffedUntil, now + 5000);
              } else {
                const falloff = .45 + .55 * (1 - distance / itemDefinition.radius);
                damageZombieFromExplosion(g, z, itemDefinition.damage * falloff, now, item.x, item.y, distance, itemDefinition.radius, itemDefinition.blastKind ?? "frag");
              }
            }
            if (isFlash) {
              sound.flashbang();
              g.flashUntil = Math.max(g.flashUntil, now + 280);
              for (let i = 0; i < itemDefinition.particleCount; i++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 90 + Math.random() * 180;
                g.particles.push({ x: item.x, y: item.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 20, until: now + 520, color: i % 3 ? "#fffdf0" : "#e9dc77", size: 4 + Math.random() * 8 });
              }
            } else if (itemDefinition.blastKind) {
              sound.explosion(itemDefinition.blastKind);
              emitExplosionVisuals(
                g,
                item.x,
                item.y,
                now,
                itemDefinition.radius * (item.key === "claymore" ? .8 : 1),
                itemDefinition.blastKind,
                itemDefinition.particleCount,
                itemDefinition.blastDuration,
                itemDefinition.shakeMs,
              );
            }
            item.until = itemDefinition.cleanupDelay === null ? null : now + itemDefinition.cleanupDelay;
            if (isFlash) g.screenShakeUntil = now + itemDefinition.shakeMs;
          }
          g.deployedItems = g.deployedItems.filter((item) => item.until === null || now < item.until);
          const impactedProjectiles = g.explosiveProjectiles.filter((projectile) => now >= projectile.impactAt);
          for (const projectile of impactedProjectiles) detonateExplosiveProjectile(g, projectile, now, damageZombieFromExplosion);
          if (impactedProjectiles.length > 0) g.explosiveProjectiles = g.explosiveProjectiles.filter((projectile) => now < projectile.impactAt);
          g.blastEffects = g.blastEffects.filter((blast) => now < blast.until);

          for (const z of g.zombies) {
            if (z.hp <= 0) continue;
            // 磷燃灼烧：点燃后持续掉血直至死亡（击杀结算走下方 newlyKilled 流程，金币/尸体照常）
            if (z.ignitedAt > 0) z.hp -= IGNITE_DPS * dt;
            if (zombieKnockPose(z, now).active) continue;
            if (Math.random() < dt * 0.05) sound.zombieGrowl({ volume: distanceVolume(z.x, p.x) });
            const barricade = g.barricades
              .filter((entry) => entry.hp > 0 && entry.x <= z.x + z.radius && entry.x > p.x && Math.abs(entry.y - z.y) < ITEMS.barricade.radius)
              // 同 x 并列（第三关围墙判定段）时取 y 最近的一段：僵尸沿墙散开各自攻击就近墙体
              .sort((a, b) => (b.x - a.x) || (Math.abs(a.y - z.y) - Math.abs(b.y - z.y)))[0];
            // 第六关可攻击队友与玩家按距离共同参与仇恨选择；防御结构仍拥有最高优先级。
            let targetNpc: LevelNpc | undefined;
            if (!barricade) {
              let nearestTargetDistance = Math.hypot(p.x - z.x, p.y - z.y);
              for (const npc of g.npcs) {
                if (!npc.targetable || npc.hp <= 0) continue;
                const npcDistance = Math.hypot(npc.field.x - z.x, npc.field.y - z.y);
                if (npcDistance < nearestTargetDistance) {
                  nearestTargetDistance = npcDistance;
                  targetNpc = npc;
                }
              }
            }
            const targetX = barricade?.x ?? targetNpc?.field.x ?? p.x;
            const targetY = barricade?.y ?? targetNpc?.field.y ?? p.y;
            const zx = targetX - z.x;
            const zy = targetY - z.y;
            const dist = Math.hypot(zx, zy);
            const debuffed = now < z.debuffedUntil;
            const missingLegs = Number(z.missingLimbs.has("leftLeg")) + Number(z.missingLimbs.has("rightLeg"));
            const limbMovementFactor = missingLegs === 2 ? .18 : missingLegs === 1 ? .58 : 1;
            const movementFactor = (debuffed ? .45 : 1) * limbMovementFactor;
            // 武器制动：被高制动力命中后短暂减速停滞；被猎犬咬住时完全定身且无法攻击
            const staggerFactor = now < z.staggeredUntil ? .3 : 1;
            const held = now < z.heldUntil;
            const targetingVehicle = isLevel8Driving(g) && !barricade && !targetNpc;
            const contactDistance = z.radius + (barricade ? 30 : targetingVehicle ? 125 : 24);
            if (held) continue;
            // 第六关巨型变异 Boss：每 7 秒蓄力一次，向当前目标前方连续喷出大量绿色酸液；每滴接触伤害 50。
            if (z.bossKind === "giantMutant") {
              if (z.spitAt > 0 && now >= z.spitAt) {
                z.spitAt = 0;
                z.nextSpitAt = now + LEVEL6_BOSS_SPIT_INTERVAL_MS - LEVEL6_BOSS_SPIT_WINDUP_MS;
                const aimAngle = Math.atan2(targetY - z.y, targetX - z.x);
                const aimX = Math.cos(aimAngle);
                const aimY = Math.sin(aimAngle);
                const sideX = -aimY;
                const sideY = aimX;
                const bossScale = (z.radius / 25) * CHARACTER_SCALE;
                for (let i = 0; i < LEVEL6_BOSS_SPIT_COUNT; i++) {
                  const forward = 45 + i * 17;
                  const lateral = ((i % 5) - 2) * 22 + (Math.random() - .5) * 22;
                  const createdAt = now + i * 70;
                  g.spits.push({
                    id: Math.floor(now * 1000 + i * 17 + Math.random() * 9),
                    fromX: z.x + aimX * 15 * bossScale,
                    fromY: z.y - 112 * bossScale,
                    targetX: targetX + aimX * forward + sideX * lateral,
                    targetY: targetY + aimY * forward + sideY * lateral,
                    createdAt,
                    landAt: createdAt + 560 + i * 16,
                    damage: 50,
                    splashRadius: 58,
                    arcHeight: 95,
                    burst: true,
                  });
                }
                sound.vomit({ volume: distanceVolume(z.x, p.x) });
                continue;
              }
              if (z.spitAt === 0 && now >= z.nextSpitAt) {
                z.spitAt = now + LEVEL6_BOSS_SPIT_WINDUP_MS;
                sound.zombieGrowl({ volume: distanceVolume(z.x, p.x) });
                continue;
              }
              if (z.spitAt > 0) continue;
            }
            // 呕吐僵尸：不近战；接近至 250 内停下，前摇 550ms 后仰后喷吐绿色唾沫（抛物线，命中 20 伤害，落地成渍）
            if (z.kind === "spitter" || z.kind === "largeSpitter") {
              const spitterScale = (z.radius / 25) * CHARACTER_SCALE;
              if (z.spitAt > 0 && now >= z.spitAt) {
                z.spitAt = 0;
                z.nextSpitAt = now + 2400 + Math.random() * 900;
                const spitFace = targetX < z.x ? -1 : 1;
                const spitCount = z.kind === "largeSpitter" ? 3 : 1;
                for (let stream = 0; stream < spitCount; stream++) {
                  const createdAt = now + stream * 105;
                  g.spits.push({
                    id: Math.floor(now * 1000 + stream * 31 + Math.random() * 29),
                    fromX: z.x + spitFace * 10 * spitterScale,
                    fromY: z.y - 112 * spitterScale,
                    targetX: targetX + (stream - (spitCount - 1) / 2) * 34 + (Math.random() - .5) * 18,
                    targetY: targetY + (Math.random() - .5) * 18,
                    createdAt,
                    landAt: createdAt + 510,
                    damage: 20,
                    splashRadius: z.kind === "largeSpitter" ? 38 : undefined,
                    arcHeight: z.kind === "largeSpitter" ? 72 : undefined,
                    burst: z.kind === "largeSpitter",
                  });
                }
                sound.vomit({ volume: distanceVolume(z.x, p.x) });
              } else if (z.spitAt === 0 && dist < 300 && now >= z.nextSpitAt) {
                z.spitAt = now + 550;
                sound.zombieGrowl({ volume: distanceVolume(z.x, p.x) });
              }
              // 保持喷吐距离；前摇期间原地站定后仰（绘制后仰由 spitAt 驱动）
              if (dist > 250 && z.spitAt === 0) {
                z.x += (zx / dist) * z.speed * movementFactor * staggerFactor * dt;
                z.y += (zy / dist) * z.speed * movementFactor * staggerFactor * dt;
                if (g.mode === "level") {
                  const [zx2, zy2] = collideObstacles(g.obstacles, z.x, z.y, 14);
                  z.x = zx2; z.y = zy2;
                }
              }
              continue;
            }
            if (dist > contactDistance) {
              z.x += (zx / dist) * z.speed * movementFactor * staggerFactor * dt;
              z.y += (zy / dist) * z.speed * movementFactor * staggerFactor * dt;
              if (g.mode === "level") {
                const [zx2, zy2] = collideObstacles(g.obstacles, z.x, z.y, 14);
                z.x = zx2; z.y = zy2;
              }
            } else {
              const attackAge = now - z.lastHit;
              const attackInterval = debuffed ? 1320 : 720;
              const impactDelay = debuffed ? 470 : 235;
              if (z.lastHit === 0 || attackAge > attackInterval) {
                z.lastHit = now;
                z.attackHitApplied = false;
              } else if (!z.attackHitApplied && attackAge >= impactDelay) {
                z.attackHitApplied = true;
                sound.zombieAttack({ volume: distanceVolume(z.x, p.x) });
                const missingArms = Number(z.missingLimbs.has("leftArm")) + Number(z.missingLimbs.has("rightArm"));
                const limbAttackFactor = missingArms === 2 ? .25 : missingArms === 1 ? .65 : 1;
                const attackDamage = z.attack * (debuffed ? .5 : 1) * limbAttackFactor;
                if (barricade) {
                  barricade.hp -= attackDamage;
                  // 第四关设备使用单一共享 HP 池：伤害发生时直接累计，不能依赖仍留在数组中的判定段反推，
                  // 否则某段被移除后其历史伤害会丢失，设备生命值会错误回升。
                  if (g.level?.levelId === LEVEL4_ID && g.level.sceneIndex === 8 && isLevel4EquipmentSegment(barricade.id)) {
                    g.level.wallHp = Math.max(0, g.level.wallHp - attackDamage);
                  }
                  if (g.level?.levelId === LEVEL5_ID && g.level.sceneIndex === 3 && isLevel5FenceSegment(barricade.id)) {
                    g.level.wallHp = Math.max(0, g.level.wallHp - attackDamage * LEVEL5_FENCE_DAMAGE_FACTOR);
                  }
                  if (g.level?.levelId === LEVEL7_ID && g.level.sceneIndex === 3 && isLevel7WallSegment(barricade.id)) {
                    g.level.wallHp = Math.max(0, g.level.wallHp - attackDamage);
                  }
                  for (let i = 0; i < 6; i++) g.particles.push({ x: barricade.x, y: barricade.y - 30 + Math.random() * 60, vx: -70 + Math.random() * 140, vy: -70 + Math.random() * 80, until: now + 380, color: i % 2 ? "#a97b45" : "#646a63", size: 3 + Math.random() * 5 });
                } else if (targetNpc) {
                  if (now <= targetNpc.invulnerableUntil) continue;
                  targetNpc.hp = Math.max(0, targetNpc.hp - attackDamage);
                  targetNpc.invulnerableUntil = now + 260;
                  if (targetNpc.squadIndex !== undefined && g.level?.levelId === LEVEL6_ID) {
                    g.level.squadHp[targetNpc.squadIndex] = targetNpc.hp;
                  }
                  for (let i = 0; i < 8; i++) g.particles.push({
                    x: targetNpc.field.x,
                    y: targetNpc.field.y - 80,
                    vx: -90 + Math.random() * 180,
                    vy: -90 + Math.random() * 120,
                    until: now + 360,
                    color: i % 2 ? "#8c1620" : "#b21f2c",
                    size: 2 + Math.random() * 4,
                  });
                } else if (targetingVehicle && g.level) {
                  g.level.vehicleHp = Math.max(0, g.level.vehicleHp - attackDamage);
                  for (let i = 0; i < 7; i++) g.particles.push({
                    x: g.level.truckX + (Math.random() - .5) * 210,
                    y: g.level.truckY - 70 + (Math.random() - .5) * 90,
                    vx: -80 + Math.random() * 160,
                    vy: -100 + Math.random() * 90,
                    until: now + 340,
                    color: i % 2 ? "#e0a34d" : "#596057",
                    size: 2 + Math.random() * 4,
                  });
                  sound.armorClank({ volume: 1 });
                } else {
                  if (now <= p.invulnerableUntil) continue;
                  p.hp -= attackDamage;
                  p.invulnerableUntil = now + 260;
                  sound.playerHurt();
                }
                g.screenShakeUntil = now + 160;
              }
            }
          }

          const destroyedBarricades = g.barricades.filter((entry) => entry.hp <= 0);
          for (const entry of destroyedBarricades) {
            sound.barricadeBreak({ volume: distanceVolume(entry.x, p.x) });
            for (let i = 0; i < ITEMS.barricade.particleCount; i++) g.particles.push({ x: entry.x, y: entry.y - 25 + Math.random() * 50, vx: -110 + Math.random() * 220, vy: -120 + Math.random() * 100, until: now + 520, color: i % 2 ? "#986c3d" : "#464d48", size: 4 + Math.random() * 7 });
          }
          g.barricades = g.barricades.filter((entry) => entry.hp > 0);

          // 绿色液体落地：普通唾沫 20 伤害；第六关 Boss 连续酸液每次接触 50 伤害，也会伤到可攻击队友。
          for (const spit of g.spits) {
            if (now < spit.landAt) continue;
            const spitDamage = spit.damage ?? 20;
            const splashRadius = spit.splashRadius ?? 46;
            g.bloodStains.push({
              id: spit.id,
              x: Math.max(12, Math.min(g.worldW - 12, spit.targetX)),
              y: Math.max(ROAD_TOP + 8, Math.min(ROAD_BOTTOM - 6, spit.targetY)),
              rx: (spit.burst ? 14 : 7) + Math.random() * (spit.burst ? 8 : 5),
              removeAt: now + BLOOD_STAIN_MS,
              tint: "vomit",
            });
            if (g.bloodStains.length > MAX_BLOOD_STAINS) g.bloodStains.splice(0, g.bloodStains.length - MAX_BLOOD_STAINS);
            for (let i = 0; i < 10; i++) {
              const a = Math.random() * Math.PI * 2;
              g.particles.push({ x: spit.targetX, y: spit.targetY - 4, vx: Math.cos(a) * (30 + Math.random() * 90), vy: -30 - Math.random() * 80, until: now + 380, color: i % 2 ? "#8fce4a" : "#5e9a2e", size: 2.5 + Math.random() * 4 });
            }
            if (Math.hypot(p.x - spit.targetX, p.y - spit.targetY) < splashRadius && now > p.invulnerableUntil) {
              p.hp -= spitDamage;
              p.invulnerableUntil = now + 260;
              sound.playerHurt();
              g.screenShakeUntil = now + 160;
            }
            for (const targetNpc of g.npcs) {
              if (!targetNpc.targetable || targetNpc.hp <= 0 || now <= targetNpc.invulnerableUntil) continue;
              if (Math.hypot(targetNpc.field.x - spit.targetX, targetNpc.field.y - spit.targetY) >= splashRadius) continue;
              targetNpc.hp = Math.max(0, targetNpc.hp - spitDamage);
              targetNpc.invulnerableUntil = now + 260;
              if (targetNpc.squadIndex !== undefined && g.level?.levelId === LEVEL6_ID) {
                g.level.squadHp[targetNpc.squadIndex] = targetNpc.hp;
              }
            }
          }
          g.spits = g.spits.filter((spit) => now < spit.landAt);

          // 搭档行动：猎犬扑咬 / 警察掩护射击 / 无人机压制（在击杀结算前结算伤害）
          updatePartner(g, now, dt);

          const before = g.zombies.length;
          const newlyKilled = g.zombies.filter((z) => z.hp <= 0);
          for (const z of newlyKilled) {
            const deathPose = zombieRenderPose(z, now, p.x);
            // 击杀奖励：当日击杀预算按僵尸总数均摊（僵尸随天数变多、单价相应下降），大块头按体型小幅加成；
            // 通关时再发结算奖励补足到当天收入区间，保证「击杀 + 结算」每天总获取落在区间内
            // 关卡模式：无金币经济（waveTotal=0，均摊公式会失去意义），仅累计击杀数
            const coinGain = g.mode === "level" ? 0 : Math.max(6, Math.round(dailyKillBudget(g.day) / g.waveTotal)) + Math.min(6, Math.floor(z.maxHp / 90));
            g.coins += coinGain;
            g.stats.coinsEarned += coinGain;
            g.dayKillCoins += coinGain;
            g.kills += 1;
            if (g.mode === "level" && g.level) g.level.sceneKills += 1;
            // 盾兵死亡时若盾牌仍在，随尸体脱手落地（与踹落同一地面道具流：原尺寸翻倒躺平，10 秒清除）
            if (z.kind === "shield" && z.shieldIntact) {
              z.shieldIntact = false;
              const dropVx = -30 + Math.random() * 60;
              g.groundProps.push({
                id: Math.floor(now * 1000 + Math.random() * 999),
                kind: "shield",
                x: z.x,
                y: z.y - 55,
                vx: dropVx,
                vy: -(110 + Math.random() * 70),
                groundY: Math.min(ROAD_BOTTOM - 8, z.y + 2),
                rotation: 0,
                angularVelocity: Math.sign(dropVx || 1) * (3 + Math.random() * 2),
                visibleAt: now,
                removeAt: now + GROUND_PROP_MS,
                settled: false,
              });
              if (g.groundProps.length > MAX_GROUND_PROPS) g.groundProps.splice(0, g.groundProps.length - MAX_GROUND_PROPS);
            }
            g.corpses.push({
              zombie: z,
              diedAt: now,
              removeAt: now + ZOMBIE_CORPSE_MS,
              fallFacing: deathPose.poseFacing,
              startPose: deathPose.body,
            });
          }
          g.zombies = g.zombies.filter((z) => z.hp > 0);
          if (before !== g.zombies.length) syncSnapshot();
          // 关卡模式：任务链推进（拾取/抵达/清场判定、场景切换、通关结算）
          if (g.mode === "level") updateLevelTasks(g, now);
          if (g.mode === "level") updateLevelNpcs(g, now, dt);

          for (const pt of g.particles) {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.vy += 210 * dt;
          }
          for (const limb of g.detachedLimbs) {
            limb.x += limb.vx * dt;
            limb.y += limb.vy * dt;
            limb.vy += 460 * dt;
            limb.rotation += limb.angularVelocity * dt;
            if (limb.y > ROAD_BOTTOM - 8) {
              limb.y = ROAD_BOTTOM - 8;
              limb.vy *= -.24;
              limb.vx *= .78;
              limb.angularVelocity *= .7;
            }
          }
          // 盾牌碎块：重力下落、落地弹跳衰减、旋转渐隐（约 0.75~1.3 秒后清除，不留地面遗留）
          for (const shard of g.metalShards) {
            shard.x += shard.vx * dt;
            shard.y += shard.vy * dt;
            shard.vy += 460 * dt;
            shard.rotation += shard.angularVelocity * dt;
            if (shard.y > ROAD_BOTTOM - 8) {
              shard.y = ROAD_BOTTOM - 8;
              shard.vy *= -.3;
              shard.vx *= .7;
              shard.angularVelocity *= .6;
            }
          }
          g.tracers = g.tracers.filter((t) => t.until > now);
          g.particles = g.particles.filter((pt) => pt.until > now);
          g.detachedLimbs = g.detachedLimbs.filter((limb) => limb.until > now);
          g.metalShards = g.metalShards.filter((shard) => shard.until > now);
          for (const prop of g.groundProps) {
            if (prop.settled) continue;
            prop.x += prop.vx * dt;
            prop.y += prop.vy * dt;
            prop.vy += 460 * dt;
            prop.rotation += prop.angularVelocity * dt;
            if (prop.y >= prop.groundY) {
              prop.y = prop.groundY;
              prop.vy *= -0.3;
              prop.vx *= 0.6;
              prop.angularVelocity *= 0.6;
              if (Math.abs(prop.vy) < 20) {
                prop.vy = 0;
                prop.vx = 0;
                prop.angularVelocity = 0;
                // 全身金属盾：落地吸附为向一侧躺平（翻倒完成的姿态，不歪斜插入地面）
                if (prop.kind === "shield") prop.rotation = Math.sign(prop.rotation || 1) * (Math.PI / 2);
                prop.settled = true;
              }
            }
          }
          g.groundProps = g.groundProps.filter((prop) => now < prop.removeAt);
          g.bloodStains = g.bloodStains.filter((stain) => now < stain.removeAt);

          if (p.hp <= 0) {
            sound.gameOver();
            if (g.mode === "survival") {
              saveBest(g.day);
              clearProgressSave();
              setSaveInfo(null);
            }
            syncSnapshot();
            changeScreen("gameover");
          } else if (g.mode === "survival" && g.spawned >= g.waveTotal && g.zombies.length === 0) {
            if (g.waveClearedAt === null) g.waveClearedAt = now;
            if (now - g.waveClearedAt >= ZOMBIE_DEATH_FALL_MS + 200) {
              // 通关结算奖励：在当天收入区间内随机取一个目标总额，减去当天击杀已得即为奖励；
              // 击杀超目标时仍发一笔保底（区间下限的 15%），保证每天总获取落在区间内且略有浮动
              const [bandLo, bandHi] = dailyIncomeBand(g.day);
              const targetTotal = Math.round(bandLo + Math.random() * (bandHi - bandLo));
              const bonus = Math.max(targetTotal - g.dayKillCoins, Math.round(bandLo * 0.15));
              g.coins += bonus;
              g.stats.bonusEarned += bonus;
              g.lastDayBonus = bonus;
              saveBest(g.day);
              syncSnapshot();
              setShopDetail(null);
              setShopTab("weapons");
              changeScreen("shop");
            }
          } else {
            g.waveClearedAt = null;
          }
        }
        }
        drawWorld(ctx, g, now);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [attack, changeScreen, damageZombie, damageZombieFromExplosion, drawWorld, saveBest, spawnZombie, syncSnapshot, updateLevelNpcs, updateLevelTasks, updatePartner]);

  const rangeFree = snapshot.mode === "range";
  const lotteryHighlight = highestLotteryRarity(lotteryRewards);
  const lotteryCinematic = screen === "lottery" && (lotteryPhase === "firing" || lotteryPhase === "flash");
  const lotteryOverlayActive = screen === "lottery" && lotteryPhase !== "idle";
  const spawnTotal = ZOMBIE_CONFIG_KINDS.reduce((sum, kind) => sum + spawnCounts[kind], 0);
  // 非战斗界面（菜单/商店/装备/结算）使用紧凑页头并隐藏底栏按键条，把纵向空间全部让给面板；
  // 战斗与暂停（screen 恒为 playing）保持完整底栏 → 暂停/进出战斗舞台几何不变、实体不跳变
  const panelMode = screen !== "playing";
  // 负重与移速展示（装备整备/商店读数条共用）
  const snapshotCarriedKg = WEAPON_HANDLING[snapshot.loadout[0]].weightKg + WEAPON_HANDLING[snapshot.loadout[1]].weightKg
    + WEAPON_HANDLING[snapshot.melee].weightKg + ARMORS[snapshot.armor].weightKg;
  const snapshotSpeedPct = Math.round(Math.max(0.72, Math.min(1, 1 - 0.007 * (snapshotCarriedKg - 5))) * 100);
  // 装备整备列表来源：靶场模式免费开放全部装备，生存模式仅限已拥有
  const loadoutGuns = rangeFree ? SHOP_WEAPON_KEYS.filter((key) => !MELEE_WEAPONS.has(key)) : snapshot.owned.filter((key) => !MELEE_WEAPONS.has(key));
  const loadoutMelees = rangeFree ? SHOP_WEAPON_KEYS.filter((key) => MELEE_WEAPONS.has(key)) : snapshot.owned.filter((key) => MELEE_WEAPONS.has(key));
  const loadoutArmors = rangeFree ? (Object.keys(ARMORS) as ArmorKey[]) : snapshot.ownedArmors;
  const loadoutPartners = rangeFree ? PARTNER_KEYS : snapshot.ownedPartners;

  // 商店详情面板：点击商品卡弹出，展示完整参数，面板内确认购买/装备后自动关闭
  let shopDetailView: React.ReactNode = null;
  if (shopDetail) {
    const closeDetail = () => setShopDetail(null);
    let detailBody: React.ReactNode = null;
    if (shopDetail.kind === "weapon") {
      const key = shopDetail.key as WeaponKey;
      const weapon = WEAPONS[key];
      const handling = WEAPON_HANDLING[key];
      const owned = snapshot.owned.includes(key);
      const canBuy = canPurchase(snapshot.mode, snapshot.coins, weapon.price);
      const isMelee = MELEE_WEAPONS.has(key);
      detailBody = (
        <>
          <div className="shop-detail-head">
            <WeaponPreview weapon={key} />
            <div><strong>{weapon.name}</strong><span>{weapon.caliber} · 全长 {REAL_LENGTH_MM[key]}mm</span><small>{weapon.description}</small></div>
          </div>
          <div className="shop-detail-stats">
            <span>射击模式 <b>{fireModeLabel(key)}</b></span>
            <span>伤害 <b>{Math.round(weaponDamage(key) * 10) / 10}{weapon.explosionRadius ? " · 爆炸" : ""}</b></span>
            {!isMelee && <span>射速 <b>{Math.round(60000 / weapon.fireRate)} 发/分</b></span>}
            {!isMelee && <span>弹匣 <b>{weapon.magazine} 发</b></span>}
            <span>穿透 <b>{weapon.penetration ?? 1} 个目标</b></span>
            {weapon.pellets ? <span>弹丸 <b>{weapon.pellets} 颗/发</b></span> : null}
            {weapon.ignite ? <span>点燃 <b>灼烧直至死亡</b></span> : null}
            <span>重量 <b>{handling.weightKg}kg</b></span>
            <span>制动力 <b>{Math.round(handling.stopping * 100)}%</b></span>
          </div>
          <div className="shop-detail-actions">
            <button className="primary-button compact" disabled={!owned && !canBuy} onClick={() => { buyWeapon(key); closeDetail(); }}>
              <span>{owned ? "装备" : rangeFree ? "免费领取并装备" : `购买并装备 · ◉ ${weapon.price}`}</span><b>→</b>
            </button>
            <button className="ghost-button" onClick={closeDetail}>关闭</button>
          </div>
        </>
      );
    } else if (shopDetail.kind === "armor") {
      const key = shopDetail.key as ArmorKey;
      const armor = ARMORS[key];
      const owned = snapshot.ownedArmors.includes(key);
      const canBuy = canPurchase(snapshot.mode, snapshot.coins, armor.price);
      detailBody = (
        <>
          <div className="shop-detail-head">
            <div className="armor-figure" aria-hidden="true">
              <i className={`armor-head ${armor.helmet}`} style={{ backgroundColor: armor.accent }} />
              <i className="armor-body" style={{ backgroundColor: armor.torso, borderColor: armor.accent }} />
              <i className="armor-legs" style={{ backgroundColor: armor.pants }} />
            </div>
            <div><strong>{armor.name}</strong><span>战斗服</span><small>{armor.description}</small></div>
          </div>
          <div className="shop-detail-stats">
            <span>最大生命 <b>{armor.maxHp} HP</b></span>
            <span>生命提升 <b>+{armor.maxHp - ARMORS.civilian.maxHp} HP</b></span>
            <span>重量 <b>{armor.weightKg}kg</b></span>
            <span>价格 <b>{shopPriceLabel(snapshot.mode, armor.price, true)}</b></span>
          </div>
          <div className="shop-detail-actions">
            <button className="primary-button compact" disabled={!owned && !canBuy} onClick={() => { buyArmor(key); closeDetail(); }}>
              <span>{owned ? "装备" : rangeFree ? "免费领取并装备" : `购买并装备 · ◉ ${armor.price}`}</span><b>→</b>
            </button>
            <button className="ghost-button" onClick={closeDetail}>关闭</button>
          </div>
        </>
      );
    } else if (shopDetail.kind === "partner") {
      const key = shopDetail.key as PartnerKey;
      const partner = PARTNERS[key];
      const owned = snapshot.ownedPartners.includes(key);
      const canBuy = canPurchase(snapshot.mode, snapshot.coins, partner.price);
      detailBody = (
        <>
          <div className="shop-detail-head">
            <PartnerPreview partner={key} />
            <div><strong>{partner.name}</strong><span>随行搭档 · 不会死亡</span><small>{partner.description}</small></div>
          </div>
          <div className="shop-detail-stats">
            {key === "hound" && (
              <>
                <span>撕咬伤害 <b>{HOUND_DAMAGE}</b></span>
                <span>扑咬间隔 <b>{HOUND_INTERVAL_MS / 1000} 秒</b></span>
                <span>扑倒 <b>≈3 秒</b></span>
                <span>追击范围 <b>620</b></span>
              </>
            )}
            {key === "officer" && (
              <>
                <span>武器 <b>M1911</b></span>
                <span>单发伤害 <b>{Math.round(weaponDamage("m1911") * 10) / 10}</b></span>
                <span>射速 <b>{Math.round(60000 / (WEAPONS.m1911.fireRate * 2))} 发/分 · 原版 50%</b></span>
                <span>弹匣 <b>{WEAPONS.m1911.magazine} 发 · 打空换弹 {(WEAPONS.m1911.reload / 1000).toFixed(2)} 秒</b></span>
                <span>索敌范围 <b>760</b></span>
              </>
            )}
            {key === "drone" && (
              <>
                <span>单发伤害 <b>{DRONE_DAMAGE}</b></span>
                <span>射速 <b>{Math.round(60000 / DRONE_INTERVAL_MS)} 发/分</b></span>
                <span>穿透 <b>2 个目标</b></span>
                <span>射击循环 <b>{DRONE_FIRE_MS / 1000} 秒 → 换弹 {DRONE_RELOAD_MS / 1000} 秒</b></span>
              </>
            )}
          </div>
          <div className="shop-detail-actions">
            <button className="primary-button compact" disabled={!owned && !canBuy} onClick={() => { buyPartner(key); closeDetail(); }}>
              <span>{owned ? "装备随行" : rangeFree ? "免费领取并装备" : `购买并装备 · ◉ ${partner.price}`}</span><b>→</b>
            </button>
            <button className="ghost-button" onClick={closeDetail}>关闭</button>
          </div>
        </>
      );
    } else {
      const key = shopDetail.key as ItemKey;
      const item = ITEMS[key];
      const canBuy = canPurchase(snapshot.mode, snapshot.coins, item.price);
      detailBody = (
        <>
          <div className="shop-detail-head">
            <span className={`item-icon item-icon-${key}`} style={{ "--item-color": item.color } as React.CSSProperties}><i /><b /></span>
            <div><strong>{item.name}</strong><span>战术道具 · 快捷键 {item.hotkey}</span><small>{item.description}</small></div>
          </div>
          <div className="shop-detail-stats">
            <span>价格 <b>{shopPriceLabel(snapshot.mode, item.price, true)}</b></span>
            <span>当前库存 <b>×{snapshot.itemInventory[key]}</b></span>
            {item.damage > 0 && <span>伤害 <b>{item.damage}</b></span>}
            {item.radius > 0 && <span>作用半径 <b>{item.radius}</b></span>}
          </div>
          <div className="shop-detail-actions">
            <button className="primary-button compact" disabled={!canBuy} onClick={() => { buyItem(key); closeDetail(); }}>
              <span>{rangeFree ? "免费领取 1 个" : `购买 1 个 · ◉ ${item.price}`}</span><b>→</b>
            </button>
            <button className="ghost-button" onClick={closeDetail}>关闭</button>
          </div>
        </>
      );
    }
    shopDetailView = (
      <div className="shop-detail-backdrop" onClick={closeDetail}>
        <div className="shop-detail" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          {detailBody}
        </div>
      </div>
    );
  }

  return (
    <main className={`game-shell ${panelMode ? "panel-mode" : ""} ${lotteryCinematic ? "lottery-cinematic" : ""}`}>
      <div className="noise" aria-hidden="true" />
      {lotteryOverlayActive ? <div className="masthead lottery-masthead-placeholder" aria-hidden="true" /> : <header className="masthead">
        <div className="masthead-left">
          <a className="brand" href="#" onClick={(e) => { e.preventDefault(); sound.uiClick(); changeScreen(majorMode === "classic" ? "menu" : "exploration"); }} aria-label="返回主菜单">
            <span className="brand-mark">DR</span>
            <span>死路求生</span>
          </a>
          {(screen === "menu" || screen === "exploration") && (
            <div className="major-mode-switch" role="tablist" aria-label="大模式切换">
              <button type="button" className={majorMode === "classic" ? "active" : ""} role="tab" aria-selected={majorMode === "classic"} onClick={() => switchMajorMode("classic")}>经典模式</button>
              <button type="button" className={majorMode === "exploration" ? "active" : ""} role="tab" aria-selected={majorMode === "exploration"} onClick={() => switchMajorMode("exploration")}>探索模式</button>
            </div>
          )}
        </div>
        <div className="masthead-side">
          <span className="edition">{majorMode === "classic" ? "经典模式 / 公路生存行动" : "探索模式 / 农田前哨"}</span>
          <AccountControl />
          <label className="volume-control" title={`主音量 ${volume}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="主音量"
              style={{ "--fill": `${volume}%` } as React.CSSProperties}
            />
            <b>{volume}</b>
          </label>
          <button
            type="button"
            className="mute-toggle"
            onClick={toggleMute}
            aria-label={muted ? "取消静音（M 键）" : "静音（M 键）"}
            aria-pressed={muted}
            title={muted ? "取消静音（M 键）" : "静音（M 键）"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>}

      <section className={`game-stage ${screen === "playing" ? "is-playing" : ""}`} ref={stageRef}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={H}
          tabIndex={screen === "playing" ? 0 : -1}
          aria-label="死路求生 2D 僵尸射击游戏画面"
          onContextMenu={(e) => e.preventDefault()}
          onPointerMove={(e) => { mouseRef.current = { ...mouseRef.current, ...pointerPosition(e) }; }}
          onPointerDown={(e) => {
            // 关卡对话中：点击推进台词
            if (screenRef.current === "playing" && stateRef.current.mode === "level" && stateRef.current.level?.dialog) {
              advanceLevelDialog();
              return;
            }
            // 关卡模式：右键拾取附近武器
            if (e.button === 2) {
              if (screenRef.current === "playing" && stateRef.current.mode === "level") tryPickupWeapon();
              return;
            }
            if (e.button !== 0 || screenRef.current !== "playing") return;
            e.currentTarget.setPointerCapture(e.pointerId);
            mouseRef.current = { ...pointerPosition(e), down: false };
            if (deploySelectedItem(performance.now())) return;
            mouseRef.current.down = true;
            attack(performance.now());
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            mouseRef.current.down = false;
            stateRef.current.player.emptyReloadLatch = false;
          }}
          onPointerLeave={() => { mouseRef.current.down = false; stateRef.current.player.emptyReloadLatch = false; }}
        />

        {screen === "menu" && (
          <div className="menu-panel overlay-panel">
            <p className="eyebrow">经典模式 · 最后的撤离公路 · 17 号封锁区</p>
            <h1>别停下<br /><em>天亮前杀出去</em></h1>
            <p className="menu-copy">尸潮一天比一天凶猛，在生存模式里守住公路、多活一天；在靶场把每一把枪练到顺手；或沿封锁公路逐关推进，杀出 17 号区——三条路，通向同一个天亮</p>
            <div className="menu-actions">
              {saveInfo && (
                <button className="primary-button continue-button" onClick={continueProgress}><span>继续 · 第 {saveInfo.nextDay} 天</span><b>↻</b></button>
              )}
              <button className="primary-button" onClick={() => startGame("survival")}><span>生存模式</span><b>→</b></button>
              <button className="range-button" onClick={() => startGame("range")}><span>靶场模式</span><small>装备免费 · 无尽僵尸</small><b>◎</b></button>
              <button className="level-button" onClick={openLevels}><span>关卡模式</span><small>独立关卡 · 剧情推进</small><b>⚑</b></button>
              <button className="codex-book-button" onClick={() => openCodex("menu")} aria-label="打开僵尸图鉴">
                <span className="codex-book-spine" aria-hidden="true" />
                <span className="codex-book-cover"><b>僵尸图鉴</b><small>已发现 {seenKinds.length} / {ZOMBIE_CONFIG_KINDS.length}</small></span>
              </button>
              <div className="record-card"><span>最高存活</span><strong>{bestDay || "—"}</strong><small>天</small></div>
            </div>
            <div className="danger-tape"><span>警告：前方感染区</span><span>弹药有限</span><span>禁止停车</span></div>
          </div>
        )}

        {screen === "exploration" && (
          <div className="exploration-panel overlay-panel">
            <div className="exploration-scenery" aria-hidden="true">
              <span className="exploration-sun" />
              <span className="exploration-tree-line" />
              <span className="exploration-barn"><i /><b /></span>
              <span className="exploration-silo"><i /></span>
              <span className="exploration-windmill"><i /><b /></span>
              <span className="exploration-crops exploration-crops-a" />
              <span className="exploration-crops exploration-crops-b" />
            </div>

            <div className="exploration-heading">
              <p className="eyebrow">探索模式 · 第一片区域</p>
              <h2>遗落农田</h2>
              <small>沿农田小路推进任务 · 通关上一任务后解锁下一任务</small>
            </div>

            <div className="exploration-wallet" aria-label="探索模式资源">
              <span><i>◉</i><small>金币</small><strong>{explorationCoins}</strong></span>
              <span><i>✦</i><small>经验点数</small><strong>{explorationExperience}</strong></span>
            </div>

            <nav className="exploration-rail exploration-rail-left" aria-label="探索模式左侧功能">
              <button type="button" onClick={() => { sound.uiClick(); setExplorationNotice("探索模式商店将在后续更新中开放。"); }}><b>▣</b><span>商店</span><small>购买探索物资</small></button>
              <button type="button" onClick={() => { sound.uiClick(); setExplorationNotice("队伍编成与成员详情将在后续更新中开放。"); }}><b>♟</b><span>队伍</span><small>查看出战成员</small></button>
            </nav>

            <nav className="exploration-rail exploration-rail-right" aria-label="探索模式右侧功能">
              <button type="button" onClick={openLottery}><b>✧</b><span>抽奖</span><small>获取探索奖励</small></button>
              <button type="button" onClick={() => openCodex("exploration")}><b>▤</b><span>僵尸图鉴</span><small>已发现 {seenKinds.length} / {ZOMBIE_CONFIG_KINDS.length}</small></button>
            </nav>

            <div className="exploration-task-map" aria-label="探索任务地图">
              <svg className="exploration-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={EXPLORATION_TASKS.map((task) => `${task.x},${task.y}`).join(" ")} />
              </svg>
              {EXPLORATION_TASKS.map((task) => {
                const unlocked = isExplorationTaskUnlocked(task.order, explorationClearedTasks);
                const cleared = explorationClearedTasks.includes(task.order);
                return (
                  <button
                    key={task.order}
                    type="button"
                    className={`exploration-task-node ${unlocked ? "unlocked" : "locked"} ${cleared ? "cleared" : ""}`}
                    style={{ "--task-x": `${task.x}%`, "--task-y": `${task.y}%` } as React.CSSProperties}
                    disabled={!unlocked}
                    aria-label={`${task.label}${unlocked ? cleared ? "，已通关，可重新进入" : "，可进入" : "，通关上一任务后解锁"}`}
                    onClick={() => { sound.uiClick(); setExplorationNotice(`${task.label}的详细内容将在后续更新中开放。`); }}
                  >
                    <span>{String(task.order).padStart(2, "0")}</span>
                    <strong>{task.label}</strong>
                    <small>{cleared ? "✓ 已通关" : unlocked ? "进入任务 →" : "🔒 未解锁"}</small>
                  </button>
                );
              })}
            </div>

            <button type="button" className="exploration-chapter-button" onClick={() => { sound.uiClick(); setExplorationNotice("章节选择将在后续更新中开放；当前为第一章「遗落农田」。"); }}>
              <small>当前章节</small><strong>第一章 · 遗落农田</strong><b>章节 ▤</b>
            </button>

            {explorationNotice && (
              <div className="exploration-notice" role="status">
                <span>{explorationNotice}</span>
                <button type="button" onClick={() => { sound.uiClick(); setExplorationNotice(null); }} aria-label="关闭提示">×</button>
              </div>
            )}
          </div>
        )}

        {screen === "lottery" && (
          <div className={`lottery-panel overlay-panel lottery-${lotteryPhase} ${lotteryHighlight ? `lottery-${lotteryHighlight}` : ""}`}>
            <div className="lottery-sky" aria-hidden="true">
              <span className="lottery-cloud lottery-cloud-a" />
              <span className="lottery-cloud lottery-cloud-b" />
              <span className="lottery-horizon" />
              <span className="lottery-road-sign"><b>17</b><small>封锁公路</small></span>
            </div>
            <div className="lottery-road" aria-hidden="true">
              <span className="lottery-lane lottery-lane-left" />
              <span className="lottery-lane lottery-lane-right" />
              <span className="lottery-wreck"><i /><b /></span>
            </div>

            <div className="lottery-zombie-field" aria-label={`公路尸群，已击杀 ${lotteryKilled} / ${LOTTERY_ZOMBIES.length}`}>
              {LOTTERY_ZOMBIES.map(([left, bottom, scale], index) => (
                <span
                  key={`${left}-${bottom}`}
                  className={`lottery-zombie ${index < lotteryKilled ? "dead" : ""} ${index === lotteryKilled - 1 ? "hit" : ""}`}
                  style={{ "--zombie-left": `${left}%`, "--zombie-bottom": `${bottom}%`, "--zombie-scale": scale, "--zombie-delay": `${(index % 5) * -.14}s` } as React.CSSProperties}
                  aria-hidden="true"
                >
                  <i className="lottery-zombie-head" />
                  <b className="lottery-zombie-body" />
                  <span className="lottery-zombie-arm lottery-zombie-arm-left" />
                  <span className="lottery-zombie-arm lottery-zombie-arm-right" />
                  <span className="lottery-zombie-leg lottery-zombie-leg-left" />
                  <span className="lottery-zombie-leg lottery-zombie-leg-right" />
                  <span className="lottery-zombie-blood" />
                </span>
              ))}
            </div>

            {lotteryPhase === "idle" && (
              <>
                <div className="lottery-interface lottery-topbar">
                  <button type="button" className="lottery-back" onClick={closeLottery}>← 返回探索</button>
                  <div className="lottery-heading">
                    <p className="eyebrow">探索模式 · 公路招募</p>
                    <h2>火线招募</h2>
                    <small>清除尸群，让公路尽头的补给箱现身</small>
                  </div>
                  <div className="lottery-ticket-wallet">
                    <i>券</i><small>招募券</small><strong>{recruitTickets}</strong><em>测试版免券</em>
                  </div>
                </div>

                <div className="lottery-interface lottery-rates" aria-label="抽奖概率">
                  {(Object.keys(LOTTERY_RARITIES) as LotteryRarity[]).map((rarity) => (
                    <span key={rarity} className={`lottery-rate-${rarity}`}><b>{LOTTERY_RARITIES[rarity].label}</b><strong>{LOTTERY_RARITIES[rarity].chance}%</strong></span>
                  ))}
                </div>
              </>
            )}

            {lotteryPhase === "idle" && (
              <div className="lottery-interface lottery-actions">
                <button type="button" onClick={() => startLotteryDraw(1)}><small>消耗 1 张招募券</small><strong>抽一次</strong><em>测试版不扣除</em></button>
                <button type="button" className="lottery-ten" onClick={() => startLotteryDraw(10)}><small>消耗 10 张招募券</small><strong>抽十次</strong><em>测试版不扣除</em></button>
              </div>
            )}

            {(lotteryPhase === "firing" || lotteryPhase === "flash") && (
              <div className="lottery-combat-status">
                <span>第一人称火力演示 · MG42</span>
                <strong>清除公路尸群</strong>
                <small>{Math.min(lotteryKilled, LOTTERY_ZOMBIES.length)} / {LOTTERY_ZOMBIES.length}</small>
              </div>
            )}

            <div className="lottery-first-person-gun" aria-hidden="true">
              <span className="lottery-fp-arm lottery-fp-arm-left" />
              <span className="lottery-fp-arm lottery-fp-arm-right" />
              <span className="lottery-mg42-stock" />
              <span className="lottery-mg42-receiver"><i /><b /></span>
              <span className="lottery-mg42-barrel"><i /></span>
              <span className="lottery-mg42-bipod" />
              <span className="lottery-ammo-belt">••••••••</span>
              <span className="lottery-muzzle-flash" />
              <span className="lottery-tracer lottery-tracer-a" />
              <span className="lottery-tracer lottery-tracer-b" />
            </div>

            <div className="lottery-screen-flash" aria-hidden="true" />

            {lotteryPhase === "reveal" && (
              <div className={`lottery-result ${lotteryDrawCount === 10 ? "lottery-result-ten" : ""}`} role="dialog" aria-modal="true" aria-label="抽奖结果">
                <p>公路已肃清</p>
                <h2>{lotteryDrawCount === 10 ? "十连招募结果" : "招募结果"}</h2>
                <div className="lottery-reward-grid">
                  {lotteryRewards.map((rarity, index) => (
                    <article key={`${rarity}-${index}`} className={`lottery-reward-card reward-${rarity}`}>
                      <small>NO. {String(index + 1).padStart(2, "0")}</small>
                      <i>?</i>
                      <strong>{LOTTERY_RARITIES[rarity].label}</strong>
                      <span>奖励内容待公布</span>
                    </article>
                  ))}
                </div>
                <div className="lottery-reveal-actions">
                  <button type="button" autoFocus onClick={() => { sound.uiClick(); setLotteryPhase("idle"); setLotteryKilled(0); setLotteryRewards([]); }}>继续招募</button>
                  <button type="button" onClick={closeLottery}>返回探索</button>
                </div>
              </div>
            )}
          </div>
        )}

        {screen === "codex" && (
          <div className="codex-panel overlay-panel">
            <div className="codex-book">
              <p className="eyebrow">战地档案 · {codexCategory === "regular" ? `已发现 ${codexSeenList.length} / ${ZOMBIE_CONFIG_KINDS.length}` : "特殊档案等待建立"}</p>
              <h2 className="codex-title">僵尸图鉴</h2>
              <div className="codex-category-tabs" role="tablist" aria-label="僵尸图鉴种类">
                <button type="button" className={codexCategory === "regular" ? "active" : ""} role="tab" aria-selected={codexCategory === "regular"} onClick={() => { sound.uiClick(); setCodexCategory("regular"); setCodexPage(0); }}>常规僵尸 <b>{codexSeenList.length}/{ZOMBIE_CONFIG_KINDS.length}</b></button>
                <button type="button" className={codexCategory === "special" ? "active" : ""} role="tab" aria-selected={codexCategory === "special"} onClick={() => { sound.uiClick(); setCodexCategory("special"); setCodexPage(0); }}>特殊僵尸 <b>0/?</b></button>
              </div>
              {codexCategory === "special" ? (
                <div className="codex-empty codex-special-empty">
                  <b>特殊僵尸档案将在后续探索中开放</b>
                  <span>特殊僵尸的种类、能力与遭遇方式将在后续更新中补充。</span>
                </div>
              ) : activeCodexList.length === 0 ? (
                <div className="codex-empty">
                  <b>档案空白</b>
                  <span>实际遭遇僵尸后，常规档案才会解锁。</span>
                </div>
              ) : (
                <>
                  <div className="codex-spread">
                    <button className="codex-flip" onClick={() => flipCodex(-1)} disabled={codexPage === 0} aria-label="上一页">‹</button>
                    <div className="codex-page">
                      <div className="codex-figure">
                        <ZombieKindPreview kind={activeCodexList[codexPage]} width={220} height={300} className="codex-preview" />
                      </div>
                      <div className="codex-info">
                        <strong>{ZOMBIE_KIND_INFO[activeCodexList[codexPage]].name}</strong>
                        <p>{CODEX_DESCRIPTIONS[activeCodexList[codexPage]]}</p>
                        <dl>
                          <div><dt>首次出现</dt><dd>第 {ZOMBIE_KIND_INFO[activeCodexList[codexPage]].unlockDay} 天</dd></div>
                          <div><dt>HP</dt><dd>{ZOMBIE_KIND_INFO[activeCodexList[codexPage]].hp} <small>第 1 天基数，随天数成长</small></dd></div>
                          <div><dt>移动速度</dt><dd>{ZOMBIE_KIND_INFO[activeCodexList[codexPage]].speed}</dd></div>
                          <div><dt>特性</dt><dd>{ZOMBIE_KIND_INFO[activeCodexList[codexPage]].trait}</dd></div>
                        </dl>
                      </div>
                    </div>
                    <button className="codex-flip" onClick={() => flipCodex(1)} disabled={codexPage >= activeCodexList.length - 1} aria-label="下一页">›</button>
                  </div>
                  <div className="codex-footer">
                    <span className="codex-pageno">{codexPage + 1} / {activeCodexList.length}</span>
                    <small>← → 或点击两侧翻页 · ESC 返回{codexReturn === "pause" ? "暂停" : codexReturn === "exploration" ? "探索模式" : "经典模式"}</small>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {screen === "levels" && (
          <div className="levels-panel overlay-panel">
            <p className="eyebrow">独立关卡 · 剧情推进</p>
            <h2>关卡模式</h2>
            <p className="levels-copy">沿 17 号封锁公路逐关推进的战役正在制作中——每一关都有独立目标与剧情。敬请期待。</p>
            <div className="levels-list">
              {LEVEL_DEFS.map((level) => {
                if (!level.playable) {
                  return (
                    <div key={level.id} className="level-card" aria-disabled="true">
                      <span className="level-order">{String(level.order).padStart(2, "0")}</span>
                      <div className="level-card-info">
                        <strong>{level.title}</strong>
                        <small>{level.briefing}</small>
                      </div>
                      <em className="level-badge">制作中</em>
                    </div>
                  );
                }
                // 解锁链：第一关始终可玩，后续关卡需通关上一关；未解锁为锁定态（灰化 + 🔒，不可点击）
                const unlocked = isLevelUnlocked(level.id, clearedLevels);
                const cleared = clearedLevels.includes(level.id);
                if (!unlocked) {
                  return (
                    <div key={level.id} className="level-card level-card-locked" aria-disabled="true" title="通关上一关后解锁">
                      <span className="level-order">{String(level.order).padStart(2, "0")}</span>
                      <div className="level-card-info">
                        <strong>{level.title}</strong>
                        <small>{level.briefing}</small>
                      </div>
                      <em className="level-badge level-badge-lock">🔒 通关上一关后解锁</em>
                    </div>
                  );
                }
                return (
                  <button key={level.id} className="level-card level-card-playable" onClick={() => startLevel(level.id)}>
                    <span className="level-order">{String(level.order).padStart(2, "0")}</span>
                    <div className="level-card-info">
                      <strong>{level.title}{cleared && <i className="level-cleared-mark" title="已通关">✓</i>}</strong>
                      <small>{level.briefing}</small>
                    </div>
                    <em className="level-badge level-badge-go">{cleared ? "重玩 →" : "开始 →"}</em>
                  </button>
                );
              })}
            </div>
            <div className="end-actions">
              <button className="ghost-button" onClick={closeLevels}>返回主菜单</button>
            </div>
            <small className="pause-hint">按 ESC 返回主菜单 · 通关上一关后解锁下一关</small>
          </div>
        )}

        {screen === "shop" && (
          <div className="shop-panel overlay-panel">
            <div className="shop-heading">
              <div><p className="eyebrow">{rangeFree ? "靶场自由配置" : snapshot.day >= 1 ? (snapshot.lastDayBonus > 0 ? `第 ${snapshot.day} 天清剿完成 · 通关奖励 ◉ ${snapshot.lastDayBonus}` : `第 ${snapshot.day} 天清剿完成`) : "出发前整备"}</p><h2>{rangeFree ? "靶场军需库" : "路边军火铺"}</h2></div>
              <div className="wallet"><span>{rangeFree ? "训练额度" : "持有金币"}</span><strong>{rangeFree ? "全部免费" : `◉ ${snapshot.coins}`}</strong></div>
            </div>
            <div className="loadout-readout">
              <span>枪械 1 <b>{WEAPONS[snapshot.loadout[0]].name}</b></span>
              <span>枪械 2 <b>{WEAPONS[snapshot.loadout[1]].name}</b></span>
              <span>近战 <b>{WEAPONS[snapshot.melee].name}</b></span>
              <span>战斗服 <b>{ARMORS[snapshot.armor].name} · {snapshot.maxHp} HP</b></span>
              <em>{rangeFree ? "B 键返回靶场 · Q 切换武器" : "Q 键循环切换"}</em>
            </div>
            <div className="shop-tabs" role="tablist" aria-label="商店分类">
              <button className={shopTab === "weapons" ? "active" : ""} onClick={() => { sound.uiClick(); setShopDetail(null); setShopTab("weapons"); }} role="tab" aria-selected={shopTab === "weapons"}>武器库 <b>{Object.keys(WEAPONS).length}</b></button>
              <button className={shopTab === "armor" ? "active" : ""} onClick={() => { sound.uiClick(); setShopDetail(null); setShopTab("armor"); }} role="tab" aria-selected={shopTab === "armor"}>战斗服 <b>{Object.keys(ARMORS).length - 1}</b></button>
              <button className={shopTab === "supplies" ? "active" : ""} onClick={() => { sound.uiClick(); setShopDetail(null); setShopTab("supplies"); }} role="tab" aria-selected={shopTab === "supplies"}>医疗补给 <b>1</b></button>
              <button className={shopTab === "items" ? "active" : ""} onClick={() => { sound.uiClick(); setShopDetail(null); setShopTab("items"); }} role="tab" aria-selected={shopTab === "items"}>战术道具 <b>{ITEM_KEYS.length}</b></button>
              <button className={shopTab === "partners" ? "active" : ""} onClick={() => { sound.uiClick(); setShopDetail(null); setShopTab("partners"); }} role="tab" aria-selected={shopTab === "partners"}>搭档 <b>{PARTNER_KEYS.length}</b></button>
              {rangeFree && (
                <button className={shopTab === "zombies" ? "active" : ""} onClick={() => { sound.uiClick(); setShopDetail(null); setShopTab("zombies"); }} role="tab" aria-selected={shopTab === "zombies"}>僵尸生成 <b>{spawnTotal}</b></button>
              )}
            </div>
            {shopTab === "weapons" && (
              <div className="shop-content" role="tabpanel">
                <div className="shop-section-label weapon-label"><b>武器</b><span>按价格升序 · 点击卡片查看详情后购买</span></div>
                <div className="shop-grid">
                  {SHOP_WEAPON_KEYS.map((key, index) => {
                    const weapon = WEAPONS[key];
                    const owned = snapshot.owned.includes(key);
                    const selected = snapshot.weapon === key;
                    const carried = key === snapshot.melee || snapshot.loadout.includes(key);
                    const canBuy = canPurchase(snapshot.mode, snapshot.coins, weapon.price);
                    return (
                      <button key={key} className={`weapon-card ${selected ? "selected" : ""} ${carried ? "carried" : ""}`} onClick={() => { sound.uiClick(); setShopDetail({ kind: "weapon", key }); }} disabled={!owned && !canBuy}>
                        <span className="weapon-index">{String(index + 1).padStart(2, "0")}</span>
                        <WeaponPreview weapon={key} />
                        <span className="weapon-price-badge">{shopPriceLabel(snapshot.mode, weapon.price)}</span>
                        <strong>{weapon.name}</strong>
                        <span className="weapon-caliber">{weapon.caliber} · 全长 {REAL_LENGTH_MM[key]}mm</span>
                        <span className="weapon-cost">购买价格 <b>{shopPriceLabel(snapshot.mode, weapon.price, true)}</b></span>
                        <small>{weapon.description}</small>
                        <span className="weapon-price">{selected ? "当前装备 · 查看详情" : carried ? "携带中 · 查看详情" : owned ? "已拥有 · 查看详情" : rangeFree ? "靶场免费 · 查看详情" : `◉ ${weapon.price} · 查看详情`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {shopTab === "armor" && (
              <div className="shop-content" role="tabpanel">
                <div className="shop-section-label"><b>战斗服</b><span>点击卡片查看详情，购买后即可换装并提升最大生命值</span></div>
                <div className="armor-grid armor-grid-full">
                  {(Object.keys(ARMORS) as ArmorKey[]).filter((key) => key !== "civilian").map((key) => {
                    const armor = ARMORS[key];
                    const owned = snapshot.ownedArmors.includes(key);
                    const selected = snapshot.armor === key;
                    const canBuy = canPurchase(snapshot.mode, snapshot.coins, armor.price);
                    return (
                      <button key={key} className={`armor-card ${selected ? "selected" : ""}`} onClick={() => { sound.uiClick(); setShopDetail({ kind: "armor", key }); }} disabled={!owned && !canBuy}>
                        <div className="armor-figure" aria-hidden="true">
                          <i className={`armor-head ${armor.helmet}`} style={{ backgroundColor: armor.accent }} />
                          <i className="armor-body" style={{ backgroundColor: armor.torso, borderColor: armor.accent }} />
                          <i className="armor-legs" style={{ backgroundColor: armor.pants }} />
                        </div>
                        <div><strong>{armor.name}</strong><span>最大生命 {armor.maxHp} HP · 重 {armor.weightKg}kg</span><small>{armor.description}</small></div>
                        <b className="armor-cost">{shopPriceLabel(snapshot.mode, armor.price, true)}</b>
                        <em>{selected ? "已装备 · 查看详情" : owned ? "已拥有 · 查看详情" : "查看详情"}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {shopTab === "supplies" && (
              <div className="shop-content" role="tabpanel">
                <div className="shop-section-label"><b>医疗补给</b><span>急救包购买后立即使用，不占武器栏位</span></div>
                <div className="supply-grid">
                  <button className="supply-card" onClick={buyMedkit} disabled={!canPurchase(snapshot.mode, snapshot.coins, MEDKIT_PRICE) || snapshot.hp >= snapshot.maxHp}>
                    <span className="medkit-icon" aria-hidden="true"><i /><b /></span>
                    <span className="supply-copy"><strong>战地急救包</strong><em>立即恢复 {MEDKIT_HEAL} HP</em><small>当前生命 {Math.ceil(snapshot.hp)} / {snapshot.maxHp} HP</small></span>
                    <span className="supply-price">{shopPriceLabel(snapshot.mode, MEDKIT_PRICE, true)}</span>
                    <span className="supply-action">{snapshot.hp >= snapshot.maxHp ? "生命值已满" : !canPurchase(snapshot.mode, snapshot.coins, MEDKIT_PRICE) ? "金币不足" : "领取并使用"}</span>
                  </button>
                </div>
              </div>
            )}
            {shopTab === "items" && (
              <div className="shop-content" role="tabpanel">
                <div className="shop-section-label"><b>战术道具</b><span>1–5、7 选择后左键确认；6 自动轰炸尸群最密集处 · 点击卡片查看详情</span></div>
                <div className="item-grid">
                  {ITEM_KEYS.map((key) => {
                    const item = ITEMS[key];
                    const canBuy = canPurchase(snapshot.mode, snapshot.coins, item.price);
                    return (
                      <button key={key} className="item-card" onClick={() => { sound.uiClick(); setShopDetail({ kind: "item", key }); }} disabled={!canBuy}>
                        <span className={`item-icon item-icon-${key}`} style={{ "--item-color": item.color } as React.CSSProperties}><i /><b /></span>
                        <span className="item-hotkey">战斗快捷键 {item.hotkey}</span>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                        <span className="item-stock">当前库存 <b>×{snapshot.itemInventory[key]}</b></span>
                        <span className="item-price">{shopPriceLabel(snapshot.mode, item.price, true)}</span>
                        <em>{canBuy ? "查看详情" : "金币不足"}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {shopTab === "partners" && (
              <div className="shop-content" role="tabpanel">
                <div className="shop-section-label"><b>搭档</b><span>搭档不会死亡、不被僵尸选为目标 · 同时只能装备 1 个 · 点击卡片查看详情</span></div>
                <div className="item-grid">
                  {PARTNER_KEYS.map((key) => {
                    const partner = PARTNERS[key];
                    const owned = snapshot.ownedPartners.includes(key);
                    const selected = snapshot.partner === key;
                    const canBuy = canPurchase(snapshot.mode, snapshot.coins, partner.price);
                    return (
                      <button key={key} className={`item-card partner-card ${selected ? "selected" : ""}`} onClick={() => { sound.uiClick(); setShopDetail({ kind: "partner", key }); }} disabled={!owned && !canBuy}>
                        <PartnerPreview partner={key} />
                        <strong>{partner.name}</strong>
                        <small>{partner.description}</small>
                        <span className="item-price">{shopPriceLabel(snapshot.mode, partner.price, true)}</span>
                        <em>{selected ? "随行中 · 查看详情" : owned ? "已拥有 · 查看详情" : canBuy ? "查看详情" : "金币不足"}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {shopTab === "zombies" && rangeFree && (
              <div className="shop-content" role="tabpanel">
                <div className="shop-section-label"><b>僵尸生成</b><span>各品种设 0–30 只，生成时打乱顺序上靶场 · HP 为第 1 天基数，随击杀数成长</span></div>
                <div className="spawn-list">
                  {ZOMBIE_CONFIG_KINDS.map((kind) => {
                    const info = ZOMBIE_KIND_INFO[kind];
                    const count = spawnCounts[kind];
                    return (
                      <div key={kind} className="spawn-row">
                        <ZombieKindPreview kind={kind} />
                        <div className="spawn-info">
                          <strong>{info.name}</strong>
                          <small>第 {info.unlockDay} 天解锁 · HP {info.hp} · {info.speed}</small>
                          <span className="spawn-trait">{info.trait}</span>
                        </div>
                        <div className="spawn-stepper">
                          <button
                            aria-label={`减少${info.name}`}
                            disabled={count <= 0}
                            onClick={() => { sound.uiClick(); setSpawnCounts((current) => ({ ...current, [kind]: Math.max(0, current[kind] - 1) })); }}
                          >−</button>
                          <b>{count}</b>
                          <button
                            aria-label={`增加${info.name}`}
                            disabled={count >= 30}
                            onClick={() => { sound.uiClick(); setSpawnCounts((current) => ({ ...current, [kind]: Math.min(30, current[kind] + 1) })); }}
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="spawn-summary">
                  <span>
                    合计 <b>{spawnTotal}</b> 只 · {snapshot.rangeSpawnMode === "batch"
                      ? (snapshot.rangeSpawnPending > 0 ? `批次进行中 · 待上场 ${snapshot.rangeSpawnPending}/${snapshot.rangeBatchTotal}` : "批次配置已生效")
                      : "当前为无尽模式"}
                  </span>
                  <div className="spawn-actions">
                    <button className="ghost-button" onClick={resumeRangeEndless} disabled={snapshot.rangeSpawnMode === "endless"}>恢复无尽模式</button>
                    <button className="primary-button compact" onClick={applyRangeSpawnBatch} disabled={spawnTotal === 0}><span>按配置生成一批（将清场）</span><b>◎</b></button>
                  </div>
                </div>
              </div>
            )}
            {shopDetailView}
            <div className="shop-footer">
              <span>{rangeFree ? "靶场内按 B 可随时暂停并返回免费军需库" : "下一天恢复 28 点生命并补满当前武器弹药"}</span>
              {rangeFree
                ? (
                  <div className="loadout-actions">
                    <button className="ghost-button" onClick={() => { sound.uiClick(); setLoadoutOpen(null); changeScreen("loadout"); }}>装备整备</button>
                    <button className="primary-button compact" onClick={resumeRange}><span>进入靶场</span><b>◎</b></button>
                  </div>
                )
                : <button className="primary-button compact" onClick={() => { sound.uiClick(); changeScreen("loadout"); }}><span>装备整备 · 第 {snapshot.day + 1} 天</span><b>→</b></button>}
            </div>
          </div>
        )}

        {screen === "loadout" && (
          <div className="shop-panel overlay-panel loadout-panel">
            <div className="shop-heading">
              <div><p className="eyebrow">装备整备</p><h2>{rangeFree ? "靶场装备配置" : `出战配置 · 第 ${snapshot.day + 1} 天`}</h2></div>
              <div className="wallet"><span>{rangeFree ? "训练额度" : "持有金币"}</span><strong>{rangeFree ? "全部免费" : `◉ ${snapshot.coins}`}</strong></div>
            </div>
            <div className="loadout-readout">
              <span>枪械 1 <b>{WEAPONS[snapshot.loadout[0]].name}</b></span>
              <span>枪械 2 <b>{WEAPONS[snapshot.loadout[1]].name}</b></span>
              <span>近战 <b>{WEAPONS[snapshot.melee].name}</b></span>
              <span>战斗服 <b>{ARMORS[snapshot.armor].name} · {snapshot.maxHp} HP</b></span>
              <span>搭档 <b>{snapshot.partner ? PARTNERS[snapshot.partner].name : "无"}</b></span>
              <span>负重 <b>{snapshotCarriedKg.toFixed(1)}kg · 移速 {snapshotSpeedPct}%</b></span>
              <em>Q 键循环切换</em>
            </div>
            {loadoutOpen === null ? (
              <div className="loadout-columns">
                <section className="loadout-column">
                  <div className="shop-section-label"><b>主武器 · 枪械 1</b><span>点击进入选择界面更换</span></div>
                  <button className="weapon-card loadout-card loadout-current selected" onClick={() => { sound.uiClick(); setLoadoutOpen("primary"); }}>
                    <WeaponPreview weapon={snapshot.loadout[0]} />
                    <strong>{WEAPONS[snapshot.loadout[0]].name}</strong>
                    <span className="weapon-price">主枪位装备中 · 点击更换</span>
                  </button>
                </section>
                <section className="loadout-column">
                  <div className="shop-section-label"><b>副武器 · 枪械 2</b><span>点击进入选择界面更换</span></div>
                  <button className="weapon-card loadout-card loadout-current selected" onClick={() => { sound.uiClick(); setLoadoutOpen("secondary"); }}>
                    <WeaponPreview weapon={snapshot.loadout[1]} />
                    <strong>{WEAPONS[snapshot.loadout[1]].name}</strong>
                    <span className="weapon-price">副枪位装备中 · 点击更换</span>
                  </button>
                </section>
                <section className="loadout-column">
                  <div className="shop-section-label"><b>近战武器</b><span>点击进入选择界面更换</span></div>
                  <button className="weapon-card loadout-card loadout-current selected" onClick={() => { sound.uiClick(); setLoadoutOpen("melee"); }}>
                    <WeaponPreview weapon={snapshot.melee} />
                    <strong>{WEAPONS[snapshot.melee].name}</strong>
                    <span className="weapon-price">近战位装备中 · 点击更换</span>
                  </button>
                </section>
                <section className="loadout-column loadout-column-stack">
                  <div className="loadout-stack-group">
                    <div className="shop-section-label"><b>战斗服</b><span>点击进入选择界面更换</span></div>
                    <button className={`armor-card loadout-card loadout-current selected`} onClick={() => { sound.uiClick(); setLoadoutOpen("armor"); }}>
                      <div className="armor-figure" aria-hidden="true">
                        <i className={`armor-head ${ARMORS[snapshot.armor].helmet}`} style={{ backgroundColor: ARMORS[snapshot.armor].accent }} />
                        <i className="armor-body" style={{ backgroundColor: ARMORS[snapshot.armor].torso, borderColor: ARMORS[snapshot.armor].accent }} />
                        <i className="armor-legs" style={{ backgroundColor: ARMORS[snapshot.armor].pants }} />
                      </div>
                      <div><strong>{ARMORS[snapshot.armor].name}</strong><span>最大生命 {ARMORS[snapshot.armor].maxHp} HP · 重 {ARMORS[snapshot.armor].weightKg}kg</span></div>
                      <em>已装备 · 点击更换</em>
                    </button>
                  </div>
                  <div className="loadout-stack-group">
                    <div className="shop-section-label"><b>搭档</b><span>点击进入选择界面更换</span></div>
                    <button className={`item-card partner-card loadout-card loadout-current ${snapshot.partner ? "selected" : ""}`} onClick={() => { sound.uiClick(); setLoadoutOpen("partner"); }}>
                      {snapshot.partner
                        ? <PartnerPreview partner={snapshot.partner} />
                        : <span className="partner-icon" aria-hidden="true">—</span>}
                      <strong>{snapshot.partner ? PARTNERS[snapshot.partner].name : "无搭档"}</strong>
                      <em>{snapshot.partner ? "随行中 · 点击更换" : "点击选择搭档"}</em>
                    </button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="shop-content select-panel">
                <div className="shop-section-label select-title">
                  <b>{loadoutOpen === "primary" ? "选择主武器 · 枪械 1" : loadoutOpen === "secondary" ? "选择副武器 · 枪械 2" : loadoutOpen === "melee" ? "选择近战武器" : loadoutOpen === "armor" ? "选择战斗服" : "选择搭档"}</b>
                  <span>点击卡片完成更换并自动返回 · ESC 返回装备整备</span>
                </div>
                {(loadoutOpen === "primary" || loadoutOpen === "secondary") && (
                  <div className="shop-grid select-grid">
                    {loadoutGuns.map((key) => {
                      const slot = loadoutOpen === "primary" ? 0 : 1;
                      const current = snapshot.loadout[slot] === key;
                      return (
                        <button key={key} className={`weapon-card ${current ? "selected" : ""}`} onClick={() => { assignLoadoutSlot(slot, key); setLoadoutOpen(null); }}>
                          <WeaponPreview weapon={key} />
                          <strong>{WEAPONS[key].name}</strong>
                          <span className="weapon-caliber">{WEAPONS[key].caliber}</span>
                          <small>{Math.round(weaponDamage(key) * 10) / 10} 伤害 · {fireModeLabel(key)} · {WEAPON_HANDLING[key].weightKg}kg · 制动力 {Math.round(WEAPON_HANDLING[key].stopping * 100)}%</small>
                          <span className="weapon-price">{current ? "当前装备" : slot === 0 ? "点击设为主武器" : "点击设为副武器"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {loadoutOpen === "melee" && (
                  <div className="shop-grid select-grid">
                    {loadoutMelees.map((key) => (
                      <button key={key} className={`weapon-card ${snapshot.melee === key ? "selected" : ""}`} onClick={() => { assignMelee(key); setLoadoutOpen(null); }}>
                        <WeaponPreview weapon={key} />
                        <strong>{WEAPONS[key].name}</strong>
                        <span className="weapon-caliber">{WEAPONS[key].caliber}</span>
                        <small>{Math.round(weaponDamage(key) * 10) / 10} 伤害 · {WEAPON_HANDLING[key].weightKg}kg · 制动力 {Math.round(WEAPON_HANDLING[key].stopping * 100)}%</small>
                        <span className="weapon-price">{snapshot.melee === key ? "当前装备" : "点击设为近战武器"}</span>
                      </button>
                    ))}
                  </div>
                )}
                {loadoutOpen === "armor" && (
                  <div className="armor-grid armor-grid-full select-grid">
                    {loadoutArmors.map((key) => {
                      const armor = ARMORS[key];
                      return (
                        <button key={key} className={`armor-card ${snapshot.armor === key ? "selected" : ""}`} onClick={() => { assignArmor(key); setLoadoutOpen(null); }}>
                          <div className="armor-figure" aria-hidden="true">
                            <i className={`armor-head ${armor.helmet}`} style={{ backgroundColor: armor.accent }} />
                            <i className="armor-body" style={{ backgroundColor: armor.torso, borderColor: armor.accent }} />
                            <i className="armor-legs" style={{ backgroundColor: armor.pants }} />
                          </div>
                          <div><strong>{armor.name}</strong><span>最大生命 {armor.maxHp} HP · 重 {armor.weightKg}kg</span><small>{armor.description}</small></div>
                          <em>{snapshot.armor === key ? "已装备" : "点击装备"}</em>
                        </button>
                      );
                    })}
                  </div>
                )}
                {loadoutOpen === "partner" && (
                  <div className="item-grid select-grid">
                    {loadoutPartners.length === 0 && <p className="loadout-empty">尚未拥有搭档，可先在商店「搭档」页购买</p>}
                    {loadoutPartners.map((key) => (
                      <button key={key} className={`item-card partner-card ${snapshot.partner === key ? "selected" : ""}`} onClick={() => { assignPartner(key); setLoadoutOpen(null); }}>
                        <PartnerPreview partner={key} />
                        <strong>{PARTNERS[key].name}</strong>
                        <small>{PARTNERS[key].description}</small>
                        <em>{snapshot.partner === key ? "随行中" : "点击装备"}</em>
                      </button>
                    ))}
                    {snapshot.partner && (
                      <button className="item-card partner-card" onClick={() => { assignPartner(null); setLoadoutOpen(null); }}>
                        <span className="partner-icon" aria-hidden="true">—</span>
                        <strong>卸下搭档</strong>
                        <small>明天独自出战，不带随行搭档</small>
                        <em>点击卸下</em>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="shop-footer">
              {loadoutOpen === null ? (
                <>
                  <span>{rangeFree ? "靶场装备全部免费 · B 键随时返回战斗" : "配置在进入战斗后生效 · 同一把枪会被自动交换到另一枪位"}</span>
                  <div className="loadout-actions">
                    <button className="ghost-button" onClick={() => { sound.uiClick(); setLoadoutOpen(null); changeScreen("shop"); }}>返回商店</button>
                    {rangeFree
                      ? <button className="primary-button compact" onClick={resumeRange}><span>进入靶场</span><b>◎</b></button>
                      : <button className="primary-button compact" onClick={startNextDay}><span>进入第 {snapshot.day + 1} 天</span><b>→</b></button>}
                  </div>
                </>
              ) : (
                <>
                  <span>选择后自动返回装备整备 · ESC 返回</span>
                  <div className="loadout-actions">
                    <button className="ghost-button" onClick={() => { sound.uiClick(); setLoadoutOpen(null); }}>返回装备整备</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {screen === "playing" && paused && (
          <div className="pause-panel overlay-panel">
            <p className="eyebrow">行动暂停</p>
            <h2>原地待命<br /><em>{snapshot.mode === "level" ? levelTitleById(snapshot.levelId) : rangeFree ? "靶场训练" : `第 ${snapshot.day} 天`}</em></h2>
            <div className="end-actions">
              <button className="primary-button" onClick={resumeGame}><span>继续战斗</span><b>▶</b></button>
              <button className="ghost-button" onClick={() => openCodex("pause")}>僵尸图鉴</button>
              <button className="ghost-button" onClick={saveProgressAndMenu}>{snapshot.mode === "level" ? "放弃关卡，返回主菜单" : rangeFree ? "返回主菜单" : "保存并返回主菜单"}</button>
            </div>
            <small className="pause-hint">{snapshot.mode === "level" ? "按 ESC 继续 · 关卡进度不保存" : rangeFree ? "按 ESC 继续训练" : `按 ESC 继续 · 退出保存后从第 ${snapshot.day} 天重新开打`}</small>
          </div>
        )}

        {screen === "gameover" && (
          <div className="gameover-panel overlay-panel">
            {snapshot.mode === "level" ? (
              <>
                <p className="eyebrow">关卡失败</p>
                {snapshot.levelId === LEVEL8_ID ? (
                  <h2>装甲车停在高速中央<br /><em>收费站仍被尸群占据</em></h2>
                ) : snapshot.levelId === LEVEL7_ID ? (
                  <h2>围墙被尸群撕开<br /><em>物资没能送回基地</em></h2>
                ) : snapshot.levelId === LEVEL6_ID ? (
                  <h2>市政大楼仍在<br /><em>感染者的阴影之下</em></h2>
                ) : snapshot.levelId === LEVEL5_ID ? (
                  <h2>围栏倒下时<br /><em>隧道再次归于黑暗</em></h2>
                ) : snapshot.levelId === LEVEL3_ID ? (
                  <h2>基地陷落在<br /><em>黎明前的黑暗里</em></h2>
                ) : snapshot.levelId === LEVEL2_ID ? (
                  <h2>你倒在了<br /><em>加入军队的路上</em></h2>
                ) : (
                  <h2>你倒在了<br /><em>逃出小区的路上</em></h2>
                )}
                <div className="settlement-board">
                  <div className="settlement-row"><span>击杀数</span><b>{snapshot.kills}</b></div>
                </div>
                <div className="end-actions"><button className="primary-button" onClick={() => startLevel(snapshot.levelId ?? LEVEL1_ID)}><span>重玩本关</span><b>↻</b></button><button className="ghost-button" onClick={() => changeScreen("menu")}>返回菜单</button></div>
              </>
            ) : (
              <>
            <p className="eyebrow">{rangeFree ? "靶场训练结束" : "行动终止 · 本局结算"}</p>
            <h2>{rangeFree ? <>本轮击杀<br /><em>{snapshot.kills} 个目标</em></> : <>你倒在了<br /><em>第 {snapshot.day} 天</em></>}</h2>
            <div className="settlement-board">
              <div className="settlement-row"><span>击杀数</span><b>{snapshot.kills}</b></div>
              <div className="settlement-row">
                <span>爆头率</span>
                <b>{snapshot.stats.shotsHit > 0 ? `${Math.round((snapshot.stats.headshots / snapshot.stats.shotsHit) * 100)}%` : "—"}</b>
                <small>{snapshot.stats.shotsHit > 0 ? `${snapshot.stats.headshots} / ${snapshot.stats.shotsHit} 次命中` : "本局无实弹命中"}</small>
              </div>
              {!rangeFree && (
                <>
                  <div className="settlement-row"><span>存活天数</span><b>{snapshot.day} 天</b><small>最高纪录 {Math.max(bestDay, snapshot.day)} 天</small></div>
                  <div className="settlement-row settlement-coins">
                    <span>金币明细</span>
                    <div className="settlement-coin-lines">
                      <em>击杀获取 <b>◉ {snapshot.stats.coinsEarned}</b></em>
                      <em>通关奖励 <b>◉ {snapshot.stats.bonusEarned}</b></em>
                      <em>军备支出 <b>◉ {snapshot.stats.coinsSpent}</b></em>
                      <em>结余持有 <b>◉ {snapshot.coins}</b></em>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="end-actions"><button className="primary-button" onClick={() => startGame(snapshot.mode)}><span>{rangeFree ? "重新训练" : "再次出发"}</span><b>↻</b></button><button className="ghost-button" onClick={() => changeScreen("menu")}>返回菜单</button></div>
              </>
            )}
          </div>
        )}

        {screen === "levelComplete" && levelResult && (
          <div className="levelcomplete-panel overlay-panel">
            <p className="eyebrow">关卡完成 · {levelTitleById(levelResult.levelId)}</p>
            {levelResult.levelId === LEVEL8_ID ? (
              <h2>高速上的最后一辆车驶入收费站<br /><em>通往前方的道路，重新属于活着的人</em></h2>
            ) : levelResult.levelId === LEVEL7_ID ? (
              <h2>最后一箱物资装上卡车<br /><em>仓库里的希望，正在运回基地</em></h2>
            ) : levelResult.levelId === LEVEL6_ID ? (
              <h2>枪声在中央大厅停下<br /><em>这座大楼重新属于活着的人</em></h2>
            ) : levelResult.levelId === LEVEL5_ID ? (
              <h2>灯光穿透隧道的尽头<br /><em>每一个求救信号，都值得有人回应</em></h2>
            ) : levelResult.levelId === LEVEL4_ID ? (
              <h2>电台重新接通的那一刻<br /><em>人类不再是孤岛</em></h2>
            ) : levelResult.levelId === LEVEL3_ID ? (
              <h2>你守住了基地<br /><em>也看清了黑暗里的东西</em></h2>
            ) : levelResult.levelId === LEVEL2_ID ? (
              <h2>从今天起<br /><em>你不再是一个人在战斗</em></h2>
            ) : (
              <h2>你逃出了小区<br /><em>但城市已经沦陷</em></h2>
            )}
            <div className="settlement-board">
              <div className="settlement-row"><span>通关用时</span><b>{Math.floor(levelResult.timeMs / 60000)}:{String(Math.floor(levelResult.timeMs / 1000) % 60).padStart(2, "0")}</b></div>
              <div className="settlement-row"><span>击杀数</span><b>{levelResult.kills}</b></div>
            </div>
            <div className="end-actions">
              <button className="primary-button" onClick={() => startLevel(levelResult.levelId)}><span>重玩本关</span><b>↻</b></button>
              <button className="ghost-button" onClick={closeLevels}>返回主菜单</button>
            </div>
            <small className="pause-hint">{levelCompleteHint(levelResult.levelId, clearedLevels)}</small>
          </div>
        )}
      </section>

      <footer className="controls-bar">
        <div><kbd>WASD</kbd><span>移动</span></div>
        <div><kbd>鼠标左键</kbd><span>射击 / 攻击</span></div>
        <div><kbd>F</kbd><span>踢击 · 伤害并击退</span></div>
        <div><kbd>Q</kbd><span>切换携带武器</span></div>
        <div><kbd>R</kbd><span>换弹</span></div>
        <div><kbd>1–5 + 左键</kbd><span>预览并放置 / 投掷</span></div>
        <div><kbd>6</kbd><span>空袭最密集尸群</span></div>
        <div><kbd>7</kbd><span>冲击手榴弹碰炸</span></div>
        <div><kbd>B</kbd><span>靶场免费军需</span></div>
        <div><kbd>G</kbd><span>关卡丢弃武器</span></div>
        <div><kbd>鼠标右键</kbd><span>关卡拾取武器</span></div>
        <div><kbd>M</kbd><span>静音开关</span></div>
        <p>提示：路障与阔剑雷仅能放在人物身前；绿色圆圈表示投掷物落点</p>
      </footer>
    </main>
  );
}
