import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Globe2,
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
  flag: string;
};

type Group = {
  id: string;
  teams: Team[];
};

type StandingValues = {
  points: number;
  headToHead: number;
  goalDifference: number;
  goalsFor: number;
  fairPlay: number;
  lot: number;
};

type StandingField = keyof StandingValues;
type GroupStandings = Record<string, Record<string, StandingValues>>;
type BracketPicks = Record<string, string>;
type View = "groups" | "bracket";

type RankedTeam = {
  team: Team;
  groupId: string;
  rank: number;
  stats: StandingValues;
};

const makeTeam = (name: string, flag: string): Team => ({ name, flag });

const groups: Group[] = [
  {
    id: "A",
    teams: [
      makeTeam("Mexico", "🇲🇽"),
      makeTeam("Switzerland", "🇨🇭"),
      makeTeam("Korea Republic", "🇰🇷"),
      makeTeam("Cameroon", "🇨🇲")
    ]
  },
  {
    id: "B",
    teams: [
      makeTeam("Canada", "🇨🇦"),
      makeTeam("Croatia", "🇭🇷"),
      makeTeam("Ghana", "🇬🇭"),
      makeTeam("Qatar", "🇶🇦")
    ]
  },
  {
    id: "C",
    teams: [
      makeTeam("Argentina", "🇦🇷"),
      makeTeam("Denmark", "🇩🇰"),
      makeTeam("Nigeria", "🇳🇬"),
      makeTeam("Costa Rica", "🇨🇷")
    ]
  },
  {
    id: "D",
    teams: [
      makeTeam("United States", "🇺🇸"),
      makeTeam("Japan", "🇯🇵"),
      makeTeam("Serbia", "🇷🇸"),
      makeTeam("Tunisia", "🇹🇳")
    ]
  },
  {
    id: "E",
    teams: [
      makeTeam("Spain", "🇪🇸"),
      makeTeam("Colombia", "🇨🇴"),
      makeTeam("Egypt", "🇪🇬"),
      makeTeam("Saudi Arabia", "🇸🇦")
    ]
  },
  {
    id: "F",
    teams: [
      makeTeam("France", "🇫🇷"),
      makeTeam("Ecuador", "🇪🇨"),
      makeTeam("Algeria", "🇩🇿"),
      makeTeam("New Zealand", "🇳🇿")
    ]
  },
  {
    id: "G",
    teams: [
      makeTeam("Brazil", "🇧🇷"),
      makeTeam("Austria", "🇦🇹"),
      makeTeam("Côte d'Ivoire", "🇨🇮"),
      makeTeam("Panama", "🇵🇦")
    ]
  },
  {
    id: "H",
    teams: [
      makeTeam("England", "🏴"),
      makeTeam("Uruguay", "🇺🇾"),
      makeTeam("Iran", "🇮🇷"),
      makeTeam("Jamaica", "🇯🇲")
    ]
  },
  {
    id: "I",
    teams: [
      makeTeam("Germany", "🇩🇪"),
      makeTeam("Senegal", "🇸🇳"),
      makeTeam("Australia", "🇦🇺"),
      makeTeam("Honduras", "🇭🇳")
    ]
  },
  {
    id: "J",
    teams: [
      makeTeam("Portugal", "🇵🇹"),
      makeTeam("Morocco", "🇲🇦"),
      makeTeam("Poland", "🇵🇱"),
      makeTeam("Iraq", "🇮🇶")
    ]
  },
  {
    id: "K",
    teams: [
      makeTeam("Netherlands", "🇳🇱"),
      makeTeam("Belgium", "🇧🇪"),
      makeTeam("South Africa", "🇿🇦"),
      makeTeam("Uzbekistan", "🇺🇿")
    ]
  },
  {
    id: "L",
    teams: [
      makeTeam("Italy", "🇮🇹"),
      makeTeam("Türkiye", "🇹🇷"),
      makeTeam("Paraguay", "🇵🇾"),
      makeTeam("Jordan", "🇯🇴")
    ]
  }
];

const allTeams = groups.flatMap((group) => group.teams);
const rounds = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"];
const standingFields: Array<{ field: StandingField; label: string; title: string }> = [
  { field: "points", label: "PTS", title: "Points" },
  { field: "headToHead", label: "H2H", title: "Head-to-head tie-break score" },
  { field: "goalDifference", label: "GD", title: "Goal difference" },
  { field: "goalsFor", label: "GF", title: "Goals scored" },
  { field: "fairPlay", label: "FP", title: "Fair-play score; higher is better" },
  { field: "lot", label: "LOT", title: "Drawing-of-lots priority" }
];

function createDefaultStandings(): GroupStandings {
  return Object.fromEntries(
    groups.map((group, groupIndex) => [
      group.id,
      Object.fromEntries(
        group.teams.map((team, teamIndex) => {
          const thirdPlacePoints = groupIndex < 4 ? 4 : groupIndex < 10 ? 3 : 2;
          const values: StandingValues[] = [
            { points: 7, headToHead: 3, goalDifference: 4, goalsFor: 6, fairPlay: 0, lot: 4 },
            { points: 5, headToHead: 1, goalDifference: 2, goalsFor: 4, fairPlay: -1, lot: 3 },
            {
              points: thirdPlacePoints,
              headToHead: groupIndex % 3,
              goalDifference: 1 - (groupIndex % 3),
              goalsFor: 2 + (groupIndex % 2),
              fairPlay: -(groupIndex % 4),
              lot: 2
            },
            { points: 1, headToHead: 0, goalDifference: -4, goalsFor: 1, fairPlay: -3, lot: 1 }
          ];

          return [team.name, values[teamIndex]];
        })
      )
    ])
  );
}

function findTeam(name?: string) {
  return name ? allTeams.find((team) => team.name === name) : undefined;
}

function compareRankedTeams(a: RankedTeam, b: RankedTeam) {
  return (
    b.stats.points - a.stats.points ||
    b.stats.headToHead - a.stats.headToHead ||
    b.stats.goalDifference - a.stats.goalDifference ||
    b.stats.goalsFor - a.stats.goalsFor ||
    b.stats.fairPlay - a.stats.fairPlay ||
    b.stats.lot - a.stats.lot ||
    a.team.name.localeCompare(b.team.name)
  );
}

function rankGroup(group: Group, standings: GroupStandings): RankedTeam[] {
  return group.teams
    .map((team) => ({
      team,
      groupId: group.id,
      rank: 0,
      stats: standings[group.id][team.name]
    }))
    .sort(compareRankedTeams)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function seedRoundOf32(groupRankings: RankedTeam[][], bestThird: RankedTeam[]) {
  const winners = groupRankings.map((ranking) => ranking[0]);
  const runnersUp = groupRankings.map((ranking) => ranking[1]);
  const seeds = [...winners, ...runnersUp.slice(8)];
  const availableOpponents = [...bestThird, ...runnersUp.slice(0, 8)];
  const bracket: Team[] = [];

  seeds.forEach((seed) => {
    let opponentIndex = availableOpponents.findIndex((candidate) => candidate.groupId !== seed.groupId);
    if (opponentIndex < 0) opponentIndex = 0;
    const [opponent] = availableOpponents.splice(opponentIndex, 1);
    bracket.push(seed.team, opponent.team);
  });

  return bracket;
}

function loadStandings(): GroupStandings {
  try {
    const saved = window.localStorage.getItem("bracket-qualified-standings-v1");
    return saved ? JSON.parse(saved) : createDefaultStandings();
  } catch {
    return createDefaultStandings();
  }
}

function loadBracketPicks(): BracketPicks {
  try {
    const saved = window.localStorage.getItem("bracket-qualified-knockout-v1");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function QualifiedBracketApp() {
  const [view, setView] = useState<View>("groups");
  const [standings, setStandings] = useState<GroupStandings>(loadStandings);
  const [bracketPicks, setBracketPicks] = useState<BracketPicks>(loadBracketPicks);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("bracket-qualified-standings-v1", JSON.stringify(standings));
  }, [standings]);

  useEffect(() => {
    window.localStorage.setItem("bracket-qualified-knockout-v1", JSON.stringify(bracketPicks));
  }, [bracketPicks]);

  const groupRankings = useMemo(
    () => groups.map((group) => rankGroup(group, standings)),
    [standings]
  );
  const thirdPlaceRanking = useMemo(
    () =>
      groupRankings
        .map((ranking) => ranking[2])
        .sort(compareRankedTeams)
        .map((entry, index) => ({ ...entry, rank: index + 1 })),
    [groupRankings]
  );
  const bestThird = thirdPlaceRanking.slice(0, 8);
  const bestThirdNames = new Set(bestThird.map((entry) => entry.team.name));
  const qualifiers = useMemo(
    () => seedRoundOf32(groupRankings, bestThird),
    [groupRankings, bestThird]
  );
  const champion = findTeam(bracketPicks.r4m0);
  const knockoutPickCount = Object.keys(bracketPicks).length;

  function switchView(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateStanding(groupId: string, teamName: string, field: StandingField, value: number) {
    setStandings((current) => ({
      ...current,
      [groupId]: {
        ...current[groupId],
        [teamName]: {
          ...current[groupId][teamName],
          [field]: Number.isFinite(value) ? value : 0
        }
      }
    }));
    setBracketPicks({});
  }

  function resetStandings() {
    setStandings(createDefaultStandings());
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
            Group Standings
          </button>
          <button className={view === "bracket" ? "active" : ""} onClick={() => switchView("bracket")} type="button">
            Knockout Stage
          </button>
          <button onClick={() => setShowGuide(true)} type="button">
            Qualification Rules
          </button>
        </div>
        <button className="challenge-select" type="button">
          Bracket Challenge <ChevronDown size={17} />
        </button>
      </nav>

      <div className="announcement">
        <Info size={18} />
        <span>Top two in every group plus the eight best third-place teams qualify for the Round of 32.</span>
      </div>

      <main>
        <Hero view={view} champion={champion} />
        <ProgressBar view={view} knockoutPickCount={knockoutPickCount} champion={champion} />

        {view === "groups" ? (
          <GroupStage
            standings={standings}
            groupRankings={groupRankings}
            thirdPlaceRanking={thirdPlaceRanking}
            bestThirdNames={bestThirdNames}
            onUpdate={updateStanding}
            onReset={resetStandings}
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
          <a href="#standings">STANDINGS</a>
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
          <small>RANK. QUALIFY. ADVANCE.</small>
        </div>
        <div className="hero-divider" />
        <div>
          <p>{view === "groups" ? "48 teams. 32 places." : "The road to the final"}</p>
          <h1>
            {view === "groups" ? (
              <>
                GROUP <em>STANDINGS</em>
              </>
            ) : champion ? (
              <>
                YOUR <em>CHAMPION</em>
              </>
            ) : (
              <>
                KNOCKOUT <em>BRACKET</em>
              </>
            )}
          </h1>
          <p className="hero-note">
            {champion ? `${champion.flag} ${champion.name} lifts the trophy.` : "Every tie-break matters."}
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
    { label: "Group Standings", complete: true, active: view === "groups" },
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

function GroupStage({
  standings,
  groupRankings,
  thirdPlaceRanking,
  bestThirdNames,
  onUpdate,
  onReset,
  onContinue
}: {
  standings: GroupStandings;
  groupRankings: RankedTeam[][];
  thirdPlaceRanking: RankedTeam[];
  bestThirdNames: Set<string>;
  onUpdate: (groupId: string, teamName: string, field: StandingField, value: number) => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="content-section qualification-section">
      <header className="section-heading">
        <div>
          <span className="eyebrow">STEP 1 OF 3</span>
          <h2>Set the group standings</h2>
          <p>
            Enter predicted statistics. Teams are ranked by points, head-to-head, goal difference, goals scored,
            fair play and drawing of lots—in that order.
          </p>
        </div>
        <div className="selection-status">
          <strong>32</strong>
          <span>teams qualify</span>
        </div>
      </header>

      <RulesStrip />

      <div className="group-grid standings-grid">
        {groups.map((group, groupIndex) => (
          <StandingsCard
            bestThirdNames={bestThirdNames}
            group={group}
            key={group.id}
            ranking={groupRankings[groupIndex]}
            standings={standings}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      <BestThirdTable ranking={thirdPlaceRanking} />

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onReset} type="button">
          <RotateCcw size={17} /> Reset standings
        </button>
        <div>
          <span>24 automatic qualifiers + 8 best third-place teams</span>
          <button className="primary-button" onClick={onContinue} type="button">
            Build Round of 32 <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

function RulesStrip() {
  return (
    <aside className="rules-strip" aria-label="Qualification rules">
      <div>
        <strong>1st & 2nd</strong>
        <span>Automatic qualification from each group</span>
      </div>
      <div>
        <strong>Best 8 thirds</strong>
        <span>Ranked together across all 12 groups</span>
      </div>
      <div>
        <strong>Tie-break order</strong>
        <span>PTS → H2H → GD → GF → FP → LOT</span>
      </div>
    </aside>
  );
}

function StandingsCard({
  group,
  ranking,
  standings,
  bestThirdNames,
  onUpdate
}: {
  group: Group;
  ranking: RankedTeam[];
  standings: GroupStandings;
  bestThirdNames: Set<string>;
  onUpdate: (groupId: string, teamName: string, field: StandingField, value: number) => void;
}) {
  return (
    <article className="group-card standings-card">
      <header>
        <div>
          <span>GROUP</span>
          <strong>{group.id}</strong>
        </div>
        <span className="complete-label">
          <Check size={14} /> Live ranking
        </span>
      </header>

      <div className="standings-head">
        <span>POS</span>
        <span>TEAM</span>
        {standingFields.map(({ field, label, title }) => (
          <abbr key={field} title={title}>
            {label}
          </abbr>
        ))}
      </div>

      <div className="standings-body">
        {ranking.map((entry) => {
          const qualifiesAutomatically = entry.rank <= 2;
          const qualifiesAsThird = entry.rank === 3 && bestThirdNames.has(entry.team.name);
          const qualificationClass = qualifiesAutomatically ? "automatic" : qualifiesAsThird ? "best-third" : "eliminated";

          return (
            <div className={`standing-row ${qualificationClass}`} key={entry.team.name}>
              <span className="standing-position">{entry.rank}</span>
              <span className="standing-team">
                <span className="flag" aria-hidden="true">
                  {entry.team.flag}
                </span>
                <strong>{entry.team.name}</strong>
              </span>
              {standingFields.map(({ field, label }) => (
                <input
                  aria-label={`${entry.team.name} ${label}`}
                  inputMode="numeric"
                  key={field}
                  max={field === "lot" ? 99 : 30}
                  min={field === "goalDifference" || field === "fairPlay" ? -30 : 0}
                  onChange={(event) => onUpdate(group.id, entry.team.name, field, Number(event.target.value))}
                  type="number"
                  value={standings[group.id][entry.team.name][field]}
                />
              ))}
              <span className="qualification-mark">
                {qualifiesAutomatically ? "Q" : qualifiesAsThird ? "3Q" : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <footer>
        <span>Q automatic · 3Q best third</span>
        <span>Top 2 + eligible 3rd</span>
      </footer>
    </article>
  );
}

function BestThirdTable({ ranking }: { ranking: RankedTeam[] }) {
  return (
    <section className="third-place-panel">
      <header>
        <div>
          <span className="eyebrow">CROSS-GROUP TABLE</span>
          <h3>Best third-place teams</h3>
          <p>The top eight ranked teams below claim the final eight Round of 32 places.</p>
        </div>
        <div className="qualification-key">
          <span><i className="qualified-dot" /> Qualifies</span>
          <span><i /> Eliminated</span>
        </div>
      </header>

      <div className="third-table-wrap">
        <div className="third-table">
          <div className="third-table-head">
            <span>Rank</span>
            <span>Team</span>
            <span>Group</span>
            {standingFields.map(({ field, label, title }) => (
              <abbr key={field} title={title}>{label}</abbr>
            ))}
            <span>Status</span>
          </div>
          {ranking.map((entry, index) => (
            <div className={`third-table-row ${index < 8 ? "qualified" : ""}`} key={entry.team.name}>
              <strong>{index + 1}</strong>
              <span className="third-team">
                <span className="flag" aria-hidden="true">{entry.team.flag}</span>
                <b>{entry.team.name}</b>
              </span>
              <span>{entry.groupId}</span>
              <span>{entry.stats.points}</span>
              <span>{entry.stats.headToHead}</span>
              <span>{entry.stats.goalDifference}</span>
              <span>{entry.stats.goalsFor}</span>
              <span>{entry.stats.fairPlay}</span>
              <span>{entry.stats.lot}</span>
              <span className="third-status">{index < 8 ? <><Check size={13} /> Qualified</> : "Eliminated"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
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
    return Array.from({ length: slotCount }, (_, index) => findTeam(picks[`r${roundIndex - 1}m${index}`]));
  }

  return (
    <section className="content-section knockout-section">
      <header className="section-heading bracket-heading">
        <div>
          <span className="eyebrow">STEP 2 OF 3</span>
          <h2>Pick every winner</h2>
          <p>The 24 automatic qualifiers and eight best third-place teams now compete in the Round of 32.</p>
        </div>
        <div className="bracket-tools">
          <button className="secondary-button" onClick={onBack} type="button">
            <ArrowLeft size={17} /> Standings
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
            <strong>
              {champion.flag} {champion.name}
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
      <span className="match-label">MATCH {String(matchNumber).padStart(2, "0")}</span>
      {[teamA, teamB].map((team, index) =>
        team ? (
          <button
            aria-pressed={selected === team.name}
            className={selected === team.name ? "winner" : selected ? "loser" : ""}
            key={team.name}
            onClick={() => onPick(team.name)}
            type="button"
          >
            <span className="flag bracket-flag" aria-hidden="true">{team.flag}</span>
            <span className="match-team-name">{team.name}</span>
            <span className="winner-check">{selected === team.name && <Check size={14} />}</span>
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
      <section aria-labelledby="guide-title" className="guide-modal rules-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Close rules" onClick={onClose} type="button">
          <X size={22} />
        </button>
        <CircleHelp size={33} />
        <span className="eyebrow">ROUND OF 32</span>
        <h2 id="guide-title">Qualification rules</h2>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Automatic qualifiers</strong>
              <p>The winner and runner-up from each of the 12 groups advance: 24 teams total.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Best third-place teams</strong>
              <p>All 12 third-place finishers are ranked together. The best eight also advance.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Tie-break sequence</strong>
              <p>Points, head-to-head, goal difference, goals scored, fair play, then drawing of lots.</p>
            </div>
          </li>
        </ol>
        <p className="rules-note">For fair-play values, the higher number wins; for example, −1 ranks above −3.</p>
        <button className="primary-button" onClick={onClose} type="button">
          Edit standings <ArrowRight size={18} />
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
      <p>Unofficial interactive concept created for demonstration. Team groupings and Round of 32 pairings are illustrative.</p>
      <nav>
        <a href="#privacy">Privacy</a>
        <a href="#terms">Terms</a>
        <a href="#help">Help</a>
      </nav>
    </footer>
  );
}

export default QualifiedBracketApp;
