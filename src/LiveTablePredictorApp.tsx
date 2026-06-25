import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  CloudOff,
  Globe2,
  GripVertical,
  Info,
  Menu,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trophy,
  UserCircle,
  X
} from "lucide-react";

type Team = {
  name: string;
  code: string;
  groupId: string;
};

type Group = {
  id: string;
  teams: Team[];
};

type TeamStats = {
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

type GroupOrder = Record<string, string[]>;
type StatsMap = Record<string, TeamStats>;
type BracketPicks = Record<string, string>;
type View = "groups" | "bracket";
type FeedState = "loading" | "live" | "cached" | "error";

type FifaStanding = {
  Played: number;
  Won: number;
  Drawn: number;
  Lost: number;
  For: number;
  Against: number;
  GoalsDiference: number;
  Points: number;
  Team?: {
    IdCountry?: string;
    Name?: Array<{ Description?: string }>;
  };
};

const fifaStandingsPage =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings";
const fifaStandingsApi =
  "https://api.fifa.com/api/v3/calendar/17/285023/289273/standing?language=en&count=500";
const flagUrl = (code: string) =>
  `https://api.fifa.com/api/v3/picture/flags-sq-2/${code}`;

const groupData: Array<[string, Array<[string, string]>]> = [
  ["A", [["Mexico", "MEX"], ["South Africa", "RSA"], ["Korea Republic", "KOR"], ["Czechia", "CZE"]]],
  ["B", [["Switzerland", "SUI"], ["Canada", "CAN"], ["Bosnia and Herzegovina", "BIH"], ["Qatar", "QAT"]]],
  ["C", [["Brazil", "BRA"], ["Morocco", "MAR"], ["Scotland", "SCO"], ["Haiti", "HAI"]]],
  ["D", [["USA", "USA"], ["Australia", "AUS"], ["Paraguay", "PAR"], ["Türkiye", "TUR"]]],
  ["E", [["Germany", "GER"], ["Côte d'Ivoire", "CIV"], ["Ecuador", "ECU"], ["Curaçao", "CUW"]]],
  ["F", [["Netherlands", "NED"], ["Japan", "JPN"], ["Sweden", "SWE"], ["Tunisia", "TUN"]]],
  ["G", [["Egypt", "EGY"], ["IR Iran", "IRN"], ["Belgium", "BEL"], ["New Zealand", "NZL"]]],
  ["H", [["Spain", "ESP"], ["Uruguay", "URU"], ["Cabo Verde", "CPV"], ["Saudi Arabia", "KSA"]]],
  ["I", [["France", "FRA"], ["Norway", "NOR"], ["Senegal", "SEN"], ["Iraq", "IRQ"]]],
  ["J", [["Argentina", "ARG"], ["Austria", "AUT"], ["Algeria", "ALG"], ["Jordan", "JOR"]]],
  ["K", [["Colombia", "COL"], ["Portugal", "POR"], ["Congo DR", "COD"], ["Uzbekistan", "UZB"]]],
  ["L", [["England", "ENG"], ["Ghana", "GHA"], ["Croatia", "CRO"], ["Panama", "PAN"]]]
];

const groups: Group[] = groupData.map(([id, teams]) => ({
  id,
  teams: teams.map(([name, code]) => ({ name, code, groupId: id }))
}));
const allTeams = groups.flatMap((group) => group.teams);
const rounds = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"];
const emptyStats: TeamStats = { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
const statColumns: Array<{ key: keyof TeamStats; label: string; title: string }> = [
  { key: "mp", label: "MP", title: "Matches played" },
  { key: "w", label: "W", title: "Wins" },
  { key: "d", label: "D", title: "Draws" },
  { key: "l", label: "L", title: "Losses" },
  { key: "gf", label: "GF", title: "Goals scored" },
  { key: "ga", label: "GA", title: "Goals against" },
  { key: "gd", label: "GD", title: "Goal difference" },
  { key: "pts", label: "Pts", title: "Points" }
];

function defaultGroupOrder(): GroupOrder {
  return Object.fromEntries(groups.map((group) => [group.id, group.teams.map((team) => team.name)]));
}

function findTeam(name?: string) {
  return name ? allTeams.find((team) => team.name === name) : undefined;
}

function loadGroupOrder(): GroupOrder {
  try {
    const saved = window.localStorage.getItem("fifa-rank-predictor-groups-v1");
    if (!saved) return defaultGroupOrder();
    const parsed = JSON.parse(saved) as GroupOrder;
    return groups.every((group) =>
      parsed[group.id]?.length === 4 &&
      group.teams.every((team) => parsed[group.id].includes(team.name))
    )
      ? parsed
      : defaultGroupOrder();
  } catch {
    return defaultGroupOrder();
  }
}

function loadThirdOrder(groupOrder: GroupOrder) {
  const currentThirds = groups.map((group) => groupOrder[group.id][2]);
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem("fifa-rank-predictor-thirds-v1") ?? "[]"
    ) as string[];
    return [
      ...parsed.filter((name) => currentThirds.includes(name)),
      ...currentThirds.filter((name) => !parsed.includes(name))
    ];
  } catch {
    return currentThirds;
  }
}

function loadBracketPicks(): BracketPicks {
  try {
    return JSON.parse(
      window.localStorage.getItem("fifa-rank-predictor-bracket-v1") ?? "{}"
    );
  } catch {
    return {};
  }
}

function loadCachedStats(): { stats: StatsMap; updatedAt: string | null } {
  try {
    return JSON.parse(
      window.localStorage.getItem("fifa-live-standings-cache-v1") ??
        '{"stats":{},"updatedAt":null}'
    );
  } catch {
    return { stats: {}, updatedAt: null };
  }
}

function parseFifaStandings(rows: FifaStanding[]) {
  return Object.fromEntries(
    rows.flatMap((row) => {
      const code = row.Team?.IdCountry;
      if (!code) return [];
      return [
        [
          code,
          {
            mp: row.Played ?? 0,
            w: row.Won ?? 0,
            d: row.Drawn ?? 0,
            l: row.Lost ?? 0,
            gf: row.For ?? 0,
            ga: row.Against ?? 0,
            gd: row.GoalsDiference ?? (row.For ?? 0) - (row.Against ?? 0),
            pts: row.Points ?? 0
          }
        ]
      ];
    })
  ) as StatsMap;
}

function seedRoundOf32(groupOrder: GroupOrder, thirdOrder: string[]) {
  const winners = groups.map((group) => findTeam(groupOrder[group.id][0])!);
  const runnersUp = groups.map((group) => findTeam(groupOrder[group.id][1])!);
  const bestThird = thirdOrder.slice(0, 8).map((name) => findTeam(name)!);
  const seeds = [...winners, ...runnersUp.slice(8)];
  const available = [...bestThird, ...runnersUp.slice(0, 8)];
  const bracket: Team[] = [];

  seeds.forEach((seed) => {
    let opponentIndex = available.findIndex((candidate) => candidate.groupId !== seed.groupId);
    if (opponentIndex < 0) opponentIndex = 0;
    const [opponent] = available.splice(opponentIndex, 1);
    bracket.push(seed, opponent);
  });

  return bracket;
}

function LiveTablePredictorApp() {
  const initialOrder = useMemo(loadGroupOrder, []);
  const cache = useMemo(loadCachedStats, []);
  const [view, setView] = useState<View>("groups");
  const [groupOrder, setGroupOrder] = useState<GroupOrder>(initialOrder);
  const [thirdOrder, setThirdOrder] = useState(() => loadThirdOrder(initialOrder));
  const [bracketPicks, setBracketPicks] = useState<BracketPicks>(loadBracketPicks);
  const [stats, setStats] = useState<StatsMap>(cache.stats);
  const [feedState, setFeedState] = useState<FeedState>(
    Object.keys(cache.stats).length ? "cached" : "loading"
  );
  const [lastUpdated, setLastUpdated] = useState<string | null>(cache.updatedAt);
  const [showGuide, setShowGuide] = useState(false);

  const refreshStandings = useCallback(async (signal?: AbortSignal) => {
    setFeedState((current) => (current === "live" ? current : "loading"));
    try {
      const response = await fetch(fifaStandingsApi, {
        headers: { Accept: "application/json" },
        signal
      });
      if (!response.ok) throw new Error(`FIFA returned ${response.status}`);
      const payload = (await response.json()) as { Results?: FifaStanding[] };
      const nextStats = parseFifaStandings(payload.Results ?? []);
      if (Object.keys(nextStats).length < 48) {
        throw new Error("Incomplete FIFA standings response");
      }
      const updatedAt = new Date().toISOString();
      setStats(nextStats);
      setLastUpdated(updatedAt);
      setFeedState("live");
      window.localStorage.setItem(
        "fifa-live-standings-cache-v1",
        JSON.stringify({ stats: nextStats, updatedAt })
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedState(Object.keys(loadCachedStats().stats).length ? "cached" : "error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshStandings(controller.signal);
    const interval = window.setInterval(() => void refreshStandings(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refreshStandings]);

  const currentThirdNames = useMemo(
    () => groups.map((group) => groupOrder[group.id][2]),
    [groupOrder]
  );

  useEffect(() => {
    setThirdOrder((current) => [
      ...current.filter((name) => currentThirdNames.includes(name)),
      ...currentThirdNames.filter((name) => !current.includes(name))
    ]);
  }, [currentThirdNames.join("|")]);

  useEffect(() => {
    window.localStorage.setItem("fifa-rank-predictor-groups-v1", JSON.stringify(groupOrder));
  }, [groupOrder]);

  useEffect(() => {
    window.localStorage.setItem("fifa-rank-predictor-thirds-v1", JSON.stringify(thirdOrder));
  }, [thirdOrder]);

  useEffect(() => {
    window.localStorage.setItem("fifa-rank-predictor-bracket-v1", JSON.stringify(bracketPicks));
  }, [bracketPicks]);

  const bestThirdNames = new Set(thirdOrder.slice(0, 8));
  const qualifiers = useMemo(
    () => seedRoundOf32(groupOrder, thirdOrder),
    [groupOrder, thirdOrder]
  );
  const champion = findTeam(bracketPicks.r4m0);
  const knockoutPickCount = Object.keys(bracketPicks).length;

  function switchView(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function moveGroupTeam(groupId: string, fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex > 3 || fromIndex === toIndex) return;
    setGroupOrder((current) => {
      const nextGroup = [...current[groupId]];
      const [team] = nextGroup.splice(fromIndex, 1);
      nextGroup.splice(toIndex, 0, team);
      return { ...current, [groupId]: nextGroup };
    });
    setBracketPicks({});
  }

  function moveThirdTeam(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= thirdOrder.length || fromIndex === toIndex) return;
    setThirdOrder((current) => {
      const next = [...current];
      const [team] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, team);
      return next;
    });
    setBracketPicks({});
  }

  function resetPredictions() {
    const defaults = defaultGroupOrder();
    setGroupOrder(defaults);
    setThirdOrder(groups.map((group) => defaults[group.id][2]));
    setBracketPicks({});
  }

  function selectWinner(roundIndex: number, matchIndex: number, teamName: string) {
    setBracketPicks((current) => {
      const next = { ...current, [`r${roundIndex}m${matchIndex}`]: teamName };
      for (let laterRound = roundIndex + 1; laterRound < rounds.length; laterRound += 1) {
        Object.keys(next)
          .filter((key) => key.startsWith(`r${laterRound}m`))
          .forEach((key) => delete next[key]);
      }
      return next;
    });
  }

  function autoPickBracket() {
    const next: BracketPicks = {};
    let currentTeams: Array<Team | undefined> = qualifiers;
    rounds.forEach((_, roundIndex) => {
      const winners: Array<Team | undefined> = [];
      for (let matchIndex = 0; matchIndex < currentTeams.length / 2; matchIndex += 1) {
        const teamA = currentTeams[matchIndex * 2];
        const teamB = currentTeams[matchIndex * 2 + 1];
        const winner = (matchIndex + roundIndex) % 3 === 0 ? teamB ?? teamA : teamA ?? teamB;
        if (winner) next[`r${roundIndex}m${matchIndex}`] = winner.name;
        winners.push(winner);
      }
      currentTeams = winners;
    });
    setBracketPicks(next);
  }

  return (
    <div className="site-shell">
      <GlobalHeader onGuide={() => setShowGuide(true)} />
      <nav className="challenge-nav" aria-label="Bracket challenge navigation">
        <div className="nav-tabs">
          <button className={view === "groups" ? "active" : ""} onClick={() => switchView("groups")} type="button">
            Group Predictor
          </button>
          <button className={view === "bracket" ? "active" : ""} onClick={() => switchView("bracket")} type="button">
            Knockout Stage
          </button>
          <button onClick={() => setShowGuide(true)} type="button">How to predict</button>
        </div>
        <button className="challenge-select" type="button">
          Bracket Challenge <ChevronDown size={17} />
        </button>
      </nav>

      <div className="announcement">
        <Info size={18} />
        <span>Drag teams into your predicted order. Live FIFA statistics update without changing your ranking.</span>
      </div>

      <main>
        <Hero view={view} champion={champion} />
        <ProgressBar view={view} knockoutPickCount={knockoutPickCount} champion={champion} />
        {view === "groups" ? (
          <GroupPredictor
            groupOrder={groupOrder}
            thirdOrder={thirdOrder}
            bestThirdNames={bestThirdNames}
            stats={stats}
            feedState={feedState}
            lastUpdated={lastUpdated}
            onRefresh={() => void refreshStandings()}
            onMoveGroupTeam={moveGroupTeam}
            onMoveThirdTeam={moveThirdTeam}
            onReset={resetPredictions}
            onContinue={() => switchView("bracket")}
          />
        ) : (
          <KnockoutStage
            qualifiers={qualifiers}
            picks={bracketPicks}
            champion={champion}
            onPick={selectWinner}
            onAutoPick={autoPickBracket}
            onReset={() => setBracketPicks({})}
            onBack={() => switchView("groups")}
          />
        )}
      </main>
      <Footer />
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function GlobalHeader({ onGuide }: { onGuide: () => void }) {
  return (
    <header className="global-header">
      <div className="utility-bar">
        <button className="menu-button" aria-label="Open menu" type="button"><Menu size={23} /></button>
        <a className="fifa-wordmark" href="#top" aria-label="FIFA home">FIFA</a>
        <nav aria-label="FIFA utilities">
          <a href="#rewards">FIFA REWARDS</a>
          <a href="#plus">FIFA+</a>
          <a href="#store">FIFA STORE</a>
          <span />
          <button type="button"><Globe2 size={19} /> English <ChevronDown size={15} /></button>
          <span />
          <button aria-label="Account" type="button"><UserCircle size={22} /></button>
        </nav>
      </div>
      <div className="tournament-bar">
        <a className="tournament-brand" href="#top">
          <span className="cup-mark"><Trophy size={21} /></span>
          <strong>FIFA WORLD CUP 26</strong>
        </a>
        <nav aria-label="Tournament navigation">
          <a href="#matches">MATCHES</a>
          <a href={fifaStandingsPage} target="_blank" rel="noreferrer">STANDINGS</a>
          <a href="#teams">TEAMS & STATS</a>
          <a href="#latest">LATEST</a>
          <a className="active" href="#gaming">FANTASY & GAMING</a>
          <button onClick={onGuide} type="button">MORE <ChevronDown size={16} /></button>
        </nav>
      </div>
    </header>
  );
}

function Hero({ view, champion }: { view: View; champion?: Team }) {
  return (
    <section className="hero" id="top">
      <div className="hero-art hero-art-left" />
      <div className="hero-copy">
        <div className="challenge-lockup">
          <span>WORLD CUP 26</span>
          <strong>BRACKET</strong>
          <strong>CHALLENGE</strong>
          <small>ORDER. QUALIFY. ADVANCE.</small>
        </div>
        <div className="hero-divider" />
        <div>
          <p>{view === "groups" ? "Your table. Live tournament data." : "The road to the final"}</p>
          <h1>
            {view === "groups" ? <>GROUP <em>PREDICTOR</em></> : champion ? <>YOUR <em>CHAMPION</em></> : <>KNOCKOUT <em>BRACKET</em></>}
          </h1>
          <p className="hero-note">{champion ? `${champion.name} lifts the trophy.` : "The stats are live. The order is yours."}</p>
        </div>
      </div>
      <div className="hero-art hero-art-right" />
    </section>
  );
}

function ProgressBar({ view, knockoutPickCount, champion }: { view: View; knockoutPickCount: number; champion?: Team }) {
  const steps = [
    { label: "Group Predictor", complete: true, active: view === "groups" },
    { label: "Round of 32", complete: knockoutPickCount === 31, active: view === "bracket" && !champion },
    { label: "Champion", complete: Boolean(champion), active: Boolean(champion) }
  ];
  return (
    <section className="progress-shell" aria-label="Bracket progress">
      {steps.map((step, index) => (
        <div className={`progress-step ${step.complete ? "complete" : ""} ${step.active ? "active" : ""}`} key={step.label}>
          <span>{step.complete ? <Check size={16} /> : index + 1}</span>
          <strong>{step.label}</strong>
          {index < steps.length - 1 && <i />}
        </div>
      ))}
    </section>
  );
}

function GroupPredictor({
  groupOrder,
  thirdOrder,
  bestThirdNames,
  stats,
  feedState,
  lastUpdated,
  onRefresh,
  onMoveGroupTeam,
  onMoveThirdTeam,
  onReset,
  onContinue
}: {
  groupOrder: GroupOrder;
  thirdOrder: string[];
  bestThirdNames: Set<string>;
  stats: StatsMap;
  feedState: FeedState;
  lastUpdated: string | null;
  onRefresh: () => void;
  onMoveGroupTeam: (groupId: string, fromIndex: number, toIndex: number) => void;
  onMoveThirdTeam: (fromIndex: number, toIndex: number) => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="content-section live-predictor-section">
      <header className="section-heading live-heading">
        <div>
          <span className="eyebrow">STEP 1 OF 3</span>
          <h2>Predict every group</h2>
          <p>Reorder the teams as you wish. Match statistics are fetched automatically from FIFA and remain read-only.</p>
        </div>
        <FeedStatus state={feedState} updatedAt={lastUpdated} onRefresh={onRefresh} />
      </header>

      <aside className="rules-strip rank-rules" aria-label="Qualification rules">
        <div><strong>Positions 1–2</strong><span>Qualify automatically from every group</span></div>
        <div><strong>Position 3</strong><span>Moves into your third-place ranking table</span></div>
        <div><strong>Live statistics</strong><span>Refresh automatically every 60 seconds</span></div>
      </aside>

      <div className="live-group-grid">
        {groups.map((group) => (
          <LiveGroupCard
            group={group}
            key={group.id}
            order={groupOrder[group.id]}
            bestThirdNames={bestThirdNames}
            stats={stats}
            onMove={onMoveGroupTeam}
          />
        ))}
      </div>

      <ThirdPlacePredictor order={thirdOrder} onMove={onMoveThirdTeam} />

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onReset} type="button"><RotateCcw size={17} /> Reset FIFA order</button>
        <div>
          <span>Your ranking is saved automatically</span>
          <button className="primary-button" onClick={onContinue} type="button">Build Round of 32 <ArrowRight size={18} /></button>
        </div>
      </div>
    </section>
  );
}

function FeedStatus({ state, updatedAt, onRefresh }: { state: FeedState; updatedAt: string | null; onRefresh: () => void }) {
  const live = state === "live";
  const loading = state === "loading";
  return (
    <div className={`live-feed-status ${state}`}>
      <span className="feed-icon">{state === "error" ? <CloudOff size={19} /> : <Cloud size={19} />}</span>
      <div>
        <strong>{live ? "Live FIFA data" : loading ? "Updating standings" : state === "cached" ? "Cached FIFA data" : "Live data unavailable"}</strong>
        <span>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for first update"}</span>
      </div>
      <button aria-label="Refresh live FIFA standings" disabled={loading} onClick={onRefresh} type="button">
        <RefreshCw className={loading ? "spinning" : ""} size={17} />
      </button>
    </div>
  );
}

function LiveGroupCard({
  group,
  order,
  bestThirdNames,
  stats,
  onMove
}: {
  group: Group;
  order: string[];
  bestThirdNames: Set<string>;
  stats: StatsMap;
  onMove: (groupId: string, fromIndex: number, toIndex: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  function drop(event: DragEvent<HTMLDivElement>, toIndex: number) {
    event.preventDefault();
    if (dragIndex !== null) onMove(group.id, dragIndex, toIndex);
    setDragIndex(null);
  }
  return (
    <article className="group-card live-group-card">
      <header>
        <div><span>GROUP</span><strong>{group.id}</strong></div>
        <span className="complete-label"><GripVertical size={14} /> Drag to rank</span>
      </header>
      <div className="live-table-scroll">
        <div className="live-table">
          <div className="live-table-head">
            <span>POS</span><span>TEAM</span>
            {statColumns.map((column) => <abbr key={column.key} title={column.title}>{column.label}</abbr>)}
            <span />
          </div>
          {order.map((teamName, index) => {
            const team = findTeam(teamName)!;
            const teamStats = stats[team.code] ?? emptyStats;
            const thirdQualified = index === 2 && bestThirdNames.has(teamName);
            return (
              <div
                className={`live-team-row ${index < 2 ? "automatic" : ""} ${thirdQualified ? "third-qualified" : ""} ${dragIndex === index ? "dragging" : ""}`}
                draggable
                key={team.name}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={() => setDragIndex(index)}
                onDrop={(event) => drop(event, index)}
              >
                <span className="rank-number">{index + 1}</span>
                <span className="live-team-cell">
                  <GripVertical className="drag-handle" size={16} />
                  <Flag team={team} />
                  <strong>{team.name}</strong>
                </span>
                {statColumns.map((column) => (
                  <span className={column.key === "pts" ? "points-value" : ""} key={column.key}>
                    {column.key === "gd" && teamStats.gd > 0 ? "+" : ""}{teamStats[column.key]}
                  </span>
                ))}
                <span className="live-row-actions">
                  <button aria-label={`Move ${team.name} up`} disabled={index === 0} onClick={() => onMove(group.id, index, index - 1)} type="button"><ArrowUp size={13} /></button>
                  <button aria-label={`Move ${team.name} down`} disabled={index === 3} onClick={() => onMove(group.id, index, index + 1)} type="button"><ArrowDown size={13} /></button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <footer><span>Q automatic · 3Q best third</span><span>Live FIFA stats</span></footer>
    </article>
  );
}

function ThirdPlacePredictor({ order, onMove }: { order: string[]; onMove: (fromIndex: number, toIndex: number) => void }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  function drop(event: DragEvent<HTMLDivElement>, toIndex: number) {
    event.preventDefault();
    if (dragIndex !== null) onMove(dragIndex, toIndex);
    setDragIndex(null);
  }
  return (
    <section className="third-place-panel rank-third-panel">
      <header>
        <div>
          <span className="eyebrow">POSITION 3 TABLE</span>
          <h3>Rank the third-place teams</h3>
          <p>Drag the teams into your predicted cross-group order. Positions 1–8 qualify.</p>
        </div>
        <div className="third-summary"><strong>8</strong><span>of 12 advance</span></div>
      </header>
      <div className="third-rank-list">
        {order.map((teamName, index) => {
          const team = findTeam(teamName)!;
          const qualifies = index < 8;
          return (
            <div
              className={`third-rank-row ${qualifies ? "qualified" : "eliminated"} ${dragIndex === index ? "dragging" : ""}`}
              draggable
              key={team.name}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDragIndex(index)}
              onDrop={(event) => drop(event, index)}
            >
              <span className="third-rank-number">{index + 1}</span>
              <GripVertical className="drag-handle" size={18} />
              <Flag team={team} />
              <strong>{team.name}</strong>
              <span className="third-group">Group {team.groupId}</span>
              <span className="third-qualifies">{qualifies ? <><Check size={14} /> Qualified</> : "Eliminated"}</span>
              <span className="rank-actions">
                <button aria-label={`Move ${team.name} up in third-place table`} disabled={index === 0} onClick={() => onMove(index, index - 1)} type="button"><ArrowUp size={14} /></button>
                <button aria-label={`Move ${team.name} down in third-place table`} disabled={index === order.length - 1} onClick={() => onMove(index, index + 1)} type="button"><ArrowDown size={14} /></button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Flag({ team, className = "" }: { team: Team; className?: string }) {
  return <span className={`official-flag ${className}`}><img src={flagUrl(team.code)} alt={`${team.name} flag`} /></span>;
}

function KnockoutStage({
  qualifiers,
  picks,
  champion,
  onPick,
  onAutoPick,
  onReset,
  onBack
}: {
  qualifiers: Team[];
  picks: BracketPicks;
  champion?: Team;
  onPick: (roundIndex: number, matchIndex: number, teamName: string) => void;
  onAutoPick: () => void;
  onReset: () => void;
  onBack: () => void;
}) {
  function getRoundTeams(roundIndex: number): Array<Team | undefined> {
    if (roundIndex === 0) return qualifiers;
    return Array.from({ length: 32 / 2 ** roundIndex }, (_, index) =>
      findTeam(picks[`r${roundIndex - 1}m${index}`])
    );
  }
  return (
    <section className="content-section knockout-section">
      <header className="section-heading bracket-heading">
        <div><span className="eyebrow">STEP 2 OF 3</span><h2>Pick every winner</h2><p>Your predicted qualifiers now fill the Round of 32.</p></div>
        <div className="bracket-tools">
          <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft size={17} /> Predictor</button>
          <button className="secondary-button accent" onClick={onAutoPick} type="button"><Sparkles size={17} /> Auto-pick</button>
          <button className="secondary-button" onClick={onReset} type="button"><RotateCcw size={17} /> Reset</button>
        </div>
      </header>
      {champion && (
        <article className="champion-banner">
          <div className="trophy-orbit"><Trophy size={43} /></div>
          <div><span>YOUR 2026 CHAMPION</span><strong className="champion-team"><Flag team={champion} /> {champion.name}</strong><p>A complete bracket, all the way to the final whistle.</p></div>
          <button className="primary-button" onClick={onReset} type="button">Make new picks</button>
        </article>
      )}
      <div className="bracket-scroll">
        <div className="bracket-board">
          {rounds.map((round, roundIndex) => {
            const roundTeams = getRoundTeams(roundIndex);
            return (
              <section className={`round-column round-${roundIndex}`} key={round}>
                <header><span>ROUND {roundIndex + 1}</span><strong>{round}</strong></header>
                <div className="round-matches">
                  {Array.from({ length: 16 / 2 ** roundIndex }, (_, matchIndex) => (
                    <MatchCard
                      key={`${round}-${matchIndex}`}
                      matchNumber={matchIndex + 1}
                      selected={picks[`r${roundIndex}m${matchIndex}`]}
                      teamA={roundTeams[matchIndex * 2]}
                      teamB={roundTeams[matchIndex * 2 + 1]}
                      onPick={(teamName) => onPick(roundIndex, matchIndex, teamName)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="scroll-hint">Scroll horizontally to follow the bracket →</p>
    </section>
  );
}

function MatchCard({ matchNumber, teamA, teamB, selected, onPick }: { matchNumber: number; teamA?: Team; teamB?: Team; selected?: string; onPick: (teamName: string) => void }) {
  return (
    <article className={`match-card ${selected ? "decided" : ""}`}>
      <span className="match-label">MATCH {String(matchNumber).padStart(2, "0")}</span>
      {[teamA, teamB].map((team, index) =>
        team ? (
          <button aria-pressed={selected === team.name} className={selected === team.name ? "winner" : selected ? "loser" : ""} key={team.name} onClick={() => onPick(team.name)} type="button">
            <Flag team={team} className="bracket-flag" />
            <span className="match-team-name">{team.name}</span>
            <span className="winner-check">{selected === team.name && <Check size={14} />}</span>
          </button>
        ) : (
          <div className="team-placeholder" key={`placeholder-${index}`}><span /><em>Awaiting winner</em></div>
        )
      )}
    </article>
  );
}

function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section aria-labelledby="guide-title" className="guide-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Close guide" onClick={onClose} type="button"><X size={22} /></button>
        <CircleHelp size={33} />
        <span className="eyebrow">PREDICTOR GUIDE</span>
        <h2 id="guide-title">Live stats, your order</h2>
        <ol>
          <li><span>1</span><div><strong>Read the live table</strong><p>MP, W, D, L, GF, GA, GD and Pts come from FIFA automatically.</p></div></li>
          <li><span>2</span><div><strong>Order every group</strong><p>Drag teams or use the arrows. Live updates never overwrite your prediction.</p></div></li>
          <li><span>3</span><div><strong>Rank the third-place teams</strong><p>The top eight in your separate third-place table qualify.</p></div></li>
        </ol>
        <button className="primary-button" onClick={onClose} type="button">Start predicting <ArrowRight size={18} /></button>
      </section>
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-brand"><strong>FIFA</strong><span>WORLD CUP 26 BRACKET CHALLENGE</span></div>
      <p>Team groups, flags and current match statistics are sourced from FIFA’s official standings feed. This is an unofficial predictor concept.</p>
      <nav><a href={fifaStandingsPage} target="_blank" rel="noreferrer">FIFA standings</a><a href="#privacy">Privacy</a><a href="#help">Help</a></nav>
    </footer>
  );
}

export default LiveTablePredictorApp;
