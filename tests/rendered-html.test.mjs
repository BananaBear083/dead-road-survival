import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished Dead Road game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>死路求生 · 2D 僵尸射击<\/title>/i);
  assert.match(html, /死路求生/);
  assert.match(html, /生存模式/);
  assert.match(html, /靶场模式/);
  assert.match(html, /最高存活/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps staged environments and articulated knockdown recovery", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(day <= 5\) return "farmland"/);
  assert.match(source, /if \(day <= 10\) return "suburb"/);
  assert.match(source, /if \(day <= 15\) return "tunnel"/);
  assert.match(source, /return "city"/);
  assert.match(source, /farmland: "农田公路"/);
  assert.match(source, /city: "沦陷城市"/);
  assert.match(source, /ZOMBIE_FALL_MS = 480/);
  assert.match(source, /ZOMBIE_RECOVER_MS = 860/);
  assert.match(source, /function zombieRecoveryLegPose/);
  assert.match(source, /function zombieRecoveryArmPose/);
  assert.match(source, /knockStartFactor = Math\.abs\(currentPose\.rotation\)/);
  assert.match(source, /knockStartLift = Math\.sin\(currentPose\.recoveryProgress/);
  assert.match(source, /refallRecoveryProgress > 0/);
  assert.match(source, /const poseFacing = knockPose\.active \? zombie\.knockFacing : zFacing/);
  assert.match(source, /zombie\.knockedDownUntil \+ ZOMBIE_RECOVER_MS/);
});

test("previews, throws, and detonates tactical items with distinct effects", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  for (const item of ["molotov", "barricade", "frag", "claymore", "flashbang", "airstrike", "impact"]) {
    assert.match(source, new RegExp(`${item}: \\{ key: "${item}"`));
  }
  assert.match(source, /function itemTargetInFront/);
  assert.match(source, /delivery: "place"/);
  assert.match(source, /const minimumX = game\.player\.x \+ \(fixedPlacement \? 90 : 120\)/);
  assert.match(source, /g\.selectedItem = g\.selectedItem === key \? null : key/);
  assert.match(source, /if \(deploySelectedItem\(performance\.now\(\)\)\) return/);
  assert.match(source, /g\.barricades\.push\(\{ id, x: target\.x, y: target\.y, hp: 100, maxHp: 100 \}\)/);
  assert.match(source, /THROW_FLIGHT_MS = 620/);
  assert.match(source, /FRAG_FUSE_MS = 2000/);
  assert.match(source, /MOLOTOV_BURN_MS = 10000/);
  assert.match(source, /function deployedItemPosition/);
  assert.match(source, /drawThrowableModel/);
  assert.match(source, /z\.debuffedUntil = Math\.max\(z\.debuffedUntil, now \+ 5000\)/);
  assert.match(source, /g\.flashUntil = Math\.max\(g\.flashUntil, now \+ 280\)/);
  assert.match(source, /const movementFactor = \(debuffed \? \.45 : 1\) \* limbMovementFactor/);
  assert.match(source, /const attackDamage = z\.attack \* \(debuffed \? \.5 : 1\) \* limbAttackFactor/);
  assert.match(source, /airstrike: \{[^\n]+damage: 520/);
  assert.match(source, /function densestZombiePoint/);
  assert.match(source, /const target = densestZombiePoint\(g\.zombies\)/);
  assert.match(source, /drawBlastEffect/);
  assert.match(source, /!event\.repeat && itemIndex >= 0/);
  assert.match(source, /function zombieInClaymoreCone/);
  assert.match(source, /const dy = zombie\.y - item\.y/);
  assert.match(source, /Math\.hypot\(z\.x - item\.x, z\.y - item\.y\)/);
  assert.doesNotMatch(source, /Math\.hypot\(z\.x - item\.x, zombieBodyY\(z\) - item\.y\)/);
  assert.match(source, /if \(z\.hp <= 0\) continue/);
  assert.match(source, /1–5、7 选择后左键确认；6 自动轰炸尸群最密集处/);
  assert.match(source, /impact: \{[^\n]+hotkey: "7"/);
  assert.match(source, /impact: \{[^\n]+impactFuse: true/);
  assert.match(source, /itemDefinition\.impactFuse && now < item\.landAt/);
  assert.match(source, /绿色圆圈表示投掷物落点/);
});

test("mixes unlockable zombie variants into the spawn pool with armor and shield rules", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  for (const kind of ["runner", "spitter", "helmet", "helmetRunner", "mutant", "army", "armyRunner", "shield", "juggernaut"]) {
    assert.match(source, new RegExp(`${kind}: \\{ unlockDay: \\d+`));
  }
  assert.match(source, /runner: \{ unlockDay: 3, weight: 26, speedFactor: 3 \}/);
  assert.match(source, /juggernaut: \{ unlockDay: 20, weight: 7, hp: 400, radius: 35, attack: 16, damageReduction: \.5 \}/);
  // 奔跑系 3 倍速与新 HP 表（头盔 200 / 突变 500 / 军队 350 / 盾兵 350）
  assert.match(source, /helmet: \{ unlockDay: 5, weight: 14, hp: 200 \}/);
  assert.match(source, /helmetRunner: \{ unlockDay: 5, weight: 10, hp: 200, speedFactor: 3 \}/);
  assert.match(source, /mutant: \{ unlockDay: 7, weight: 12, hp: 500, radius: 36 \}/);
  assert.match(source, /army: \{ unlockDay: 9, weight: 12, hp: 350, damageReduction: \.5 \}/);
  assert.match(source, /armyRunner: \{ unlockDay: 11, weight: 10, hp: 350, damageReduction: \.5, speedFactor: 3 \}/);
  assert.match(source, /shield: \{ unlockDay: 15, weight: 9, hp: 350, damageReduction: \.5 \}/);
  assert.doesNotMatch(source, /speedFactor: 2/);
  // 生成池渐进混入 + 靶场按击杀折算解锁进度
  assert.match(source, /Math\.min\(1, \(poolDay - spec\.unlockDay \+ 1\) \/ 4\)/);
  assert.match(source, /Math\.min\(20, 1 \+ Math\.floor\(g\.kills \/ 6\)\)/);
  // 穿透豁免公式与爆炸/火焰无视减免
  assert.match(source, /Math\.min\(\.8, \(\(WEAPONS\[sourceWeapon\]\.penetration \?\? 1\) - 1\) \/ 4\)/);
  assert.match(source, /z\.damageReduction > 0 && sourceWeapon/);
  // 格挡判定：头盔眼缝 / 盾牌眼平观察窗（全身金属盾）/ 重甲胸口；重甲免疫打腿倒地
  assert.match(source, /z\.kind === "helmet" \|\| z\.kind === "helmetRunner"/);
  assert.match(source, /z\.kind === "shield" && z\.shieldIntact/);
  assert.match(source, /Math\.hypot\(hit\.localX - faceDir \* 22, hit\.localY \+ 117\) > 6/);
  assert.match(source, /z\.kind !== "juggernaut" && Math\.random\(\) < \.5/);
  assert.match(source, /emitArmorSpark/);
  assert.match(source, /sound\.armorClank/);
  // 燧石66：格挡只挡直接伤害挡不住点燃（被挡下同样 ignitedAt）
  assert.match(source, /if \(WEAPONS\[sourceWeapon\]\.ignite\) z\.ignitedAt = now/);
  assert.match(source, /格挡也挡不住灼烧/);
  // 全身金属盾：共用几何（手持/落地同尺寸），落地翻倒躺平
  assert.match(source, /function drawMetalShieldBody\(ctx: CanvasRenderingContext2D, scale: number\)/);
  assert.match(source, /ctx\.translate\(facing \* 22 \* scale, -70 \* scale\)/);
  assert.match(source, /drawMetalShieldBody\(ctx, CHARACTER_SCALE\)/);
  assert.match(source, /if \(prop\.kind === "shield"\) prop\.rotation = Math\.sign\(prop\.rotation \|\| 1\) \* \(Math\.PI \/ 2\)/);
  // 踹落盾牌与地面遗留
  assert.match(source, /kind: "shield",/);
  // 呕吐僵尸：远程喷吐、不近战、绿色污渍 10 秒渐隐
  assert.match(source, /z\.kind === "spitter"/);
  assert.match(source, /sound\.vomit/);
  assert.match(source, /tint: "vomit"/);
});

test("gives the riot shield 500 HP with accumulating damage and a shattering break", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const sound = await readFile(new URL("../app/sound.ts", import.meta.url), "utf8");

  // 盾牌独立 500 HP：常量、类型字段、生成/预览初始化、信息页签说明
  assert.match(source, /const SHIELD_HP = 500/);
  assert.match(source, /shieldHp: number/);
  assert.match(source, /shieldDents: Array<\{ x: number; y: number \}>/);
  assert.match(source, /shieldHp: kind === "shield" \? SHIELD_HP : 0/);
  assert.match(source, /全身金属盾 500 HP，击碎后失效/);
  // 子弹被盾格挡 → 盾牌吃武器单发原始伤害（不吃部位倍率/僵尸减免/穿透豁免），弹孔按真实命中点累积
  assert.match(source, /z\.shieldHp -= damage/);
  assert.match(source, /hit\.localX - faceDir \* 22/);
  assert.match(source, /hit\.localY \+ 70/);
  assert.match(source, /if \(z\.shieldDents\.length > 14\) z\.shieldDents\.shift\(\)/);
  // 爆炸冲击波全额震伤盾牌（金属盾不怕火焰，燃烧/点燃不伤盾）
  assert.match(source, /爆炸冲击波全额震伤完好盾牌/);
  // HP 归零 → 碎裂：无盾化处理、金属碎片系统、音效；碎裂不产生地面遗留道具（与踹落完整盾牌路径不同）
  assert.match(source, /function shatterZombieShield/);
  assert.match(source, /z\.shieldIntact = false;\s*z\.shieldHp = 0;\s*z\.shieldDents = \[\]/);
  assert.match(source, /g\.metalShards\.push\(\{/);
  assert.match(source, /metalShards: MetalShard\[\]/);
  assert.match(source, /metalShards: \[\]/);
  assert.match(source, /g\.metalShards = g\.metalShards\.filter\(\(shard\) => shard\.until > now\)/);
  assert.match(source, /shard\.vy \+= 460 \* dt/);
  assert.match(source, /for \(const shard of g\.metalShards\) drawMetalShard\(ctx, shard, now\)/);
  assert.match(sound, /shieldShatter\(options: PlayOptions = \{\}\)/);
  assert.match(source, /sound\.shieldShatter\(\{ volume: distanceVolume/);
  // 战损视觉：弹孔 + 四档裂纹/崩边/玻璃龟裂，hash01 确定性伪随机不闪烁
  assert.match(source, /function drawShieldDamage/);
  assert.match(source, /zombie\.shieldHp > SHIELD_HP \* \.75/);
  assert.match(source, /drawShieldDamage\(ctx, zombie, scale\)/);
  assert.match(source, /hash01\(zombie\.id \* 13\.37/);
  // 踹落完整盾牌的既有机制保留（与击碎路径并存）
  assert.match(source, /蹬踹可踹落盾兵僵尸的盾牌/);
});

test("gives explosive weapons full blast visuals and zombie dismemberment", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  assert.match(source, /rpg7:[\s\S]*?blastKind: "rocket"/);
  assert.match(source, /m32:[\s\S]*?blastKind: "grenade"/);
  assert.match(source, /function emitExplosionVisuals/);
  assert.match(source, /kind === "airstrike" \|\| kind === "rocket"/);
  assert.match(source, /function detachZombieLimb/);
  assert.match(source, /missingLimbs: Set<ZombieLimb>/);
  assert.match(source, /const damageZombieFromExplosion = useCallback/);
  assert.match(source, /const detachChance = Math\.min\(\.94/);
  assert.match(source, /g\.detachedLimbs\.push|game\.detachedLimbs\.push/);
  assert.match(source, /drawDetachedLimb\(ctx, limb\)/);
  assert.match(source, /!zombie\.missingLimbs\.has\("leftArm"\)/);
  assert.match(source, /!zombie\.missingLimbs\.has\("rightLeg"\)/);
  assert.match(source, /limb\.vy \+= 460 \* dt/);
});

test("replaces M1922 with a full-scale PKM", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /m1922|M1922/);
  assert.match(source, /\| "glock17" \| "m1911" \| "pkm"/);
  assert.match(source, /pkm: \{\s*key: "pkm", name: "PKM", price: 23200/);
  assert.match(source, /caliber: "7\.62×54mmR · 100 发"/);
  assert.match(source, /glock17: 17, m1911: 7, pkm: 100/);
  assert.match(source, /if \(key === "pkm"\)/);
  assert.match(source, /pkm: \{ stockEnd: -42, receiverStart: -5, receiverEnd: 48, barrelStart: 72, muzzleX: 130 \}/);
  assert.match(source, /m1911: 216, pkm: 1192/);
  assert.match(source, /m1911: 127, pkm: 658/);
});

test("keeps killed zombies as naturally falling corpses for ten seconds", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  assert.match(source, /ZOMBIE_DEATH_FALL_MS = 1050/);
  assert.match(source, /ZOMBIE_CORPSE_MS = 10000/);
  assert.match(source, /type ZombieCorpse =/);
  assert.match(source, /corpses: ZombieCorpse\[\]/);
  assert.match(source, /waveClearedAt: number \| null/);
  assert.match(source, /function zombieDeathLegPose/);
  assert.match(source, /function zombieDeathArmPose/);
  assert.match(source, /function drawZombieCorpse/);
  assert.match(source, /function zombieRenderPose/);
  assert.match(source, /type ZombieBodyPose =/);
  assert.match(source, /startPose: deathPose\.body/);
  assert.match(source, /const stagger = easeInOut/);
  assert.match(source, /const collapse = easeInOut/);
  assert.match(source, /const fall = easeInOut/);
  assert.match(source, /const newlyKilled = g\.zombies\.filter\(\(z\) => z\.hp <= 0\)/);
  assert.match(source, /removeAt: now \+ ZOMBIE_CORPSE_MS/);
  assert.match(source, /g\.corpses = g\.corpses\.filter\(\(corpse\) => now < corpse\.removeAt\)/);
  assert.match(source, /g\.corpses = g\.corpses\.filter\(\(corpse\) => now < corpse\.removeAt\);\s*if \(screenRef\.current === "playing"\)/);
  assert.match(source, /now - g\.waveClearedAt >= ZOMBIE_DEATH_FALL_MS \+ 200/);
  assert.match(source, /for \(const corpse of g\.corpses\) drawZombieCorpse\(ctx, corpse, now\)/);
  assert.match(source, /g\.zombies\.length < 30 && now >= g\.nextSpawnAt/);
});

test("supports a free endless target-range mode", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  assert.match(source, /type GameMode = "survival" \| "range" \| "level"/);
  assert.match(source, /startGame\("range"\)/);
  assert.match(source, /function shopCost\(mode: GameMode, listedPrice: number\)/);
  assert.match(source, /return mode === "range" \? 0 : listedPrice/);
  assert.match(source, /function completePurchase\(game: GameState/);
  assert.match(source, /key === "b" && !event\.repeat/);
  assert.match(source, /g\.zombies\.length < 30 && now >= g\.nextSpawnAt/);
  assert.match(source, /g\.mode === "survival" && g\.spawned >= g\.waveTotal/);
  assert.match(source, /装备免费 · 无尽僵尸/);
  assert.match(source, /B 键返回靶场/);
});

test("range shop configures batch zombie spawns per kind", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  // GameState 批次字段与 freshState 默认值
  assert.match(source, /rangeSpawnMode: "endless" \| "batch"/);
  assert.match(source, /rangeSpawnQueue: ZombieKind\[\]/);
  assert.match(source, /rangeBatchTotal: number/);
  assert.match(source, /rangeSpawnMode: "endless",\s*rangeSpawnQueue: \[\],\s*rangeBatchTotal: 0,/);
  // 11 个品种的信息表与配置顺序
  assert.match(source, /const ZOMBIE_KIND_INFO: Record<ZombieKind/);
  for (const kind of ["normal", "brute", "runner", "spitter", "helmet", "helmetRunner", "mutant", "army", "armyRunner", "shield", "juggernaut"]) {
    assert.match(source, new RegExp(`${kind}: \\{ name: "`));
  }
  assert.match(source, /const ZOMBIE_CONFIG_KINDS = Object\.keys\(ZOMBIE_KIND_INFO\) as ZombieKind\[\]/);
  // spawnZombie 指定种类直通（跳过 brute roll 与池抽取）
  assert.match(source, /forcedKind\?: ZombieKind/);
  assert.match(source, /forcedKind \?\? \(brute \? "brute" : "normal"\)/);
  // 帧循环批次分支：队列逐个 shift 生成，场上 30 上限共用
  assert.match(source, /g\.rangeSpawnMode === "batch"/);
  assert.match(source, /const forcedKind = g\.rangeSpawnQueue\.shift\(\)/);
  assert.match(source, /spawnZombie\(g, now, forcedKind\)/);
  // HUD 批次文案与清剿完毕提示
  assert.match(source, /配置批次 \$\{g\.rangeBatchTotal - g\.rangeSpawnQueue\.length - g\.zombies\.length\}/);
  assert.match(source, /批次已清剿完毕 · 按 B 配置下一批/);
  assert.match(source, /无尽目标 · 场上/);
  // 页签（仅靶场渲染）、步进器 0–30 与 UI state
  assert.match(source, /\| "partners" \| "zombies"/);
  assert.match(source, /\{rangeFree && \(\s*<button className=\{shopTab === "zombies"/);
  assert.match(source, /const \[spawnCounts, setSpawnCounts\] = useState<Record<ZombieKind, number>>/);
  assert.match(source, /Math\.max\(0, current\[kind\] - 1\)/);
  assert.match(source, /Math\.min\(30, current\[kind\] \+ 1\)/);
  assert.match(source, /按配置生成一批（将清场）/);
  assert.match(source, /恢复无尽模式/);
  // 批次动作：展开配置、Fisher-Yates 打乱、清场后回战斗；恢复无尽清空批次
  assert.match(source, /const applyRangeSpawnBatch = useCallback/);
  assert.match(source, /Math\.floor\(Math\.random\(\) \* \(i \+ 1\)\)/);
  assert.match(source, /g\.rangeSpawnQueue = queue;\s*g\.rangeBatchTotal = queue\.length;\s*g\.zombies = \[\];\s*g\.corpses = \[\];\s*g\.spits = \[\];/);
  assert.match(source, /const resumeRangeEndless = useCallback/);
  // 品种预览组件与服装缓存
  assert.match(source, /function ZombieKindPreview\(\{ kind, width = 150, height = 200, className = "spawn-preview" \}: \{ kind: ZombieKind; width\?: number; height\?: number; className\?: string \}\)/);
  assert.match(source, /const PREVIEW_OUTFITS = new Map<ZombieKind, ZombieOutfit>\(\)/);
});

test("fills any screen aspect ratio with a dynamic world width", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  // 常量与 GameState 字段：高恒 720、宽 = 720 × 舞台实际比例（精确比例不夹取 → 零拉伸）
  assert.match(source, /const DEFAULT_WORLD_W = 1280/);
  assert.doesNotMatch(source, /const MIN_WORLD_W|const MAX_WORLD_W/);
  assert.match(source, /worldW: number/);
  assert.match(source, /freshState = \(mode: GameMode = "survival", worldW: number = DEFAULT_WORLD_W\)/);
  assert.doesNotMatch(source, /const W = 1280/);
  // ResizeObserver：实测舞台比例 → 更新 worldW + 重映射实体 + 重设位图宽
  assert.match(source, /new ResizeObserver\(applyStageSize\)/);
  assert.match(source, /Math\.round\(\(H \* rect\.width\) \/ rect\.height\)/);
  assert.match(source, /function remapWorldX\(g: GameState, factor: number\)/);
  assert.match(source, /remapWorldX\(g, nextW \/ g\.worldW\)/);
  assert.match(source, /g\.worldW = nextW/);
  assert.match(source, /width=\{canvasW\}/);
  // 开局/续档沿用当前世界宽度，背景与绘制走动态宽度
  assert.match(source, /freshState\(mode, worldWRef\.current\)/);
  assert.match(source, /freshState\("survival", worldWRef\.current\)/);
  assert.match(source, /drawBackground\(ctx, g\.day, g\.worldW\)/);
  assert.match(source, /const W = g\.worldW/);
  // 生成位置/玩家钳制/鼠标换算随动态宽度
  assert.match(source, /x: g\.worldW \+ 45 \+ Math\.random\(\) \* 130/);
  assert.match(source, /Math\.min\(g\.worldW - 52, p\.x/);
  assert.match(source, /\* canvas\.width/);
  // 极端窄屏：HUD 与快捷栏缩放兜底（画布本身不拉伸）；聚焦不触发页面滚动
  assert.match(source, /const hudScale = Math\.min\(1, W \/ 700\)/);
  assert.match(source, /const itemBarScale = Math\.min\(1, \(W - 16\) \/ itemBarWidth\)/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  // CSS：舞台填满网格区域且不设 16:9/宽度上限（黑边消除）；画布绝对定位不撑破轨道（无页面滚动）
  assert.match(css, /\.game-stage \{[^}]*width: 100%;[^}]*height: 100%;[^}]*min-width: 0;[^}]*min-height: 0;/);
  assert.match(css, /\.game-stage > canvas \{ position: absolute; inset: 0;/);
  assert.match(css, /body \{[^}]*overflow: hidden; \}/);
  assert.doesNotMatch(css, /\.game-stage \{[^}]*aspect-ratio/);
  assert.doesNotMatch(css, /1420px/);
});

test("expands menu/shop/loadout panels by hiding the key-hint bar outside battle", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  // 非战斗界面隐藏底栏 + 紧凑页头，舞台面板向下扩展；战斗/暂停（screen === "playing"）几何不变
  assert.match(source, /const panelMode = screen !== "playing"/);
  assert.match(source, /className=\{`game-shell \$\{panelMode \? "panel-mode" : ""\}`\}/);
  assert.match(css, /\.panel-mode \.controls-bar \{ display: none; \}/);
  assert.match(css, /\.panel-mode \.masthead \{ height: 52px; \}/);
  // 底栏按键条全局压缩（60px）
  assert.match(css, /\.controls-bar \{ min-height: 60px/);
  // 防重叠：按钮组换行 + 菜单装饰不拦截点击
  assert.match(css, /\.shop-footer \{ flex-wrap: wrap/);
  assert.match(css, /\.menu-actions \{ flex-wrap: wrap/);
  assert.match(css, /\.end-actions \{ flex-wrap: wrap/);
  assert.match(css, /\.menu-panel::after \{ pointer-events: none; \}/);
});

test("aligns loadout columns to the top with a uniform label-to-card rhythm", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  // 顶端对齐：不再有钉底 margin-top:auto（栏内卡片与堆叠栏搭档组均已移除）
  assert.doesNotMatch(css, /loadout-current:last-child \{ margin-top: auto/);
  assert.doesNotMatch(css, /loadout-stack-group:last-child \{ margin-top: auto/);
  // 堆叠栏两组顶端顺排，标签两行提示与其它栏一致（不再隐藏 span → 卡片顶部同线）
  assert.match(css, /\.loadout-column-stack \{ display: flex; flex-direction: column; gap: 8px; min-height: 0; justify-content: flex-start; \}/);
  assert.match(css, /\.loadout-stack-group \{ display: flex; flex: 0 0 auto; flex-direction: column; \}/);
  assert.doesNotMatch(css, /\.loadout-stack-group \.shop-section-label span \{ display: none/);
  // 标签→卡片间距统一为 6px
  assert.match(css, /\.loadout-current \{ margin-top: 6px; \}/);
});

test("tracks seen zombies in localStorage and pages through the codex book", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  // Screen 与入口：主菜单书本按钮 + 暂停面板入口
  assert.match(source, /"menu" \| "playing" \| "shop" \| "loadout" \| "gameover" \| "codex"/);
  assert.match(source, /codex-book-button/);
  assert.match(source, /openCodex\("menu"\)/);
  assert.match(source, /openCodex\("pause"\)/);
  // 见过记录：独立 localStorage key，生存模式生成即登记（靶场不计入），死亡/重开不清除
  assert.match(source, /const CODEX_KEY = "dead-road-codex-seen"/);
  assert.match(source, /function readSeenZombies\(\): ZombieKind\[\]/);
  assert.match(source, /function markZombieSeen\(kind: ZombieKind\): boolean/);
  assert.match(source, /g\.mode === "survival" && markZombieSeen\(kind\)/);
  // 水合安全：state 初始为空、effect 中经 queueMicrotask 读取 localStorage（与 bestDay 同一模式）
  assert.match(source, /useState<ZombieKind\[\]>\(\[\]\)/);
  assert.match(source, /queueMicrotask\(\(\) => \{ if \(active\) setSeenKinds\(readSeenZombies\(\)\); \}\)/);
  // 一页一种：图鉴只列出已见过的种类，简介覆盖全部 11 种
  assert.match(source, /const codexSeenList = ZOMBIE_CONFIG_KINDS\.filter\(\(kind\) => seenKinds\.includes\(kind\)\)/);
  assert.match(source, /const CODEX_DESCRIPTIONS: Record<ZombieKind, string>/);
  for (const kind of ["normal", "brute", "runner", "spitter", "helmet", "helmetRunner", "mutant", "army", "armyRunner", "shield", "juggernaut"]) {
    assert.match(source, new RegExp(`  ${kind}: "`));
  }
  // 页面内容：首次出现天数 / HP / 速度 / 特性 + 大图预览（复用建模渲染，图鉴专用大画布）
  assert.match(source, /第 \{ZOMBIE_KIND_INFO\[codexSeenList\[codexPage\]\]\.unlockDay\} 天/);
  assert.match(source, /<ZombieKindPreview kind=\{codexSeenList\[codexPage\]\} width=\{220\} height=\{300\} className="codex-preview" \/>/);
  // 翻页：左右按钮 + 方向键，页码指示"3 / 12"式
  assert.match(source, /\{codexPage \+ 1\} \/ \{codexSeenList\.length\}/);
  assert.match(source, /flipCodex\(key === "arrowleft" \? -1 : 1\)/);
  assert.match(source, /disabled=\{codexPage >= codexSeenList\.length - 1\}/);
  // ESC 返回来源界面（菜单/暂停）
  assert.match(source, /screenRef\.current === "codex"/);
  assert.match(source, /changeScreen\(codexReturn === "pause" \? "playing" : "menu"\)/);
  // 空图鉴占位
  assert.match(source, /档案空白/);
  // CSS：书本入口与摊开书本面板，自身适配舞台不溢出
  assert.match(css, /\.codex-book-button/);
  assert.match(css, /\.codex-book-spine/);
  assert.match(css, /\.codex-panel \{[^}]*overflow: hidden/);
  assert.match(css, /\.codex-book \{[^}]*max-height: 100%;[^}]*overflow: hidden/);
  assert.match(css, /\.codex-flip/);
  assert.match(css, /\.codex-pageno/);
});

test("advertises a coming-soon campaign mode with its own screen and placeholder levels", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const response = await render();
  const html = await response.text();

  // 主菜单第三模式入口（SSR HTML 可见）与涵盖三模式的新标语；旧标语移除
  assert.match(html, /关卡模式/);
  assert.match(html, /独立关卡 · 剧情推进/);
  assert.match(html, /三条路，通向同一个天亮/);
  assert.doesNotMatch(source, /然后再多活一天/);
  // 独立 screen 类型与占位数据模型（预留关卡选择结构）
  assert.match(source, /"menu" \| "playing" \| "shop" \| "loadout" \| "gameover" \| "codex" \| "levels"/);
  assert.match(source, /type LevelDef = \{/);
  assert.match(source, /const LEVEL_DEFS: LevelDef\[\] = \[/);
  assert.match(source, /unlockedByDay: number/);
  // 占位页：敬请期待 + 禁用态占位关卡卡 + 返回按钮
  assert.match(source, /敬请期待/);
  assert.match(source, /aria-disabled="true"/);
  assert.match(source, /制作中/);
  assert.match(source, /LEVEL_DEFS\.map\(\(level\) => level\.playable \?/);
  assert.match(source, /返回主菜单/);
  // 打开/关闭与 ESC 返回主菜单
  assert.match(source, /const openLevels = useCallback/);
  assert.match(source, /changeScreen\("levels"\)/);
  assert.match(source, /const closeLevels = useCallback/);
  assert.match(source, /screenRef\.current === "levels"/);
  // CSS：入口按钮（暗金同构 range-button）与占位页；移动端按钮适配
  assert.match(css, /\.level-button \{/);
  assert.match(css, /\.levels-panel \{/);
  assert.match(css, /\.level-card \{/);
  assert.match(css, /\.level-badge \{/);
  assert.match(css, /\.primary-button, \.range-button, \.level-button \{/);
});

test("level mode: playable escape-home level with scenes, tasks, camera and pickups", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const sound = await readFile(new URL("../app/sound.ts", import.meta.url), "utf8");

  // 拳脚武器：近战体系一员、不进商店、不绘制模型（赤手空拳）
  assert.match(source, /\| "fists"/);
  assert.match(source, /fists: \{\s*key: "fists"/);
  assert.match(source, /MELEE_WEAPONS[^;]*"fists"/s);
  assert.match(source, /\.filter\(\(key\) => key !== "fists"\)/);
  assert.match(source, /if \(key === "fists"\) return;/);
  // 第 1 关定义：可玩、三场景数据模型
  assert.match(source, /id: "level-escape-home"/);
  assert.match(source, /title: "逃出小区"/);
  assert.match(source, /playable: true/);
  assert.match(source, /const LEVEL1_SCENES: LevelSceneDef\[\] = \[/);
  assert.match(source, /type LevelPickup = \{/);
  assert.match(source, /type LevelObstacle = \{/);
  assert.match(source, /type LevelRunState = \{/);
  // GameState 关卡字段与 freshState 初始化
  assert.match(source, /cameraX: number/);
  assert.match(source, /level: LevelRunState \| null/);
  assert.match(source, /pickups: LevelPickup\[\]/);
  assert.match(source, /obstacles: LevelObstacle\[\]/);
  // 场景加载/预置僵尸/障碍碰撞/任务文案
  assert.match(source, /function loadLevelScene\(/);
  assert.match(source, /function makeLevelZombie\(/);
  assert.match(source, /function collideObstacles\(/);
  assert.match(source, /function levelTaskText\(/);
  assert.match(source, /拾取桌上的水果刀（走近后按右键）/);
  assert.match(source, /找到大门（消灭拦路的僵尸）/);
  assert.match(source, /消灭街道上的僵尸/);
  assert.match(source, /到保安亭拾取格洛克 17（右键拾取）/);
  // 跟随镜头：世界平移 + 鼠标世界坐标换算 + 摄像机钳制
  assert.match(source, /ctx\.translate\(-g\.cameraX, 0\)/);
  assert.match(source, /mouseRef\.current\.x \+ g\.cameraX - p\.x/);
  assert.match(source, /g\.cameraX = Math\.max\(0, Math\.min\(g\.worldW - viewW, p\.x - viewW \* 0\.42\)\)/);
  // drawWorld 背景按关卡分发；HUD 按画布宽
  assert.match(source, /const W = ctx\.canvas\.width/);
  assert.match(source, /if \(g\.mode === "level"\) drawLevelBackground\(ctx, g, now\)/);
  assert.match(source, /if \(g\.mode === "level"\) drawLevelProps\(ctx, g, now\)/);
  // 场景绘制函数与写实道具
  assert.match(source, /function drawLevelHome\(/);
  assert.match(source, /function drawLevelCorridor\(/);
  assert.match(source, /function drawLevelStreet\(/);
  assert.match(source, /function drawWreckedCar\(/);
  // 废弃车辆伪 3D：明暗派生体色 + 受光顶面挤出 + 玻璃厚度 + 3/4 角度差异（车头端面/缺轮）
  assert.match(source, /function shadeHex\(/);
  assert.match(source, /受光顶面/);
  assert.match(source, /玻璃厚度/);
  assert.match(source, /车头端面/);
  assert.match(source, /ctx\.scale\(facing, 1\)/);
  assert.match(source, /function drawLevelPickups\(/);
  // 任务链推进：场景击杀计数、任务完成提示、通关结算
  assert.match(source, /g\.level\.sceneKills \+= 1/);
  assert.match(source, /taskDoneFlashUntil = now \+ 1600/);
  assert.match(source, /✓ 任务完成/);
  assert.match(source, /changeScreen\("levelComplete"\)/);
  assert.match(source, /const \[levelResult, setLevelResult\]/);
  assert.match(source, /screen === "levelComplete" && levelResult/);
  assert.match(source, /通关用时/);
  // G 丢弃 / 右键拾取
  assert.match(source, /key === "g" && !event\.repeat && stateRef\.current\.mode === "level"/);
  assert.match(source, /const dropWeapon = useCallback/);
  assert.match(source, /const tryPickupWeapon = useCallback/);
  assert.match(source, /e\.button === 2/);
  assert.match(source, /onContextMenu=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(source, /右键 拾取/);
  // startLevel 初始化：空手出门、无尸潮
  assert.match(source, /const startLevel = useCallback/);
  assert.match(source, /g\.waveTotal = 0/);
  assert.match(source, /g\.owned = new Set<WeaponKey>\(\["fists"\]\)/);
  assert.match(source, /onClick=\{\(\) => startLevel\(level\.id\)\}/);
  // 关卡模式金币结算守卫（waveTotal=0 不参与均摊公式）
  assert.match(source, /g\.mode === "level" \? 0 : Math\.max\(6, Math\.round\(dailyKillBudget\(g\.day\) \/ g\.waveTotal\)\)/);
  // HUD：关卡标题/任务副行/用时/隐藏道具栏
  assert.match(source, /第 1 关 · \$\{LEVEL1_TITLE\}/);
  assert.match(source, /levelTaskText\(g\)/);
  assert.match(source, /g\.mode !== "level"/);
  // 音效：任务完成上扬钟声
  assert.match(sound, /taskComplete\(options: PlayOptions = \{\}\)/);
  // CSS：可玩关卡卡与通关面板
  assert.match(css, /\.level-card-playable \{/);
  assert.match(css, /\.level-badge-go \{/);
  assert.match(css, /\.levelcomplete-panel \{/);
});
