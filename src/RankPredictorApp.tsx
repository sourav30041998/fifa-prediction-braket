import {
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
  Globe2,
  GripVertical,
  Info,
  Menu,
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

type GroupOrder = Record<string, string[]>;
type BracketPicks = Record<string, string>;
type View = "groups" | "bracket";

const fifaStandingsUrl =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings";
const fifaFlagUrl = (code: string) =>
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

function defaultGroupOrder(): GroupOrder {
  return Object.fromEntries(
    groups.map((group) => [group.id, group.teams.map((team) => team.name)])
  );
}

function findTeam(name?: string) {
  return name ? allTeams.find((team) => team.name === name) : undefined;
}

function loadGroupOrder(): GroupOrder {
  try {
    const saved = window.localStorage.getItem("fifa-rank-predictor-groups-v1");
    if (!saved) return defaultGroupOrder();
    const parsed = JSON.parse(saved) as GroupOrder;
    const isValid = groups.every((group) => {
      const names = parsed[group.id] ?? [];
      return names.length === 4 && group.teams.every((team) => names.includes(team.name));
    });
    return isValid ? parsed : defaultGroupOrder();
  } catch {
    return defaultGroupOrder();
  }
}

function loadThirdOrder(groupOrder: GroupOrder) {
  try {
    const saved = window.localStorage.getItem("fifa-rank-predictor-thirds-v1");
    const currentThirds = groups.map((group) => groupOrder[group.id][2]);
    if (!saved) return currentThirds;
    const parsed = JSON.parse(saved) as string[];
    return [
      ...parsed.filter((name) => currentThirds.includes(name)),
      ...currentThirds.filter((name) => !parsed.includes(name))
    ];
  } catch {
    return groups.map((group) => groupOrder[group.id][2]);
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

function seedRoundOf32(groupOrder: GroupOrder, thirdOrder: string[]) {
  const winners = groups.map((group) => findTeam(groupOrder[group.id][0])!);
  const runnersUp = groups.map((group) => findTeam(groupOrder[group.id][1])!);
  const bestThird = thirdOrder.slice(0, 8).map((name) => findTeam(name)!);
  const seeds = [...winners, ...runnersUp.slice(8)];
  const opponents = [...bestThird, ...runnersUp.slice(0, 8)];
  const available = [...opponents];
  const bracket: Team[] = [];

  seeds.forEach((seed) => {
    let opponentIndex = available.findIndex(
      (candidate) => candidate.groupId !== seed.groupId
    );
    if (opponentIndex < 0) opponentIndex = 0;
    const [opponent] = available.splice(opponentIndex, 1);
    bracket.push(seed, opponent);
  });

  return bracket;
}

function RankPredictorApp() {
  const [view, setView] = useState<View>("groups");
  const [groupOrder, setGroupOrder] = useState<GroupOrder>(loadGroupOrder);
  const [thirdOrder, setThirdOrder] = useState<string[]>(() =>
    loadThirdOrder(loadGroupOrder())
  );
  const [bracketPicks, setBracketPicks] =
    useState<BracketPicks>(loadBracketPicks);
  const [showGuide, setShowGuide] = useState(false);

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
    window.localStorage.setItem(
      "fifa-rank-predictor-groups-v1",
      JSON.stringify(groupOrder)
    );
  }, [groupOrder]);

  useEffect(() => {
    window.localStorage.setItem(
      "fifa-rank-predictor-thirds-v1",
      JSON.stringify(thirdOrder)
    );
  }, [thirdOrder]);

  useEffect(() => {
    window.localStorage.setItem(
      "fifa-rank-predictor-bracket-v1",
      JSON.stringify(bracketPicks)
    );
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
          <button
            className={view === "groups" ? "active" : ""}
            onClick={() => switchView("groups")}
            type="button"
          >
            Group Predictor
          </button>
          <button
            className={view === "bracket" ? "active" : ""}
            onClick={() => switchView("bracket")}
            type="button"
          >
            Knockout Stage
          </button>
          <button onClick={() => setShowGuide(true)} type="button">
            How to predict
          </button>
        </div>
        <button className="challenge-select" type="button">
          Bracket Challenge <ChevronDown size={17} />
        </button>
      </nav>

      <div className="announcement">
        <Info size={18} />
        <span>
          Drag teams into your predicted finishing order. The top two and best
          eight third-place teams advance.
        </span>
      </div>

      <main>
        <Hero view={view} champion={champion} />
        <ProgressBar
          view={view}
          knockoutPickCount={knockoutPickCount}
          champion={champion}
        />

        {view === "groups" ? (
          <GroupPredictor
            groupOrder={groupOrder}
            thirdOrder={thirdOrder}
            bestThirdNames={bestThirdNames}
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
        <button className="menu-button" aria-label="Open menu" type="button">
          <Menu size={23} />
        </button>
        <a className="fifa-wordmark" href="#top" aria-label="FIFA home">
          FIFA
        </a>
        <nav aria-label="FIFA utilities">
          <a href="#rewards">FIFA REWARDS</a>
          <a href="#plus">FIFA+</a>
          <a href="#store">FIFA STORE</a>
          <span />
          <button type="button">
            <Globe2 size={19} /> English <ChevronDown size={15} />
          </button>
          <span />
          <button aria-label="Account" type="button">
            <UserCircle size={22} />
          </button>
        </nav>
      </div>
      <div className="tournament-bar">
        <a className="tournament-brand" href="#top">
          <span className="cup-mark">
            <Trophy size={21} />
          </span>
          <strong>FIFA WORLD CUP 26</strong>
        </a>
        <nav aria-label="Tournament navigation">
          <a href="#matches">MATCHES</a>
          <a href={fifaStandingsUrl} target="_blank" rel="noreferrer">
            STANDINGS
          </a>
          <a href="#teams">TEAMS & STATS</a>
          <a href="#latest">LATEST</a>
          <a className="active" href="#gaming">FANTASY & GAMING</a>
          <button onClick={onGuide} type="button">
            MORE <ChevronDown size={16} />
          </button>
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
          <p>{view === "groups" ? "Your table. Your prediction." : "The road to the final"}</p>
          <h1>
            {view === "groups" ? (
              <>GROUP <em>PREDICTOR</em></>
            ) : champion ? (
              <>YOUR <em>CHAMPION</em></>
            ) : (
              <>KNOCKOUT <em>BRACKET</em></>
            )}
          </h1>
          <p className="hero-note">
            {champion
              ? `${champion.name} lifts the trophy.`
              : "Move every nation into the position you expect."}
          </p>
        </div>
      </div>
      <div className="hero-art hero-art-right" />
    </section>
  );
}

function ProgressBar({
  view,
  knockoutPickCount,
  champion
}: {
  view: View;
  knockoutPickCount: number;
  champion?: Team;
}) {
  const steps = [
    { label: "Group Predictor", complete: true, active: view === "groups" },
    { label: "Round of 32", complete: knockoutPickCount === 31, active: view === "bracket" && !champion },
    { label: "Champion", complete: Boolean(champion), active: Boolean(champion) }
  ];

  return (
    <section className="progress-shell" aria-label="Bracket progress">
      {steps.map((step, index) => (
        <div
          className={`progress-step ${step.complete ? "complete" : ""} ${step.active ? "active" : ""}`}
          key={step.label}
        >
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
  onMoveGroupTeam,
  onMoveThirdTeam,
  onReset,
  onContinue
}: {
  groupOrder: GroupOrder;
  thirdOrder: string[];
  bestThirdNames: Set<string>;
  onMoveGroupTeam: (groupId: string, fromIndex: number, toIndex: number) => void;
  onMoveThirdTeam: (fromIndex: number, toIndex: number) => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="content-section rank-predictor-section">
      <header className="section-heading">
        <div>
          <span className="eyebrow">STEP 1 OF 3</span>
          <h2>Predict every group</h2>
          <p>
            Drag each team into your expected finishing order. You can also use
            the arrow controls. No points or score calculations—just your table.
          </p>
        </div>
        <div className="selection-status">
          <strong>12</strong>
          <span>groups to rank</span>
        </div>
      </header>

      <aside className="rules-strip rank-rules" aria-label="Qualification rules">
        <div>
          <strong>Positions 1–2</strong>
          <span>Qualify automatically from every group</span>
        </div>
        <div>
          <strong>Position 3</strong>
          <span>Moves into the third-place ranking table</span>
        </div>
        <div>
          <strong>Best eight thirds</strong>
          <span>Advance to complete the Round of 32</span>
        </div>
      </aside>

      <div className="group-grid rank-group-grid">
        {groups.map((group) => (
          <RankGroupCard
            group={group}
            key={group.id}
            order={groupOrder[group.id]}
            bestThirdNames={bestThirdNames}
            onMove={onMoveGroupTeam}
          />
        ))}
      </div>

      <ThirdPlacePredictor
        order={thirdOrder}
        onMove={onMoveThirdTeam}
      />

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onReset} type="button">
          <RotateCcw size={17} /> Reset FIFA order
        </button>
        <div>
          <span>Your ranking is saved automatically</span>
          <button className="primary-button" onClick={onContinue} type="button">
            Build Round of 32 <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

function RankGroupCard({
  group,
  order,
  bestThirdNames,
  onMove
}: {
  group: Group;
  order: string[];
  bestThirdNames: Set<string>;
  onMove: (groupId: string, fromIndex: number, toIndex: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function drop(event: DragEvent<HTMLDivElement>, toIndex: number) {
    event.preventDefault();
    if (dragIndex !== null) onMove(group.id, dragIndex, toIndex);
    setDragIndex(null);
  }

  return (
    <article className="group-card rank-group-card">
      <header>
        <div>
          <span>GROUP</span>
          <strong>{group.id}</strong>
        </div>
        <span className="complete-label">
          <GripVertical size={14} /> Drag to rank
        </span>
      </header>

      <div className="rank-team-list">
        {order.map((teamName, index) => {
          const team = findTeam(teamName)!;
          const isThirdQualifier = index === 2 && bestThirdNames.has(teamName);
          return (
            <div
              className={`rank-team-row ${index < 2 ? "automatic" : ""} ${isThirdQualifier ? "third-qualified" : ""} ${dragIndex === index ? "dragging" : ""}`}
              draggable
              key={team.name}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDragIndex(index)}
              onDrop={(event) => drop(event, index)}
            >
              <span className="rank-number">{index + 1}</span>
              <span className="drag-handle" aria-hidden="true">
                <GripVertical size={18} />
              </span>
              <Flag team={team} />
              <strong>{team.name}</strong>
              <span className="rank-status">
                {index < 2 ? "Q" : isThirdQualifier ? "3Q" : index === 2 ? "3rd" : "—"}
              </span>
              <span className="rank-actions">
                <button
                  aria-label={`Move ${team.name} up`}
                  disabled={index === 0}
                  onClick={() => onMove(group.id, index, index - 1)}
                  type="button"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label={`Move ${team.name} down`}
                  disabled={index === 3}
                  onClick={() => onMove(group.id, index, index + 1)}
                  type="button"
                >
                  <ArrowDown size={14} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <footer>
        <span>Q automatic · 3Q best third</span>
        <span>Editable order</span>
      </footer>
    </article>
  );
}

function ThirdPlacePredictor({
  order,
  onMove
}: {
  order: string[];
  onMove: (fromIndex: number, toIndex: number) => void;
}) {
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
          <p>
            These are the teams currently placed third in your groups. Drag them
            into your predicted cross-group order; positions 1–8 qualify.
          </p>
        </div>
        <div className="third-summary">
          <strong>8</strong>
          <span>of 12 advance</span>
        </div>
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
              <span className="drag-handle" aria-hidden="true">
                <GripVertical size={18} />
              </span>
              <Flag team={team} />
              <strong>{team.name}</strong>
              <span className="third-group">Group {team.groupId}</span>
              <span className="third-qualifies">
                {qualifies ? <><Check size={14} /> Qualified</> : "Eliminated"}
              </span>
              <span className="rank-actions">
                <button
                  aria-label={`Move ${team.name} up in third-place table`}
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                  type="button"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label={`Move ${team.name} down in third-place table`}
                  disabled={index === order.length - 1}
                  onClick={() => onMove(index, index + 1)}
                  type="button"
                >
                  <ArrowDown size={14} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Flag({ team, className = "" }: { team: Team; className?: string }) {
  return (
    <span className={`official-flag ${className}`}>
      <img src={fifaFlagUrl(team.code)} alt={`${team.name} flag`} />
    </span>
  );
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
    const slotCount = 32 / 2 ** roundIndex;
    return Array.from({ length: slotCount }, (_, index) =>
      findTeam(picks[`r${roundIndex - 1}m${index}`])
    );
  }

  return (
    <section className="content-section knockout-section">
      <header className="section-heading bracket-heading">
        <div>
          <span className="eyebrow">STEP 2 OF 3</span>
          <h2>Pick every winner</h2>
          <p>
            Your top two teams and selected best thirds now fill the Round of 32.
          </p>
        </div>
        <div className="bracket-tools">
          <button className="secondary-button" onClick={onBack} type="button">
            <ArrowLeft size={17} /> Predictor
          </button>
          <button className="secondary-button accent" onClick={onAutoPick} type="button">
            <Sparkles size={17} /> Auto-pick
          </button>
          <button className="secondary-button" onClick={onReset} type="button">
            <RotateCcw size={17} /> Reset
          </button>
        </div>
      </header>

      {champion && (
        <article className="champion-banner">
          <div className="trophy-orbit">
            <Trophy size={43} />
          </div>
          <div>
            <span>YOUR 2026 CHAMPION</span>
            <strong className="champion-team">
              <Flag team={champion} /> {champion.name}
            </strong>
            <p>A complete bracket, all the way to the final whistle.</p>
          </div>
          <button className="primary-button" onClick={onReset} type="button">
            Make new picks
          </button>
        </article>
      )}

      <div className="bracket-scroll">
        <div className="bracket-board">
          {rounds.map((round, roundIndex) => {
            const roundTeams = getRoundTeams(roundIndex);
            const matchCount = 16 / 2 ** roundIndex;
            return (
              <section className={`round-column round-${roundIndex}`} key={round}>
                <header>
                  <span>ROUND {roundIndex + 1}</span>
                  <strong>{round}</strong>
                </header>
                <div className="round-matches">
                  {Array.from({ length: matchCount }, (_, matchIndex) => (
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

function MatchCard({
  matchNumber,
  teamA,
  teamB,
  selected,
  onPick
}: {
  matchNumber: number;
  teamA?: Team;
  teamB?: Team;
  selected?: string;
  onPick: (teamName: string) => void;
}) {
  return (
    <article className={`match-card ${selected ? "decided" : ""}`}>
      <span className="match-label">
        MATCH {String(matchNumber).padStart(2, "0")}
      </span>
      {[teamA, teamB].map((team, index) =>
        team ? (
          <button
            aria-pressed={selected === team.name}
            className={selected === team.name ? "winner" : selected ? "loser" : ""}
            key={team.name}
            onClick={() => onPick(team.name)}
            type="button"
          >
            <Flag team={team} className="bracket-flag" />
            <span className="match-team-name">{team.name}</span>
            <span className="winner-check">
              {selected === team.name && <Check size={14} />}
            </span>
          </button>
        ) : (
          <div className="team-placeholder" key={`placeholder-${index}`}>
            <span />
            <em>Awaiting winner</em>
          </div>
        )
      )}
    </article>
  );
}

function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="guide-title"
        className="guide-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close guide" onClick={onClose} type="button">
          <X size={22} />
        </button>
        <CircleHelp size={33} />
        <span className="eyebrow">PREDICTOR GUIDE</span>
        <h2 id="guide-title">Build your table</h2>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Order every group</strong>
              <p>Drag teams or use the arrow buttons to set positions 1–4.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Rank the third-place teams</strong>
              <p>Every predicted third-place team enters a separate 12-team table.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Choose the best eight</strong>
              <p>The top eight in your third-place table join the 24 automatic qualifiers.</p>
            </div>
          </li>
        </ol>
        <button className="primary-button" onClick={onClose} type="button">
          Start predicting <ArrowRight size={18} />
        </button>
      </section>
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <strong>FIFA</strong>
        <span>WORLD CUP 26 BRACKET CHALLENGE</span>
      </div>
      <p>
        Team groups and flag images are sourced from FIFA’s official 2026
        standings data. This is an unofficial interactive predictor concept.
      </p>
      <nav>
        <a href={fifaStandingsUrl} target="_blank" rel="noreferrer">FIFA standings</a>
        <a href="#privacy">Privacy</a>
        <a href="#help">Help</a>
      </nav>
    </footer>
  );
}

export default RankPredictorApp;
