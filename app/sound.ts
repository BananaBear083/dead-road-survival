"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- webkitAudioContext fallback needs a loose cast */

/**
 * 《死路求生》程序生成音效系统。
 *
 * 所有音效均由 Web Audio API 实时合成（振荡器 + 预生成噪声缓冲 + 滤波/包络），
 * 不加载任何外部音频文件。AudioContext 懒加载，并在首次用户手势
 * （pointerdown / keydown）时 resume，以满足浏览器自动播放策略。
 *
 * 性能约定：
 * - 白噪声缓冲只生成一次并全局复用；
 * - 并发发声数上限 MAX_VOICES，超出时驱逐最旧的非关键音效；
 * - 所有 play 调用均为非阻塞的“即发即弃”，不干扰游戏主循环。
 */

export type MeleeKind = "slash" | "stab" | "heavy";
export type PlayOptions = { volume?: number };

const MUTE_KEY = "dead-road-muted";
const VOLUME_KEY = "dead-road-volume";
const MAX_VOICES = 24;
const NOISE_SECONDS = 2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
let muteLoaded = false;
let masterVolume = 0.85;
let volumeLoaded = false;

type Voice = { stop: () => void; critical: boolean; startedAt: number };
const voices = new Set<Voice>();

function loadMuted() {
  if (muteLoaded || typeof window === "undefined") return;
  muteLoaded = true;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
}

function loadVolume() {
  if (volumeLoaded || typeof window === "undefined") return;
  volumeLoaded = true;
  try {
    const saved = Number(window.localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(saved) && saved >= 0 && saved <= 1) masterVolume = saved;
  } catch {
    /* 读取失败保留默认音量 */
  }
}

function applyMasterGain() {
  if (!ctx || !master) return;
  const target = muted ? 0 : masterVolume;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
}

function makeNoiseBuffer(audio: AudioContext): AudioBuffer {
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * NOISE_SECONDS), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  loadMuted();
  loadVolume();
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterVolume;
    master.connect(ctx.destination);
    noiseBuffer = makeNoiseBuffer(ctx);
  }
  return ctx;
}

/** 首次用户手势时调用，恢复被浏览器挂起的 AudioContext。 */
function unlock() {
  const audio = ensureContext();
  if (audio && audio.state === "suspended") void audio.resume();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

/**
 * 登记一个发声体；超出并发上限时驱逐最旧的非关键音效，
 * 若全都是关键音效则驱逐最旧的一个，保证新音效可播放。
 */
function track(sources: AudioScheduledSourceNode[], critical = false): boolean {
  const audio = ctx;
  if (!audio || !master) return false;
  if (voices.size >= MAX_VOICES) {
    let victim: Voice | undefined;
    for (const candidate of voices) {
      if (!candidate.critical && (!victim || candidate.startedAt < victim.startedAt)) victim = candidate;
    }
    if (!victim) {
      for (const candidate of voices) {
        if (!victim || candidate.startedAt < victim.startedAt) victim = candidate;
      }
    }
    if (victim) {
      voices.delete(victim);
      victim.stop();
    }
  }
  const voice: Voice = {
    critical,
    startedAt: audio.currentTime,
    stop: () => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* 已停止的节点忽略 */
        }
      }
    },
  };
  voices.add(voice);
  sources[sources.length - 1].onended = () => {
    voices.delete(voice);
  };
  return true;
}

/** 指数包络：attack 快速起音，decay 衰减到接近 0。 */
function envelope(param: AudioParam, at: number, peak: number, attack: number, decay: number) {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.max(0.001, attack));
  param.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

type ToneOptions = {
  type: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  volume: number;
  attack?: number;
  delay?: number;
  vibratoRate?: number;
  vibratoDepth?: number;
  filter?: { type: BiquadFilterType; frequency: number; q?: number };
  critical?: boolean;
  /** 输出目标节点（默认主增益；环境音事件传入环境层增益以参与交叉淡变）。 */
  dest?: AudioNode;
};

/** 播放一个带包络与可选滤波/颤音的振荡器音。 */
function tone(options: ToneOptions) {
  const audio = ensureContext();
  if (!audio || !master || muted) return;
  const at = audio.currentTime + (options.delay ?? 0);
  const osc = audio.createOscillator();
  osc.type = options.type;
  osc.frequency.setValueAtTime(Math.max(1, options.from), at);
  if (options.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), at + options.duration);
  }
  const gain = audio.createGain();
  envelope(gain.gain, at, options.volume, options.attack ?? 0.005, options.duration);
  let head: AudioNode = osc;
  if (options.filter) {
    const filter = audio.createBiquadFilter();
    filter.type = options.filter.type;
    filter.frequency.value = options.filter.frequency;
    filter.Q.value = options.filter.q ?? 1;
    head.connect(filter);
    head = filter;
  }
  head.connect(gain);
  gain.connect(options.dest ?? master);
  const sources: AudioScheduledSourceNode[] = [osc];
  if (options.vibratoRate && options.vibratoDepth) {
    const lfo = audio.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = options.vibratoRate;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = options.vibratoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + options.duration + 0.2);
    sources.push(lfo);
  }
  if (!track(sources, options.critical)) return;
  osc.start(at);
  osc.stop(at + options.duration + 0.2);
}

type NoiseOptions = {
  duration: number;
  volume: number;
  attack?: number;
  delay?: number;
  playbackRate?: number;
  filter?: { type: BiquadFilterType; from: number; to?: number; q?: number };
  critical?: boolean;
  /** 输出目标节点（默认主增益；环境音事件传入环境层增益以参与交叉淡变）。 */
  dest?: AudioNode;
};

/** 播放一段复用白噪声缓冲的滤波噪声。 */
function noise(options: NoiseOptions) {
  const audio = ensureContext();
  if (!audio || !master || !noiseBuffer || muted) return;
  const at = audio.currentTime + (options.delay ?? 0);
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  source.playbackRate.value = options.playbackRate ?? 1;
  const gain = audio.createGain();
  envelope(gain.gain, at, options.volume, options.attack ?? 0.004, options.duration);
  let head: AudioNode = source;
  if (options.filter) {
    const filter = audio.createBiquadFilter();
    filter.type = options.filter.type;
    filter.frequency.setValueAtTime(Math.max(10, options.filter.from), at);
    if (options.filter.to !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(10, options.filter.to), at + options.duration);
    }
    filter.Q.value = options.filter.q ?? 0.8;
    head.connect(filter);
    head = filter;
  }
  head.connect(gain);
  gain.connect(options.dest ?? master);
  if (!track([source], options.critical)) return;
  source.start(at, Math.random() * NOISE_SECONDS * 0.5);
  source.stop(at + options.duration + 0.25);
}

function isMuted() {
  loadMuted();
  return muted;
}

function setMuted(next: boolean) {
  loadMuted();
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* 隐私模式下写失败仅本次不持久化 */
  }
  applyMasterGain();
}

/** 单层噪声参数（from/to 为滤波频率扫描）。 */
type NoiseLayer = {
  filterType: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
  duration: number;
  volume: number;
  playbackRate?: number;
  delay?: number;
  attack?: number;
};

/** 每把枪的音色配方：初段爆音 + 枪口低频 thump + 可选主体/尾音/回声/特殊层。 */
type GunTimbre = {
  /** 初段爆音：短促噪声脉冲，中心频率决定“脆/闷/尖”。 */
  crack: NoiseLayer;
  /** 枪口低频 thump：正弦下滑，决定“重量感”。 */
  thump: { from: number; to: number; duration: number; volume: number };
  /** 低通主体轰响（射速 <70ms 的武器连发时自动省略防糊）。 */
  body?: NoiseLayer;
  /** 机械/金属尾音（射速 <70ms 时自动省略）。 */
  tail?: NoiseLayer;
  /** 山谷式远回声（狙击）。 */
  echo?: NoiseLayer;
  /** 霰弹多弹丸散射 tick 数。 */
  pellets?: number;
  /** 泵动霰弹枪：击发约 0.3s 后的 chk-chk 上膛声。 */
  pump?: boolean;
  /** 火箭推进嘶声（RPG-7）。 */
  hiss?: NoiseLayer;
  /** 大口径/爆炸物关键音效，驱逐时优先保留。 */
  critical?: boolean;
};

/** 逐枪音色表（与 DeadRoadGame.tsx 中 WEAPONS 对齐；听感参考现实特征）。 */
const GUN_TIMBRE: Record<string, GunTimbre> = {
  // —— 手枪 ——
  glock17: { // 9mm：尖锐高频、短促干净
    crack: { filterType: "bandpass", from: 2600, q: 0.8, duration: 0.07, volume: 0.5, playbackRate: 1.5 },
    thump: { from: 210, to: 85, duration: 0.06, volume: 0.42 },
    tail: { filterType: "bandpass", from: 3200, q: 3, duration: 0.035, volume: 0.09, delay: 0.055, playbackRate: 1.6 },
  },
  m1911: { // .45 ACP：更沉闷厚重，低频占比高
    crack: { filterType: "bandpass", from: 1800, q: 0.8, duration: 0.09, volume: 0.5, playbackRate: 1.3 },
    thump: { from: 165, to: 68, duration: 0.1, volume: 0.56 },
    body: { filterType: "lowpass", from: 850, duration: 0.12, volume: 0.24, playbackRate: 0.9 },
    tail: { filterType: "bandpass", from: 2600, q: 3, duration: 0.04, volume: 0.08, delay: 0.06, playbackRate: 1.5 },
  },
  // —— 冲锋枪 ——
  mac11: { // 射速极高：碎而轻，单发极短（连发自动精简）
    crack: { filterType: "bandpass", from: 2950, q: 0.9, duration: 0.042, volume: 0.3, playbackRate: 1.7 },
    thump: { from: 235, to: 110, duration: 0.038, volume: 0.26 },
  },
  mp5k: { // 9mm 滚柱延迟：闷而紧凑
    crack: { filterType: "bandpass", from: 2250, q: 0.9, duration: 0.055, volume: 0.34, playbackRate: 1.5 },
    thump: { from: 190, to: 85, duration: 0.055, volume: 0.36 },
    body: { filterType: "lowpass", from: 1050, duration: 0.06, volume: 0.16, playbackRate: 1.1 },
  },
  // —— 步枪 ——
  ak47: { // 粗重中频“咔-砰”，尾音带金属感
    crack: { filterType: "bandpass", from: 1500, q: 0.7, duration: 0.11, volume: 0.54, playbackRate: 1.25 },
    thump: { from: 150, to: 60, duration: 0.12, volume: 0.5 },
    body: { filterType: "lowpass", from: 720, duration: 0.15, volume: 0.28, playbackRate: 1 },
    tail: { filterType: "bandpass", from: 2550, q: 4, duration: 0.12, volume: 0.08, delay: 0.05, playbackRate: 1.5 },
  },
  m16: { // 高频尖锐的“啪”，清脆、尾音短
    crack: { filterType: "bandpass", from: 2900, q: 0.9, duration: 0.075, volume: 0.5, playbackRate: 1.6 },
    thump: { from: 205, to: 92, duration: 0.06, volume: 0.38 },
    tail: { filterType: "bandpass", from: 3400, q: 3.5, duration: 0.05, volume: 0.07, delay: 0.045, playbackRate: 1.6 },
  },
  m4: { // 短枪管卡宾枪：比 M16 更紧凑、更干脆
    crack: { filterType: "bandpass", from: 3050, q: 0.95, duration: 0.066, volume: 0.48, playbackRate: 1.65 },
    thump: { from: 215, to: 96, duration: 0.055, volume: 0.36 },
    tail: { filterType: "bandpass", from: 3600, q: 3.8, duration: 0.04, volume: 0.065, delay: 0.04, playbackRate: 1.7 },
  },
  scarh: { // 7.62 重锤：比 M16 更沉更慢
    crack: { filterType: "bandpass", from: 1300, q: 0.7, duration: 0.13, volume: 0.55, playbackRate: 1.15 },
    thump: { from: 130, to: 54, duration: 0.16, volume: 0.58 },
    body: { filterType: "lowpass", from: 620, duration: 0.18, volume: 0.3, playbackRate: 0.95 },
  },
  // —— 狙击 ——
  awm: { // 巨大初速爆音 + 长回声尾
    crack: { filterType: "bandpass", from: 2100, q: 0.8, duration: 0.18, volume: 0.6, playbackRate: 1.3 },
    thump: { from: 120, to: 38, duration: 0.5, volume: 0.75 },
    body: { filterType: "lowpass", from: 480, duration: 0.7, volume: 0.4, playbackRate: 0.7 },
    echo: { filterType: "bandpass", from: 1600, q: 1, duration: 0.55, volume: 0.16, delay: 0.26, playbackRate: 0.8, attack: 0.03 },
    critical: true,
  },
  m107: { // .50 BMG 半自动反器材：强烈低频冲击与机械回响
    crack: { filterType: "bandpass", from: 1350, q: 0.75, duration: 0.24, volume: 0.66, playbackRate: 1.05 },
    thump: { from: 88, to: 27, duration: 0.68, volume: 0.9 },
    body: { filterType: "lowpass", from: 350, duration: 0.85, volume: 0.47, playbackRate: 0.58 },
    echo: { filterType: "bandpass", from: 980, q: 1, duration: 0.75, volume: 0.2, delay: 0.31, playbackRate: 0.68, attack: 0.04 },
    critical: true,
  },
  flint66: { // 12.7 反器材：比 AWM 更低沉的胸腔爆音 + 远距滚雷尾音
    crack: { filterType: "bandpass", from: 1500, q: 0.8, duration: 0.22, volume: 0.62, playbackRate: 1.1 },
    thump: { from: 96, to: 30, duration: 0.62, volume: 0.85 },
    body: { filterType: "lowpass", from: 380, duration: 0.8, volume: 0.44, playbackRate: 0.62 },
    echo: { filterType: "bandpass", from: 1100, q: 1, duration: 0.7, volume: 0.18, delay: 0.3, playbackRate: 0.7, attack: 0.04 },
    critical: true,
  },
  // —— 霰弹枪 ——
  sawedoff: { // 短截：更“炸”、尾音短
    crack: { filterType: "bandpass", from: 1250, q: 0.7, duration: 0.1, volume: 0.42, playbackRate: 1.1 },
    thump: { from: 108, to: 40, duration: 0.3, volume: 0.8 },
    body: { filterType: "lowpass", from: 780, duration: 0.2, volume: 0.5, playbackRate: 0.85 },
    pellets: 3,
    critical: true,
  },
  saiga12: { // 半自动：轰响 + 自动机金属尾
    crack: { filterType: "bandpass", from: 1350, q: 0.7, duration: 0.09, volume: 0.42, playbackRate: 1.15 },
    thump: { from: 115, to: 44, duration: 0.26, volume: 0.72 },
    body: { filterType: "lowpass", from: 800, duration: 0.19, volume: 0.46, playbackRate: 0.9 },
    tail: { filterType: "bandpass", from: 1800, q: 2.5, duration: 0.06, volume: 0.1, delay: 0.12, playbackRate: 1.3 },
    pellets: 3,
    critical: true,
  },
  rem870: { // 泵动：击发约 0.3s 后 chk-chk 上膛
    crack: { filterType: "bandpass", from: 1150, q: 0.7, duration: 0.11, volume: 0.44, playbackRate: 1.1 },
    thump: { from: 110, to: 42, duration: 0.3, volume: 0.78 },
    body: { filterType: "lowpass", from: 750, duration: 0.22, volume: 0.5, playbackRate: 0.85 },
    pellets: 3,
    pump: true,
    critical: true,
  },
  // —— 机枪 ——
  pkm: { // 比 M240 更“干”：脆壳突出、轰响少
    crack: { filterType: "bandpass", from: 1750, q: 0.8, duration: 0.085, volume: 0.42, playbackRate: 1.3 },
    thump: { from: 148, to: 62, duration: 0.085, volume: 0.42 },
    body: { filterType: "lowpass", from: 780, duration: 0.09, volume: 0.18, playbackRate: 1 },
    tail: { filterType: "bandpass", from: 2300, q: 3, duration: 0.05, volume: 0.06, delay: 0.05, playbackRate: 1.4 },
  },
  m240l: { // 中射速重响
    crack: { filterType: "bandpass", from: 1500, q: 0.8, duration: 0.095, volume: 0.42, playbackRate: 1.25 },
    thump: { from: 136, to: 56, duration: 0.1, volume: 0.46 },
    body: { filterType: "lowpass", from: 680, duration: 0.12, volume: 0.26, playbackRate: 0.95 },
  },
  mg42: { // 1200 RPM：短促锐裂、密集机械节奏
    crack: { filterType: "bandpass", from: 2050, q: 0.9, duration: 0.048, volume: 0.34, playbackRate: 1.5 },
    thump: { from: 158, to: 68, duration: 0.046, volume: 0.34 },
    body: { filterType: "lowpass", from: 760, duration: 0.05, volume: 0.13, playbackRate: 1.05 },
  },
  gatling: { // 单发极短，靠 42ms 射速连成蜂鸣；旋转底噪由 setGatlingSpin 提供
    crack: { filterType: "bandpass", from: 2550, q: 1, duration: 0.034, volume: 0.24, playbackRate: 1.7 },
    thump: { from: 185, to: 85, duration: 0.032, volume: 0.2 },
  },
  // —— 爆炸物发射 ——
  rpg7: { // 闷“噗”出膛 + 火箭推进嘶声
    crack: { filterType: "lowpass", from: 420, duration: 0.28, volume: 0.4, playbackRate: 0.7 },
    thump: { from: 92, to: 36, duration: 0.32, volume: 0.68 },
    hiss: { filterType: "bandpass", from: 900, to: 3200, q: 0.7, duration: 0.65, volume: 0.22, delay: 0.05, playbackRate: 1.1, attack: 0.06 },
    critical: true,
  },
  m32: { // 榴弹“嗵”的闷响
    crack: { filterType: "bandpass", from: 850, q: 0.8, duration: 0.06, volume: 0.18, playbackRate: 0.9 },
    thump: { from: 76, to: 34, duration: 0.24, volume: 0.62 },
    body: { filterType: "lowpass", from: 360, duration: 0.18, volume: 0.34, playbackRate: 0.7 },
    critical: true,
  },
};

/** 按每把枪的音色配方渲染枪声；fireRateMs <70 时自动精简分层并略降音量，连发不糊。 */
function gunshot(weaponKey: string, options: PlayOptions & { fireRateMs?: number } = {}) {
  const timbre = GUN_TIMBRE[weaponKey] ?? GUN_TIMBRE.glock17;
  const v = options.volume ?? 1;
  const compact = (options.fireRateMs ?? 999) < 70;
  const loud = compact ? 0.85 : 1;
  const critical = timbre.critical ?? false;
  const play = (layer: NoiseLayer) => noise({
    duration: layer.duration,
    volume: layer.volume * v * loud,
    attack: layer.attack,
    delay: layer.delay,
    playbackRate: layer.playbackRate,
    filter: { type: layer.filterType, from: layer.from, to: layer.to, q: layer.q },
    critical,
  });
  play(timbre.crack);
  tone({ type: "sine", from: timbre.thump.from, to: timbre.thump.to, duration: timbre.thump.duration, volume: timbre.thump.volume * v * loud, critical });
  if (timbre.body && !compact) play(timbre.body);
  if (timbre.tail && !compact) play(timbre.tail);
  if (timbre.echo) play(timbre.echo);
  if (timbre.pellets) {
    for (let i = 0; i < timbre.pellets; i++) {
      noise({ duration: 0.03, volume: 0.15 * v, delay: 0.02 + i * 0.018, filter: { type: "highpass", from: 2600 }, critical });
    }
  }
  if (timbre.pump && !compact) {
    noise({ duration: 0.05, volume: 0.14 * v, delay: 0.32, filter: { type: "bandpass", from: 1500, q: 1.5 }, playbackRate: 1.2 });
    noise({ duration: 0.05, volume: 0.14 * v, delay: 0.45, filter: { type: "bandpass", from: 1950, q: 1.5 }, playbackRate: 1.2 });
  }
  if (timbre.hiss) play(timbre.hiss);
}

/** 爆炸三段结构配方：初爆（低频轰+噪声团）→ 碎裂（高频屑片）→ 滚雷尾（长低频衰减）。 */
type ExplosionProfile = {
  boom: { from: number; to: number; duration: number; volume: number };
  blast: { from: number; to: number; duration: number; volume: number; playbackRate: number };
  debris: { count: number; brightness: number; volume: number };
  rumble?: { duration: number; volume: number; frequency: number };
};

const EXPLOSION_PROFILES: Record<string, ExplosionProfile> = {
  frag: { // 破片手雷：高频碎裂感强
    boom: { from: 76, to: 28, duration: 0.55, volume: 0.75 },
    blast: { from: 1000, to: 150, duration: 0.5, volume: 0.6, playbackRate: 0.7 },
    debris: { count: 6, brightness: 1.4, volume: 0.15 },
    rumble: { duration: 0.9, volume: 0.25, frequency: 220 },
  },
  claymore: { // 阔剑雷：更脆、低频少，定向喷射感
    boom: { from: 82, to: 32, duration: 0.42, volume: 0.62 },
    blast: { from: 1450, to: 260, duration: 0.38, volume: 0.55, playbackRate: 0.9 },
    debris: { count: 7, brightness: 1.7, volume: 0.14 },
    rumble: { duration: 0.55, volume: 0.16, frequency: 260 },
  },
  rocket: { // RPG 战斗部：中等偏大爆炸
    boom: { from: 64, to: 24, duration: 0.8, volume: 0.95 },
    blast: { from: 800, to: 100, duration: 0.75, volume: 0.7, playbackRate: 0.55 },
    debris: { count: 5, brightness: 1, volume: 0.14 },
    rumble: { duration: 1.4, volume: 0.35, frequency: 150 },
  },
  grenade: { // M32 40mm：小型爆炸
    boom: { from: 86, to: 34, duration: 0.45, volume: 0.6 },
    blast: { from: 900, to: 180, duration: 0.4, volume: 0.45, playbackRate: 0.75 },
    debris: { count: 3, brightness: 1.1, volume: 0.1 },
    rumble: { duration: 0.7, volume: 0.2, frequency: 200 },
  },
  airstrike: { // 航弹：超大低频 + 长滚雷尾
    boom: { from: 54, to: 20, duration: 1.15, volume: 1 },
    blast: { from: 600, to: 70, duration: 1.1, volume: 0.85, playbackRate: 0.4 },
    debris: { count: 8, brightness: 0.9, volume: 0.16 },
    rumble: { duration: 2.3, volume: 0.45, frequency: 110 },
  },
};

/** 按爆炸类型渲染真实化爆炸声：次声冲击 → 低频爆轰 → 碎裂裂响 → 滚雷长尾（低频为主，减少电子感）。 */
function explosion(kind: string, options: PlayOptions = {}) {
  const profile = EXPLOSION_PROFILES[kind] ?? EXPLOSION_PROFILES.frag;
  const v = options.volume ?? 1;
  // 次声压力层：真实爆炸录音中以低频能量为主的体感冲击
  tone({ type: "sine", from: 44, to: 16, duration: profile.boom.duration * 1.5, volume: Math.min(1, profile.boom.volume * 0.9) * v, attack: 0.002, critical: true });
  // 初爆：低频轰 + 宽频噪声团（低通快速收窄，呈闷响）
  tone({ type: "sine", from: profile.boom.from, to: profile.boom.to, duration: profile.boom.duration, volume: profile.boom.volume * v, attack: 0.004, critical: true });
  noise({ duration: profile.blast.duration, volume: profile.blast.volume * v, attack: 0.002, filter: { type: "lowpass", from: profile.blast.from, to: profile.blast.to }, playbackRate: profile.blast.playbackRate, critical: true });
  // 早期"裂响"：中频带通碎裂，代替高频电子声
  noise({ duration: 0.09, volume: profile.debris.volume * 1.5 * v, attack: 0.001, delay: 0.015, filter: { type: "bandpass", from: 850, q: 0.8 }, playbackRate: 0.85 });
  // 碎裂屑片：中低频带通、随机延迟散落
  for (let i = 0; i < profile.debris.count; i++) {
    noise({ duration: 0.08 + Math.random() * 0.16, volume: profile.debris.volume * v, delay: 0.1 + Math.random() * 0.7, filter: { type: "bandpass", from: 320 + Math.random() * 900 * profile.debris.brightness, q: 1.1 }, playbackRate: 0.7 });
  }
  // 滚雷尾：双层错开的长低频衰减，模拟远雷余响
  if (profile.rumble) {
    noise({ duration: profile.rumble.duration * 1.25, volume: profile.rumble.volume * v, attack: 0.09, delay: 0.14, filter: { type: "lowpass", from: profile.rumble.frequency }, playbackRate: 0.28, critical: true });
    noise({ duration: profile.rumble.duration, volume: profile.rumble.volume * 0.6 * v, attack: 0.14, delay: 0.36, filter: { type: "lowpass", from: profile.rumble.frequency * 0.65 }, playbackRate: 0.24 });
  }
}

/* ------------------------------------------------------------------ */
/* 环境背景音：循环噪声/振荡器分层 + 定时随机事件；切换时交叉淡入淡出。 */
/* 底床不占 SFX 并发名额（独立增益分支，统一汇入 master）。            */
/* ------------------------------------------------------------------ */

export type AmbienceEnv = "farmland" | "suburb" | "tunnel" | "city";

type AmbienceEvent = { timer: number };

type AmbienceLayer = {
  env: AmbienceEnv;
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  events: AmbienceEvent[];
  stopped: boolean;
};

let ambienceLayer: AmbienceLayer | null = null;
const AMBIENCE_FADE_SEC = 1.5;

/** 循环噪声底床：滤波 + 可选 LFO 调制增益/滤波频率，形成无缝风声/轰鸣。 */
function ambienceBed(
  audio: AudioContext,
  layer: AmbienceLayer,
  options: {
    playbackRate: number;
    filterType: BiquadFilterType;
    frequency: number;
    q?: number;
    gain: number;
    lfoRate?: number;
    lfoDepth?: number;
    lfoTarget?: "gain" | "frequency";
  },
) {
  if (!noiseBuffer) return;
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  source.playbackRate.value = options.playbackRate;
  const filter = audio.createBiquadFilter();
  filter.type = options.filterType;
  filter.frequency.value = options.frequency;
  filter.Q.value = options.q ?? 0.7;
  const gain = audio.createGain();
  gain.gain.value = options.gain;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(layer.gain);
  source.start(audio.currentTime, Math.random() * NOISE_SECONDS * 0.5);
  layer.sources.push(source);
  if (options.lfoRate && options.lfoDepth) {
    const lfo = audio.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = options.lfoRate;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = options.lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(options.lfoTarget === "frequency" ? filter.frequency : gain.gain);
    lfo.start();
    layer.sources.push(lfo);
  }
}

/** 持续低频嗡鸣底床（隧道/城市）。 */
function ambienceHum(
  audio: AudioContext,
  layer: AmbienceLayer,
  options: { type: OscillatorType; frequency: number; gain: number; vibratoRate?: number; vibratoDepth?: number },
) {
  const osc = audio.createOscillator();
  osc.type = options.type;
  osc.frequency.value = options.frequency;
  const gain = audio.createGain();
  gain.gain.value = options.gain;
  osc.connect(gain);
  gain.connect(layer.gain);
  osc.start();
  layer.sources.push(osc);
  if (options.vibratoRate && options.vibratoDepth) {
    const lfo = audio.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = options.vibratoRate;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = options.vibratoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    layer.sources.push(lfo);
  }
}

/** 以随机间隔循环触发环境事件（虫鸣/犬吠/水滴/警报等），层停止后不再触发。 */
function scheduleAmbienceEvent(layer: AmbienceLayer, minMs: number, maxMs: number, fn: () => void) {
  const event: AmbienceEvent = { timer: 0 };
  layer.events.push(event);
  const tick = () => {
    if (layer.stopped) return;
    fn();
    event.timer = window.setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
  };
  event.timer = window.setTimeout(tick, minMs * 0.5 + Math.random() * (maxMs - minMs));
}

function buildAmbienceLayer(audio: AudioContext, env: AmbienceEnv): AmbienceLayer {
  const layer: AmbienceLayer = { env, gain: audio.createGain(), sources: [], events: [], stopped: false };
  const dest = layer.gain;
  const at = audio.currentTime;
  layer.gain.gain.setValueAtTime(0.0001, at);
  layer.gain.gain.exponentialRampToValueAtTime(1, at + AMBIENCE_FADE_SEC);
  layer.gain.connect(master as GainNode);

  if (env === "farmland") {
    // 风 + 草叶底床
    ambienceBed(audio, layer, { playbackRate: 0.5, filterType: "lowpass", frequency: 380, gain: 0.07, lfoRate: 0.07, lfoDepth: 0.03 });
    ambienceBed(audio, layer, { playbackRate: 1.4, filterType: "bandpass", frequency: 2000, q: 0.6, gain: 0.014, lfoRate: 0.23, lfoDepth: 0.006 });
    // 虫鸣：2-4 声高频短鸣
    scheduleAmbienceEvent(layer, 1600, 4200, () => {
      const chirps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < chirps; i++) {
        tone({ type: "sine", from: 4000 + Math.random() * 700, duration: 0.035, volume: 0.05, delay: i * (0.07 + Math.random() * 0.03), dest });
      }
    });
    // 草叶沙沙
    scheduleAmbienceEvent(layer, 4500, 9000, () => {
      noise({ duration: 0.7, volume: 0.05, attack: 0.25, filter: { type: "bandpass", from: 2400, q: 0.6 }, playbackRate: 1.35, dest });
    });
  } else if (env === "suburb") {
    // 轻风 + 树叶底床
    ambienceBed(audio, layer, { playbackRate: 0.55, filterType: "lowpass", frequency: 520, gain: 0.05, lfoRate: 0.09, lfoDepth: 0.02 });
    ambienceBed(audio, layer, { playbackRate: 1.25, filterType: "bandpass", frequency: 1350, q: 0.6, gain: 0.012, lfoRate: 0.3, lfoDepth: 0.005 });
    // 远处犬吠：1-3 声短促下滑吠叫
    scheduleAmbienceEvent(layer, 7000, 16000, () => {
      const barks = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < barks; i++) {
        const delay = i * (0.24 + Math.random() * 0.1);
        tone({ type: "sawtooth", from: 380 + Math.random() * 80, to: 170, duration: 0.1, volume: 0.09, delay, attack: 0.004, filter: { type: "bandpass", frequency: 700, q: 1.2 }, dest });
        noise({ duration: 0.07, volume: 0.05, delay, filter: { type: "bandpass", from: 900, q: 1 }, playbackRate: 0.9, dest });
      }
    });
    // 树叶摩擦
    scheduleAmbienceEvent(layer, 5000, 10000, () => {
      noise({ duration: 0.9, volume: 0.04, attack: 0.3, filter: { type: "bandpass", from: 1500, q: 0.6 }, playbackRate: 1.2, dest });
    });
  } else if (env === "tunnel") {
    // 低频轰鸣 + 空间感底床
    ambienceBed(audio, layer, { playbackRate: 0.32, filterType: "lowpass", frequency: 115, gain: 0.11, lfoRate: 0.05, lfoDepth: 0.04 });
    ambienceHum(audio, layer, { type: "sine", frequency: 52, gain: 0.035, vibratoRate: 0.4, vibratoDepth: 1.5 });
    ambienceBed(audio, layer, { playbackRate: 0.6, filterType: "bandpass", frequency: 650, q: 0.8, gain: 0.01, lfoRate: 0.13, lfoDepth: 0.004 });
    // 水滴 + 一声轻回声
    scheduleAmbienceEvent(layer, 2000, 5200, () => {
      const base = 900 + Math.random() * 400;
      tone({ type: "sine", from: base, to: base * 0.45, duration: 0.09, volume: 0.09, attack: 0.002, dest });
      tone({ type: "sine", from: base * 0.8, to: base * 0.4, duration: 0.07, volume: 0.035, delay: 0.26, attack: 0.004, dest });
    });
    // 隧道深处低鸣涌动
    scheduleAmbienceEvent(layer, 12000, 24000, () => {
      noise({ duration: 2.6, volume: 0.06, attack: 1.1, filter: { type: "lowpass", from: 160 }, playbackRate: 0.4, dest });
    });
  } else {
    // 城市：低沉嗡鸣 + 交通底噪
    ambienceHum(audio, layer, { type: "sine", frequency: 60, gain: 0.04 });
    ambienceHum(audio, layer, { type: "sine", frequency: 120, gain: 0.014, vibratoRate: 0.3, vibratoDepth: 1 });
    ambienceBed(audio, layer, { playbackRate: 0.45, filterType: "lowpass", frequency: 230, gain: 0.055, lfoRate: 0.06, lfoDepth: 0.022 });
    // 远处警报：双音升降
    scheduleAmbienceEvent(layer, 15000, 30000, () => {
      tone({ type: "sine", from: 660, to: 920, duration: 1.3, volume: 0.04, attack: 0.45, dest });
      tone({ type: "sine", from: 920, to: 660, duration: 1.3, volume: 0.04, delay: 1.35, attack: 0.45, dest });
    });
    // 楼间阵风
    scheduleAmbienceEvent(layer, 6000, 12000, () => {
      noise({ duration: 1.8, volume: 0.05, attack: 0.6, filter: { type: "bandpass", from: 450, to: 1100, q: 0.7 }, playbackRate: 0.8, dest });
    });
  }
  return layer;
}

function fadeOutAmbienceLayer(layer: AmbienceLayer | null, fadeSec = AMBIENCE_FADE_SEC) {
  if (!layer || layer.stopped) return;
  layer.stopped = true;
  for (const event of layer.events) window.clearTimeout(event.timer);
  if (ctx) {
    const at = ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(at);
    layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), at);
    layer.gain.gain.exponentialRampToValueAtTime(0.0001, at + fadeSec);
  }
  window.setTimeout(() => {
    for (const source of layer.sources) {
      try {
        source.stop();
      } catch {
        /* 已停止的节点忽略 */
      }
    }
    layer.gain.disconnect();
  }, fadeSec * 1000 + 120);
}

/** 切换/启动环境背景音；同环境重复调用为空操作，异环境 1.5s 交叉淡变。 */
function startAmbience(env: AmbienceEnv) {
  const audio = ensureContext();
  if (!audio || !master) return;
  if (ambienceLayer && !ambienceLayer.stopped && ambienceLayer.env === env) return;
  fadeOutAmbienceLayer(ambienceLayer);
  ambienceLayer = buildAmbienceLayer(audio, env);
}

/** 淡出并停止当前环境背景音。 */
function stopAmbience() {
  fadeOutAmbienceLayer(ambienceLayer);
  ambienceLayer = null;
}

/* ------------------------------------------------------------------ */
/* 低血量心跳：lub-dub 双跳节律；血量越低心率越快、音量越大。           */
/* 由游戏循环按当前 HP 驱动 setHeartbeat(hp)，离场时传 null 停止。      */
/* ------------------------------------------------------------------ */

let heartbeatTimer: number | null = null;
let heartbeatNextAt = 0;
let heartbeatBpm = 70;
let heartbeatLevel = 0.4;

function scheduleHeartbeatBeats() {
  const audio = ctx;
  if (!audio || !master) return;
  const lookahead = 0.4;
  while (heartbeatNextAt < audio.currentTime + lookahead) {
    const period = 60 / heartbeatBpm;
    if (heartbeatNextAt < audio.currentTime - 0.1) heartbeatNextAt = audio.currentTime;
    const delay = Math.max(0, heartbeatNextAt - audio.currentTime);
    const gap = Math.min(0.3, period * 0.32);
    tone({ type: "sine", from: 58, to: 40, duration: 0.1, volume: 0.5 * heartbeatLevel, attack: 0.008, delay, critical: true });
    tone({ type: "sine", from: 50, to: 36, duration: 0.08, volume: 0.36 * heartbeatLevel, attack: 0.006, delay: delay + gap, critical: true });
    heartbeatNextAt += period;
  }
}

/** HP 35 → 约 70 BPM；HP ≤10 → 约 130 BPM。传 null / >35 / ≤0 停止。 */
function setHeartbeat(hp: number | null) {
  if (hp === null || hp <= 0 || hp > 35) {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    return;
  }
  const t = Math.min(1, (35 - hp) / 25);
  heartbeatBpm = 70 + t * 60;
  heartbeatLevel = 0.4 + t * 0.5;
  if (heartbeatTimer === null) {
    const audio = ensureContext();
    if (!audio) return;
    heartbeatNextAt = audio.currentTime + 0.08;
    heartbeatTimer = window.setInterval(scheduleHeartbeatBeats, 120);
  }
}

/* ------------------------------------------------------------------ */
/* 加特林旋转底噪：持续开火期间的高频“电钻/蜂鸣”层。                    */
/* ------------------------------------------------------------------ */

let gatlingSpin: { sources: AudioScheduledSourceNode[]; gain: GainNode } | null = null;

function setGatlingSpin(active: boolean) {
  if (active) {
    if (gatlingSpin || muted) return;
    const audio = ensureContext();
    if (!audio || !master || !noiseBuffer) return;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, audio.currentTime + 0.18);
    gain.connect(master);
    const drill = audio.createBufferSource();
    drill.buffer = noiseBuffer;
    drill.loop = true;
    drill.playbackRate.value = 1.5;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 1.2;
    drill.connect(filter);
    filter.connect(gain);
    const wobble = audio.createOscillator();
    wobble.type = "sawtooth";
    wobble.frequency.value = 110;
    const wobbleGain = audio.createGain();
    wobbleGain.gain.value = 0.03;
    wobble.connect(wobbleGain);
    wobbleGain.connect(gain.gain);
    drill.start(audio.currentTime, Math.random() * NOISE_SECONDS * 0.5);
    wobble.start();
    gatlingSpin = { sources: [drill, wobble], gain };
    return;
  }
  if (!gatlingSpin) return;
  const spin = gatlingSpin;
  gatlingSpin = null;
  if (ctx) {
    spin.gain.gain.cancelScheduledValues(ctx.currentTime);
    spin.gain.gain.setValueAtTime(Math.max(0.0001, spin.gain.gain.value), ctx.currentTime);
    spin.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
  }
  window.setTimeout(() => {
    for (const source of spin.sources) {
      try {
        source.stop();
      } catch {
        /* 已停止的节点忽略 */
      }
    }
    spin.gain.disconnect();
  }, 340);
}

export const soundManager = {
  isMuted,
  setMuted,
  toggleMuted(): boolean {
    setMuted(!isMuted());
    return isMuted();
  },
  setMasterVolume(volume: number) {
    masterVolume = Math.min(1, Math.max(0, volume));
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(VOLUME_KEY, String(masterVolume));
      } catch {
        /* 隐私模式下写失败仅本次不持久化 */
      }
    }
    applyMasterGain();
  },
  getMasterVolume() {
    loadVolume();
    return masterVolume;
  },
  unlock,
  ambience: startAmbience,
  stopAmbience,
  setHeartbeat,
  setGatlingSpin,

  gunshot,
  explosion,

  /** 空仓扣扳机：两声干涩咔哒。 */
  dryFire() {
    tone({ type: "square", from: 2100, duration: 0.018, volume: 0.16, filter: { type: "highpass", frequency: 1200 } });
    tone({ type: "square", from: 1500, duration: 0.02, volume: 0.14, delay: 0.045 });
  },

  /** 换弹：立即卸弹匣，接近结束时装弹匣。 */
  reload(durationMs: number) {
    tone({ type: "square", from: 900, to: 500, duration: 0.05, volume: 0.2, filter: { type: "bandpass", frequency: 1200, q: 2 } });
    noise({ duration: 0.05, volume: 0.14, filter: { type: "bandpass", from: 2400, q: 1.4 } });
    const inDelay = Math.max(0.25, durationMs / 1000 - 0.3);
    noise({ duration: 0.06, volume: 0.2, delay: inDelay, filter: { type: "bandpass", from: 1800, q: 1.2 } });
    tone({ type: "square", from: 620, to: 980, duration: 0.06, volume: 0.18, delay: inDelay + 0.05, filter: { type: "bandpass", frequency: 1500, q: 2 } });
  },

  /** 呕吐僵尸喷吐：湿黏的喉音翻涌 + 液体喷出。 */
  vomit(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    noise({ duration: 0.22, volume: 0.3 * v, filter: { type: "lowpass", from: 520 }, playbackRate: 0.7 });
    tone({ type: "sawtooth", from: 220, to: 90, duration: 0.2, volume: 0.12 * v, filter: { type: "lowpass", frequency: 700 } });
    noise({ duration: 0.16, volume: 0.2 * v, delay: 0.14, filter: { type: "bandpass", from: 900, q: 0.8 }, playbackRate: 1.2 });
  },

  /** 子弹命中盔甲/盾牌被挡下：短促金属“叮”声 + 细微碎响。 */
  armorClank(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "square", from: 2900, to: 2100, duration: 0.045, volume: 0.16 * v, filter: { type: "bandpass", frequency: 3400, q: 4 } });
    noise({ duration: 0.05, volume: 0.14 * v, filter: { type: "bandpass", from: 4200, q: 2.2 }, playbackRate: 1.5 });
  },

  /** 关卡任务完成：两声上扬钟声音符（660 → 990），清脆确认感。 */
  taskComplete(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sine", from: 660, to: 660, duration: 0.14, volume: 0.3 * v });
    tone({ type: "sine", from: 990, to: 990, duration: 0.22, volume: 0.3 * v, delay: 0.12 });
  },

  /** 军用卡车驶近：低沉柴油引擎轰鸣渐强后减速（救援事件开场）。 */
  truckEngine(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sawtooth", from: 48, to: 88, duration: 1.6, volume: 0.32 * v, filter: { type: "lowpass", frequency: 240 } });
    tone({ type: "sawtooth", from: 88, to: 56, duration: 1.2, volume: 0.3 * v, delay: 1.6, filter: { type: "lowpass", frequency: 210 } });
    noise({ duration: 2.6, volume: 0.16 * v, filter: { type: "lowpass", from: 140 }, playbackRate: 0.6 });
    tone({ type: "square", from: 120, to: 150, duration: 1.4, volume: 0.06 * v, delay: 0.2, filter: { type: "lowpass", frequency: 300 } });
  },

  /** 卡车刹车停稳：气压泄压嘶声 + 制动尖鸣。 */
  truckBrake(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    noise({ duration: 0.5, volume: 0.22 * v, filter: { type: "bandpass", from: 3200, q: 1.1 }, playbackRate: 1.1 });
    tone({ type: "square", from: 1500, to: 950, duration: 0.22, volume: 0.1 * v, filter: { type: "bandpass", frequency: 1800, q: 3 } });
    noise({ duration: 0.7, volume: 0.14 * v, delay: 0.22, filter: { type: "highpass", from: 2400 }, playbackRate: 0.9 });
  },

  /** 基地警报渐强：真实空袭/基地警报的缓慢起伏 wail——主音锯齿波 400↔690 慢速扫频，
      叠加 +1% 失谐层（电机拍频颤抖）与低八度三角波厚度层，低通滤波给出空间距离感；
      每个 wail 周期音量递增，实现由小渐大的开场。 */
  alarmCrescendo(durationSec = 6, options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    const wailSec = 3.2;
    const cycles = Math.max(1, Math.round(durationSec / wailSec));
    for (let i = 0; i < cycles; i++) {
      const t = cycles === 1 ? 1 : i / (cycles - 1);
      const vol = (0.05 + 0.3 * t) * v;
      const delay = i * wailSec;
      const up = wailSec * 0.46;
      const down = wailSec * 0.54;
      // 主音层：缓慢升起 → 落下的长音 wail（包络拖尾与下半周期交叠，保持连续）
      tone({ type: "sawtooth", from: 400, to: 690, duration: up * 1.6, volume: vol, delay, attack: up * 0.55, filter: { type: "lowpass", frequency: 1400 } });
      tone({ type: "sawtooth", from: 690, to: 400, duration: down * 1.6, volume: vol, delay: delay + up, attack: down * 0.25, filter: { type: "lowpass", frequency: 1400 } });
      // 失谐层：+1% 频率差产生缓慢拍频（警报电机的颤抖感）
      tone({ type: "sawtooth", from: 404, to: 697, duration: up * 1.6, volume: vol * 0.65, delay, attack: up * 0.55, filter: { type: "lowpass", frequency: 1150 } });
      tone({ type: "sawtooth", from: 697, to: 404, duration: down * 1.6, volume: vol * 0.65, delay: delay + up, attack: down * 0.25, filter: { type: "lowpass", frequency: 1150 } });
      // 低八度厚度层：填补空间感与体量感
      tone({ type: "triangle", from: 200, to: 345, duration: up * 1.6, volume: vol * 0.5, delay, attack: up * 0.55, filter: { type: "lowpass", frequency: 850 } });
      tone({ type: "triangle", from: 345, to: 200, duration: down * 1.6, volume: vol * 0.5, delay: delay + up, attack: down * 0.25, filter: { type: "lowpass", frequency: 850 } });
    }
  },

  /** 盾牌 HP 归零被击碎：低频冲击 + 多声部失谐金属崩响 + 碎块散落的高频飞溅噪声。 */
  shieldShatter(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sine", from: 150, to: 42, duration: 0.22, volume: 0.5 * v });
    tone({ type: "square", from: 2400, to: 1400, duration: 0.09, volume: 0.22 * v, filter: { type: "bandpass", frequency: 2800, q: 3 } });
    tone({ type: "square", from: 3150, to: 1850, duration: 0.07, volume: 0.18 * v, delay: 0.03, filter: { type: "bandpass", frequency: 3600, q: 4 } });
    tone({ type: "square", from: 1750, to: 1050, duration: 0.13, volume: 0.16 * v, delay: 0.02, filter: { type: "bandpass", frequency: 2000, q: 3 } });
    noise({ duration: 0.3, volume: 0.3 * v, filter: { type: "bandpass", from: 3800, q: 1.2 }, playbackRate: 1.3 });
    noise({ duration: 0.18, volume: 0.18 * v, delay: 0.09, filter: { type: "bandpass", from: 5200, q: 2 }, playbackRate: 1.6 });
  },

  /** 栓动步枪拉栓循环：上抬开锁 → 后拉 → 前推 → 下压锁定，四段金属机械声；延迟随各枪循环时长等比缩放。 */
  boltAction(cycleMs = 620) {
    const s = cycleMs / 620;
    tone({ type: "square", from: 1350, to: 900, duration: 0.03, volume: 0.18, delay: 0.05 * s, filter: { type: "bandpass", frequency: 2100, q: 3 } });
    noise({ duration: 0.045, volume: 0.2, delay: 0.16 * s, filter: { type: "bandpass", from: 2600, q: 1.6 } });
    noise({ duration: 0.045, volume: 0.18, delay: 0.34 * s, filter: { type: "bandpass", from: 2200, q: 1.6 } });
    tone({ type: "square", from: 850, to: 1250, duration: 0.035, volume: 0.2, delay: 0.48 * s, filter: { type: "bandpass", frequency: 1600, q: 2.6 } });
  },

  /** Q 切换武器：金属摩擦 + 卡榫声。 */
  weaponSwitch() {
    noise({ duration: 0.07, volume: 0.2, filter: { type: "bandpass", from: 3200, q: 1.1 } });
    tone({ type: "square", from: 1300, to: 900, duration: 0.045, volume: 0.13, delay: 0.05 });
  },

  /** 近战挥舞破空声。 */
  meleeSwing(kind: MeleeKind) {
    if (kind === "stab") {
      noise({ duration: 0.14, volume: 0.3, attack: 0.02, filter: { type: "bandpass", from: 900, to: 2400, q: 1.2 } });
    } else if (kind === "heavy") {
      noise({ duration: 0.3, volume: 0.38, attack: 0.05, filter: { type: "bandpass", from: 300, to: 1100, q: 1 }, playbackRate: 0.8 });
    } else {
      noise({ duration: 0.2, volume: 0.3, attack: 0.03, filter: { type: "bandpass", from: 600, to: 1800, q: 1.1 } });
    }
  },

  /** 近战命中肉体的闷击。 */
  meleeHit(heavy: boolean, options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sine", from: heavy ? 120 : 150, to: 55, duration: heavy ? 0.16 : 0.1, volume: (heavy ? 0.6 : 0.45) * v });
    noise({ duration: 0.09, volume: 0.38 * v, filter: { type: "lowpass", from: heavy ? 600 : 900 }, playbackRate: 0.7 });
  },

  kick() {
    noise({ duration: 0.18, volume: 0.28, attack: 0.03, filter: { type: "bandpass", from: 400, to: 1400, q: 1 }, playbackRate: 0.85 });
  },

  /** 猎犬吠叫：低吼垫底 + 两声短促吠叫（扑咬时触发，按距离衰减）。 */
  dogBark(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sawtooth", from: 140, to: 90, duration: 0.22, volume: 0.2 * v, filter: { type: "lowpass", frequency: 500 } });
    tone({ type: "sawtooth", from: 480, to: 210, duration: 0.08, volume: 0.38 * v, filter: { type: "bandpass", frequency: 1100, q: 1.4 } });
    noise({ duration: 0.06, volume: 0.24 * v, filter: { type: "bandpass", from: 1300, q: 1 } });
    tone({ type: "sawtooth", from: 540, to: 240, duration: 0.075, volume: 0.34 * v, delay: 0.12, filter: { type: "bandpass", frequency: 1250, q: 1.4 } });
    noise({ duration: 0.055, volume: 0.2 * v, delay: 0.12, filter: { type: "bandpass", from: 1500, q: 1 } });
  },

  kickHit() {
    tone({ type: "sine", from: 110, to: 50, duration: 0.14, volume: 0.55 });
    noise({ duration: 0.08, volume: 0.34, filter: { type: "lowpass", from: 700 }, playbackRate: 0.7 });
  },

  /** 僵尸被击中腿部倒地：钝重扑倒声。 */
  zombieFall(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sine", from: 90, to: 40, duration: 0.18, volume: 0.38 * v });
    noise({ duration: 0.12, volume: 0.2 * v, filter: { type: "lowpass", from: 350 }, playbackRate: 0.6 });
  },

  /** 僵尸攻击下砸。 */
  zombieAttack(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sawtooth", from: 160, to: 70, duration: 0.22, volume: 0.28 * v, vibratoRate: 14, vibratoDepth: 25, filter: { type: "lowpass", frequency: 900 } });
    noise({ duration: 0.16, volume: 0.24 * v, attack: 0.02, filter: { type: "bandpass", from: 700, to: 250, q: 1 }, playbackRate: 0.8 });
  },

  /** 环境低吼：带颤音的长呻吟，配合距离衰减使用。 */
  zombieGrowl(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sawtooth", from: 65 + Math.random() * 35, to: 50 + Math.random() * 20, duration: 1.1, attack: 0.25, volume: 0.2 * v, vibratoRate: 5 + Math.random() * 3, vibratoDepth: 12, filter: { type: "lowpass", frequency: 450 } });
  },

  /** 燃烧瓶：点燃轰燃 + 持续燃烧底噪与爆裂声，durationSec 后自动淡出。 */
  molotovIgnite(durationSec: number, options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    noise({ duration: 0.5, volume: 0.5 * v, attack: 0.02, filter: { type: "bandpass", from: 500, to: 1600, q: 0.8 }, playbackRate: 0.9 });
    const audio = ensureContext();
    if (!audio || !master || !noiseBuffer || muted) return;
    const at = audio.currentTime;
    const duration = Math.max(0.6, durationSec);
    const bed = audio.createBufferSource();
    bed.buffer = noiseBuffer;
    bed.loop = true;
    bed.playbackRate.value = 0.5;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 620;
    filter.Q.value = 0.6;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.16 * v), at + 0.4);
    gain.gain.setValueAtTime(Math.max(0.0002, 0.16 * v), Math.max(at + 0.41, at + duration - 0.8));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const lfo = audio.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 7;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = 0.05 * v;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    bed.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    if (!track([bed, lfo])) return;
    bed.start(at, Math.random());
    bed.stop(at + duration + 0.1);
    lfo.start(at);
    lfo.stop(at + duration + 0.1);
    const pops = Math.min(Math.floor(duration * 2.2), 24);
    for (let i = 0; i < pops; i++) {
      noise({ duration: 0.02 + Math.random() * 0.03, volume: 0.09 * v, delay: Math.random() * duration, filter: { type: "highpass", from: 2200 }, playbackRate: 1.6 });
    }
  },

  /** 震撼弹：爆闪 + 耳鸣高音（tinnitus）。 */
  flashbang() {
    noise({ duration: 0.12, volume: 0.6, filter: { type: "highpass", from: 2500 }, critical: true });
    tone({ type: "sine", from: 3800, duration: 2.6, attack: 0.002, volume: 0.22, critical: true });
  },

  /** 人物受伤：主角、关卡队友与探索队员共用的短促痛呼/钝击反馈。 */
  playerHurt(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sawtooth", from: 170, to: 85, duration: 0.16, volume: 0.4 * v, filter: { type: "lowpass", frequency: 1000 }, critical: true });
    noise({ duration: 0.1, volume: 0.26 * v, filter: { type: "lowpass", from: 500 }, playbackRate: 0.6 });
  },

  /** 肉体受击：所有模式中的僵尸/人物命中共享低频撞击与湿润冲击层。 */
  bodyHit(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    tone({ type: "sine", from: 105, to: 48, duration: 0.09, volume: 0.25 * v });
    noise({ duration: 0.075, volume: 0.2 * v, filter: { type: "lowpass", from: 720 }, playbackRate: 0.65 });
  },

  uiClick() {
    tone({ type: "square", from: 950, to: 700, duration: 0.045, volume: 0.14, filter: { type: "bandpass", frequency: 1600, q: 1.5 } });
  },

  /** 购买成功：两声金属“收款”音。 */
  purchase() {
    tone({ type: "triangle", from: 1250, duration: 0.09, volume: 0.26, attack: 0.002 });
    tone({ type: "triangle", from: 1870, duration: 0.16, volume: 0.26, delay: 0.08, attack: 0.002 });
  },

  /** 金币不足：低闷拒绝音。 */
  purchaseFail() {
    tone({ type: "square", from: 160, to: 110, duration: 0.16, volume: 0.2, filter: { type: "lowpass", frequency: 600 } });
  },

  /** 波次开始 / 新一天：双音低鸣号角。 */
  waveStart() {
    tone({ type: "sawtooth", from: 98, duration: 0.5, attack: 0.06, volume: 0.3, filter: { type: "lowpass", frequency: 700 }, critical: true });
    tone({ type: "sawtooth", from: 147, duration: 0.5, attack: 0.06, volume: 0.22, delay: 0.02, filter: { type: "lowpass", frequency: 700 }, critical: true });
  },

  gameOver() {
    tone({ type: "sawtooth", from: 220, to: 55, duration: 1.6, attack: 0.02, volume: 0.34, vibratoRate: 6, vibratoDepth: 10, filter: { type: "lowpass", frequency: 900 }, critical: true });
    tone({ type: "sine", from: 110, to: 36, duration: 1.8, volume: 0.28, critical: true });
  },

  /** 空中支援呼叫：电台静噪 + 战机掠过。 */
  airstrike() {
    noise({ duration: 0.08, volume: 0.2, filter: { type: "bandpass", from: 1800, q: 3 } });
    tone({ type: "square", from: 1300, duration: 0.05, volume: 0.12, delay: 0.09 });
    noise({ duration: 1.2, volume: 0.2, attack: 0.5, filter: { type: "bandpass", from: 300, to: 1400, q: 0.7 }, playbackRate: 0.9 });
  },

  /** 投掷出手破空声。 */
  itemThrow() {
    noise({ duration: 0.16, volume: 0.2, attack: 0.02, filter: { type: "bandpass", from: 800, to: 2000, q: 1 } });
  },

  /** 路障放置：木架落地闷响。 */
  barricadePlace() {
    tone({ type: "sine", from: 140, to: 70, duration: 0.12, volume: 0.4 });
    noise({ duration: 0.09, volume: 0.24, filter: { type: "lowpass", from: 900 }, playbackRate: 0.8 });
  },

  /** 路障被摧毁：木板碎裂。 */
  barricadeBreak(options: PlayOptions = {}) {
    const v = options.volume ?? 1;
    noise({ duration: 0.3, volume: 0.38 * v, filter: { type: "lowpass", from: 1200, to: 300 }, playbackRate: 0.8 });
    tone({ type: "triangle", from: 300, to: 90, duration: 0.2, volume: 0.28 * v });
  },
};

export type SoundManager = typeof soundManager;
