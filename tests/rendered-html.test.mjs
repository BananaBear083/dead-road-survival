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
  assert.match(source, /juggernaut: \{ unlockDay: 18, weight: 7, hp: 500, radius: 35, attack: 16, damageReduction: \.7 \}/);
  assert.match(source, /juggernaut: \{ name: "重甲僵尸", unlockDay: 18, hp: 500, speed: "中速", trait: "仅胸口可伤、免疫打腿倒地，减免 70%；高穿透武器可削弱减伤" \}/);
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
  // 穿透豁免公式；普通护甲沿用非枪械伤害规则，第七关全身插板由专属路径覆盖
  assert.match(source, /Math\.min\(\.8, \(\(WEAPONS\[sourceWeapon\]\.penetration \?\? 1\) - 1\) \/ 4\)/);
  assert.match(source, /sourceWeapon \? armorPenBypass\(sourceWeapon\) : 0/);
  assert.match(source, /仅胸口可伤 · 减免 70% · 高穿透武器可削弱减伤/);
  // 格挡判定：头盔眼缝 / 盾牌眼平观察窗（全身金属盾）/ 重甲胸口；重甲免疫打腿倒地
  assert.match(source, /kind === "helmet" \|\| kind === "helmetRunner"/);
  assert.match(source, /kind === "shield" && shieldIntact/);
  assert.match(source, /Math\.hypot\(localX - faceDir \* 22, localY \+ 117\) > 6/);
  assert.match(source, /const JUGGERNAUT_CHEST_WEAK_HALF_WIDTH = 15/);
  assert.match(source, /const JUGGERNAUT_CHEST_WEAK_TOP_Y = -100/);
  assert.match(source, /const JUGGERNAUT_CHEST_WEAK_BOTTOM_Y = -76/);
  assert.match(source, /const JUGGERNAUT_BODY_HIT_RADIUS = 25/);
  assert.match(source, /zombie\.kind === "juggernaut" \? JUGGERNAUT_BODY_HIT_RADIUS : 18/);
  assert.match(source, /function lineCircleClosestT\(/);
  assert.match(source, /const juggernautBody = zombie\.kind === "juggernaut" && region\.region === "body"/);
  assert.match(source, /const orderT = lineCircleHitT\(/);
  assert.match(source, /t: orderT/);
  assert.match(source, /function isJuggernautChestWeakHit\(/);
  assert.match(source, /weakX \* weakX \+ weakY \* weakY <= 1/);
  assert.match(source, /isJuggernautChestWeakHit\(region, localX, localY\) \? null : "juggernaut"/);
  assert.match(source, /腹部装甲板完全覆盖/);
  assert.match(source, /z\.kind !== "juggernaut" && z\.bossKind !== "giantMutant" && Math\.random\(\) < \.5/);
  assert.match(source, /emitArmorSpark/);
  assert.match(source, /sound\.armorClank/);
  // 燧石66：格挡只挡直接伤害挡不住点燃（被挡下同样 ignitedAt）
  assert.match(source, /if \(sourceWeapon && WEAPONS\[sourceWeapon\]\.ignite\) z\.ignitedAt = now/);
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
  assert.match(source, /type WeaponKey = FirearmSoundKey/);
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
  assert.match(source, /normal: 6, brute: 0, runner: 0, spitter: 0, largeSpitter: 0, zombieDog: 0/);
  assert.match(source, /helmet: 0, helmetRunner: 0, armored: 0, armoredRunner: 0/);
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
  assert.match(source, /function ZombieKindPreview\(\{ kind, width = 150, height = 200, className = "spawn-preview"/);
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
  assert.match(source, /for \(const pickup of g\.pickups\) pickup\.x \*= factor/);
  assert.match(source, /for \(const obstacle of g\.obstacles\) obstacle\.x \*= factor/);
  assert.match(source, /for \(const npc of g\.npcs\)[\s\S]*npc\.field\.x \*= factor;[\s\S]*npc\.anchorX \*= factor/);
  assert.match(source, /g\.level\.truckX \*= factor/);
  assert.match(source, /g\.level\.truckStopX \*= factor/);
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
  assert.match(source, /className=\{`game-shell \$\{panelMode \? "panel-mode" : ""\} \$\{lotteryCinematic \? "lottery-cinematic" : ""\}`\}/);
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
  assert.match(source, /type Screen = "menu" \| "exploration" \| "playing" \| "shop" \| "loadout" \| "gameover" \| "codex"/);
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
  assert.match(source, /第 \{ZOMBIE_KIND_INFO\[activeCodexList\[codexPage\]\]\.unlockDay\} 天/);
  assert.match(source, /<ZombieKindPreview kind=\{activeCodexList\[codexPage\]\} width=\{220\} height=\{300\} className="codex-preview" \/>/);
  // 翻页：左右按钮 + 方向键，页码指示"3 / 12"式
  assert.match(source, /\{codexPage \+ 1\} \/ \{activeCodexList\.length\}/);
  assert.match(source, /flipCodex\(key === "arrowleft" \? -1 : 1\)/);
  assert.match(source, /disabled=\{codexPage >= activeCodexList\.length - 1\}/);
  // ESC 返回来源界面（菜单/暂停）
  assert.match(source, /screenRef\.current === "codex"/);
  assert.match(source, /codexReturn === "exploration" \? "exploration" : "menu"/);
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
  assert.match(source, /type Screen = "menu" \| "exploration" \| "playing" \| "shop" \| "loadout" \| "gameover" \| "codex" \| "levels"/);
  assert.match(source, /type LevelDef = \{/);
  assert.match(source, /const LEVEL_DEFS: LevelDef\[\] = \[/);
  assert.match(source, /unlockedByDay: number/);
  // 占位页：敬请期待 + 禁用态占位关卡卡 + 返回按钮
  assert.match(source, /敬请期待/);
  assert.match(source, /aria-disabled="true"/);
  assert.match(source, /制作中/);
  assert.match(source, /LEVEL_DEFS\.map\(\(level\) => \{/);
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

test("level mode: sequential unlock chain with persisted cleared-levels record", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  // 持久化：独立 localStorage 键 + 容错读取 + 去重登记（与进度存档/图鉴键互不影响）
  assert.match(source, /const LEVELS_CLEARED_KEY = "dead-road-levels-cleared"/);
  assert.match(source, /function readClearedLevels\(\): string\[\]/);
  assert.match(source, /window\.localStorage\.getItem\(LEVELS_CLEARED_KEY\)/);
  assert.match(source, /function markLevelCleared\(levelId: string\): string\[\]/);
  assert.match(source, /if \(!cleared\.includes\(levelId\)\) cleared\.push\(levelId\)/);
  // 解锁链：第一关始终可玩，第 N 关需通关第 N-1 关（按 LEVEL_DEFS 顺序）
  assert.match(source, /function isLevelUnlocked\(levelId: string, cleared: string\[\]\): boolean/);
  assert.match(source, /return index === 0 \|\| cleared\.includes\(LEVEL_DEFS\[index - 1\]\.id\)/);
  // 组件状态 + SSR 安全水合（queueMicrotask 与图鉴同款）
  assert.match(source, /const \[clearedLevels, setClearedLevels\] = useState<string\[\]>\(\[\]\)/);
  assert.match(source, /queueMicrotask\(\(\) => \{ if \(active\) setClearedLevels\(readClearedLevels\(\)\); \}\)/);
  // 通关时登记 + startLevel 解锁守卫（锁定卡片之外的第二重保险）
  assert.match(source, /setClearedLevels\(markLevelCleared\(level\.levelId\)\)/);
  assert.match(source, /if \(!isLevelUnlocked\(levelId, readClearedLevels\(\)\)\) return;/);
  // 锁定态卡片：灰化 + 🔒 提示 + 不可点击（div 非 button）；已解锁可点击；已通关 ✓ 标记与「重玩」徽章
  assert.match(source, /const unlocked = isLevelUnlocked\(level\.id, clearedLevels\)/);
  assert.match(source, /const cleared = clearedLevels\.includes\(level\.id\)/);
  assert.match(source, /className="level-card level-card-locked"/);
  assert.match(source, /🔒 通关上一关后解锁/);
  assert.match(source, /className="level-cleared-mark"/);
  assert.match(source, /\{cleared \? "重玩 →" : "开始 →"\}/);
  assert.match(source, /按 ESC 返回主菜单 · 通关上一关后解锁下一关/);
  // 结算提示联动：确实解锁才显示「已开放」，否则预告制作中
  assert.match(source, /function levelCompleteHint\(levelId: string, cleared: string\[\]\): string/);
  assert.match(source, /nextDef\?\.playable && isLevelUnlocked\(nextDef\.id, cleared\)/);
  assert.match(source, /\{levelCompleteHint\(levelResult\.levelId, clearedLevels\)\}/);
  // CSS：锁定态灰化 + 🔒 徽章 + 通关 ✓ 标记
  assert.match(css, /\.level-card-locked \{/);
  assert.match(css, /\.level-badge-lock \{/);
  assert.match(css, /\.level-cleared-mark \{/);
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
  assert.match(source, /const LEVEL1_ID = "level-escape-home"/);
  assert.match(source, /const LEVEL1_TITLE = "逃出小区"/);
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
  // 掉落武器按场景持久保存到整关结束：切场景只追加预置物，绘制/拾取只读取当前 sceneIndex
  assert.match(source, /g\.pickups\.push\(\.\.\.scene\.pickups\.map/);
  assert.match(source, /id: -\(sceneIndex \* 100 \+ i \+ 1\)/);
  assert.match(source, /filter\(\(preset\) => !g\.pickups\.some\(\(existing\) => existing\.id === preset\.id\)\)/);
  assert.match(source, /sceneIndex: g\.level\?\.sceneIndex \?\? 0/);
  assert.match(source, /pk\.sceneIndex !== g\.level\?\.sceneIndex/);
  assert.match(source, /不同槽位时只丢掉手里这一把，另一把仍保留/);
  assert.match(source, /if \(g\.loadout\[0\] === w\) g\.loadout\[0\] = "fists"/);
  assert.match(source, /const pickupSlot: 0 \| 1 = currentSlot === 1/);
  // startLevel 初始化：空手出门、无尸潮
  assert.match(source, /const startLevel = useCallback/);
  assert.match(source, /g\.waveTotal = 0/);
  assert.match(source, /g\.owned = new Set<WeaponKey>\(\["fists"\]\)/);
  assert.match(source, /onClick=\{\(\) => startLevel\(level\.id\)\}/);
  // 关卡模式金币结算守卫（waveTotal=0 不参与均摊公式）
  assert.match(source, /g\.mode === "level" \? 0 : Math\.max\(6, Math\.round\(dailyKillBudget\(g\.day\) \/ g\.waveTotal\)\)/);
  // HUD：关卡标题/任务副行/用时/隐藏道具栏
  assert.match(source, /levelTitleById\(g\.level\?\.levelId/);
  assert.match(source, /levelTaskText\(g, now\)/);
  assert.match(source, /g\.mode !== "level"/);
  // 音效：任务完成上扬钟声
  assert.match(sound, /taskComplete\(options: PlayOptions = \{\}\)/);
  // CSS：可玩关卡卡与通关面板
  assert.match(css, /\.level-card-playable \{/);
  assert.match(css, /\.level-badge-go \{/);
  assert.match(css, /\.levelcomplete-panel \{/);
});

test("level mode: join-army level with highway event, rescue squad, dialog and base", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const sound = await readFile(new URL("../app/sound.ts", import.meta.url), "utf8");

  // 02 卡替换为可玩关卡，03「防守基地」同为可玩关卡
  assert.match(source, /const LEVEL2_ID = "level-join-army"/);
  assert.match(source, /const LEVEL2_TITLE = "加入军队"/);
  assert.match(source, /\{ id: LEVEL2_ID, order: 2, title: LEVEL2_TITLE/);
  assert.match(source, /\{ id: LEVEL3_ID, order: 3, title: LEVEL3_TITLE/);
  // 双场景数据：公路（长距离跟随）与军事基地（巡逻 NPC）
  assert.match(source, /const LEVEL2_SCENES: LevelSceneDef\[\] = \[/);
  assert.match(source, /function levelScenesFor\(/);
  assert.match(source, /patrols\?: \{ fx: number; y: number \}\[\]/);
  assert.match(source, /到达加油站（击杀拦路的僵尸）/);
  assert.match(source, /活下去/);
  assert.match(source, /到达军营/);
  // 开局装备：格洛克 17 + 水果刀
  assert.match(source, /new Set<WeaponKey>\(\["fists", "glock17", "fruitknife"\]\)/);
  // 事件阶段机：伏击涌出 → 坚持倒计时 → 军车 → 士兵下车 → 对话
  assert.match(source, /eventStage: "none" \| "ambush" \| "truck" \| "soldiers" \| "dialog"/);
  assert.match(source, /const LEVEL2_AMBUSH_TOTAL = 30/);
  assert.match(source, /const LEVEL2_SURVIVE_MS = 10000/);
  assert.match(source, /const LEVEL2_SOLDIERS = 5/);
  assert.match(source, /level\.eventCount % 3 === 2 \? "helmet" : "normal"/);
  assert.match(source, /sound\.truckEngine\(\)/);
  assert.match(source, /sound\.truckBrake\(\)/);
  assert.match(source, /兄弟，我建议你加入我们。/);
  assert.match(source, /\{ speaker: "你", text: "行。" \}/);
  // NPC 体系：LevelNpc 复用搭档骨架，战斗/巡逻双模式
  assert.match(source, /type LevelNpc = \{/);
  assert.match(source, /function makeLevelNpc\(/);
  assert.match(source, /npcs: LevelNpc\[\]/);
  assert.match(source, /const updateLevelNpcs = useCallback/);
  assert.match(source, /damageZombie\(g, s\.zombie, weaponDamage\(wkey\), now, shotAngle/);
  assert.match(source, /function drawLevelSoldier\(/);
  assert.match(source, /ARMORS\.army/);
  assert.match(source, /WEAPON_HOLD\[weapon\]/);
  // 军车：伪 3D 行驶动画与音画（1.8× 与人物同比例；停靠点 = 触发时刻玩家近旁）
  assert.match(source, /function drawMilitaryTruck\(/);
  assert.match(source, /drawMilitaryTruck\(ctx, g\.level\.truckX/);
  assert.match(source, /ctx\.scale\(1\.8, 1\.8\)/);
  assert.match(source, /truckY: number;\s*truckStopX: number;/);
  assert.match(source, /level\.truckStopX = g\.player\.x \+ 30/);
  assert.match(source, /level\.truckY = Math\.max\(300, Math\.min\(470, g\.player\.y - 150\)\)/);
  assert.match(source, /g\.level\.truckY >= 0 \? g\.level\.truckY : 360/);
  // 通关文案按关定制
  assert.match(source, /但城市已经沦陷/);
  assert.match(source, /你不再是一个人在战斗/);
  assert.match(source, /已开放 · 从关卡模式进入/);
  assert.match(sound, /truckEngine\(options: PlayOptions = \{\}\)/);
  assert.match(sound, /truckBrake\(options: PlayOptions = \{\}\)/);
  // 对话框：任意键/点击推进，推进期间冻结移动射击
  assert.match(source, /function drawLevelDialog\(/);
  assert.match(source, /const advanceLevelDialog = useCallback/);
  assert.match(source, /按任意键 \/ 点击 继续/);
  assert.match(source, /level\?\.dialog\) \{\s*if \(!event\.repeat\) advanceLevelDialog\(\)/);
  assert.match(source, /levelDialogOpen/);
  // 场景绘制：公路加油站 + 军事基地 + 军营目标标记
  assert.match(source, /function drawLevelHighway\(/);
  assert.match(source, /function drawGasStation\(/);
  assert.match(source, /function drawLevelBase\(/);
  assert.match(source, /LEVEL2_BARRACKS_FX \* g\.worldW/);
  // 任务文案：击杀计数与增援倒计时
  assert.match(source, /增援抵达/);
  // 失败重试按当前关卡
  assert.match(source, /startLevel\(snapshot\.levelId \?\? LEVEL1_ID\)/);
});


test("level mode: defend-base level with night lighting, wall defense and scout", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const sound = await readFile(new URL("../app/sound.ts", import.meta.url), "utf8");

  // 03 卡替换为可玩关卡「防守基地」
  assert.match(source, /const LEVEL3_ID = "level-defend-base"/);
  assert.match(source, /const LEVEL3_TITLE = "防守基地"/);
  assert.match(source, /\{ id: LEVEL3_ID, order: 3, title: LEVEL3_TITLE, briefing: "[^"]+", unlockedByDay: 1, playable: true \}/);
  assert.match(source, /levelId !== LEVEL1_ID && levelId !== LEVEL2_ID && levelId !== LEVEL3_ID/);
  assert.match(source, /levelId === LEVEL3_ID \? LEVEL3_SCENES/);
  // 三场景数据：宿舍（开场演出）→ 外墙夜防 → 土路侦查（5 突变强壮僵尸）
  assert.match(source, /const LEVEL3_SCENES: LevelSceneDef\[\] = \[/);
  assert.match(source, /军营宿舍 · 夜/);
  assert.match(source, /基地外墙 · 夜/);
  assert.match(source, /城外土路 · 夜/);
  assert.match(source, /走出军营/);
  assert.match(source, /走到掩体后/);
  assert.match(source, /阻击第一波攻势/);
  assert.match(source, /探查（沿土路走到尽头）/);
  assert.match(source, /击杀重甲僵尸/);
  assert.match(source, /\{ kind: "mutant" as ZombieKind, fx \}/);
  // 开局装备：M16 + 格洛克 17 + 破片手榴弹 ×3 + 军队服
  assert.match(source, /g\.loadout = \["m16", "glock17"\]/);
  assert.match(source, /g\.itemInventory\.frag = 3/);
  assert.match(source, /g\.player\.armor = "army"/);
  // 开场演出：睡眠 → 警报渐强 + 屏幕渐亮 → 起身（阶段机 + 输入冻结）
  assert.match(source, /"sleep" \| "rise" \| "defend" \| "boss"/);
  assert.match(source, /const LEVEL3_WAKE_MS = 6000/);
  assert.match(source, /const LEVEL3_RISE_MS = 1400/);
  assert.match(source, /sound\.alarmCrescendo\(LEVEL3_WAKE_MS \/ 1000\)/);
  assert.match(source, /function levelInputFrozen\(/);
  assert.match(source, /function drawDormSleeper\(/);
  assert.match(sound, /alarmCrescendo\(durationSec = 6, options: PlayOptions = \{\}\)/);
  // 黑夜光照系统：暗色覆盖层 + destination-out 光洞（枪灯锥形光 / 探照灯 / 警报红光）
  assert.match(source, /function drawNightLighting\(/);
  assert.match(source, /"destination-out"/);
  assert.match(source, /function punchCone\(/);
  assert.match(source, /function punchCircle\(/);
  assert.match(source, /drawNightLighting\(ctx, g, now\)/);
  // 围墙防守：HP 500 共享池 + 射击孔 + 6 名队友钉点射击（4×M16 + PKM + 燧石66）+ 70 只（15 盾兵先锋 + 55 奔跑系 20/20/15 交错）
  assert.match(source, /const LEVEL3_WALL_HP = 500/);
  assert.match(source, /const LEVEL3_WAVE_TOTAL = 55/);
  assert.match(source, /const LEVEL3_WAVE_EVERY_MS = 640/);
  assert.match(source, /"runner", "helmetRunner", "armyRunner", "runner", "helmetRunner", "runner",/);
  // 盾兵先锋梯队：15 只最先上场（间隔 480 略密形成盾墙），随后按 640ms 节奏接 55 奔跑系；总数 70，计数/通关判定同步
  assert.match(source, /const LEVEL3_VANGUARD_TOTAL = 15/);
  assert.match(source, /const LEVEL3_VANGUARD_EVERY_MS = 480/);
  assert.match(source, /const LEVEL3_DEFEND_TOTAL = LEVEL3_VANGUARD_TOTAL \+ LEVEL3_WAVE_TOTAL/);
  assert.match(source, /const vanguard = level\.eventCount < LEVEL3_VANGUARD_TOTAL/);
  assert.match(source, /level\.eventAt \+ 900 \+ level\.eventCount \* LEVEL3_VANGUARD_EVERY_MS/);
  assert.match(source, /const kind: ZombieKind = vanguard \? "shield" : LEVEL3_WAVE_KINDS\[\(level\.eventCount - LEVEL3_VANGUARD_TOTAL\) % LEVEL3_WAVE_KINDS\.length\]/);
  assert.match(source, /level\.eventCount < LEVEL3_DEFEND_TOTAL && now >= spawnDue/);
  assert.match(source, /level\.eventCount >= LEVEL3_DEFEND_TOTAL && g\.zombies\.length === 0/);
  assert.match(source, /击杀 \$\{Math\.min\(g\.level\.sceneKills, LEVEL3_DEFEND_TOTAL\)\}\/\$\{LEVEL3_DEFEND_TOTAL\}/);
  // 关卡生成器给盾兵完整机制：金属盾 500 HP + 完好标记（与生存模式 spawnZombie 一致）
  assert.match(source, /shieldIntact: kind === "shield",\s*shieldHp: kind === "shield" \? SHIELD_HP : 0,/);
  // 本关精英僵尸（奔跑系 + 盾兵本体）HP 统一 500：仅第三关生成处覆盖（hp + maxHp），不改全局 ZOMBIE_KIND_SPECS；盾牌 500 不变
  assert.match(source, /const LEVEL3_ELITE_HP = 500/);
  assert.match(source, /const LEVEL3_ELITE_KINDS: ReadonlySet<ZombieKind> = new Set\(\["runner", "helmetRunner", "armyRunner", "shield"\]\)/);
  assert.match(source, /function applyLevel3ZombieHp\(z: Zombie\): Zombie/);
  assert.match(source, /applyLevel3ZombieHp\(makeLevelZombie\(6000 \+ level\.eventCount/);
  assert.match(source, /if \(g\.level\?\.levelId === LEVEL3_ID\) return applyLevel3ZombieHp\(zombie\)/);
  // 全局规格保持原值：奔跑=普通基数、头盔奔跑 200、军队奔跑 350、盾兵本体 350（生存/靶场/其他关卡不受影响）
  assert.match(source, /helmetRunner: \{ unlockDay: 5, weight: 10, hp: 200, speedFactor: 3 \}/);
  assert.match(source, /armyRunner: \{ unlockDay: 11, weight: 10, hp: 350, damageReduction: \.5, speedFactor: 3 \}/);
  assert.match(source, /shield: \{ unlockDay: 15, weight: 9, hp: 350, damageReduction: \.5 \}/);
  assert.match(source, /const LEVEL3_WALL_HOLES = \[280, 420, 560\]/);
  assert.match(source, /function level3WallBlock\(/);
  assert.match(source, /level\.wallHp = Math\.max\(0, LEVEL3_WALL_HP - segDamage\)/);
  assert.match(source, /if \(level\.wallHp <= 0\) \{ failLevel\(\); return; \}/);
  // 夜防编队 6 人：4 × M16 + PKM 机枪手（中路压制）+ 燧石66 狙击手（靠后狙杀高价值目标），钉点射击
  assert.match(source, /const defenseSquad: Array<\[number, number, WeaponKey\]> = \[/);
  assert.match(source, /\[-66, 280, "m16"\], \[-66, 400, "m16"\], \[-66, 460, "pkm"\],/);
  assert.match(source, /\[-66, 520, "m16"\], \[-66, 600, "m16"\], \[-150, 340, "flint66"\],/);
  assert.match(source, /g\.npcs\.push\(makeLevelNpc\(wallX \+ dx, ny, true, true, squadWeapon\)\)/);
  assert.match(source, /function makeLevelNpc\([\s\S]*?weapon: WeaponKey = "m16",[\s\S]*?\): LevelNpc/);
  assert.match(source, /field\.ammo = WEAPONS\[weapon\]\.magazine/);
  // NPC 战斗循环武器通用化：换弹/射速/后坐/射程/曳光/伤害/枪声均按手持武器
  assert.match(source, /const wkey = npc\.weapon/);
  assert.match(source, /f\.ammo = wspec\.magazine/);
  assert.match(source, /f\.reloadingUntil = now \+ wspec\.reload/);
  assert.match(source, /wspec\.fireRate \* \(wkey === "pkm" \? 1\.15 : wkey === "flint66" \? 1\.4 : 1\.6\)/);
  assert.match(source, /WEAPON_RECOIL\[wkey\]\.heat/);
  assert.match(source, /sound\.gunshot\(wkey, \{ fireRateMs, volume: 0\.5 \* distanceVolume\(f\.x, p\.x\) \}\)/);
  // 燧石66 狙击手：优先当前 HP 最高目标；穿透 5 目标沿弹道由近及远结算（点燃走 damageZombie 的 ignite）
  assert.match(source, /燧石66 狙击手优先高价值目标/);
  assert.match(source, /const pen = wspec\.penetration \?\? 1/);
  assert.match(source, /hits\.sort\(\(a, b\) => a\.impact\.t - b\.impact\.t\)/);
  assert.match(source, /for \(const s of struck\) damageZombie\(g, s\.zombie, weaponDamage\(wkey\), now, shotAngle, s\.impact, wkey\)/);
  // PKM 压制扫射带散布
  assert.match(source, /const shotAngle = f\.angle \+ \(wkey === "pkm" \? \(Math\.random\(\) - \.5\) \* \.09 : 0\)/);
  // 人物模型手持对应枪模（绘制函数按武器参数化）
  assert.match(source, /function drawLevelSoldier\(ctx: CanvasRenderingContext2D, f: PartnerField, now: number, weapon: WeaponKey = "m16"\)/);
  assert.match(source, /drawLevelSoldier\(ctx, npc\.field, now, npc\.weapon\)/);
  assert.match(source, /const hold = WEAPON_HOLD\[weapon\]/);
  assert.match(source, /drawWeaponModel\(ctx, weapon, gunScale/);
  // 剧情结构判定段只承伤不渲染路障模型（玩家自己部署的高 id 路障仍正常显示）
  assert.match(source, /function isScriptedLevelStructure\(id: number\): boolean/);
  assert.match(source, /if \(isScriptedLevelStructure\(barricade\.id\)\) continue;/);
  // 基地路灯：沿道路/围墙内侧分布，接入光照系统产生光洞
  assert.match(source, /const LEVEL3_LAMP_FX = \[0\.1, 0\.3, 0\.48\]/);
  assert.match(source, /基地路灯：写实灯杆 \+ 挑臂 \+ 发光灯头/);
  assert.match(source, /基地路灯光洞：灯头暖光 \+ 地面光池/);
  // 探照灯加亮加大 / 枪灯更远 / 队友枪灯
  assert.match(source, /punchCone\(lctx, sx, 92, ang, 1150, 0\.085, 0\.85\)/);
  assert.match(source, /p\.weapon === "m16" \? 650 : MELEE_WEAPONS\.has\(p\.weapon\) \? 0 : 290/);
  assert.match(source, /队友枪灯：每名士兵的 M16 同带锥形光束/);
  // 过渡任务「走到基地大门」：大门闸板开启 + 门洞判定段移除 + 脉冲指引
  assert.match(source, /\{ id: "reach-gate", text: "走到基地大门" \}/);
  assert.match(source, /const LEVEL3_GATE_TOP = 462/);
  assert.match(source, /const LEVEL3_GATE_BOTTOM = 578/);
  assert.match(source, /大门开启后（任务推进到「走到基地大门」），门洞可通行\/射击/);
  assert.match(source, /基地大门/);
  // 土路侦查：5 突变 + 重甲僵尸 boss（复用生存机制）+ 手雷提示
  assert.match(source, /const LEVEL3_MUTANTS = 5/);
  assert.match(source, /makeLevelZombie\(6999, "juggernaut"/);
  assert.match(source, /破片手榴弹 ×\$\{g\.itemInventory\.frag\}（按 3 选择 · 左键投掷）/);
  // 警报声真实化：缓慢起伏 wail + 失谐层 + 低八度厚度层
  assert.match(sound, /from: 400, to: 690/);
  assert.match(sound, /from: 404, to: 697/);
  assert.match(sound, /type: "triangle", from: 200, to: 345/);
  // 通关/失败文案按关定制
  assert.match(source, /你守住了基地/);
  assert.match(source, /也看清了黑暗里的东西/);
  assert.match(source, /新关卡正在制作中，敬请期待/);
  assert.match(source, /基地陷落在/);
  assert.match(source, /黎明前的黑暗里/);
});

test("level mode: capture-radio level with briefing dialog, truck ride, floor clears, roof defense and custom completion", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  // 关卡定义：04「占领电台」可玩并连接可玩的第五关；纳入解锁链（通关第三关解锁）与场景/入场守卫
  assert.match(source, /const LEVEL4_ID = "level-capture-radio"/);
  assert.match(source, /const LEVEL4_TITLE = "占领电台"/);
  assert.match(source, /\{ id: LEVEL4_ID, order: 4, title: LEVEL4_TITLE, briefing: "[^"]+", unlockedByDay: 1, playable: true \}/);
  assert.match(source, /\{ id: LEVEL5_ID, order: 5, title: LEVEL5_TITLE, briefing: "[^"]+", unlockedByDay: 1, playable: true \}/);
  assert.match(source, /levelId === LEVEL5_ID \? LEVEL5_SCENES : levelId === LEVEL4_ID \? LEVEL4_SCENES/);
  assert.match(source, /levelId !== LEVEL1_ID && levelId !== LEVEL2_ID && levelId !== LEVEL3_ID && levelId !== LEVEL4_ID && levelId !== LEVEL5_ID/);
  // 开局配置：SCAR-H + 格洛克 17 + 军队服（同第三关装甲）
  assert.match(source, /g\.owned = new Set<WeaponKey>\(\["fists", "scarh", "glock17"\]\)/);
  assert.match(source, /g\.loadout = \["scarh", "glock17"\]/);
  // 九场景结构：商讨室 → 基地集合区 → 电台门口 → 一层 → 楼梯间 → 二层 → 楼梯间 → 天台 → 通讯设备区
  assert.match(source, /const LEVEL4_SCENES: LevelSceneDef\[\] = \[/);
  assert.match(source, /name: "军事基地 · 商讨室"/);
  assert.match(source, /name: "军事基地 · 集合区"/);
  assert.match(source, /name: "电台门口 · 白天"/);
  assert.match(source, /name: "电台 · 一层走廊"/);
  assert.match(source, /name: "电台 · 二层走廊"/);
  assert.match(source, /name: "天台 · 白天"/);
  assert.match(source, /name: "天台 · 通讯设备区"/);
  assert.match(source, /\{ id: "find-teammate", text: "找到队友（走到会议桌旁）" \}/);
  assert.match(source, /\{ id: "leave-briefing", text: "走出商讨室" \}/);
  assert.match(source, /\{ id: "board-truck", text: "上车（走到基地大门）" \}/);
  assert.match(source, /\{ id: "breach", text: "突破（单人进入电台通讯基地）" \}/);
  // 场景 0：桌旁商讨对话（占领电台 / 10 分钟后集合）→ 走出房门后才切换独立室外集合区
  assert.match(source, /\{ speaker: "队友", text: "我们接到一个任务，占领电台。" \}/);
  assert.match(source, /\{ speaker: "队友", text: "10 分钟后集合。" \}/);
  assert.match(source, /level\.eventStage = "talk"/);
  assert.match(source, /task\.id === "leave-briefing" && g\.player\.x >= g\.worldW - 120\) goScene\(1\)/);
  assert.match(source, /const roomW = W/);
  assert.match(source, /function drawLevel4BaseYard\(/);
  // 场景 1：基地集合区走到大门上车
  assert.match(source, /g\.player\.x >= LEVEL4_GATE_FX \* g\.worldW - 90/);
  assert.match(source, /goScene\(2\);\s+level\.eventStage = "ride"/);
  // 场景 2：军车缓出刹停；停车后延迟 650ms 才显示玩家，随后 4 名 M16 队友下车留守
  assert.match(source, /level\.eventStage = "ride"/);
  assert.match(source, /const LEVEL4_TRUCK_STOP_FX = 0\.68/);
  assert.match(source, /const LEVEL4_PLAYER_EXIT_DELAY_MS = 650/);
  assert.match(source, /const t = Math\.min\(1, \(now - level\.eventAt\) \/ 2800\)/);
  assert.match(source, /sound\.truckEngine\(\)/);
  assert.match(source, /sound\.truckBrake\(\)/);
  assert.match(source, /const LEVEL4_SQUAD = 4/);
  assert.match(source, /if \(now < level\.eventAt \+ LEVEL4_PLAYER_EXIT_DELAY_MS\) return/);
  assert.match(source, /g\.player\.x = level\.truckX \+ 115/);
  assert.match(source, /g\.npcs\.push\(makeLevelNpc\(level\.truckX \+ 70, disembarkY, true, true\)\)/);
  assert.match(source, /function levelPlayerHidden\(g: GameState, now: number\)/);
  assert.match(source, /level\.eventStage === "ride" \|\| \(level\.eventStage === "disembark" && now < level\.eventAt \+ LEVEL4_PLAYER_EXIT_DELAY_MS\)/);
  assert.match(source, /g\.player\.x >= LEVEL4_STATION_DOOR_FX \* g\.worldW - 40/);
  assert.match(source, /goScene\(3\)/);
  // 场景 3/5：一层 5 突变 + 5 头盔奔跑 + 5 军队；二层 5 盾兵 + 5 军队奔跑 + 5 军队；楼梯间过渡
  assert.match(source, /const LEVEL4_FLOOR1_TOTAL = 15/);
  assert.match(source, /const LEVEL4_FLOOR2_TOTAL = 15/);
  assert.match(source, /name: "楼梯间"/);
  assert.match(source, /\{ id: "climb-1", text: "上楼（前往二层）" \}/);
  assert.match(source, /\{ id: "climb-2", text: "上楼（前往天台）" \}/);
  assert.match(source, /task\.id === "clear-floor-1" && level\.sceneKills >= LEVEL4_FLOOR1_TOTAL && g\.player\.x >= g\.worldW - 130/);
  assert.match(source, /task\.id === "clear-floor-2" && level\.sceneKills >= LEVEL4_FLOOR2_TOTAL && g\.player\.x >= g\.worldW - 130/);
  // 场景 7：天台 1 只重甲僵尸（沿用 kill-juggernaut 任务体系）
  assert.match(source, /zombies: \[\{ kind: "juggernaut" as ZombieKind, fx: 0\.62 \}\]/);
  // 场景 8 防守战：30 军队奔跑自右冲击、设备 HP 500 共享池、20 秒维修倒计时、失败判定与通关
  assert.match(source, /const LEVEL4_DEFEND_TOTAL = 30/);
  assert.match(source, /const LEVEL4_DEFEND_EVERY_MS = 600/);
  assert.match(source, /const LEVEL4_EQUIP_HP = 500/);
  assert.match(source, /const LEVEL4_EQUIP_ID = 92000/);
  assert.match(source, /const LEVEL4_REPAIR_MS = 20000/);
  assert.match(source, /g\.zombies\.push\(makeLevelZombie\(8000 \+ level\.eventCount, "armyRunner"/);
  assert.match(source, /g\.level\.wallHp = Math\.max\(0, g\.level\.wallHp - attackDamage\)/);
  assert.match(source, /if \(level\.wallHp <= 0\) \{ failLevel\(\); return; \}/);
  assert.match(source, /if \(level\.wallHp > 0 && now - level\.eventAt >= LEVEL4_REPAIR_MS\) completeLevel\(\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(source, /shiftTimeline\(stateRef\.current, now - hiddenAt\)/);
  assert.match(source, /screenRef\.current === "playing" && !pausedRef\.current/);
  // 3 名 M16 队友戒备 + 1 名队友驻守维修（非战斗 hold 钉在设备旁）
  assert.match(source, /g\.npcs\.push\(makeLevelNpc\(equipX - 150, ny, true, true\)\)/);
  assert.match(source, /g\.npcs\.push\(makeLevelNpc\(equipX - 52, 470, false, true\)\)/);
  assert.match(source, /驻守型（非战斗 hold，如第四关维修通讯设备的队友）/);
  // 玩家防守位钳制：不越过设备线
  assert.match(source, /p\.x = Math\.min\(p\.x, LEVEL4_EQUIP_FX \* g\.worldW - 60\)/);
  // HUD：楼层击杀计数 + 维修倒计时与设备 HP
  assert.match(source, /task\.id === "clear-floor-1" \|\| task\.id === "clear-floor-2"/);
  assert.match(source, /维修剩余 \$\{remain\} 秒 · 设备 \$\{Math\.ceil\(g\.level\.wallHp\)\} HP/);
  // 场景绘制：封闭商讨室/独立基地集合区/电台门口/金属白走廊/楼梯间/天台/设备区；白天（黑夜光照仅第三关）
  assert.match(source, /function drawLevel4Briefing\(/);
  assert.match(source, /function drawLevel4BaseYard\(/);
  assert.match(source, /function drawLevel4StationGate\(/);
  assert.match(source, /function drawLevel4Floor\(ctx: CanvasRenderingContext2D, g: GameState, now: number, floorNo: number\)/);
  assert.match(source, /function drawLevel4Stairwell\(ctx: CanvasRenderingContext2D, g: GameState, nextFloor: number\)/);
  assert.match(source, /function drawLevel4Roof\(/);
  assert.match(source, /function drawLevel4RoofDefense\(/);
  assert.match(source, /#aab4be/);
  assert.match(source, /const level3Night = level\.levelId === LEVEL3_ID/);
  // 完整建模：商讨室覆盖整个独立场景；电台地面先画、不会遮住放大后的主楼；楼梯间绘制与可走轨迹共用常量
  assert.match(source, /const roomW = W/);
  assert.match(source, /drawText\(ctx, "基地通讯席"/);
  assert.match(source, /const bw = 900/);
  assert.match(source, /const buildingTop = 32/);
  assert.match(source, /const buildingBottom = 420/);
  assert.match(source, /const roofEquipmentY = buildingTop - 8/);
  assert.match(source, /const towerTop = 8/);
  assert.match(source, /drawText\(ctx, "供电与发射机房"/);
  const stationStart = source.indexOf("function drawLevel4StationGate");
  const stationEnd = source.indexOf("function drawLevel4Floor", stationStart);
  const stationSource = source.slice(stationStart, stationEnd);
  const groundIndex = stationSource.indexOf("const ground =");
  const buildingIndex = stationSource.indexOf("const doorX =");
  assert.ok(groundIndex >= 0 && buildingIndex >= 0 && groundIndex < buildingIndex, "电台地面应先于主楼绘制，避免遮住门厅和一层");
  assert.match(source, /两跑平台楼梯/);
  assert.match(source, /const LEVEL4_STAIR_LOWER_START_FX = 0\.08/);
  assert.match(source, /const LEVEL4_STAIR_LANDING_FX = 0\.43/);
  assert.match(source, /const LEVEL4_STAIR_EXIT_Y = 340/);
  assert.match(source, /const LEVEL4_STAIR_MIN_WORLD_W = 620/);
  assert.match(source, /function level4StairFootY\(worldW: number, x: number\)/);
  assert.match(source, /Math\.floor\(\(\(x - lowerStart\) \/ Math\.max\(1, landingStart - lowerStart\)\) \* steps\)/);
  assert.match(source, /Math\.floor\(\(\(x - landingEnd\) \/ Math\.max\(1, upperEnd - landingEnd\)\) \* steps\)/);
  assert.match(source, /p\.y = level4StairFootY\(g\.worldW, p\.x\)/);
  assert.match(source, /function levelSceneWorldWidth\(levelId: string, sceneIndex: number, canvasW: number\)/);
  assert.match(source, /const stairScene = \(levelId === LEVEL4_ID && \(sceneIndex === 4 \|\| sceneIndex === 6\)\) \|\| \(levelId === LEVEL6_ID && sceneIndex === 7\)/);
  assert.match(source, /const minimum = stairScene \? LEVEL4_STAIR_MIN_WORLD_W : 1/);
  assert.match(source, /const nextWorldW = levelSceneWorldWidth\(g\.level\.levelId, g\.level\.sceneIndex, nextW\)/);
  assert.match(source, /p\.x = Math\.max\(52, worldW \* LEVEL4_STAIR_LOWER_START_FX\)/);
  assert.match(source, /const exitDoorY = LEVEL4_STAIR_EXIT_Y - 240/);
  assert.match(source, /g\.player\.y <= LEVEL4_STAIR_EXIT_Y \+ 4/);
  assert.match(source, /const upperStepW = upperSpan \/ steps/);
  // 设备区视觉：HP 条 + 维修进度条 + 维修火花
  assert.match(source, /通讯设备 \$\{Math\.ceil\(level\.wallHp\)\} HP/);
  assert.match(source, /维修进度 \$\{Math\.floor\(prog \* 100\)\}%/);
  // 通关文案定制 + 第五关解锁提示由通用解锁链生成
  assert.match(source, /电台重新接通的那一刻/);
  assert.match(source, /人类不再是孤岛/);
  assert.match(source, /第 \$\{nextDef\.order\} 关正在制作中，敬请期待/);
});

test("level mode: rescue-operation level with helicopter insertion, tunnel power defense, survivor search and road clearing", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");

  // 第五关定义、解锁链与开局装备
  assert.match(source, /const LEVEL5_ID = "level-rescue-operation"/);
  assert.match(source, /const LEVEL5_TITLE = "解救行动"/);
  assert.match(source, /\{ id: LEVEL5_ID, order: 5, title: LEVEL5_TITLE, briefing: "[^"]+", unlockedByDay: 1, playable: true \}/);
  assert.match(source, /levelId === LEVEL5_ID \? LEVEL5_SCENES/);
  assert.match(source, /g\.owned = new Set<WeaponKey>\(\["fists", "m16", "glock17"\]\)/);
  assert.match(source, /g\.loadout = \["m16", "glock17"\]/);
  assert.match(source, /g\.armor = "army"/);

  // 六场景长任务链：监听室 → 停机坪 → 隧道入口 → 黑暗电力区 → 搜救区 → 撤离道路
  assert.match(source, /const LEVEL5_SCENES: LevelSceneDef\[\] = \[/);
  for (const name of [
    "通讯基地 · 无线电监听室", "通讯基地 · 天台停机坪", "隧道入口 · 直升机降落区",
    "隧道 · 电力配置室", "隧道 · 搜救区", "隧道 · 撤离道路",
  ]) assert.match(source, new RegExp(`name: "${name}"`));
  for (const task of ["find-radio-teammate", "board-helicopter", "repair-power", "find-survivor", "clear-rescue-road", "board-rescue-vehicle"]) {
    assert.match(source, new RegExp(`id: "${task}"`));
  }

  // 关卡实体明确复用生存模式的完整人物/僵尸机制，而非创建简化版。
  assert.match(source, /继续走生存模式同一套/);
  assert.match(source, /绘制、步态、下砸攻击、血液\/结构损伤、断肢和打腿倒地结算/);
  assert.match(source, /function makeLevelZombie\(/);
  assert.match(source, /zombieRenderPose\(z, now, p\.x\)/);

  // 监听室找到队友并弹出指定对话，完成后进入天台。
  assert.match(source, /function drawLevel5MonitoringRoom\(/);
  assert.match(source, /无线电监听室 · 04/);
  assert.match(source, /SOS · 信号重复中/);
  assert.match(source, /\{ speaker: "队友", text: "隧道里有求救信号，我们得去看看。" \}/);
  assert.match(source, /level\.eventStage === "talk" && !level\.dialog\) goScene\(1\)/);

  // 停机坪登机、按人物比例放大的细节化直升机 3.2 秒飞入落稳，玩家与 4 名 M16 队友再依次下机。
  assert.match(source, /function drawMilitaryHelicopter\(/);
  assert.match(source, /const LEVEL5_HELICOPTER_SCALE = 1\.75/);
  assert.match(source, /const shadowGroundY = flying \? 510 : groundY \+ 10/);
  assert.match(source, /涡轴发动机舱、进气口与排气管/);
  assert.match(source, /开启的侧滑舱门与可见座舱/);
  assert.match(source, /function drawLevel5Helipad\(/);
  assert.match(source, /LEVEL5_HELIPAD_FX \* g\.worldW - 120/);
  assert.match(source, /level\.eventStage = "flight"/);
  assert.match(source, /const t = Math\.min\(1, \(now - level\.eventAt\) \/ 3200\)/);
  assert.match(source, /level\.eventStage = "landed"/);
  assert.match(source, /const LEVEL5_SQUAD = 4/);
  assert.match(source, /const LEVEL5_PLAYER_EXIT_DELAY_MS = 650/);
  assert.match(source, /g\.npcs\.push\(makeLevelNpc\(level\.truckX \+ 270 \+ squadIndex \* 120, 360 \+ \(\(squadIndex \* 97\) % 180\), true, true\)\)/);
  assert.match(source, /\{ speaker: "队友", text: "里面太黑了，我们需要维修电力" \}/);
  assert.match(source, /level\.eventStage === "talk" && !level\.dialog\) goScene\(3\)/);
  assert.match(source, /level\.levelId === LEVEL5_ID && level\.sceneIndex === 2/);

  // 未通电隧道只有枪灯；维修 15 秒，3 名 M16 队友和玩家守 500 HP 围栏，军队奔跑僵尸持续冲击。
  assert.match(source, /const LEVEL5_FENCE_HP = 500/);
  assert.match(source, /const LEVEL5_FENCE_DAMAGE_FACTOR = 0\.35/);
  assert.match(source, /const LEVEL5_REPAIR_MS = 15000/);
  assert.match(source, /const LEVEL5_DEFEND_TOTAL = 36/);
  assert.match(source, /function drawLevel5Tunnel\(/);
  assert.match(source, /const level5DarkTunnel = level\.levelId === LEVEL5_ID && level\.sceneIndex === 3/);
  assert.match(source, /未通电的隧道和市政大楼严格只靠枪灯与开火\/爆炸照明/);
  assert.match(source, /for \(const ny of \[310, 430, 550\]\) g\.npcs\.push\(makeLevelNpc\(fenceX - 150, ny, true, true\)\)/);
  assert.match(source, /makeLevelNpc\(powerX - 34, 430, false, true\)/);
  assert.match(source, /const LEVEL5_FENCE_FX = 0\.43/);
  assert.match(source, /"armyRunner", fenceX \+ 650 \+ Math\.random\(\) \* 250/);
  assert.match(source, /isLevel5FenceSegment\(barricade\.id\)/);
  assert.match(source, /g\.level\.wallHp = Math\.max\(0, g\.level\.wallHp - attackDamage \* LEVEL5_FENCE_DAMAGE_FACTOR\)/);
  assert.match(source, /if \(level\.wallHp <= 0\) \{ failLevel\(\); return; \}/);
  assert.match(source, /level\.wallHp > 0 && now - level\.eventAt >= LEVEL5_REPAIR_MS/);
  assert.match(source, /p\.x = Math\.min\(p\.x, LEVEL5_FENCE_FX \* g\.worldW - 60\)/);

  // 通电后的搜救区精确为 10 军队 + 5 军队奔跑 + 5 盾兵，全清并找到求救人员后换装 M240L。
  assert.match(source, /const LEVEL5_RESCUE_TOTAL = 20/);
  assert.match(source, /\.\.\.\[0\.18, 0\.24, 0\.3, 0\.36, 0\.43, 0\.5, 0\.58, 0\.66, 0\.75, 0\.84\]\.map\(\(fx\) => \(\{ kind: "army"/);
  assert.match(source, /\.\.\.\[0\.32, 0\.45, 0\.57, 0\.71, 0\.86\]\.map\(\(fx\) => \(\{ kind: "armyRunner"/);
  assert.match(source, /\.\.\.\[0\.38, 0\.52, 0\.64, 0\.78, 0\.9\]\.map\(\(fx\) => \(\{ kind: "shield"/);
  assert.match(source, /level\.sceneKills >= LEVEL5_RESCUE_TOTAL/);
  assert.match(source, /g\.player\.x >= LEVEL5_SURVIVOR_FX \* g\.worldW - 130/);
  assert.match(source, /g\.owned\.add\("m240l"\)/);
  assert.match(source, /g\.loadout = \["m240l", "m240l"\]/);
  assert.match(source, /g\.player\.weapon = "m240l"/);

  // 最终长道路 50 军队僵尸；全清后上车通关，镜头继续按人物位置跟随。
  assert.match(source, /const LEVEL5_ROAD_TOTAL = 50/);
  assert.match(source, /Array\.from\(\{ length: LEVEL5_ROAD_TOTAL \}/);
  assert.match(source, /task\.id === "clear-rescue-road" && level\.sceneKills >= LEVEL5_ROAD_TOTAL/);
  assert.match(source, /task\.id === "board-rescue-vehicle" && g\.player\.x >= LEVEL5_VEHICLE_FX \* g\.worldW - 150\) completeLevel\(\)/);
  assert.match(source, /g\.cameraX = Math\.max\(0, Math\.min\(g\.worldW - viewW, p\.x - viewW \* 0\.42\)\)/);

  // 第五关失败与成功标语。
  assert.match(source, /围栏倒下时/);
  assert.match(source, /隧道再次归于黑暗/);
  assert.match(source, /灯光穿透隧道的尽头/);
  assert.match(source, /每一个求救信号，都值得有人回应/);
});

test("level mode: occupy-building level with persistent squad, blackout floors and giant mutant boss", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const level6ScenesSource = source.slice(source.indexOf("const LEVEL6_SCENES"), source.indexOf("function isLevel3WallSegment"));

  assert.match(source, /const LEVEL6_ID = "level-occupy-building"/);
  assert.match(source, /const LEVEL6_TITLE = "攻占大楼"/);
  assert.match(source, /\{ id: LEVEL6_ID, order: 6, title: LEVEL6_TITLE, briefing: "[^"]+", unlockedByDay: 1, playable: true \}/);
  assert.match(source, /levelId === LEVEL6_ID \? LEVEL6_SCENES/);
  assert.match(source, /const LEVEL6_SCENES: LevelSceneDef\[\] = \[/);
  for (const task of ["find-assault-team", "board-assault-truck", "occupy-power-room", "occupy-archives", "occupy-central-hall"]) {
    assert.match(source, new RegExp(`id: "${task}"`));
  }
  assert.match(source, /我们要参加攻占市政大楼的任务/);
  assert.match(source, /这次任务很危险，大家小心点/);
  assert.match(source, /const operationTarget = highwayBriefing \? "高速收费站" : warehouseBriefing \? "物资仓库" : cityHallBriefing \? "市政大楼" : "电台"/);
  assert.match(source, /warehouseBriefing \? "行动：夺取仓库" : cityHallBriefing \? "行动：攻占市政大楼" : "行动：占领电台"/);
  assert.match(source, /const LEVEL6_SQUAD_SIZE = 2/);
  assert.match(source, /const LEVEL6_SQUAD_HP = 100/);
  assert.match(source, /followPlayer\?: boolean/);
  assert.match(source, /targetable\?: boolean/);
  assert.match(source, /level\.squadHp\[targetNpc\.squadIndex\] = targetNpc\.hp/);
  assert.match(source, /for \(const npc of g\.npcs\) \{\s+if \(npc\.hp <= 0\) continue;\s+drawLevelSoldier/);
  assert.match(source, /\{ hp, maxHp: LEVEL6_SQUAD_HP, followPlayer: true, targetable: true, squadIndex \}/);
  assert.match(source, /for \(const npc of g\.npcs\) \{\s+if \(npc\.hp <= 0\) continue;\s+drawLevelSoldier/);
  assert.match(source, /restoreLevel6Squad\(g\)/);
  assert.match(source, /level6DarkBuilding/);
  assert.match(source, /!level\.powerOn && \(level\.sceneIndex === 3 \|\| level\.sceneIndex === 4\)/);
  assert.match(source, /const LEVEL6_CORRIDOR_ONE_TOTAL = 23/);
  assert.match(source, /const LEVEL6_POWER_ROOM_TOTAL = 15/);
  assert.match(source, /const LEVEL6_CORRIDOR_TWO_TOTAL = 10/);
  assert.match(source, /const LEVEL6_ARCHIVE_TOTAL = 2/);
  assert.match(level6ScenesSource, /length: 10[\s\S]*kind: "armyRunner"/);
  assert.match(level6ScenesSource, /\[0\.24, 0\.48, 0\.72\][\s\S]*kind: "juggernaut"/);
  assert.match(level6ScenesSource, /length: 10[\s\S]*kind: "army"/);
  assert.match(level6ScenesSource, /\[0\.38, 0\.5, 0\.62, 0\.74, 0\.84\][\s\S]*kind: "shield"/);
  assert.match(level6ScenesSource, /\[0\.22, 0\.36, 0\.52, 0\.68, 0\.84\][\s\S]*kind: "shield"/);
  assert.match(level6ScenesSource, /\[0\.28, 0\.43, 0\.58, 0\.73, 0\.88\][\s\S]*kind: "juggernaut"/);
  assert.equal((level6ScenesSource.match(/\{ kind: "mutant", fx:/g) ?? []).length, 6);
  assert.match(source, /const LEVEL6_CENTRAL_HALL_TOTAL = 6/);
  assert.match(source, /level\.powerOn = true/);
  assert.match(source, /function makeLevel6Boss/);
  assert.match(source, /bossKind = "giantMutant"/);
  assert.match(source, /boss\.hp = 1500/);
  assert.match(source, /boss\.maxHp = 1500/);
  assert.match(source, /const LEVEL6_BOSS_SPEED = 52/);
  assert.match(source, /boss\.speed = LEVEL6_BOSS_SPEED/);
  assert.match(source, /const LEVEL6_BOSS_SPAWN_Y = 590/);
  assert.match(source, /boss\.y = LEVEL6_BOSS_SPAWN_Y/);
  assert.match(source, /boss\.attack = 50/);
  assert.match(source, /function giantMutantDamageReduction[\s\S]*return region === "body" \? \.7 : \.5/);
  assert.match(source, /kickDamageReduction\(z, "legs"\)/);
  assert.match(source, /z\.hp -= burnDamage;/);
  assert.match(source, /z\.hp -= IGNITE_DPS \* dt;/);
  assert.match(source, /damageZombie\(g, z, damage, now, angle, undefined, undefined, true\)/);
  assert.match(source, /region === "legs" && z\.kind !== "juggernaut" && z\.bossKind !== "giantMutant"/);
  assert.match(source, /missingLegs > 0 && z\.bossKind !== "giantMutant"/);
  assert.match(source, /if \(z\.hp > 0 && z\.bossKind !== "giantMutant"\) \{/);
  assert.match(source, /巨型变异僵尸 \$\{Math\.ceil\(boss\.hp\)\} \/ \$\{boss\.maxHp\} HP/);
  assert.match(source, /const LEVEL6_BOSS_SPIT_INTERVAL_MS = 5000/);
  assert.match(source, /const LEVEL6_BOSS_SPIT_WINDUP_MS = 800/);
  assert.match(source, /now \+ LEVEL6_BOSS_SPIT_INTERVAL_MS - LEVEL6_BOSS_SPIT_WINDUP_MS/);
  assert.match(source, /damage: 50/);
  assert.match(source, /burst: true/);
  assert.match(source, /level\.sceneKills >= LEVEL6_CENTRAL_HALL_TOTAL\) completeLevel\(\)/);
  assert.match(source, /这座大楼重新属于活着的人/);
  assert.match(source, /const bw = Math\.min\(1680, W - 120\)/);
  assert.match(source, /for \(const floorY of \[88, 228, 368\]\)/);
  assert.match(source, /const columnXs = \[38, 132, 226, 434, 528, 622\]/);
  assert.match(source, /if \(d > arrive\) \{\s+const step = Math\.min\(d - arrive, speed \* dt\)/);
  assert.match(source, /if \(f\.moving\) \{\s+ctx\.translate[\s\S]*ctx\.rotate/);
});

test("all modes: empty primary fire reloads while partial magazines require R", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const attackSource = source.slice(source.indexOf("const attack = useCallback"), source.indexOf("const reload = useCallback"));
  const reloadSource = source.slice(source.indexOf("const reload = useCallback"), source.indexOf("// 搭档战斗逻辑"));

  assert.match(attackSource, /if \(p\.ammo\[p\.weapon\] <= 0\) \{\s+[^}]*reloadRef\.current\(now\);\s+return;/);
  assert.doesNotMatch(attackSource, /p\.ammo\[p\.weapon\] < weapon\.magazine[\s\S]*reloadRef\.current/);
  assert.match(reloadSource, /p\.ammo\[p\.weapon\] === weapon\.magazine/);
  assert.doesNotMatch(reloadSource, /window\.setTimeout/);
  assert.match(source, /if \(now >= p\.reloadingUntil && p\.reloadingUntil !== 0\) \{\s+p\.ammo\[p\.weapon\] = WEAPONS\[p\.weapon\]\.magazine;\s+p\.reloadingUntil = 0/);
  assert.match(source, /if \(key === "r"\) reload\(performance\.now\(\)\)/);
});

test("level mode: seize-warehouse level with armored zombies, flint pickup and two supply runs", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const level7Source = source.slice(source.indexOf("// ===== 第七关「夺取仓库」 ====="), source.indexOf("function isLevel3WallSegment"));

  assert.match(source, /const LEVEL7_ID = "level-seize-warehouse"/);
  assert.match(source, /const LEVEL7_TITLE = "夺取仓库"/);
  assert.match(source, /\{ id: LEVEL7_ID, order: 7, title: LEVEL7_TITLE,[^\n]+playable: true \}/);
  assert.match(source, /levelId === LEVEL7_ID \? LEVEL7_SCENES/);
  assert.match(source, /levelId !== LEVEL7_ID/);
  assert.match(source, /g\.owned = new Set<WeaponKey>\(\["fists", "ak47", "glock17"\]\)/);
  assert.match(source, /g\.loadout = \["ak47", "glock17"\]/);
  assert.match(source, /g\.armor = "army"/);
  assert.match(source, /我们要夺取仓库，获得更多物资/);
  assert.match(source, /const LEVEL7_SQUAD_SIZE = 4/);
  assert.match(source, /makeLevelNpc\(level\.truckX \+ 70, disembarkY, true, true, "m16"\)/);

  assert.match(level7Source, /name: "物资仓库 · 堆放区"/);
  assert.match(level7Source, /extra: 4200/);
  assert.match(source, /const LEVEL7_JUGGERNAUTS = 2/);
  assert.match(source, /const LEVEL7_SHIELDS = 5/);
  assert.match(source, /const LEVEL7_ARMORED = 10/);
  assert.match(source, /const LEVEL7_ARMORED_HP = 100/);
  assert.match(source, /const LEVEL7_ARMORED_REDUCTION = \.99/);
  assert.match(source, /const LEVEL7_ARMORED_SPEED_FACTOR = 1\.5/);
  assert.match(source, /function applyLevel7ArmorZombie/);
  assert.match(source, /z\.warehouseArmor = true/);
  assert.match(source, /z\.damageReduction = LEVEL7_ARMORED_REDUCTION/);
  assert.match(source, /z\.speed \*= LEVEL7_ARMORED_SPEED_FACTOR/);
  assert.match(source, /if \(zombie\.warehouseArmor\)/);
  assert.match(source, /function kickDamageReduction\(zombie: Zombie/);
  assert.match(source, /z\.warehouseArmor \? z\.damageReduction : 0/);
  assert.match(source, /z\.ignitedAt > 0\) z\.hp -= IGNITE_DPS \* dt/);

  assert.match(level7Source, /pickups: \[\{ weapon: "flint66", fx: LEVEL7_FLINT_FX, y: 365, onTable: true \}\]/);
  assert.match(level7Source, /拾取燧石66以对付护甲僵尸（走近物资箱后按右键）/);
  assert.match(source, /g\.player\.weapon === "flint66" \|\| g\.loadout\.includes\("flint66"\)/);
  assert.match(source, /if \(key === "g"[^\n]+dropWeapon\(\)/);
  assert.match(source, /if \(e\.button === 2\)[\s\S]*tryPickupWeapon\(\)/);

  assert.match(source, /const LEVEL7_WALL_HP = 500/);
  assert.match(source, /const LEVEL7_DEFENDERS = 2/);
  assert.match(source, /const LEVEL7_TRANSPORT_LEGS = 4/);
  assert.match(source, /const LEVEL7_TRANSPORT_SPEED_FACTOR = \.66/);
  assert.match(source, /LEVEL7_TRANSPORT_BASE_LEG_MS \/ LEVEL7_TRANSPORT_SPEED_FACTOR/);
  assert.match(source, /eventStage = "warehouse-defense"/);
  assert.match(source, /makeLevelNpc\(wallX - 170 - \(i % 2\) \* 78, 278 \+ i \* 92, true, true, "m16"\)/);
  assert.match(source, /const activeAttackers = g\.zombies\.reduce\(\(count, zombie\) => count \+ Number\(zombie\.hp > 0\), 0\)/);
  assert.match(source, /const spawnX = Math\.min\(g\.worldW - 90, wallX \+ LEVEL7_ATTACKER_SPAWN_OFFSET\)/);
  assert.match(source, /applyLevel7ArmorZombie\(attacker\)/);
  assert.match(source, /level\.wallHp = Math\.max\(0, g\.level\.wallHp - attackDamage\)/);
  assert.match(source, /Math\.floor\(level\.eventCount \/ 2\)/);
  assert.match(source, /if \(elapsed >= totalMs && level\.wallHp > 0\) completeLevel\(\)/);
  assert.match(source, /仓库里的希望，正在运回基地/);
});

test("level 7 warehouse horde reaches the firing wall before transport completes", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const level7Source = source.slice(source.indexOf("// ===== 第七关「夺取仓库」 ====="), source.indexOf("function isLevel3WallSegment"));
  const numberConstant = (name) => {
    const match = source.match(new RegExp(`const ${name} = ([\\d.]+)`));
    assert.ok(match, `${name} must be a numeric constant`);
    return Number(match[1]);
  };
  const wallFx = numberConstant("LEVEL7_WALL_FX");
  const transportLegMs = numberConstant("LEVEL7_TRANSPORT_BASE_LEG_MS") / numberConstant("LEVEL7_TRANSPORT_SPEED_FACTOR");
  const transportLegs = numberConstant("LEVEL7_TRANSPORT_LEGS");
  const extraMatch = level7Source.match(/name: "物资仓库 · 堆放区",\s+extra: (\d+)/);
  assert.ok(extraMatch, "warehouse scene extra width must be declared");
  const worldWidth = 1280 + Number(extraMatch[1]);
  const offsetMatch = source.match(/const LEVEL7_ATTACKER_SPAWN_OFFSET = ([\d.]+)/);
  const spawnX = offsetMatch ? Math.min(worldWidth - 90, wallFx * worldWidth + Number(offsetMatch[1])) : worldWidth - 90;
  const minimumArmySpeed = 42;
  const distanceToWall = spawnX - wallFx * worldWidth - 30;
  const slowestArrivalMs = distanceToWall / minimumArmySpeed * 1000;

  assert.ok(wallFx > 0 && wallFx < 1);
  assert.ok(slowestArrivalMs < transportLegMs * transportLegs, "the slowest attacker must reach the wall before the two supply runs finish");
});

test("level mode: clear-highway level with drivable armored vehicle and toll-station assault", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const level8Source = source.slice(source.indexOf("// ===== 第八关「清理高速」 ====="), source.indexOf("function isLevel3WallSegment"));

  assert.match(source, /const LEVEL8_ID = "level-clear-highway"/);
  assert.match(source, /const LEVEL8_TITLE = "清理高速"/);
  assert.match(source, /\{ id: LEVEL8_ID, order: 8, title: LEVEL8_TITLE,[^\n]+playable: true \}/);
  assert.match(source, /levelId === LEVEL8_ID \? LEVEL8_SCENES/);
  assert.match(source, /我们需要清理高速并占领收费站，扫清障碍/);
  assert.match(source, /g\.owned = new Set<WeaponKey>\(\["fists", "ak47", "glock17"\]\)/);
  assert.match(source, /g\.loadout = \["ak47", "glock17"\]/);
  assert.match(source, /g\.armor = "army"/);

  assert.match(source, /const LEVEL8_VEHICLE_HP = 500/);
  assert.match(source, /const LEVEL8_HMG_DAMAGE = 80/);
  assert.match(source, /const LEVEL8_HMG_MAGAZINE = 200/);
  assert.match(source, /const LEVEL8_HMG_PENETRATION_BYPASS = \.8/);
  assert.match(source, /const LEVEL8_HMG_STOPPING = 1/);
  assert.match(source, /g\.level\?\.levelId === LEVEL8_ID\) drawLevel8ArmoredVehicle\(ctx, g\.level, now, gx - 180, 470\)/);
  assert.match(source, /eventStage = "armored-drive"/);
  assert.match(source, /function isLevel8Driving/);
  assert.match(source, /level\.truckX = Math\.max\([^\n]+dx \* LEVEL8_VEHICLE_SPEED \* dt/);
  assert.match(source, /g\.cameraX = Math\.max\(0, Math\.min\(g\.worldW - viewW, p\.x - viewW \* 0\.42\)\)/);
  assert.match(source, /vehicleHp = Math\.max\(0, g\.level\.vehicleHp - attackDamage\)/);
  assert.match(source, /penetrationBypass: LEVEL8_HMG_PENETRATION_BYPASS, stopping: LEVEL8_HMG_STOPPING/);

  assert.match(source, /const LEVEL8_HIGHWAY_JUGGERNAUTS = 10/);
  assert.match(source, /const LEVEL8_HIGHWAY_ARMY = 30/);
  assert.match(source, /const LEVEL8_HIGHWAY_SHIELDS = 20/);
  assert.match(source, /const LEVEL8_HIGHWAY_HELMETS = 30/);
  assert.match(source, /const LEVEL8_HIGHWAY_TOTAL = LEVEL8_HIGHWAY_JUGGERNAUTS \+ LEVEL8_HIGHWAY_ARMY \+ LEVEL8_HIGHWAY_SHIELDS \+ LEVEL8_HIGHWAY_HELMETS/);
  assert.match(level8Source, /name: "封锁高速"/);
  assert.match(level8Source, /name: "收费站 · 长走廊"/);
  assert.match(source, /const LEVEL8_TOLL_ARMY = 10/);
  assert.match(source, /const LEVEL8_TOLL_RUNNERS = 5/);
  assert.match(source, /const LEVEL8_TOLL_SHIELDS = 5/);
  assert.match(source, /const LEVEL8_TOLL_JUGGERNAUTS = 2/);
  assert.match(source, /const LEVEL8_TOLL_SQUAD_SIZE = 2/);
  assert.match(source, /makeLevelNpc\([^\n]+true, false, "m16", \{ followPlayer: true, targetable: true/);
  assert.match(source, /高速上的最后一辆车驶入收费站/);
});

test("expands the global arsenal, zombie roster, reload latch and physical explosive projectiles", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /const SHOTGUN_DAMAGE_FACTOR = \.75/);
  assert.match(source, /spec\.pellets \? baseDamage \* SHOTGUN_DAMAGE_FACTOR : baseDamage/);
  assert.match(source, /flint66:[\s\S]*?penetration: 15/);
  assert.match(source, /const penetrationDamageFactor = Math\.max\(\.1, 1 - index \* \.2\)/);

  assert.match(source, /juggernaut: \{ unlockDay: 18/);
  assert.match(source, /armored: \{ unlockDay: 6, weight: [^}]+hp: 100[^}]+damageReduction: \.99/);
  assert.match(source, /armoredRunner: \{ unlockDay: 9, weight: [^}]+hp: 100[^}]+speedFactor: 3[^}]+damageReduction: \.99/);
  assert.match(source, /zombieDog: \{ unlockDay: 4, weight: [^}]+hp: 60[^}]+speedFactor: 4/);
  assert.match(source, /largeSpitter: \{ unlockDay: [0-9]+, weight: [^}]+hp: 200/);
  assert.match(source, /const spitCount = z\.kind === "largeSpitter" \? 3 : 1/);
  assert.match(source, /damage: 20/);
  assert.match(source, /armored: \{ name: "护甲僵尸"/);
  assert.match(source, /armoredRunner: \{ name: "奔跑护甲僵尸"/);
  assert.match(source, /zombieDog: \{ name: "僵尸狗"/);
  assert.match(source, /dogShiftX \+ dogFacing \* \(31 \+ dogLunge \* 7\)/);
  assert.match(source, /facingTargetX >= zombie\.x \? 1 : -1/);
  assert.match(source, /if \(region\.region === "head"\) hitLocalX \*= dogFacing/);
  assert.match(source, /const woundX = wound\.region === "head" \? facing \* wound\.x : wound\.x/);
  assert.match(source, /largeSpitter: \{ name: "大型喷吐僵尸"/);
  assert.match(source, /zombieDog: "感染后的军犬/);
  assert.match(source, /armored: "与仓库中遇到的护甲感染者相同/);
  assert.match(source, /armoredRunner: "奔跑僵尸与护甲感染者的结合体/);
  assert.match(source, /largeSpitter: "体型膨胀的远程感染者/);

  assert.match(source, /m4:[\s\S]*?name: "M4"[\s\S]*?price: 7800/);
  assert.match(source, /m107:[\s\S]*?name: "Barrett M107"[\s\S]*?price: 14500[\s\S]*?damage: 200[\s\S]*?magazine: 10[\s\S]*?penetration: 5/);
  assert.match(source, /mg42:[\s\S]*?name: "MG42"[\s\S]*?price: 26000[\s\S]*?damage: 40[\s\S]*?magazine: 100[\s\S]*?penetration: 2/);
  assert.match(source, /m107: \{ weightKg: [^,]+, stopping: 1 \}/);
  assert.match(source, /mg42: \{ weightKg: [^,]+, stopping: \.5 \}/);
  assert.match(source, /m4: \{ stance: "rifle"/);
  assert.match(source, /m107: \{ stance: "rifle"/);
  assert.match(source, /mg42: \{ stance: "rifle"/);

  assert.match(source, /emptyReloadLatch: boolean/);
  assert.match(source, /if \(p\.emptyReloadLatch\) return;/);
  assert.match(source, /p\.emptyReloadLatch = true;\s*reloadRef\.current\(now\)/);
  assert.match(source, /onPointerUp[\s\S]*emptyReloadLatch = false/);
  assert.match(css, /\.select-grid \.weapon-card small \{[^}]*white-space: normal/);

  assert.match(source, /type ExplosiveProjectile =/);
  assert.match(source, /explosiveProjectiles: ExplosiveProjectile\[\]/);
  assert.match(source, /g\.explosiveProjectiles\.push\(/);
  assert.match(source, /function drawExplosiveProjectile\(/);
  assert.doesNotMatch(source, /weapon\.explosionRadius\)[\s\S]{0,1300}g\.tracers\.push/);
  assert.match(source, /function detonateExplosiveProjectile\(/);
  assert.match(source, /drawBlastEffect[\s\S]*central smoke column/i);
  assert.match(source, /drawLevel8ArmoredVehicle[\s\S]*M-ATV-inspired four-wheel MRAP silhouette/i);
  assert.match(source, /const wheelCenters = \[-108, 104\]/);
  assert.match(source, /TAK-4-style independent suspension/i);
  assert.match(source, /ballistic-glass trapezoids/i);
  assert.match(source, /V-hull keel/i);
  assert.match(source, /const LEVEL8_HMG_MOUNT_X = -18/);
  assert.match(source, /const LEVEL8_HMG_MOUNT_Y = -211/);
  assert.match(source, /const LEVEL8_HMG_MUZZLE_X = 163/);
  assert.match(source, /ctx\.translate\(LEVEL8_HMG_MOUNT_X, LEVEL8_HMG_MOUNT_Y\)/);
  assert.match(source, /const mountX = level\.truckX \+ LEVEL8_HMG_MOUNT_X/);
  assert.match(source, /const mountY = level\.truckY \+ LEVEL8_HMG_MOUNT_Y/);
  assert.match(source, /const muzzleX = mountX \+ Math\.cos\(aimAngle\) \* LEVEL8_HMG_MUZZLE_X/);
  assert.match(source, /hitZombieRegion\(muzzleX, muzzleY, endX, endY/);
  assert.match(source, /g\.tracers\.push\(\{ x1: muzzleX, y1: muzzleY/);
  assert.match(source, /mouseRef\.current\.y - \(level\.truckY \+ LEVEL8_HMG_MOUNT_Y\)/);
  assert.match(source, /mouseRef\.current\.x \+ g\.cameraX - \(level\.truckX \+ LEVEL8_HMG_MOUNT_X\)/);
  assert.doesNotMatch(source, /const wheelCenters = \[-120, -78, 78, 120\]/);
});

test("adds a farm exploration hub with sequential missions and split zombie codex", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /type MajorMode = "classic" \| "exploration"/);
  assert.match(source, /type Screen = [^;]+"exploration"/);
  assert.match(source, /经典模式/);
  assert.match(source, /探索模式/);
  assert.match(source, /screen === "menu" \|\| screen === "exploration"/);
  assert.match(source, /const EXPLORATION_TASKS:[\s\S]*Array\.from\(\{ length: 10 \}/);
  assert.match(source, /function isExplorationTaskUnlocked\(/);
  assert.match(source, /return order === 1 \|\| cleared\.includes\(order - 1\)/);
  assert.match(source, /className="exploration-panel overlay-panel"/);
  assert.match(source, /任务一/);
  assert.match(source, /任务十/);
  assert.match(source, /抽奖/);
  assert.match(source, /商店/);
  assert.match(source, /队伍/);
  assert.match(source, /章节/);
  assert.match(source, /const \[explorationCoins, setExplorationCoins\] = useState\(0\)/);
  assert.match(source, /const \[explorationExperience, setExplorationExperience\] = useState\(0\)/);
  assert.match(source, /const \[explorationVouchers, setExplorationVouchers\] = useState\(0\)/);
  assert.match(source, /<small>点券<\/small><strong>\{explorationVouchers\}<\/strong>/);
  assert.match(source, /常规僵尸/);
  assert.match(source, /特殊僵尸/);
  assert.match(source, /特殊僵尸档案将在后续探索中开放/);
  assert.match(source, /setCodexCategory\("regular"\)/);
  assert.match(css, /\.exploration-panel \{/);
  assert.match(css, /\.exploration-task-map \{/);
  assert.match(css, /\.exploration-task-node\.locked/);
  assert.match(css, /\.exploration-wallet/);
  assert.match(css, /\.codex-category-tabs/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.volume-control \{ display: none; \}/);
});

test("adds a ticket-paid player-aimed lottery road battle with weighted rarity reveals", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /type Screen = [^;]+"lottery"/);
  assert.match(source, /type LotteryRarity = "common" \| "rare" \| "epic" \| "legendary"/);
  assert.match(source, /LOTTERY_RARITIES:[\s\S]*common:[\s\S]*chance: 50[\s\S]*rare:[\s\S]*chance: 30[\s\S]*epic:[\s\S]*chance: 15[\s\S]*legendary:[\s\S]*chance: 5/);
  assert.match(source, /const LOTTERY_RARITY_ORDER: LotteryRarity\[\] = \["common", "rare", "epic", "legendary"\]/);
  assert.match(source, /function rollLotteryRarity\(/);
  assert.match(source, /cumulativeChance \+= LOTTERY_RARITIES\[rarity\]\.chance \/ 100/);
  assert.match(source, /if \(roll < cumulativeChance\) return rarity/);
  assert.match(source, /const \[recruitTickets, setRecruitTickets\] = useState\(0\)/);
  assert.match(source, /startLotteryDraw\(1\)/);
  assert.match(source, /startLotteryDraw\(10\)/);
  assert.match(source, /if \(recruitTickets < count\) return/);
  assert.match(source, /setRecruitTickets\(\(tickets\) => tickets - count\)/);
  assert.match(source, /disabled=\{recruitTickets < 1\}/);
  assert.match(source, /disabled=\{recruitTickets < 10\}/);
  assert.doesNotMatch(source, /测试版免券|测试版不扣除/);
  assert.match(source, /鼠标瞄准 · 按住左键全自动射击 · MG42/);
  assert.match(source, /className=\{`lottery-zombie/);
  assert.match(source, /data-lottery-zombie=\{index\}/);
  assert.match(source, /const lotteryDead = lotteryZombieDamage\.flatMap/);
  assert.match(source, /const updateLotteryAim = useCallback/);
  assert.match(source, /const fireLottery = useCallback/);
  assert.match(source, /closest\("\[data-lottery-zombie\]"\)/);
  assert.match(source, /const originX = rect\.width \* \.5;[\s\S]*const originY = rect\.height \* \.82;/);
  assert.match(source, /sound\.gunshot\("mg42"/);
  assert.match(source, /lotteryFireTimerRef\.current = window\.setInterval/);
  assert.match(source, /window\.clearInterval\(lotteryFireTimerRef\.current\)/);
  assert.match(source, /onPointerCancel=\{stopLotteryFire\}/);
  assert.match(source, /window\.addEventListener\("blur", stopLotteryFire\)/);
  assert.match(source, /lotteryDead\.length !== LOTTERY_ZOMBIES\.length/);
  assert.match(source, /setLotteryPhase\("flash"\)/);
  assert.match(source, /setLotteryPhase\("reveal"\)/);
  assert.match(source, /const LOTTERY_WHITE_FLASH_MS = 500/);
  assert.doesNotMatch(source, /LOTTERY_KILL_INTERVAL_MS/);
  assert.match(source, /window\.clearTimeout\(revealTimer\)/);
  assert.match(source, /const lotteryOverlayActive = screen === "lottery" && lotteryPhase !== "idle"/);
  assert.match(source, /lotteryOverlayActive \? <div className="masthead lottery-masthead-placeholder" aria-hidden="true" \/> : <header className="masthead">/);
  assert.match(source, /tabIndex=\{screen === "playing" \? 0 : -1\}/);
  assert.match(source, /\{lotteryPhase === "idle" && \([\s\S]*lottery-topbar/);
  assert.match(source, /奖励内容待公布/);
  assert.match(css, /\.lottery-panel/);
  assert.match(css, /\.lottery-first-person-gun/);
  assert.match(css, /\.lottery-gun-aim[^}]*rotate\(calc\(var\(--lottery-aim-angle, -90deg\) \+ 7deg\)\)/);
  assert.match(css, /\.lottery-muzzle-flash/);
  assert.match(css, /\.lottery-crosshair/);
  assert.match(css, /\.lottery-aim-line/);
  assert.match(css, /\.lottery-zombie:not\(\.dead\) \{ pointer-events: auto; cursor: crosshair; \}/);
  assert.doesNotMatch(css, /\.lottery-firing \.lottery-muzzle-flash[^}]*infinite/);
  assert.match(css, /\.lottery-screen-flash/);
  assert.match(css, /\.lottery-flash \.lottery-screen-flash \{ opacity: 1; \}/);
  assert.match(css, /\.lottery-result-ten > \.lottery-reward-grid/);
  assert.match(css, /repeat\(5, minmax\(52px, 1fr\)\)/);
  assert.match(css, /\.lottery-common/);
  assert.match(css, /\.lottery-rare/);
  assert.match(css, /\.lottery-epic/);
  assert.match(css, /\.lottery-legendary/);
});

test("adds the exploration exchange shop, vehicle upgrades and courage auto-battle", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /type Screen = [^;]+"explorationShop"[^;]+"vehicleGarage"[^;]+"explorationBattle"/);
  assert.match(source, /const EXPLORATION_VOUCHER_EXCHANGE_COST = 100/);
  assert.match(source, /setExplorationVouchers\(\(vouchers\) => vouchers - EXPLORATION_VOUCHER_EXCHANGE_COST\)/);
  assert.match(source, /setRecruitTickets\(\(tickets\) => tickets \+ 1\)/);
  assert.match(source, /100 点券/);
  assert.match(source, /1 张招募券/);
  assert.match(source, /className="exploration-shop-panel/);

  assert.match(source, /function explorationVehicleKind\(level: number\)/);
  assert.match(source, /if \(level >= 10\) return "bus"/);
  assert.match(source, /if \(level >= 5\) return "truck"/);
  assert.match(source, /function explorationVehicleMaxHp\(level: number\) \{ return 200 \+ \(level - 1\) \* 20; \}/);
  assert.match(source, /function explorationVehicleUpgradeCost\(level: number\) \{ return 2000 \+ \(level - 1\) \* 1000; \}/);
  assert.match(source, /const \[explorationVehicleLevel, setExplorationVehicleLevel\] = useState\(1\)/);
  assert.match(source, /车辆改装/);
  assert.match(source, /className="vehicle-garage-panel/);
  assert.match(source, /className=\{`exploration-vehicle vehicle-\$\{kind\}/);
  assert.doesNotMatch(source, /进入战斗测试/);

  assert.match(source, /courageCost: 10/);
  assert.match(source, /courageCost: 15/);
  assert.match(source, /const EXPLORATION_TASK1_COINS = 1536/);
  assert.match(source, /const EXPLORATION_TASK1_EXPERIENCE = 157/);
  assert.match(source, /const EXPLORATION_PROGRESS_KEY = "dead-road-exploration-progress"/);
  assert.match(source, /const \[explorationExperience, setExplorationExperience\] = useState\(0\)/);
  assert.match(source, /function freshExplorationBattle\(vehicleHp: number, taskOrder: number, rewardEligible = false\)/);
  assert.match(source, /1: \{ openingZombieKinds: \["normal", "normal", "normal"\], finite: true, reward: "resources"/);
  assert.match(source, /kind: "normal"/);
  assert.match(source, /setExplorationCoins\(\(coins\) => coins \+ taskConfig\.rewardCoins\)/);
  assert.match(source, /setExplorationExperience\(\(experience\) => experience \+ taskConfig\.rewardExperience\)/);
  assert.match(source, /window\.localStorage\.setItem\(EXPLORATION_PROGRESS_KEY/);
  assert.match(source, /onClick=\{\(\) => startExplorationBattle\(task\.order\)\}/);
  assert.match(source, /EXPLORATION_TASK_NAMES\[explorationBattle\.taskOrder - 1\]\}完成/);
  assert.match(source, /首次通关奖励已领取/);
  assert.match(source, /window\.setInterval\([\s\S]*courage: battle\.courage \+ 1[\s\S]*1000/);
  assert.match(source, /nearestUnit/);
  assert.match(source, /nearestZombie/);
  assert.match(source, /vehicleHp/);
  assert.match(source, /任务失败 · 车辆已被击毁/);
  assert.match(source, /没有敌人时，队员将在原地警戒/);
  assert.match(source, /className="exploration-battle-panel/);

  assert.match(css, /\.exploration-wallet-exp i/);
  assert.match(css, /\.exploration-wallet-exp strong/);
  assert.match(css, /\.exploration-banknote/);
  assert.match(css, /\.exploration-shop-panel/);
  assert.match(css, /\.vehicle-garage-panel/);
  assert.match(css, /\.exploration-vehicle\.vehicle-van/);
  assert.match(css, /\.exploration-vehicle\.vehicle-truck/);
  assert.match(css, /\.exploration-vehicle\.vehicle-bus/);
  assert.match(css, /\.exploration-battle-panel/);
  assert.match(css, /\.battle-farm-scenery/);
  assert.match(css, /\.battle-road[^}]*top: 32%/);
  assert.match(css, /\.battle-vehicle-position[^}]*bottom: 5%[^}]*width: 390px/);
  assert.match(css, /\.battle-courage/);
  assert.match(css, /\.battle-squad-bar/);
});

test("adds the exploration six-slot team roster with shared character and weapon previews", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /type Screen = [^;]+"explorationTeam"/);
  assert.match(source, /type ExplorationTeamTab = "personnel" \| "consumables"/);
  assert.match(source, /const EXPLORATION_TEAM_SIZE = 6/);
  assert.match(source, /const EXPLORATION_MAX_VEHICLE_LEVEL = 15/);
  assert.match(source, /id: "civilian"[\s\S]*name: "平民"[\s\S]*weapon: "baseballbat"[\s\S]*rarity: "common"[\s\S]*faction: "民间武装"[\s\S]*hp: 80[\s\S]*damage: 15[\s\S]*speed: "中等"/);
  assert.match(source, /id: "farmer"[\s\S]*name: "农民"[\s\S]*weapon: "sawedoff"[\s\S]*rarity: "common"[\s\S]*faction: "民间武装"[\s\S]*hp: 70[\s\S]*damage: WEAPONS\.sawedoff\.damage[\s\S]*speed: "慢"/);
  assert.match(source, /const \[explorationTeamTab, setExplorationTeamTab\] = useState<ExplorationTeamTab>\("personnel"\)/);
  assert.match(source, /const \[deployedMemberIds, setDeployedMemberIds\] = useState<string\[\]>\(\["civilian", "farmer"\]\)/);
  assert.match(source, /Math\.min\(15, explorationVehicleLevel\)/);
  assert.match(source, /speedFactor: member\.speedFactor/);
  assert.match(source, /setExplorationExperience\(\(experience\) => experience - upgradeCost\)/);
  assert.match(source, /recruitedMemberIds\.includes\(member\.id\)/);
  assert.match(source, /deployedMemberIds\.map\(\(memberId\) =>/);
  assert.match(source, /resolveExplorationProjectileHit\(candidate, firearmWeapon!, penetratedDamage/);
  assert.match(source, /type ExplorationBattlePendingMeleeHit =/);
  assert.match(source, /impactAt: supportNow \+ Math\.min\(320/);
  assert.match(source, /target\.hp -= hit\.damage \* explorationZombieArmorDamageFactor/);
  assert.match(source, /unit\.cooldown = weapon\.fireRate \/ 1000/);
  assert.match(source, /unit\.reloadRemaining = weapon\.reload \/ 1000/);
  assert.match(source, /sound\.gunshot\(member\.weapon/);
  assert.match(source, /const pellets = weapon\.pellets \?\? 1/);
  assert.match(source, /const pelletHitChance = weapon\.pellets/);
  assert.match(source, /if \(Math\.random\(\) > pelletHitChance\) continue/);
  assert.match(source, /if \(region === "legs"\)[\s\S]*zombie\.kind !== "juggernaut" && Math\.random\(\) < \.5/);
  assert.match(source, /zombie\.knockedDownRemaining = Math\.max/);
  assert.match(source, /bone: zombie\.wounds\.filter\(\(wound\) => wound\.region === region\)\.length >= 2/);
  assert.match(source, /battle-unit-shared-model[\s\S]*<ExplorationMemberPreview member=\{member\}/);
  assert.match(source, /battle-enemy-shared-model[\s\S]*<ZombieKindPreview kind=\{zombie\.kind\}/);
  assert.match(source, /<ExplorationMemberPreview member=\{member\} battleScale/);
  assert.match(source, /className="battle-zombie-shared-preview" fillHeight/);
  assert.match(source, /const referenceRadius = fillHeight \? z\.radius : 36/);
  assert.match(source, /const scale = battleScale \? EXPLORATION_BATTLE_MEMBER_SCALE : 1\.9/);
  assert.match(source, /function ExplorationMemberPreview/);
  assert.match(source, /function drawSurvivalHumanHeadAndFace/);
  assert.match(source, /drawSurvivalHumanHeadAndFace\(ctx, facing, farmer \? "farmerHat" : police \? "policeCap" : soldier \? "combatHelmet" : "cap"\)/);
  assert.match(source, /if \(armor\.key === "civilian"\) \{\s*drawSurvivalHumanHeadAndFace\(ctx, facing, "cap"\)/);
  assert.match(source, /standingLegPose/);
  assert.match(source, /gaitLegPose/);
  assert.match(source, /drawWeaponModel\(ctx, member\.weapon/);
  assert.match(source, /computeReloadVisual\(member\.weapon/);
  assert.match(source, /drawReloadProps\(ctx, member\.weapon/);
  assert.match(source, /lottery-zombie-shared-preview/);
  assert.match(source, /screen === "explorationTeam"/);
  assert.match(source, /team-member-card[\s\S]*<ExplorationMemberPreview member=\{member\} \/>/);
  assert.match(source, /人员上阵/);
  assert.match(source, /消耗品上阵/);
  assert.match(source, /Array\.from\(\{ length: 3 \}/);
  assert.match(source, /当前上阵人员/);
  assert.match(source, /未上阵与待购买人员/);
  assert.match(source, /等级不能超过车辆等级/);
  assert.match(source, /levelSkills:[\s\S]*level: 5[\s\S]*level: 10[\s\S]*level: 15/);

  assert.match(css, /\.exploration-team-panel/);
  assert.match(css, /\.team-deployed-grid/);
  assert.match(css, /repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.team-member-card\.rarity-common/);
  assert.match(css, /\.team-member-card\.rarity-rare/);
  assert.match(css, /\.team-member-card\.rarity-epic/);
  assert.match(css, /\.team-member-card\.rarity-legendary/);
  assert.match(css, /\.team-member-preview/);
  assert.match(css, /\.team-consumable-grid[^}]*repeat\(3, 1fr\)/);
  assert.match(css, /\.battle-unit-shared-model[^}]*width: 108px[^}]*height: 184px/);
  assert.match(css, /\.battle-enemy-shared-model[^}]*width: 108px[^}]*height: 184px/);
});

test("adds escalating member upgrades, repeatable lottery rewards, shared hurt audio and the persistent starter pack", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const sound = await readFile(new URL("../app/sound.ts", import.meta.url), "utf8");

  assert.match(source, /function explorationMemberUpgradeCost\(level: number\) \{ return 200 \+ \(level - 1\) \* 50; \}/);
  assert.match(source, /const upgradeCost = explorationMemberUpgradeCost\(level\)/);
  assert.match(source, /const selectedExplorationMemberUpgradeCost = explorationMemberUpgradeCost\(selectedExplorationMemberLevel\)/);
  assert.match(source, /setLotteryRewards\(Array\.from\(\{ length: count \}, \(\) => rollLotteryRarity\(\)\)\)/);
  assert.doesNotMatch(source, /setLotteryRewards\([^\n]*new Set/);

  assert.match(source, /id: "combatSoldier"[\s\S]*name: "格斗士兵"[\s\S]*weapon: "combatknife"[\s\S]*rarity: "legendary"[\s\S]*trait: "攻速较快"[\s\S]*faction: "军队"[\s\S]*hp: 150[\s\S]*damage: 50[\s\S]*speed: "快"/);
  assert.match(source, /level: 5, name: "每攻击 3 次进行一次蹬踹"/);
  assert.match(source, /level: 10, name: "每次攻击 30% 概率连续攻击"/);
  assert.match(source, /level: 15, name: "每 10 秒投掷 100 伤害飞刀"/);
  assert.match(source, /combatSkills: \{ attackIntervalFactor: \.72, kickEvery: 3, comboChance: \.3, thrownKnifeInterval: 10, thrownKnifeDamage: 100 \}/);
  assert.match(source, /unit\.level >= 5 && unit\.attacksPerformed % combatSkills\.kickEvery === 0/);
  assert.match(source, /unit\.level >= 10 && Math\.random\(\) < combatSkills\.comboChance/);
  assert.match(source, /combatSkills && unit\.level >= 15 && unit\.skillCooldown <= 0/);
  assert.match(source, /target\.hp -= combatSkills\.thrownKnifeDamage/);
  assert.match(source, /className="battle-throwing-knife"/);
  assert.match(source, /drawWeaponModel\(ctx, "combatknife", 1\)/);
  assert.match(source, /function survivalKickDamage\(day: number\) \{ return 11 \+ day \* \.75; \}/);
  assert.match(source, /unit\.actionRemaining = KICK_ANIMATION_MS \/ 1000/);
  assert.match(source, /impactAt: performance\.now\(\) \+ KICK_IMPACT_DELAY_MS/);
  assert.match(source, /hp: zombie\.hp - survivalKickDamage\(1\) \* impactCount/);
  assert.match(source, /x: zombie\.x \+ explorationKickKnockbackPercent\(\) \* impactCount/);

  assert.match(source, /const EXPLORATION_STARTER_PACK_COST = 1000/);
  assert.match(source, /const EXPLORATION_STARTER_PACK_EXPERIENCE = 1000/);
  assert.match(source, /const EXPLORATION_STARTER_PACK_COINS = 3000/);
  assert.match(source, /starterPackPurchased: boolean/);
  assert.match(source, /setOwnedMemberIds\(\(owned\) => owned\.includes\("combatSoldier"\)/);
  assert.match(source, /starterPackPurchased \? "已购买" : `1000 点券购买`/);
  assert.match(css, /\.exploration-shop-panel[^}]*overflow-y: auto/);
  assert.match(css, /\.starter-pack-page[^}]*top: 100%/);
  assert.match(css, /\.starter-pack-page[^}]*border: 4px solid #d4ad3a/);

  assert.match(sound, /bodyHit\(options: PlayOptions = \{\}\)/);
  assert.match(source, /sound\.bodyHit\(\{ volume: distanceVolume\(z\.x, g\.player\.x\) \* \.58 \}\)/);
  assert.match(source, /sound\.playerHurt\(\{ volume: distanceVolume\(targetNpc\.field\.x, p\.x\) \* \.7 \}\)/);
  assert.match(source, /sound\.playerHurt\(\{ volume: \.62 \}\)/);
  assert.match(css, /\.battle-enemy-shared-model[^}]*width: 108px[^}]*height: 184px/);
  assert.match(css, /\.battle-unit-shared-model[^}]*width: 108px[^}]*height: 184px/);
  assert.doesNotMatch(source, /--enemy-scale/);
  assert.doesNotMatch(css, /--enemy-scale/);
});

test("adds midnight-reset daily missions and permanent exploration achievements", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const dailyBlock = source.slice(source.indexOf("const EXPLORATION_DAILY_TASKS"), source.indexOf("const EXPLORATION_ACHIEVEMENTS"));
  const achievementBlock = source.slice(source.indexOf("const EXPLORATION_ACHIEVEMENTS"), source.indexOf("const EXPLORATION_DAILY_TASK_IDS"));

  assert.equal((dailyBlock.match(/\{ id:/g) ?? []).length, 5);
  assert.match(dailyBlock, /complete-mainline[\s\S]*rewardCoins: 200, activity: 50/);
  assert.match(dailyBlock, /recruit-once[\s\S]*rewardExperience: 100, activity: 60/);
  assert.match(dailyBlock, /buy-consumable[\s\S]*rewardCoins: 400, activity: 100/);
  assert.match(dailyBlock, /earn-coins[\s\S]*target: 3000, rewardCoins: 500, activity: 70/);
  assert.match(dailyBlock, /earn-experience[\s\S]*target: 200, rewardExperience: 100, activity: 80/);
  assert.match(source, /EXPLORATION_DAILY_ACTIVITY_REWARD_TARGET = 300/);
  assert.match(source, /EXPLORATION_DAILY_ACTIVITY_REWARD_VOUCHERS = 100/);
  assert.match(source, /new Date\(now\.getFullYear\(\), now\.getMonth\(\), now\.getDate\(\) \+ 1\)/);
  assert.match(source, /activityRewardClaimed: true/);
  assert.match(source, /dailyProgress: explorationDailyProgress/);

  assert.equal((achievementBlock.match(/\{ id:/g) ?? []).length, 16);
  assert.match(achievementBlock, /farm-clear[\s\S]*target: 10, rewardVouchers: 1000/);
  assert.match(achievementBlock, /zombie-kills-50[\s\S]*rewardVouchers: 200/);
  assert.match(achievementBlock, /zombie-kills-500[\s\S]*rewardVouchers: 1000/);
  assert.match(achievementBlock, /lottery-1[\s\S]*rewardVouchers: 200/);
  assert.match(achievementBlock, /lottery-50[\s\S]*rewardVouchers: 500/);
  assert.match(achievementBlock, /spend-500[\s\S]*rewardVouchers: 100/);
  assert.match(achievementBlock, /spend-4000[\s\S]*rewardVouchers: 1000/);
  assert.match(source, /recordExplorationDailyMetric\("mainlineCompletions"\)/);
  assert.match(source, /recordExplorationDailyMetric\("recruitDraws", count\)/);
  assert.match(source, /lotteryDraws: progress\.lotteryDraws \+ count/);
  assert.match(source, /vouchersSpent: progress\.vouchersSpent \+ amount/);
  assert.match(source, /zombieKills: progress\.zombieKills \+ newlyKilled\.length/);

  assert.match(source, /changeScreen\("explorationTasks"\)/);
  assert.match(source, /role="tab" aria-selected=\{explorationTaskSystemTab === "daily"\}/);
  assert.match(source, /role="tab" aria-selected=\{explorationTaskSystemTab === "achievements"\}/);
  assert.match(source, /本日活跃度/);
  assert.match(source, /已完成/);
  assert.match(source, /claimExplorationDailyTask/);
  assert.match(source, /claimExplorationAchievement/);
  assert.match(source, /已领取/);
  assert.match(css, /\.exploration-tasks-panel/);
  assert.match(css, /\.daily-activity-card/);
  assert.match(css, /\.achievement-list/);

  assert.match(source, /ctx\.ellipse\(0, -123, 18, 3\.5/);
  assert.match(source, /ctx\.ellipse\(0, -126, 10\.5, 6\.5/);
});

test("keeps exploration zombies full-size and complete while attacking", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /function drawCompleteZombieBodyFrame\(/);
  assert.match(source, /function ZombieKindPreview[\s\S]*drawCompleteZombieBodyFrame\(ctx, z,/);
  assert.match(source, /for \(const z of g\.zombies\)[\s\S]*drawCompleteZombieBodyFrame\(ctx, z,/);
  assert.match(source, /const previewLength = knockedDown \? width - 18 : height - 14/);
  assert.match(source, /ctx\.translate\(knockedDown \? canvas\.width - 8 : canvas\.width \/ 2/);
  assert.match(source, /className=\{`battle-enemy battle-enemy-shared-model \$\{large \? "large" : ""\} \$\{knockedDown \? "knocked-down" : ""\}`\}/);
  assert.match(source, /width=\{knockedDown \? 184 : large \? 144 : 108\} height=\{knockedDown \? 108 : large \? 220 : 168\}/);
  assert.match(css, /\.battle-enemy-shared-model[^}]*width: 108px[^}]*height: 184px/);
  assert.match(css, /\.battle-enemy-shared-model\.knocked-down[^}]*width:\s*184px[^}]*height:\s*124px/);
  assert.match(css, /\.battle-unit-shared-model[^}]*width: 108px[^}]*height: 184px/);
  assert.match(source, /const EXPLORATION_BATTLE_MEMBER_SCALE = 3\.05/);
  assert.match(source, /const scale = battleScale \? EXPLORATION_BATTLE_MEMBER_SCALE : 1\.9/);
  assert.match(source, /type ExplorationBattleCorpse = \{/);
  assert.match(source, /corpses: ExplorationBattleCorpse\[\]/);
  assert.match(source, /type ExplorationBattleGroundProp = \{/);
  assert.match(source, /groundProps: ExplorationBattleGroundProp\[\]/);
  assert.match(source, /removeAt: supportNow \+ GROUND_PROP_MS/);
  assert.match(source, /battle\.groundProps\.filter\(\(prop\) => supportNow < prop\.removeAt\)/);
  assert.match(source, /explorationBattle\.groundProps\.map\(\(prop\)/);
  assert.match(source, /className=\{`battle-ground-prop battle-ground-\$\{prop\.kind\}`\}/);
  assert.match(source, /type ExplorationBattleBloodEffect = \{/);
  assert.match(source, /bloodEffects: ExplorationBattleBloodEffect\[\]/);
  assert.match(source, /className="battle-blood-splatter"/);
  assert.match(source, /removeAt: supportNow \+ ZOMBIE_CORPSE_MS/);
  assert.match(source, /battle\.corpses\.filter\(\(corpse\) => supportNow < corpse\.removeAt\)/);
  assert.match(source, /explorationBattle\.corpses\.map\(\(corpse\)/);
  assert.match(source, /className="battle-enemy battle-enemy-shared-model knocked-down battle-corpse"/);
  assert.match(css, /\.battle-corpse[^}]*pointer-events:\s*none/);
  assert.match(css, /\.battle-ground-prop/);
  assert.match(css, /\.battle-blood-splatter/);
});

test("uses weapon-specific reload audio and ten-second dropped firearm props in every mode", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const soundSource = await readFile(new URL("../app/sound.ts", import.meta.url), "utf8");

  assert.match(soundSource, /type ReloadTimbre =/);
  assert.match(soundSource, /export type FirearmSoundKey =/);
  assert.match(soundSource, /const RELOAD_TIMBRE: Record<FirearmSoundKey, ReloadTimbre>/);
  for (const weapon of ["glock17", "m1911", "mac11", "mp5k", "ak47", "m4", "m16", "scarh", "saiga12", "rem870", "sawedoff", "awm", "m107", "flint66", "m240l", "mg42", "pkm", "gatling", "rpg7", "m32"]) {
    assert.match(soundSource, new RegExp(`\\b${weapon}: \\{`));
  }
  assert.match(soundSource, /reload\(weaponKey: FirearmSoundKey, durationMs: number\)/);
  assert.match(source, /sound\.reload\(firearmWeapon!, weapon\.reload\)/);
  assert.match(source, /sound\.reload\(p\.weapon as FirearmSoundKey, weapon\.reload\)/);
  assert.match(source, /sound\.reload\("m1911", WEAPONS\.m1911\.reload\)/);
  assert.match(source, /sound\.reload\("m16", DRONE_RELOAD_MS\)/);
  assert.match(soundSource, /function firearmReloadInsertionTimeline/);
  assert.match(soundSource, /for \(const insertionProgress of timeline\.insertions\)/);
  assert.match(source, /firearmReloadInsertionTimeline\(key as FirearmSoundKey\)/);
  assert.match(soundSource, /rem870: \{ mechanism: "shells"[^}]*rounds: 7/);
  assert.match(source, /rem870: \{[^}]*reloadKind: "shells"[^}]*shellCount: 7/);
  assert.match(source, /m240l: \{[^}]*reloadKind: "belt"/);
  assert.match(source, /gatling: \{[^}]*reloadKind: "box"/);
  assert.match(source, /removeAt: now \+ GROUND_PROP_MS/);
  assert.match(source, /removeAt: supportNow \+ GROUND_PROP_MS/);
  assert.doesNotMatch(source, /MAX_GROUND_PROPS/);
  assert.doesNotMatch(source, /corpses = \[[\s\S]*?\]\.slice\(-80\)/);
  assert.match(source, /function zombieProjectileBlockKind/);
  assert.doesNotMatch(source, /explorationZombieShotBlocked/);
  assert.match(source, /function ExplorationGroundPropView[\s\S]*drawGroundProp\(ctx/);
  assert.match(source, /function ExplorationBloodEffectView[\s\S]*drawBloodStain\(ctx/);
  assert.match(source, /type ExplorationBattleSpit =/);
  assert.match(source, /launchAt: supportNow \+ 360 \+ burstIndex \* 150/);
  assert.match(source, /impactAt: supportNow \+ 840 \+ burstIndex \* 150/);
  assert.match(source, /damage: 20/);
  assert.match(source, /attackWindupRemaining = \.235/);
  assert.match(source, /weapon\.blastKind && weapon\.explosionRadius/);
  assert.match(source, /const penetration = Math\.max\(1, weapon\.penetration \?\? 1\)/);
  assert.match(source, /if \(WEAPONS\[weaponKey\]\.ignite\) zombie\.ignited = true/);
  assert.match(source, /kind: "shield"[\s\S]*removeAt: now \+ GROUND_PROP_MS/);
  assert.match(source, /const spitTarget = nearestUnit \?\? \{ id: "vehicle", x: 9, y: 12 \}/);
  assert.match(source, /explorationPlaneDistance\(target, \{ x: spit\.toX, y: spit\.toY \}\) > 3\.5/);
  assert.match(source, /if \(!weapon\.explosionRadius\) addGroundProp/);
  assert.match(source, /if \(BOLT_ACTION_WEAPONS\.has\(member\.weapon\)\) sound\.boltAction/);
  assert.match(source, /Math\.max\(\.1, 1 - penetrationIndex \* \.2\)/);
  assert.match(source, /if \(!penetrated\) break/);
});

test("adds manual reward claims, member growth and reusable exploration support items", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const claimExplorationDailyTask = useCallback/);
  assert.match(source, /const claimExplorationAchievement = useCallback/);
  assert.match(source, /claimedTaskIds/);
  assert.match(source, /hasUnclaimedExplorationReward/);
  assert.match(source, /task-unclaimed-dot/);
  assert.match(source, /className="task-claim-button"/);
  assert.doesNotMatch(source, /const newlyCompleted = EXPLORATION_DAILY_TASKS/);
  assert.match(css, /\.task-unclaimed-dot/);

  assert.match(source, /id: "civilian"[\s\S]*hpPerLevel: 5,[\s\S]*damagePerLevel: 1/);
  assert.match(source, /id: "farmer"[\s\S]*hpPerLevel: 3,[\s\S]*damagePerLevel: 2/);
  assert.match(source, /id: "combatSoldier"[\s\S]*hpPerLevel: 5,[\s\S]*damagePerLevel: 2/);
  assert.match(source, /function explorationMemberStatsAtLevel/);
  assert.match(source, /hp: stats\.hp,[\s\S]*damage: stats\.damage/);

  assert.match(source, /armySupport: \{ name: "军队支援", price: 3000/);
  assert.match(source, /armoredSupport: \{ name: "装甲车支援", price: 3000/);
  assert.match(source, /airSupport: \{ name: "空中支援", price: 2000/);
  assert.match(source, /EXPLORATION_CONSUMABLE_COOLDOWN_MS = 30000/);
  assert.match(source, /EXPLORATION_SUPPORT_DURATION_MS = 10000/);
  assert.match(source, /EXPLORATION_SUPPORT_ARRIVAL_MS = 550/);
  assert.match(source, /recordExplorationDailyMetric\("consumablesPurchased"\)/);
  assert.match(source, /使用金币购买/);
  assert.match(source, /setExplorationCoins\(\(coins\) => coins - item\.price\)/);
  assert.match(source, /5名M16士兵支援/);
  assert.match(source, /ExplorationMemberPreview member=\{EXPLORATION_SUPPORT_SOLDIER\}/);
  assert.match(source, /automaticWeaponStartedAt=\{armySupportReady/);
  assert.match(source, /support-soldier-model[\s\S]*battle-ejected-casing[\s\S]*battle-dropped-magazine/);
  assert.match(source, /重机枪装甲车支援/);
  assert.match(source, /function ExplorationArmoredSupportModel/);
  assert.match(source, /drawLevel8ArmoredVehicle\(ctx/);
  assert.match(source, /LEVEL8_HMG_FIRE_MS[\s\S]*LEVEL8_HMG_PENETRATION/);
  assert.match(source, /armoredSupportNextShotAt \+= LEVEL8_HMG_FIRE_MS/);
  assert.match(source, /armySupportNextShotAt \+= WEAPONS\.m16\.fireRate/);
  assert.match(source, /resolveExplorationProjectileHit\(zombie, "m16", weaponDamage\("m16"\)/);
  assert.match(source, /weaponDamage\(member\.weapon\) \+ \(unit\.damage - member\.damage\) \/ pellets/);
  assert.match(source, /sound\.airstrike\(\)/);
  assert.match(source, /impactAt: now \+ 550[\s\S]*impacted: false/);
  assert.match(source, /damageExplorationZombieFromExplosion\(zombie, 500 \* hitCount/);
  assert.match(source, /zombie\.shieldHp -= damage/);
  assert.match(source, /const detachChance = Math\.min\(\.94/);
  assert.match(source, /zombie\.knockedDownRemaining = Math\.max/);
  assert.match(source, /dropletCount = 13/);
  assert.match(source, /if \(!penetrated\) break/);
  assert.match(source, /!WEAPONS\[member\.weapon\]\.explosionRadius/);
  assert.match(source, /zombie\.attackWindupRemaining = \.235/);
  assert.match(source, /zombie\.attackAnimationRemaining = \.56/);
  assert.match(source, /zombie\.attackImpactAt = supportNow \+ 235/);
  assert.match(source, /zombie\.attackAnimationUntil = supportNow \+ 560/);
  assert.match(source, /actionStartedAt=\{zombie\.action === "attack" \? zombie\.attackStartedAt : undefined\}/);
  assert.match(source, /zombie\.cooldown = \.72/);
  assert.match(source, /type ExplorationBattleDetachedLimb =/);
  assert.match(source, /type ExplorationBattleMetalShard =/);
  assert.match(source, /ExplorationDetachedLimbView/);
  assert.match(source, /ExplorationMetalShardView/);
  assert.match(source, /const stainCount = projectStains && Math\.random\(\) < \.7/);
  assert.match(source, /const falloff = \.45 \+ \.55 \* Math\.max/);
  assert.match(source, /const limbScale = radius \/ 25 \* CHARACTER_SCALE/);
  assert.match(source, /socketX, socketY, 15, false/);
  assert.match(source, /const shieldShards = Array\.from\(\{ length: 12 \}/);
  assert.match(source, /ExplorationAirstrikeEffectView/);
  assert.match(source, /battle-classic-blast/);
  assert.match(css, /\.consumable-shop-page[^}]*top: 200%/);
  assert.match(css, /\.battle-consumable-bar/);
});

test("shares consumable icons, classic gunfire and classic airstrike explosions across exploration UI", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /function ExplorationConsumableIcon/);
  assert.match(source, /consumable-product-icon[\s\S]*ExplorationConsumableIcon/);
  assert.match(source, /team-consumable-slot equipped[\s\S]*ExplorationConsumableIcon/);
  assert.match(source, /battle-consumable-bar[\s\S]*ExplorationConsumableIcon/);
  assert.match(source, /kind === "armySupport"[\s\S]*Array\.from\(\{ length: 5 \}/);
  assert.match(source, /kind === "armoredSupport"[\s\S]*ExplorationArmoredSupportModel/);
  assert.match(source, /function ExplorationFighterIcon/);
  assert.match(source, /function drawSurvivalMuzzleFlash/);
  assert.match(source, /automaticWeaponStartedAt/);
  assert.match(source, /support-bullet-tracer/);
  assert.match(source, /shotTarget: \{ x: number; y: number \} \| null/);
  assert.match(source, /shotSerial: number/);
  assert.match(source, /unit\.shotTarget = \{ x: target\.x, y: target\.y \}/);
  assert.match(source, /className="battle-unit-bullet-tracers"/);
  assert.match(source, /key=\{`\$\{unit\.id\}-\$\{unit\.shotSerial\}`\}/);
  assert.match(source, /className="battle-unit-bullet-tracer"/);
  assert.match(css, /\.battle-unit-bullet-tracers/);
  assert.match(css, /\.battle-unit-bullet-tracer/);
  assert.match(source, /armored-support-tracer/);
  assert.match(source, /EXPLORATION_ARMORED_SUPPORT_INITIAL_AMMO = 46/);
  assert.match(source, /armoredSupportAmmo: EXPLORATION_ARMORED_SUPPORT_INITIAL_AMMO/);
  assert.match(source, /armoredSupportReloadUntil = armoredSupportNextShotAt \+ LEVEL8_HMG_RELOAD_MS/);
  assert.match(source, /armoredSupportFiring &&/);
  assert.match(source, /firingStartedAt !== undefined \|\| reloadUntil > now/);
  assert.match(source, /function dropLevel8AmmoBox/);
  assert.match(source, /armySupportReady && explorationBattleHasLivingZombies/);
  assert.match(source, /armored-ejected-casing/);
  assert.match(source, /armored-dropped-ammo-box/);
  assert.match(source, /function ExplorationAirstrikeEffectView/);
  assert.match(source, /drawBlastEffect\(ctx, blast, now\)/);
  assert.match(source, /drawAirstrikeBombModel/);
  assert.match(source, /impactAt: supportNow, until: supportNow \+ ITEMS\.airstrike\.blastDuration/);
  assert.match(css, /\.consumable-icon/);
  assert.match(css, /\.airstrike-falling-bomb/);
  assert.match(css, /\.armored-ejected-casing/);
  assert.match(css, /\.armored-dropped-ammo-box/);
});

test("supports paid supplies, repeat summons and a stable two-dimensional exploration battlefield", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /courageCost: number/);
  assert.match(source, /name: "平民"[\s\S]*?courageCost: 10/);
  assert.match(source, /name: "农民"[\s\S]*?courageCost: 15/);
  assert.match(source, /name: "格斗士兵"[\s\S]*?courageCost: 15/);
  assert.match(source, /召唤勇气值[\s\S]*selectedExplorationMember\.courageCost/);
  assert.match(source, /nextUnitId/);
  assert.match(source, /member-\$\{memberId\}-\$\{battle\.nextUnitId\}/);
  assert.match(source, /courage: battle\.courage - member\.courageCost/);
  assert.doesNotMatch(source, /battle\.deployed\.includes\(id\)/);
  assert.match(source, /explorationCoins < item\.price/);
  assert.match(source, /setExplorationCoins\(\(coins\) => coins - item\.price\)/);
  assert.match(source, /购买 · \{item\.price\} 金币/);
  assert.doesNotMatch(source, /测试阶段全部免费/);
  assert.match(source, /function explorationBattleSpawnPoint/);
  assert.match(source, /type ExplorationBattleZombie = \{[^}]*y: number/);
  assert.match(source, /type ExplorationBattleUnit = \{[^}]*y: number/);
  assert.match(source, /explorationPlaneDistance/);
  assert.match(source, /style=\{\{ left: `\$\{zombie\.x\}%`, bottom: `\$\{zombie\.y\}%`/);
  assert.match(source, /type ExplorationBattleState = \{[\s\S]*zombiesAlerted: boolean/);
  assert.match(source, /zombiesAlerted: false/);
  assert.match(source, /const zombieWasHit = zombies\.some/);
  assert.match(source, /const zombiesAlerted = battle\.zombiesAlerted \|\| zombieWasHit/);
  assert.match(source, /if \(!zombiesAlerted\) \{ zombie\.action = "guard"; return; \}/);
  assert.match(source, /return \{ \.\.\.battle,[^}]*zombiesAlerted,/);
  assert.doesNotMatch(source, /target\.missingLimbs = \[/);
  assert.match(source, /battle-squad-bar[\s\S]*ExplorationMemberPreview member=\{member\}/);
  assert.match(css, /\.battle-consumable-bar[^}]*top:\s*12px/);
  assert.match(css, /\.battle-consumable-bar[^}]*left:\s*50%/);
  assert.match(css, /\.battle-top-hud[^}]*top:\s*78px/);
  assert.match(css, /--battle-entity-width:\s*108px/);
  assert.match(css, /\.battle-squad-bar \.team-member-preview/);
});

test("recruits a rare police officer through the task two roadside cinematic", async () => {
  const source = await readFile(new URL("../app/DeadRoadGame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /type ExplorationRecruitPhase = "approach" \| "dialog" \| "reward"/);
  assert.match(source, /"explorationRecruit"/);
  assert.match(source, /id: "police"[\s\S]*?name: "警察"[\s\S]*?weapon: "glock17"/);
  assert.match(source, /id: "police"[\s\S]*?rarity: "rare"[\s\S]*?trait: "无"[\s\S]*?faction: "警察"/);
  assert.match(source, /id: "police"[\s\S]*?hp: 70[\s\S]*?damage: weaponDamage\("glock17"\)/);
  assert.match(source, /id: "police"[\s\S]*?damage: weaponDamage\("glock17"\) \* \.75/);
  assert.match(source, /id: "police"[\s\S]*?hpPerLevel: 3[\s\S]*?damagePerLevel: 2/);
  assert.match(source, /id: "police"[\s\S]*?speed: "中等"[\s\S]*?courageCost: 20/);
  assert.match(source, /const EXPLORATION_TASK2_NORMAL_ZOMBIE_COUNT = 5/);
  assert.match(source, /const EXPLORATION_TASK2_RUNNER_ZOMBIE_COUNT = 2/);
  assert.match(source, /const EXPLORATION_TASK2_COINS = 1641/);
  assert.match(source, /const EXPLORATION_TASK2_EXPERIENCE = 154/);
  assert.match(source, /Array\.from\(\{ length: EXPLORATION_TASK2_NORMAL_ZOMBIE_COUNT \}, \(\) => "normal" as const\)/);
  assert.match(source, /Array\.from\(\{ length: EXPLORATION_TASK2_RUNNER_ZOMBIE_COUNT \}, \(\) => "runner" as const\)/);
  assert.match(source, /2: \{ openingZombieKinds: EXPLORATION_TASK2_OPENING_ZOMBIE_KINDS/);
  assert.match(source, /2: \{[\s\S]*?reward: "police"[\s\S]*?rewardCoins: EXPLORATION_TASK2_COINS[\s\S]*?rewardExperience: EXPLORATION_TASK2_EXPERIENCE/);
  assert.match(source, /explorationBattleTaskConfig\(battle\.taskOrder\)\.finite/);
  assert.match(source, /taskConfig\.reward === "police"[\s\S]*setOwnedMemberIds[\s\S]*"police"/);
  assert.match(source, /const recruitDelay = Math\.max\(240, latestCorpseRemoval - performance\.now\(\)\)/);
  assert.match(source, /changeScreen\("explorationRecruit"\);[\s\S]*}, recruitDelay\)/);
  assert.match(source, /setExplorationCoins\(\(coins\) => coins \+ taskConfig\.rewardCoins\)/);
  assert.match(source, /setExplorationExperience\(\(experience\) => experience \+ taskConfig\.rewardExperience\)/);
  assert.match(source, /recordExplorationDailyEarnings\(taskConfig\.rewardCoins, taskConfig\.rewardExperience\)/);
  assert.match(source, /!explorationBattle\.rewardEligible \|\| taskConfig\.reward !== "police"/);
  assert.doesNotMatch(source, /explorationRecruitRewardEligible/);
  assert.match(source, /\+\{EXPLORATION_TASK2_COINS\} 金币[\s\S]*\+\{EXPLORATION_TASK2_EXPERIENCE\} 经验点数/);
  assert.match(source, /!explorationBattle\.completed \|\| !explorationBattle\.rewardEligible \|\| taskConfig\.reward !== "police"/);
  assert.match(source, /changeScreen\("explorationRecruit"\)/);
  assert.match(source, /setExplorationMemberLevels\([\s\S]*police: levels\.police \?\? 1/);
  assert.match(source, /平民[\s\S]*你可以加入我们/);
  assert.match(source, /screen === "explorationRecruit"/);
  assert.match(source, /ExplorationMemberPreview member=\{policeRecruitMember\}/);
  assert.match(source, /稀有人员[\s\S]*警察/);
  assert.match(css, /\.exploration-recruit-panel/);
  assert.match(css, /\.recruit-police/);
  assert.match(css, /\.recruit-reward-card[^{]*\{[^}]*#4ea8ff/);
});
