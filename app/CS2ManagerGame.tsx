"use client";

/* eslint-disable @next/next/no-img-element -- player and team artwork comes from the dated external VRS source */

import { useEffect, useMemo, useState } from "react";

import {
  drawRecruit,
  formatCoins,
  FREE_RECRUIT_ROLES,
  isCompleteLineup,
  LEAGUE_STAGES,
  LINEUP_SLOTS,
  lineupPower,
  MANAGER_PLAYERS,
  MANAGER_TEAMS,
  nextLeaguePosition,
  playerPower,
  RECRUIT_COST,
  ROLE_LABELS,
  roleFitsSlot,
  SLOT_LABELS,
  SLOT_ROLE,
  stageReward,
  type LineupSlot,
  type ManagerPlayer,
  type ManagerTeam,
} from "./cs2Manager";

type ManagerView = "ranking" | "roster" | "recruit" | "league";
type CrestShape = "shield" | "hex" | "round";
type CrestSymbol = "准" | "★" | "⚡" | "狼";

type CreatedTeam = {
  name: string;
  country: string;
  crestShape: CrestShape;
  crestSymbol: CrestSymbol;
  primary: string;
  accent: string;
};

type MatchRecord = {
  id: string;
  season: number;
  stage: string;
  opponent: string;
  won: boolean;
  score: string;
  reward: number;
};

type ManagerSave = {
  version: 1;
  team: CreatedTeam | null;
  coins: number;
  recruitedIds: string[];
  lineup: Partial<Record<LineupSlot, string>>;
  freeRecruitIndex: number;
  stageIndex: number;
  opponentIndex: number;
  userRank: number;
  season: number;
  history: MatchRecord[];
};

type MatchResult = {
  won: boolean;
  score: string;
  reward: number;
  opponent: ManagerTeam;
  stageName: string;
  skipped: string | null;
};

const SAVE_KEY = "cs2-manager-save-v1";
const COUNTRIES = [
  "中国", "蒙古", "韩国", "日本", "德国", "法国", "英国", "丹麦", "瑞典", "芬兰",
  "波兰", "乌克兰", "俄罗斯", "土耳其", "美国", "加拿大", "巴西", "阿根廷", "澳大利亚", "国际纵队",
];
const PRIMARY_COLORS = ["#f5c343", "#ff4d35", "#53d7ff", "#8157ff", "#27e58b", "#f4f0e7"];
const ACCENT_COLORS = ["#0a0d0f", "#151e2a", "#311117", "#f4f0e7"];

function blankSave(): ManagerSave {
  return {
    version: 1,
    team: null,
    coins: 0,
    recruitedIds: [],
    lineup: {},
    freeRecruitIndex: 0,
    stageIndex: 0,
    opponentIndex: 0,
    userRank: 32,
    season: 1,
    history: [],
  };
}

function loadSave(): ManagerSave {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "null") as Partial<ManagerSave> | null;
    if (!parsed || parsed.version !== 1) return blankSave();
    return {
      ...blankSave(),
      ...parsed,
      team: parsed.team ?? null,
      recruitedIds: Array.isArray(parsed.recruitedIds) ? parsed.recruitedIds : [],
      lineup: parsed.lineup ?? {},
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 30) : [],
    };
  } catch {
    return blankSave();
  }
}

function TeamCrest({ team, small = false }: { team: CreatedTeam; small?: boolean }) {
  return (
    <div
      className={`manager-crest crest-${team.crestShape} ${small ? "is-small" : ""}`}
      style={{ "--crest-primary": team.primary, "--crest-accent": team.accent } as React.CSSProperties}
      aria-label={`${team.name} 队徽`}
    >
      <span>{team.crestSymbol}</span>
      <i />
    </div>
  );
}

function TeamCreation({ onCreate }: { onCreate: (team: CreatedTeam) => void }) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("中国");
  const [crestShape, setCrestShape] = useState<CrestShape>("shield");
  const [crestSymbol, setCrestSymbol] = useState<CrestSymbol>("准");
  const [primary, setPrimary] = useState(PRIMARY_COLORS[0]);
  const [accent, setAccent] = useState(ACCENT_COLORS[0]);
  const draft = { name: name.trim() || "YOUR TEAM", country, crestShape, crestSymbol, primary, accent };

  return (
    <main className="manager-create-screen">
      <div className="manager-create-noise" />
      <section className="manager-create-copy">
        <p className="manager-kicker"><span>CS2</span> OWNER CAREER</p>
        <h1>从零打造<br />世界第一战队</h1>
        <p>签下真实职业选手，配置五人阵容，从 Challenger 一路打进 Major 决赛。</p>
        <div className="manager-create-statline">
          <span><b>31</b> 支真实劲旅</span>
          <span><b>155</b> 名职业选手</span>
          <span><b>6</b> 级赛事征程</span>
        </div>
      </section>

      <section className="manager-create-panel">
        <header>
          <span>俱乐部注册处</span>
          <b>01 / 建立身份</b>
        </header>
        <div className="crest-workbench">
          <TeamCrest team={draft} />
          <div>
            <small>预览</small>
            <strong>{draft.name}</strong>
            <em>{country} · EST. 2026</em>
          </div>
        </div>

        <label className="manager-field">
          <span>战队名称</span>
          <input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} placeholder="输入俱乐部名称" />
        </label>
        <label className="manager-field">
          <span>注册国家 / 地区</span>
          <select value={country} onChange={(event) => setCountry(event.target.value)}>
            {COUNTRIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <div className="manager-custom-row">
          <fieldset>
            <legend>队徽轮廓</legend>
            <div className="manager-choice-row">
              {(["shield", "hex", "round"] as CrestShape[]).map((shape) => (
                <button key={shape} className={crestShape === shape ? "active" : ""} onClick={() => setCrestShape(shape)} aria-label={shape}>
                  <i className={`mini-crest mini-${shape}`} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>核心图腾</legend>
            <div className="manager-choice-row">
              {(["准", "★", "⚡", "狼"] as CrestSymbol[]).map((symbol) => (
                <button key={symbol} className={crestSymbol === symbol ? "active" : ""} onClick={() => setCrestSymbol(symbol)}>{symbol}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="manager-custom-row">
          <fieldset>
            <legend>主色</legend>
            <div className="manager-color-row">
              {PRIMARY_COLORS.map((color) => (
                <button key={color} className={primary === color ? "active" : ""} style={{ background: color }} onClick={() => setPrimary(color)} aria-label={color} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>底色</legend>
            <div className="manager-color-row">
              {ACCENT_COLORS.map((color) => (
                <button key={color} className={accent === color ? "active" : ""} style={{ background: color }} onClick={() => setAccent(color)} aria-label={color} />
              ))}
            </div>
          </fieldset>
        </div>

        <button
          className="manager-primary-action"
          disabled={!name.trim()}
          onClick={() => onCreate({ ...draft, name: name.trim() })}
        >
          创建战队 <span>→</span>
        </button>
      </section>
    </main>
  );
}

function StatPill({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`manager-stat ${highlight ? "highlight" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
      <i><em style={{ width: `${value}%` }} /></i>
    </div>
  );
}

function PlayerCard({
  player,
  compact = false,
  footer,
}: {
  player: ManagerPlayer;
  compact?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <article className={`manager-player-card role-${player.role} ${compact ? "compact" : ""}`}>
      <div className="manager-player-photo">
        {/* Snapshot portrait from the linked public player profile. */}
        <img src={player.portrait} alt={player.fullName} referrerPolicy="no-referrer" />
        <span>#{player.teamRank}</span>
        <a href={player.profile} target="_blank" rel="noreferrer" aria-label={`查看 ${player.nickname} 资料`}>↗</a>
      </div>
      <div className="manager-player-identity">
        <span>{ROLE_LABELS[player.role]} · {player.country}</span>
        <strong>{player.nickname}</strong>
        <small>{player.teamName}</small>
      </div>
      {!compact && (
        <div>
          <p className="manager-game-data-label">游戏能力值</p>
          <div className="manager-player-stats">
            <StatPill label="火力" value={player.stats.firepower} />
            <StatPill label="意识" value={player.stats.awareness} />
            <StatPill label="反应" value={player.stats.reaction} />
            <StatPill label="道具" value={player.stats.utility} />
            {player.role === "igl" && <StatPill label="战术" value={player.stats.tactics} highlight />}
          </div>
        </div>
      )}
      {footer && <footer>{footer}</footer>}
    </article>
  );
}

function TeamDetail({ team, onClose }: { team: ManagerTeam; onClose: () => void }) {
  return (
    <div className="manager-modal-backdrop" onMouseDown={onClose}>
      <section className="manager-team-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div className="manager-team-logo"><img src={team.logo} alt="" referrerPolicy="no-referrer" /></div>
          <div>
            <span>VALVE REGIONAL STANDINGS · #{team.rank}</span>
            <h2>{team.name}</h2>
            <p>{team.country} · {team.points} VRS 积分 · 阵容战力 {team.power}</p>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        <div className="manager-modal-roster">
          {team.players.map((player) => <PlayerCard key={player.id} player={player} />)}
        </div>
        <footer>
          <span>名单、肖像与 VRS 名次取自快照；固定位置和能力值为游戏规则映射，并非官方评分。</span>
          <a href={team.teamProfile} target="_blank" rel="noreferrer">查看战队资料 ↗</a>
        </footer>
      </section>
    </div>
  );
}

function RecruitmentView({
  save,
  onRecruit,
}: {
  save: ManagerSave;
  onRecruit: () => void;
}) {
  const freeLeft = Math.max(0, 5 - save.freeRecruitIndex);
  const nextRole = FREE_RECRUIT_ROLES[save.freeRecruitIndex];
  const canPay = save.coins >= RECRUIT_COST;
  return (
    <section className="manager-view manager-recruit-view">
      <div className="manager-recruit-hero">
        <div className="manager-recruit-art">
          <div className="manager-scout-ring ring-a" />
          <div className="manager-scout-ring ring-b" />
          <div className="manager-scout-crosshair">＋</div>
          <strong>SCOUT<br />NETWORK</strong>
          <span>GLOBAL DATABASE / 155 PLAYERS</span>
        </div>
        <div className="manager-recruit-copy">
          <p className="manager-section-code">03 / 人才市场</p>
          <h2>寻找你的下一位<br /><em>超级明星</em></h2>
          <p>每次招募先按 VRS 名次区间抽取，再从该区间的真实选手池中随机签约。已拥有的选手不会重复出现，区间概率不会跨档补位。</p>
          <div className="manager-odds">
            <span><b>55%</b><small>排名 31–20</small></span>
            <span><b>30%</b><small>排名 19–10</small></span>
            <span><b>10%</b><small>排名 9–5</small></span>
            <span className="legend"><b>5%</b><small>排名 4–1</small></span>
          </div>
          <button
            className="manager-recruit-button"
            disabled={!freeLeft && !canPay}
            onClick={onRecruit}
          >
            <span>{freeLeft ? `免费招募 · 剩余 ${freeLeft} 次` : "签下一名选手"}</span>
            <strong>{freeLeft ? `本次保底：${ROLE_LABELS[nextRole]}` : `◉ ${formatCoins(RECRUIT_COST)}`}</strong>
          </button>
          {!freeLeft && !canPay && <small className="manager-insufficient">金币不足，参加联赛赢取奖金。</small>}
        </div>
      </div>

      <div className="manager-guarantee-track">
        <header>
          <div><span>新手五人组</span><strong>前五次免费并精确覆盖完整阵容</strong></div>
          <b>{save.freeRecruitIndex} / 5</b>
        </header>
        <div>
          {FREE_RECRUIT_ROLES.map((role, index) => (
            <span key={`${role}-${index}`} className={index < save.freeRecruitIndex ? "done" : index === save.freeRecruitIndex ? "current" : ""}>
              <i>{index < save.freeRecruitIndex ? "✓" : index + 1}</i>
              <b>{ROLE_LABELS[role]}</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function RankingView({
  save,
  onSelectTeam,
}: {
  save: ManagerSave;
  onSelectTeam: (team: ManagerTeam) => void;
}) {
  const rows = useMemo(() => {
    const official = MANAGER_TEAMS.map((team) => ({
      displayRank: team.rank >= save.userRank ? team.rank + 1 : team.rank,
      team,
    }));
    return [
      ...official,
      { displayRank: save.userRank, team: null },
    ].sort((a, b) => a.displayRank - b.displayRank);
  }, [save.userRank]);

  return (
    <section className="manager-view manager-ranking-view">
      <header className="manager-view-heading">
        <div>
          <p className="manager-section-code">01 / 全球格局</p>
          <h2>战队排名</h2>
          <span>经理生涯动态名次 · 官方队伍保留 VRS 2026-07-06 来源名次</span>
        </div>
        <div className="manager-rank-summary">
          <span>当前排名</span><b>#{save.userRank}</b><small>世界 / 32</small>
        </div>
      </header>

      <div className="manager-ranking-table">
        <div className="manager-ranking-head">
          <span>生涯名次</span><span>俱乐部</span><span>国家 / 地区</span><span>阵容核心</span><span>VRS 积分</span><span>战力</span>
        </div>
        {rows.map(({ displayRank, team }) => team ? (
          <button key={team.name} className={`manager-ranking-row tier-${Math.ceil(displayRank / 8)}`} onClick={() => onSelectTeam(team)}>
            <b className="manager-rank-number">{String(displayRank).padStart(2, "0")}<small>VRS #{team.rank}</small></b>
            <span className="manager-ranking-club"><i><img src={team.logo} alt="" referrerPolicy="no-referrer" /></i><strong>{team.name}</strong></span>
            <span>{team.country}</span>
            <span className="manager-ranking-roster">{team.players.map((player) => player.nickname).join(" · ")}</span>
            <span>{team.points}</span>
            <span><b>{team.power}</b><em>查看 ›</em></span>
          </button>
        ) : save.team && (
          <div key="user-team" className="manager-ranking-row user-team">
            <b className="manager-rank-number">{String(displayRank).padStart(2, "0")}<small>生涯</small></b>
            <span className="manager-ranking-club"><TeamCrest team={save.team} small /><strong>{save.team.name}</strong><small>你的战队</small></span>
            <span>{save.team.country}</span>
            <span className="manager-ranking-roster">{save.recruitedIds.length ? "自建阵容" : "尚未签约选手"}</span>
            <span>—</span>
            <span><b>{lineupPowerForSave(save)}</b></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function playerById(id: string | undefined) {
  return id ? MANAGER_PLAYERS.find((player) => player.id === id) : undefined;
}

function lineupPlayersForSave(save: ManagerSave) {
  return LINEUP_SLOTS.map((slot) => playerById(save.lineup[slot])).filter(Boolean) as ManagerPlayer[];
}

function lineupPowerForSave(save: ManagerSave) {
  return lineupPower(lineupPlayersForSave(save));
}

function RosterView({
  save,
  onSetSlot,
}: {
  save: ManagerSave;
  onSetSlot: (slot: LineupSlot, playerId: string) => void;
}) {
  const ownedPlayers = save.recruitedIds.map((id) => playerById(id)).filter(Boolean) as ManagerPlayer[];
  const power = lineupPowerForSave(save);
  return (
    <section className="manager-view manager-roster-view">
      <header className="manager-view-heading">
        <div>
          <p className="manager-section-code">02 / 竞技阵容</p>
          <h2>首发五人组</h2>
          <span>每名选手只能进入按公开职责映射的游戏固定位置</span>
        </div>
        <div className="manager-lineup-power"><span>阵容总战力</span><b>{power}</b><small>{isCompleteLineup(save.lineup) ? "阵容已就绪" : "需要补齐五个位置"}</small></div>
      </header>

      <div className="manager-formation">
        {LINEUP_SLOTS.map((slot) => {
          const player = playerById(save.lineup[slot]);
          const choices = ownedPlayers.filter((candidate) => roleFitsSlot(candidate.role, slot));
          return (
            <article key={slot} className={`manager-slot slot-${SLOT_ROLE[slot]} ${player ? "filled" : ""}`}>
              <header><span>{SLOT_LABELS[slot]}</span><b>{ROLE_LABELS[SLOT_ROLE[slot]]}</b></header>
              {player ? (
                <>
                  <img src={player.portrait} alt={player.fullName} referrerPolicy="no-referrer" />
                  <div><strong>{player.nickname}</strong><span>{player.teamName} · #{player.teamRank}</span><b>{playerPower(player)} 战力</b></div>
                </>
              ) : (
                <div className="manager-empty-slot"><i>＋</i><strong>等待选手</strong><span>仅限{ROLE_LABELS[SLOT_ROLE[slot]]}</span></div>
              )}
              <select value={save.lineup[slot] ?? ""} onChange={(event) => onSetSlot(slot, event.target.value)}>
                <option value="">— 选择{ROLE_LABELS[SLOT_ROLE[slot]]} —</option>
                {choices.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.nickname} · #{candidate.teamRank} · {playerPower(candidate)}</option>
                ))}
              </select>
            </article>
          );
        })}
      </div>

      <div className="manager-owned-roster">
        <header><div><span>选手仓库</span><strong>{ownedPlayers.length} / 155 已签约</strong></div><small>点击卡片右上角可查看公开资料</small></header>
        {ownedPlayers.length ? (
          <div className="manager-owned-grid">
            {ownedPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} compact footer={
                <span>{playerPower(player)} <small>战力</small></span>
              } />
            ))}
          </div>
        ) : (
          <div className="manager-empty-roster"><b>尚无选手</b><span>前往「招募人员」完成五次免费签约。</span></div>
        )}
      </div>
    </section>
  );
}

function LeagueView({ save, onPlay }: { save: ManagerSave; onPlay: () => void }) {
  const stage = LEAGUE_STAGES[save.stageIndex];
  const opponentRank = stage.ranks[save.opponentIndex];
  const opponent = MANAGER_TEAMS[opponentRank - 1];
  const userPower = lineupPowerForSave(save);
  const complete = isCompleteLineup(save.lineup);
  const roundLabel = stage.rounds?.[save.opponentIndex] ?? `第 ${save.opponentIndex + 1} 场`;
  const reward = stageReward(save.stageIndex, save.opponentIndex);

  return (
    <section className="manager-view manager-league-view">
      <div className="manager-season-map">
        <header>
          <div><p className="manager-section-code">04 / 职业征程</p><h2>赛季 {String(save.season).padStart(2, "0")}</h2></div>
          <span>失败将直接进入下一赛事</span>
        </header>
        <div className="manager-stage-track">
          {LEAGUE_STAGES.map((item, index) => (
            <div key={item.id} className={index < save.stageIndex ? "passed" : index === save.stageIndex ? "active" : ""}>
              <i>{index < save.stageIndex ? "✓" : index + 1}</i>
              <span>{item.shortName}</span>
              <small>#{item.ranks[0]}–#{item.ranks[item.ranks.length - 1]}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="manager-match-card">
        <header>
          <span>{stage.name}</span><b>{roundLabel}</b><small>胜利奖金 ◉ {formatCoins(reward)}</small>
        </header>
        <div className="manager-versus">
          <div className="manager-versus-team user">
            {save.team && <TeamCrest team={save.team} />}
            <span>世界 #{save.userRank}</span>
            <strong>{save.team?.name}</strong>
            <b>{userPower}</b>
            <small>阵容总战力</small>
          </div>
          <div className="manager-vs-mark"><span>BEST OF 3</span><b>VS</b><i>战力高者获胜</i></div>
          <div className="manager-versus-team">
            <div className="manager-opponent-logo"><img src={opponent.logo} alt="" referrerPolicy="no-referrer" /></div>
            <span>VRS #{opponent.rank}</span>
            <strong>{opponent.name}</strong>
            <b>{opponent.power}</b>
            <small>阵容总战力</small>
          </div>
        </div>
        <div className="manager-power-comparison">
          <i style={{ width: `${userPower + opponent.power ? (userPower / (userPower + opponent.power)) * 100 : 50}%` }} />
        </div>
        <button className="manager-match-button" disabled={!complete} onClick={onPlay}>
          {complete ? "开始比赛" : "阵容未完整"} <span>▶</span>
        </button>
      </div>

      <aside className="manager-match-history">
        <header><span>最近战绩</span><b>{save.history.filter((item) => item.won).length} 胜 · {save.history.filter((item) => !item.won).length} 负</b></header>
        {save.history.length ? save.history.slice(0, 7).map((record) => (
          <div key={record.id} className={record.won ? "win" : "loss"}>
            <i>{record.won ? "W" : "L"}</i>
            <span><b>{record.opponent}</b><small>{record.stage} · S{record.season}</small></span>
            <strong>{record.score}</strong>
            <em>{record.reward ? `+${formatCoins(record.reward)}` : "—"}</em>
          </div>
        )) : <p>首场比赛等待开赛。</p>}
      </aside>
    </section>
  );
}

function RecruitReveal({ player, onClose }: { player: ManagerPlayer; onClose: () => void }) {
  const tier = player.teamRank <= 4 ? "legendary" : player.teamRank <= 9 ? "elite" : player.teamRank <= 19 ? "pro" : "rising";
  return (
    <div className={`manager-modal-backdrop recruit-reveal ${tier}`}>
      <section>
        <p>NEW SIGNING · VRS #{player.teamRank}</p>
        <div className="manager-reveal-card"><PlayerCard player={player} /></div>
        <h2>{player.nickname}</h2>
        <span>{player.teamName} · {ROLE_LABELS[player.role]} · 战力 {playerPower(player)}</span>
        <button onClick={onClose}>收入阵容</button>
      </section>
    </div>
  );
}

function MatchResultModal({ result, onClose }: { result: MatchResult; onClose: () => void }) {
  return (
    <div className={`manager-modal-backdrop match-result ${result.won ? "won" : "lost"}`}>
      <section>
        <p>{result.stageName}</p>
        <span>{result.won ? "VICTORY" : "DEFEAT"}</span>
        <h2>{result.score}</h2>
        <div><strong>{result.won ? `奖金 +${formatCoins(result.reward)}` : "本场无奖金"}</strong><small>对手 · {result.opponent.name}（#{result.opponent.rank}）</small></div>
        {result.skipped && <em>赛事失利，赛程已跳至 {result.skipped}</em>}
        <button onClick={onClose}>继续征程</button>
      </section>
    </div>
  );
}

export function CS2ManagerGame() {
  const [save, setSave] = useState<ManagerSave | null>(null);
  const [view, setView] = useState<ManagerView>("ranking");
  const [selectedTeam, setSelectedTeam] = useState<ManagerTeam | null>(null);
  const [recruitReveal, setRecruitReveal] = useState<ManagerPlayer | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  useEffect(() => {
    queueMicrotask(() => setSave(loadSave()));
  }, []);

  useEffect(() => {
    if (!save) return;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [save]);

  if (!save) return <main className="manager-loading"><span>VRS</span><b>载入职业赛场…</b></main>;
  if (!save.team) {
    return <TeamCreation onCreate={(team) => setSave({ ...save, team })} />;
  }

  const recruit = () => {
    const free = save.freeRecruitIndex < FREE_RECRUIT_ROLES.length;
    if (!free && save.coins < RECRUIT_COST) return;
    const forcedRole = free ? FREE_RECRUIT_ROLES[save.freeRecruitIndex] : undefined;
    const player = drawRecruit(Math.random(), Math.random(), forcedRole, save.recruitedIds);
    if (!player) return;

    const nextLineup = { ...save.lineup };
    const matchingEmptySlot = LINEUP_SLOTS.find((slot) => !nextLineup[slot] && roleFitsSlot(player.role, slot));
    if (matchingEmptySlot) nextLineup[matchingEmptySlot] = player.id;
    setSave({
      ...save,
      coins: free ? save.coins : save.coins - RECRUIT_COST,
      freeRecruitIndex: free ? save.freeRecruitIndex + 1 : save.freeRecruitIndex,
      recruitedIds: [...save.recruitedIds, player.id],
      lineup: nextLineup,
    });
    setRecruitReveal(player);
  };

  const setSlot = (slot: LineupSlot, playerId: string) => {
    const player = playerById(playerId);
    if (playerId && (!player || !roleFitsSlot(player.role, slot) || !save.recruitedIds.includes(playerId))) return;
    const next = { ...save.lineup };
    for (const key of LINEUP_SLOTS) if (next[key] === playerId) delete next[key];
    if (playerId) next[slot] = playerId;
    else delete next[slot];
    setSave({ ...save, lineup: next });
  };

  const playMatch = () => {
    if (!isCompleteLineup(save.lineup)) return;
    const stage = LEAGUE_STAGES[save.stageIndex];
    const opponentRank = stage.ranks[save.opponentIndex];
    const opponent = MANAGER_TEAMS[opponentRank - 1];
    const userPower = lineupPowerForSave(save);
    const won = userPower > opponent.power;
    const gap = Math.abs(userPower - opponent.power);
    const losingRounds = Math.max(2, Math.min(11, 11 - Math.floor(gap / 22)));
    const score = won ? `13 : ${losingRounds}` : `${losingRounds} : 13`;
    const reward = won ? stageReward(save.stageIndex, save.opponentIndex) : 0;
    const next = nextLeaguePosition(save.stageIndex, save.opponentIndex, won);
    const nextStageName = LEAGUE_STAGES[next.stageIndex].name;
    const history: MatchRecord = {
      id: `${Date.now()}-${opponent.rank}`,
      season: save.season,
      stage: stage.name,
      opponent: opponent.name,
      won,
      score,
      reward,
    };
    setSave({
      ...save,
      coins: save.coins + reward,
      userRank: won ? Math.min(save.userRank, opponent.rank) : save.userRank,
      stageIndex: next.stageIndex,
      opponentIndex: next.opponentIndex,
      season: save.season + (next.seasonComplete ? 1 : 0),
      history: [history, ...save.history].slice(0, 30),
    });
    setMatchResult({
      won,
      score,
      reward,
      opponent,
      stageName: `${stage.name} · ${stage.rounds?.[save.opponentIndex] ?? `第 ${save.opponentIndex + 1} 场`}`,
      skipped: won ? null : nextStageName,
    });
  };

  return (
    <main className="cs2-manager-shell">
      <header className="manager-topbar">
        <div className="manager-club-id">
          <TeamCrest team={save.team} small />
          <div><strong>{save.team.name}</strong><span>{save.team.country} · 世界 #{save.userRank}</span></div>
        </div>
        <nav>
          {([
            ["ranking", "战队排名"],
            ["roster", "战队人员"],
            ["recruit", "招募人员"],
            ["league", "联赛"],
          ] as [ManagerView, string][]).map(([id, label], index) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              <i>0{index + 1}</i>{label}
              {id === "roster" && !isCompleteLineup(save.lineup) && <em>!</em>}
            </button>
          ))}
        </nav>
        <div className="manager-wallet">
          <span>俱乐部资金</span><strong><i>◉</i> {formatCoins(save.coins)}</strong>
        </div>
      </header>

      <div className="manager-content">
        {view === "ranking" && <RankingView save={save} onSelectTeam={setSelectedTeam} />}
        {view === "roster" && <RosterView save={save} onSetSlot={setSlot} />}
        {view === "recruit" && <RecruitmentView save={save} onRecruit={recruit} />}
        {view === "league" && <LeagueView save={save} onPlay={playMatch} />}
      </div>

      <footer className="manager-footer">
        <span>CS2 OWNER / CAREER DATABASE</span>
        <span>名单、VRS 名次与肖像：<a href="https://www.hltv.org/valve-ranking/teams/2026/july/6" target="_blank" rel="noreferrer">Valve VRS 2026-07-06 / HLTV</a> · 能力值与固定位置为游戏化映射，并非官方评分</span>
        <button onClick={() => {
          if (window.confirm("确定清空经理生涯并重新创建战队吗？")) {
            window.localStorage.removeItem(SAVE_KEY);
            setSave(blankSave());
          }
        }}>重置生涯</button>
      </footer>

      {selectedTeam && <TeamDetail team={selectedTeam} onClose={() => setSelectedTeam(null)} />}
      {recruitReveal && <RecruitReveal player={recruitReveal} onClose={() => setRecruitReveal(null)} />}
      {matchResult && <MatchResultModal result={matchResult} onClose={() => setMatchResult(null)} />}
    </main>
  );
}
