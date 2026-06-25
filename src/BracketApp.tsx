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
  code: string;
  flag: string;
};

type Group = {
  id: string;
  teams: Team[];
};

type GroupPicks = Record<string, string[]>;
type BracketPicks = Record<string, string>;
type View = "groups" | "bracket";

const groups: Group[] = [
  {
    id: "A",
    teams: [
      { name: "Mexico", code: "MEX", flag: "🇲🇽" },
      { name: "Switzerland", code: "SUI", flag: "🇨🇭" },
      { name: "Korea Republic", code: "KOR", flag: "🇰🇷" },
      { name: "Cameroon", code: "CMR", flag: "🇨🇲" }
    ]
  },
  {
    id: "B",
    teams: [
      { name: "Canada", code: "CAN", flag: "🇨🇦" },
      { name: "Croatia", code: "CRO", flag: "🇭🇷" },
      { name: "Ghana", code: "GHA", flag: "🇬🇭" },
      { name: "Qatar", code: "QAT", flag: "🇶🇦" }
    ]
  },
  {
    id: "C",
    teams: [
      { name: "Argentina", code: "ARG", flag: "🇦🇷" },
      { name: "Denmark", code: "DEN", flag: "🇩🇰" },
      { name: "Nigeria", code: "NGA", flag: "🇳🇬" },
      { name: "Costa Rica", code: "CRC", flag: "🇨🇷" }
    ]
  },
  {
    id: "D",
    teams: [
      { name: "United States", code: "USA", flag: "🇺🇸" },
      { name: "Japan", code: "JPN", flag: "🇯🇵" },
      { name: "Serbia", code: "SRB", flag: "🇷🇸" },
      { name: "Tunisia", code: "TUN", flag: "🇹🇳" }
    ]
  },
  {
    id: "E",
    teams: [
      { name: "Spain", code: "ESP", flag: "🇪🇸" },
      { name: "Colombia", code: "COL", flag: "🇨🇴" },
      { name: "Egypt", code: "EGY", flag: "🇪🇬" },
      { name: "Saudi Arabia", code: "KSA", flag: "🇸🇦" }
    ]
  },
  {
    id: "F",
    teams: [
      { name: "France", code: "FRA", flag: "🇫🇷" },
      { name: "Ecuador", code: "ECU", flag: "🇪🇨" },
      { name: "Algeria", code: "ALG", flag: "🇩🇿" },
      { name: "New Zealand", code: "NZL", flag: "🇳🇿" }
    ]
  },
  {
    id: "G",
    teams: [
      { name: "Brazil", code: "BRA", flag: "🇧🇷" },
      { name: "Austria", code: "AUT", flag: "🇦🇹" },
      { name: "Côte d'Ivoire", code: "CIV", flag: "🇨🇮" },
      { name: "Panama", code: "PAN", flag: "🇵🇦" }
    ]
  },
  {
    id: "H",
    teams: [
      { name: "England", code: "ENG", flag: "🏴" },
      { name: "Uruguay", code: "URU", flag: "🇺🇾" },
      { name: "Iran", code: "IRN", flag: "🇮🇷" },
      { name: "Jamaica", code: "JAM", flag: "🇯🇲" }
    ]
  },
  {
    id: "I",
    teams: [
      { name: "Germany", code: "GER", flag: "🇩🇪" },
      { name: "Senegal", code: "SEN", flag: "🇸🇳" },
      { name: "Australia", code: "AUS", flag: "🇦🇺" },
      { name: "Honduras", code: "HON", flag: "🇭🇳" }
    ]
  },
  {
    id: "J",
    teams: [
      { name: "Portugal", code: "POR", flag: "🇵🇹" },
      { name: "Morocco", code: "MAR", flag: "🇲🇦" },
      { name: "Poland", code: "POL", flag: "🇵🇱" },
      { name: "Iraq", code: "IRQ", flag: "🇮🇶" }
    ]
  },
  {
    id: "K",
    teams: [
      { name: "Netherlands", code: "NED", flag: "🇳🇱" },
      { name: "Belgium", code: "BEL", flag: "🇧🇪" },
      { name: "South Africa", code: "RSA", flag: "🇿🇦" },
      { name: "Uzbekistan", code: "UZB", flag: "🇺🇿" }
    ]
  },
  {
    id: "L",
    teams: [
      { name: "Italy", code: "ITA", flag: "🇮🇹" },
      { name: "Türkiye", code: "TUR", flag: "🇹🇷" },
      { name: "Paraguay", code: "PAR", flag: "🇵🇾" },
      { name: "Jordan", code: "JOR", flag: "🇯🇴" }
    ]
  }
];

const allTeams = groups.flatMap((group) => group.teams);
const rounds = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"];

function defaultGroupPicks(): GroupPicks {
  return Object.fromEntries(groups.map((group) => [group.id, group.teams.slice(0, 2).map((team) => team.name)]));
}

function findTeam(name?: string): Team | undefined {
  return name ? allTeams.find((team) => team.name === name) : undefined;
}

function BracketApp() {
  const [view, setView] = useState<View>("groups");
  const [groupPicks, setGroupPicks] = useState<GroupPicks>(() => {
    try {
      const saved = window.localStorage.getItem("bracket-group-picks");
      return saved ? JSON.parse(saved) : defaultGroupPicks();
    } catch {
      return defaultGroupPicks();
    }
  });
  const [bracketPicks, setBracketPicks] = useState<BracketPicks>(() => {
    try {
      const saved = window.localStorage.getItem("bracket-knockout-picks");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("bracket-group-picks", JSON.stringify(groupPicks));
  }, [groupPicks]);

  useEffect(() => {
    window.localStorage.setItem("bracket-knockout-picks", JSON.stringify(bracketPicks));
  }, [bracketPicks]);

  const selectedCount = Object.values(groupPicks).reduce((total, picks) => total + picks.length, 0);
  const groupsComplete = selectedCount === groups.length * 2;

  const qualifiers = useMemo(() => {
    const topTwo = groups.flatMap((group) =>
      (groupPicks[group.id] ?? []).map((teamName) => findTeam(teamName)).filter(Boolean) as Team[]
    );
    const bestThird = groups
      .map((group) => group.teams.find((team) => !(groupPicks[group.id] ?? []).includes(team.name)))
      .filter(Boolean)
      .slice(0, 8) as Team[];

    const qualified = [...topTwo, ...bestThird];
    const seeded: Team[] = [];
    for (let index = 0; index < qualified.length / 2; index += 1) {
      seeded.push(qualified[index], qualified[qualified.length - 1 - index]);
    }
    return seeded;
  }, [groupPicks]);

  const champion = findTeam(bracketPicks.r4m0);
  const knockoutPickCount = Object.keys(bracketPicks).length;

  function switchView(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleTeam(groupId: string, teamName: string) {
    setGroupPicks((current) => {
      const groupSelection = current[groupId] ?? [];
      const isSelected = groupSelection.includes(teamName);
      if (!isSelected && groupSelection.length >= 2) return current;

      const nextSelection = isSelected
        ? groupSelection.filter((name) => name !== teamName)
        : [...groupSelection, teamName];

      return { ...current, [groupId]: nextSelection };
    });
    setBracketPicks({});
  }

  function resetGroups() {
    setGroupPicks(Object.fromEntries(groups.map((group) => [group.id, []])));
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
            My Bracket
          </button>
          <button className={view === "bracket" ? "active" : ""} onClick={() => switchView("bracket")} type="button">
            Knockout Stage
          </button>
          <button onClick={() => setShowGuide(true)} type="button">
            How to play
          </button>
        </div>
        <button className="challenge-select" type="button">
          Bracket Challenge <ChevronDown size={17} />
        </button>
      </nav>

      <div className="announcement">
        <Info size={18} />
        <span>Build your road to the final. Your picks are saved automatically on this device.</span>
      </div>

      <main>
        <Hero view={view} champion={champion} />
        <ProgressBar view={view} groupsComplete={groupsComplete} knockoutPickCount={knockoutPickCount} champion={champion} />

        {view === "groups" ? (
          <GroupStage
            groupPicks={groupPicks}
            selectedCount={selectedCount}
            groupsComplete={groupsComplete}
            onToggle={toggleTeam}
            onReset={resetGroups}
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
          <small>PREDICT. ADVANCE. WIN.</small>
        </div>
        <div className="hero-divider" />
        <div>
          <p>{view === "groups" ? "Your tournament starts here" : "The road to the final"}</p>
          <h1>
            {view === "groups" ? (
              <>
                GROUP <em>STAGE</em>
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
            {champion ? `${champion.flag} ${champion.name} lifts the trophy.` : "Make every pick. Own every moment."}
          </p>
        </div>
      </div>
      <div className="hero-art hero-art-right" />
    </section>
  );
}

function ProgressBar({
  view,
  groupsComplete,
  knockoutPickCount,
  champion
}: {
  view: View;
  groupsComplete: boolean;
  knockoutPickCount: number;
  champion?: Team;
}) {
  const steps = [
    { label: "Group Stage", complete: groupsComplete, active: view === "groups" },
    { label: "Knockout Stage", complete: knockoutPickCount === 31, active: view === "bracket" && !champion },
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
  groupPicks,
  selectedCount,
  groupsComplete,
  onToggle,
  onReset,
  onContinue
}: {
  groupPicks: GroupPicks;
  selectedCount: number;
  groupsComplete: boolean;
  onToggle: (groupId: string, teamName: string) => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="content-section">
      <header className="section-heading">
        <div>
          <span className="eyebrow">STEP 1 OF 3</span>
          <h2>Choose your qualifiers</h2>
          <p>Select the winner and runner-up from every group. Your first selection takes the top spot.</p>
        </div>
        <div className="selection-status">
          <strong>{selectedCount}/24</strong>
          <span>teams selected</span>
        </div>
      </header>

      <div className="group-grid">
        {groups.map((group) => {
          const selected = groupPicks[group.id] ?? [];
          return (
            <article className={`group-card ${selected.length === 2 ? "complete" : ""}`} key={group.id}>
              <header>
                <div>
                  <span>GROUP</span>
                  <strong>{group.id}</strong>
                </div>
                {selected.length === 2 ? (
                  <span className="complete-label">
                    <Check size={14} /> Complete
                  </span>
                ) : (
                  <span className="pick-label">{2 - selected.length} picks left</span>
                )}
              </header>
              <div className="team-list">
                {group.teams.map((team) => {
                  const rank = selected.indexOf(team.name);
                  const isSelected = rank >= 0;
                  const isLocked = !isSelected && selected.length >= 2;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={isSelected ? "selected" : ""}
                      disabled={isLocked}
                      key={team.code}
                      onClick={() => onToggle(group.id, team.name)}
                      type="button"
                    >
                      <span className="rank">{isSelected ? rank + 1 : ""}</span>
                      <span className="flag" aria-hidden="true">
                        {team.flag}
                      </span>
                      <span className="team-name">{team.name}</span>
                      <span className="team-code">{team.code}</span>
                      <span className="pick-check">{isSelected && <Check size={15} />}</span>
                    </button>
                  );
                })}
              </div>
              <footer>
                <span>Top two advance</span>
                <span>{selected.length}/2</span>
              </footer>
            </article>
          );
        })}
      </div>

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onReset} type="button">
          <RotateCcw size={17} /> Reset picks
        </button>
        <div>
          <span>{groupsComplete ? "Group stage complete" : `${24 - selectedCount} selections remaining`}</span>
          <button className="primary-button" disabled={!groupsComplete} onClick={onContinue} type="button">
            Build knockout bracket <ArrowRight size={18} />
          </button>
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
          <p>Choose a team in each matchup to advance them through the tournament.</p>
        </div>
        <div className="bracket-tools">
          <button className="secondary-button" onClick={onBack} type="button">
            <ArrowLeft size={17} /> Groups
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
            key={team.code}
            onClick={() => onPick(team.name)}
            type="button"
          >
            <span className="flag">{team.flag}</span>
            <strong>{team.code}</strong>
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
      <section aria-labelledby="guide-title" className="guide-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Close guide" onClick={onClose} type="button">
          <X size={22} />
        </button>
        <CircleHelp size={33} />
        <span className="eyebrow">BRACKET 101</span>
        <h2 id="guide-title">How to play</h2>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Rank every group</strong>
              <p>Pick a winner and runner-up from all 12 groups.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Advance your winners</strong>
              <p>Work through each knockout matchup, round by round.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Crown your champion</strong>
              <p>Complete the final and lock in your tournament story.</p>
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
      <p>Unofficial interactive concept created for demonstration. Team groupings are illustrative.</p>
      <nav>
        <a href="#privacy">Privacy</a>
        <a href="#terms">Terms</a>
        <a href="#help">Help</a>
      </nav>
    </footer>
  );
}

export default BracketApp;
