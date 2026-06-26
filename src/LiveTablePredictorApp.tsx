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
import { getAnnexCAllocation } from "./fifaAnnexC";
import {
  deterministicMatchRandom,
  pickProbableWinner,
  type PredictionRanking
} from "./autoPickModel";

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
type RankingMap = Record<string, PredictionRanking>;
type BracketPicks = Record<string, string>;
type AutoPickCache = {
  baseline: BracketPicks;
  generated: BracketPicks;
};
type View = "groups" | "bracket";
type FeedState = "loading" | "live" | "cached" | "error";

type FifaMatchResult = {
  IdMatch: string;
  StartTime: string;
  Result: number;
  IdGroup: string;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  HomeTeamId: string;
  AwayTeamId: string;
};

type FifaRanking = {
  Rank: number;
  TotalPoints: number;
  IdCountry: string;
};

type FifaStanding = {
  Played: number;
  Won: number;
  Drawn: number;
  Lost: number;
  For: number;
  Against: number;
  GoalsDiference: number;
  Points: number;
  Group?: Array<{ Description?: string }>;
  MatchResults?: FifaMatchResult[];
  Team?: {
    IdTeam?: string;
    IdCountry?: string;
    Name?: Array<{ Description?: string }>;
  };
};

type GroupFixture = {
  id: string;
  groupId: string;
  kickoff: string;
  homeCode: string;
  awayCode: string;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
};

type ScorePrediction = { home: number; away: number };
type ScorePredictions = Record<string, ScorePrediction>;

const fifaStandingsPage =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings";
const fifaRegulationsUrl =
  "https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf";
const fifaStandingsApi =
  "https://api.fifa.com/api/v3/calendar/17/285023/289273/standing?language=en&count=500";
const fifaRankingsApi =
  "https://api.fifa.com/api/v3/fifarankings/rankings/live?gender=1&sportType=0&language=en";
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

function findTeamByCode(code?: string) {
  return code ? allTeams.find((team) => team.code === code) : undefined;
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

function loadAutoPickSnapshot(): BracketPicks | null {
  try {
    const saved = window.localStorage.getItem("fifa-auto-pick-snapshot-v1");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function loadAutoPickCache(): AutoPickCache | null {
  try {
    const saved = window.localStorage.getItem("fifa-auto-pick-cache-v1");
    if (!saved) return null;
    const parsed = JSON.parse(saved) as AutoPickCache;
    return parsed?.baseline && parsed?.generated ? parsed : null;
  } catch {
    return null;
  }
}

function loadCachedRankings(): { rankings: RankingMap; updatedAt: string | null } {
  try {
    return JSON.parse(
      window.localStorage.getItem("fifa-ranking-cache-v1") ??
        '{"rankings":{},"updatedAt":null}'
    );
  } catch {
    return { rankings: {}, updatedAt: null };
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

function loadCachedFixtures(): GroupFixture[] {
  try {
    return JSON.parse(window.localStorage.getItem("fifa-live-fixtures-cache-v1") ?? "[]");
  } catch {
    return [];
  }
}

function loadScorePredictions(): ScorePredictions {
  try {
    return JSON.parse(window.localStorage.getItem("fifa-score-predictions-v1") ?? "{}");
  } catch {
    return {};
  }
}

function parseFifaFixtures(rows: FifaStanding[]) {
  const teamCodeById = Object.fromEntries(
    rows.flatMap((row) => row.Team?.IdTeam && row.Team.IdCountry ? [[row.Team.IdTeam, row.Team.IdCountry]] : [])
  ) as Record<string, string>;
  const fixtures = new Map<string, GroupFixture>();

  rows.forEach((row) => {
    const groupDescription = row.Group?.[0]?.Description ?? "";
    const groupId = groupDescription.replace("Group ", "");
    row.MatchResults?.forEach((match) => {
      if (fixtures.has(match.IdMatch)) return;
      const homeCode = teamCodeById[match.HomeTeamId];
      const awayCode = teamCodeById[match.AwayTeamId];
      if (!homeCode || !awayCode || !groupId) return;
      const hasScore = match.HomeTeamScore !== null && match.AwayTeamScore !== null;
      fixtures.set(match.IdMatch, {
        id: match.IdMatch,
        groupId,
        kickoff: match.StartTime,
        homeCode,
        awayCode,
        homeScore: match.HomeTeamScore,
        awayScore: match.AwayTeamScore,
        completed: hasScore && (match.Result === 4 || new Date(match.StartTime).getTime() <= Date.now())
      });
    });
  });

  return [...fixtures.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

function calculateProjectedStats(fixtures: GroupFixture[], predictions: ScorePredictions) {
  const projected = Object.fromEntries(allTeams.map((team) => [team.code, { ...emptyStats }])) as StatsMap;

  fixtures.forEach((fixture) => {
    const predicted = predictions[fixture.id];
    const home = fixture.completed ? fixture.homeScore : predicted?.home;
    const away = fixture.completed ? fixture.awayScore : predicted?.away;
    if (home === null || away === null || home === undefined || away === undefined) return;

    const homeStats = projected[fixture.homeCode];
    const awayStats = projected[fixture.awayCode];
    if (!homeStats || !awayStats) return;

    homeStats.mp += 1;
    awayStats.mp += 1;
    homeStats.gf += home;
    homeStats.ga += away;
    awayStats.gf += away;
    awayStats.ga += home;
    homeStats.gd = homeStats.gf - homeStats.ga;
    awayStats.gd = awayStats.gf - awayStats.ga;

    if (home > away) {
      homeStats.w += 1;
      awayStats.l += 1;
      homeStats.pts += 3;
    } else if (away > home) {
      awayStats.w += 1;
      homeStats.l += 1;
      awayStats.pts += 3;
    } else {
      homeStats.d += 1;
      awayStats.d += 1;
      homeStats.pts += 1;
      awayStats.pts += 1;
    }
  });

  return projected;
}

function compareTeamsByProjectedStats(a: Team, b: Team, stats: StatsMap) {
  const aStats = stats[a.code] ?? emptyStats;
  const bStats = stats[b.code] ?? emptyStats;
  return (
    bStats.pts - aStats.pts ||
    bStats.gd - aStats.gd ||
    bStats.gf - aStats.gf ||
    a.name.localeCompare(b.name)
  );
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

type OfficialMatch = {
  number: number;
  teams: [Team | undefined, Team | undefined];
  labels: [string, string];
};

type RoundOf32SlotPreview = {
  matchNumber: number;
  slotLabel: string;
  opponent?: Team;
  opponentSlotLabel: string;
};

type RoundOf32ScenarioOutcome = "win" | "draw" | "loss" | "exact";

type RoundOf32ScenarioPreview = RoundOf32SlotPreview & {
  outcome: RoundOf32ScenarioOutcome;
  outcomeLabel: string;
  projectedPosition: number;
};

type RoundOf32TeamScenarioPreview = {
  team: Team;
  currentPosition: number;
  currentStats: TeamStats;
  fixed: boolean;
  nextMatchOpponent?: Team;
  scenarios: RoundOf32ScenarioPreview[];
};

const scenarioOutcomes: Array<{ outcome: Exclude<RoundOf32ScenarioOutcome, "exact">; label: string }> = [
  { outcome: "win", label: "If they win" },
  { outcome: "draw", label: "If they draw" },
  { outcome: "loss", label: "If they lose" }
];

const roundOf16Sources: Record<number, [number, number]> = {
  89: [73, 75],
  90: [74, 77],
  91: [76, 78],
  92: [79, 80],
  93: [83, 84],
  94: [81, 82],
  95: [86, 88],
  96: [85, 87]
};

const quarterFinalSources: Record<number, [number, number]> = {
  97: [89, 90],
  98: [93, 94],
  99: [91, 92],
  100: [95, 96]
};

const semiFinalSources: Record<number, [number, number]> = {
  101: [97, 98],
  102: [99, 100]
};

const officialPickOrder = [
  73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104
];

const leftBracketMatches = {
  round32: [74, 77, 73, 75, 83, 84, 81, 82],
  round16: [90, 89, 93, 94],
  quarterFinals: [97, 98],
  semiFinals: [101]
};

const rightBracketMatches = {
  round32: [76, 78, 79, 80, 86, 88, 85, 87],
  round16: [91, 92, 95, 96],
  quarterFinals: [99, 100],
  semiFinals: [102]
};

function buildRoundOf32(groupOrder: GroupOrder, thirdOrder: string[]) {
  const position = (groupId: string, index: number) => findTeam(groupOrder[groupId][index]);
  const thirdByGroup = Object.fromEntries(
    groups.map((group) => [group.id, position(group.id, 2)])
  ) as Record<string, Team | undefined>;
  const qualifyingThirdGroups = thirdOrder
    .slice(0, 8)
    .map((teamName) => findTeam(teamName)?.groupId)
    .filter((groupId): groupId is string => Boolean(groupId));
  const annexC = getAnnexCAllocation(qualifyingThirdGroups);
  const thirdOpponent = (winnerGroup: keyof typeof annexC) => thirdByGroup[annexC[winnerGroup]];
  const match = (
    number: number,
    teamA: Team | undefined,
    teamB: Team | undefined,
    labelA: string,
    labelB: string
  ): OfficialMatch => ({ number, teams: [teamA, teamB], labels: [labelA, labelB] });

  return new Map<number, OfficialMatch>([
    [73, match(73, position("A", 1), position("B", 1), "2A", "2B")],
    [74, match(74, position("E", 0), thirdOpponent("E"), "1E", `3${annexC.E}`)],
    [75, match(75, position("F", 0), position("C", 1), "1F", "2C")],
    [76, match(76, position("C", 0), position("F", 1), "1C", "2F")],
    [77, match(77, position("I", 0), thirdOpponent("I"), "1I", `3${annexC.I}`)],
    [78, match(78, position("E", 1), position("I", 1), "2E", "2I")],
    [79, match(79, position("A", 0), thirdOpponent("A"), "1A", `3${annexC.A}`)],
    [80, match(80, position("L", 0), thirdOpponent("L"), "1L", `3${annexC.L}`)],
    [81, match(81, position("D", 0), thirdOpponent("D"), "1D", `3${annexC.D}`)],
    [82, match(82, position("G", 0), thirdOpponent("G"), "1G", `3${annexC.G}`)],
    [83, match(83, position("K", 1), position("L", 1), "2K", "2L")],
    [84, match(84, position("H", 0), position("J", 1), "1H", "2J")],
    [85, match(85, position("B", 0), thirdOpponent("B"), "1B", `3${annexC.B}`)],
    [86, match(86, position("J", 0), position("H", 1), "1J", "2H")],
    [87, match(87, position("K", 0), thirdOpponent("K"), "1K", `3${annexC.K}`)],
    [88, match(88, position("D", 1), position("G", 1), "2D", "2G")]
  ]);
}

function resolveOfficialMatch(
  matchNumber: number,
  roundOf32: Map<number, OfficialMatch>,
  picks: BracketPicks
): OfficialMatch {
  const firstRound = roundOf32.get(matchNumber);
  if (firstRound) return firstRound;

  if (matchNumber === 103) {
    return {
      number: 103,
      teams: [getMatchLoser(101, roundOf32, picks), getMatchLoser(102, roundOf32, picks)],
      labels: ["RU101", "RU102"]
    };
  }

  const sources =
    roundOf16Sources[matchNumber] ??
    quarterFinalSources[matchNumber] ??
    semiFinalSources[matchNumber] ??
    (matchNumber === 104 ? [101, 102] : undefined);
  if (!sources) return { number: matchNumber, teams: [undefined, undefined], labels: ["TBD", "TBD"] };

  return {
    number: matchNumber,
    teams: [findTeam(picks[`m${sources[0]}`]), findTeam(picks[`m${sources[1]}`])],
    labels: [`W${sources[0]}`, `W${sources[1]}`]
  };
}

function getMatchLoser(matchNumber: number, roundOf32: Map<number, OfficialMatch>, picks: BracketPicks) {
  const match = resolveOfficialMatch(matchNumber, roundOf32, picks);
  const winner = picks[`m${matchNumber}`];
  if (!winner) return undefined;
  return match.teams.find((team) => team && team.name !== winner);
}

function sanitizeOfficialPicks(picks: BracketPicks, roundOf32: Map<number, OfficialMatch>) {
  const next: BracketPicks = {};
  officialPickOrder.forEach((matchNumber) => {
    const selected = picks[`m${matchNumber}`];
    if (!selected) return;
    const match = resolveOfficialMatch(matchNumber, roundOf32, next);
    if (match.teams.some((team) => team?.name === selected)) next[`m${matchNumber}`] = selected;
  });
  return next;
}

function sameBracketPicks(left: BracketPicks, right: BracketPicks) {
  return officialPickOrder.every((matchNumber) => left[`m${matchNumber}`] === right[`m${matchNumber}`]);
}

function hasEveryGroupReachedSecondMatch(stats: StatsMap) {
  return groups.every((group) =>
    group.teams.every((team) => (stats[team.code]?.mp ?? 0) >= 2)
  );
}

function hasGroupCompletedAllMatches(groupId: string, fixtures: GroupFixture[]) {
  const groupFixtures = fixtures.filter((fixture) => fixture.groupId === groupId);
  return groupFixtures.length >= 6 && groupFixtures.every((fixture) => fixture.completed);
}

function hasEveryGroupCompletedAllMatches(fixtures: GroupFixture[]) {
  return groups.every((group) => hasGroupCompletedAllMatches(group.id, fixtures));
}

function getSlotSourceGroups(label: string) {
  return label
    .slice(1)
    .split("")
    .filter((groupId) => groups.some((group) => group.id === groupId));
}

function canTreatRoundOf32SlotAsExact(slot: RoundOf32SlotPreview, fixtures: GroupFixture[]) {
  const labels = [slot.slotLabel, slot.opponentSlotLabel];
  if (labels.some((label) => label.startsWith("3"))) {
    return hasEveryGroupCompletedAllMatches(fixtures);
  }

  const sourceGroups = labels.flatMap(getSlotSourceGroups);
  return sourceGroups.length > 0 && sourceGroups.every((groupId) => hasGroupCompletedAllMatches(groupId, fixtures));
}

function getRoundOf32SlotPreview(team: Team, roundOf32: Map<number, OfficialMatch>): RoundOf32SlotPreview | null {
  for (const match of roundOf32.values()) {
    const teamIndex = match.teams.findIndex((candidate) => candidate?.name === team.name);
    if (teamIndex === -1) continue;
    const opponentIndex = teamIndex === 0 ? 1 : 0;
    return {
      matchNumber: match.number,
      slotLabel: match.labels[teamIndex],
      opponent: match.teams[opponentIndex],
      opponentSlotLabel: match.labels[opponentIndex]
    };
  }
  return null;
}

function findNextFixtureForTeam(team: Team, fixtures: GroupFixture[]) {
  return fixtures
    .filter((fixture) =>
      !fixture.completed &&
      (fixture.homeCode === team.code || fixture.awayCode === team.code)
    )
    .sort((left, right) => left.kickoff.localeCompare(right.kickoff))[0];
}

function getFixtureOpponent(team: Team, fixture?: GroupFixture) {
  if (!fixture) return undefined;
  const opponentCode = fixture.homeCode === team.code ? fixture.awayCode : fixture.homeCode;
  return findTeamByCode(opponentCode);
}

function scoreForScenarioOutcome(
  fixture: GroupFixture,
  team: Team,
  outcome: Exclude<RoundOf32ScenarioOutcome, "exact">
): ScorePrediction {
  const teamIsHome = fixture.homeCode === team.code;
  if (outcome === "draw") return { home: 1, away: 1 };
  const teamGoals = outcome === "win" ? 1 : 0;
  const opponentGoals = outcome === "win" ? 0 : 1;
  return teamIsHome
    ? { home: teamGoals, away: opponentGoals }
    : { home: opponentGoals, away: teamGoals };
}

function buildThirdOrderFromGroupOrder(groupOrder: GroupOrder, stats: StatsMap) {
  return groups
    .map((group) => findTeam(groupOrder[group.id][2]))
    .filter((team): team is Team => Boolean(team))
    .sort((left, right) => compareTeamsByProjectedStats(left, right, stats))
    .map((team) => team.name);
}

function buildGroupOpponentPreviews({
  group,
  groupOrder,
  roundOf32,
  stats,
  fixtures,
  predictions
}: {
  group: Group;
  groupOrder: GroupOrder;
  roundOf32: Map<number, OfficialMatch>;
  stats: StatsMap;
  fixtures: GroupFixture[];
  predictions: ScorePredictions;
}): RoundOf32TeamScenarioPreview[] {
  const order = groupOrder[group.id] ?? group.teams.map((team) => team.name);

  return order
    .map((teamName, index) => {
      const team = findTeam(teamName);
      if (!team || team.groupId !== group.id) return null;

      const currentStats = stats[team.code] ?? emptyStats;
      const currentPosition = index + 1;
      const nextFixture = findNextFixtureForTeam(team, fixtures);
      const nextMatchOpponent = getFixtureOpponent(team, nextFixture);

      if (!nextFixture) {
        const slot = getRoundOf32SlotPreview(team, roundOf32);
        if (!slot) return null;
        const fixed = canTreatRoundOf32SlotAsExact(slot, fixtures);
        return {
          team,
          currentPosition,
          currentStats,
          fixed,
          scenarios: [{
            ...slot,
            outcome: "exact",
            outcomeLabel: fixed ? "Exact opponent" : "Current possible opponent",
            projectedPosition: currentPosition
          }]
        };
      }

      const scenarios = scenarioOutcomes.flatMap(({ outcome, label }) => {
        const scenarioPredictions = {
          ...predictions,
          [nextFixture.id]: scoreForScenarioOutcome(nextFixture, team, outcome)
        };
        const scenarioStats = calculateProjectedStats(fixtures, scenarioPredictions);
        const scenarioGroupOrder = {
          ...groupOrder,
          [group.id]: [...group.teams]
            .sort((left, right) => compareTeamsByProjectedStats(left, right, scenarioStats))
            .map((candidate) => candidate.name)
        };
        const scenarioThirdOrder = buildThirdOrderFromGroupOrder(scenarioGroupOrder, scenarioStats);
        const scenarioRoundOf32 = buildRoundOf32(scenarioGroupOrder, scenarioThirdOrder);
        const slot = getRoundOf32SlotPreview(team, scenarioRoundOf32);
        if (!slot) return [];
        return [{
          ...slot,
          outcome,
          outcomeLabel: label,
          projectedPosition: scenarioGroupOrder[group.id].indexOf(team.name) + 1
        }];
      });

      if (scenarios.length === 0) return null;

      const uniqueMatchups = new Set(
        scenarios.map((scenario) => [
          scenario.matchNumber,
          scenario.slotLabel,
          scenario.opponent?.name ?? "pending",
          scenario.opponentSlotLabel
        ].join("|"))
      );
      const fixed =
        scenarios.length === scenarioOutcomes.length &&
        uniqueMatchups.size === 1 &&
        canTreatRoundOf32SlotAsExact(scenarios[0], fixtures);

      return {
        team,
        currentPosition,
        currentStats,
        fixed,
        nextMatchOpponent,
        scenarios: fixed
          ? [{ ...scenarios[0], outcome: "exact", outcomeLabel: "Exact opponent" }]
          : scenarios
      };
    })
    .filter((preview): preview is RoundOf32TeamScenarioPreview => Boolean(preview));
}

function LiveTablePredictorApp() {
  const initialOrder = useMemo(loadGroupOrder, []);
  const cache = useMemo(loadCachedStats, []);
  const rankingCache = useMemo(loadCachedRankings, []);
  const [view, setView] = useState<View>("groups");
  const [groupOrder, setGroupOrder] = useState<GroupOrder>(initialOrder);
  const [thirdOrder, setThirdOrder] = useState(() => loadThirdOrder(initialOrder));
  const [bracketPicks, setBracketPicks] = useState<BracketPicks>(loadBracketPicks);
  const [autoPickSnapshot, setAutoPickSnapshot] = useState<BracketPicks | null>(loadAutoPickSnapshot);
  const [autoPickCache, setAutoPickCache] = useState<AutoPickCache | null>(loadAutoPickCache);
  const [stats, setStats] = useState<StatsMap>(cache.stats);
  const [rankings, setRankings] = useState<RankingMap>(rankingCache.rankings);
  const [fixtures, setFixtures] = useState<GroupFixture[]>(loadCachedFixtures);
  const [scorePredictions, setScorePredictions] = useState<ScorePredictions>(loadScorePredictions);
  const [predictionGroup, setPredictionGroup] = useState<string | null>(null);
  const [opponentPreviewGroup, setOpponentPreviewGroup] = useState<string | null>(null);
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
      const nextFixtures = parseFifaFixtures(payload.Results ?? []);
      if (Object.keys(nextStats).length < 48 || nextFixtures.length < 72) {
        throw new Error("Incomplete FIFA standings response");
      }
      const updatedAt = new Date().toISOString();
      setStats(nextStats);
      setFixtures(nextFixtures);
      setLastUpdated(updatedAt);
      setFeedState("live");
      window.localStorage.setItem(
        "fifa-live-standings-cache-v1",
        JSON.stringify({ stats: nextStats, updatedAt })
      );
      window.localStorage.setItem("fifa-live-fixtures-cache-v1", JSON.stringify(nextFixtures));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedState(Object.keys(loadCachedStats().stats).length ? "cached" : "error");
    }
  }, []);

  const refreshRankings = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(fifaRankingsApi, {
        headers: { Accept: "application/json" },
        signal
      });
      if (!response.ok) throw new Error(`FIFA rankings returned ${response.status}`);
      const payload = (await response.json()) as { Results?: FifaRanking[] };
      const nextRankings = Object.fromEntries(
        (payload.Results ?? [])
          .filter((entry) => entry.IdCountry && entry.Rank && entry.TotalPoints)
          .map((entry) => [
            entry.IdCountry,
            { rank: entry.Rank, points: entry.TotalPoints }
          ])
      ) as RankingMap;
      if (Object.keys(nextRankings).length < 48) throw new Error("Incomplete FIFA ranking response");
      const updatedAt = new Date().toISOString();
      setRankings(nextRankings);
      window.localStorage.setItem(
        "fifa-ranking-cache-v1",
        JSON.stringify({ rankings: nextRankings, updatedAt })
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
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

  useEffect(() => {
    const controller = new AbortController();
    void refreshRankings(controller.signal);
    const interval = window.setInterval(() => void refreshRankings(), 15 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refreshRankings]);

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

  useEffect(() => {
    if (autoPickSnapshot === null) {
      window.localStorage.removeItem("fifa-auto-pick-snapshot-v1");
    } else {
      window.localStorage.setItem("fifa-auto-pick-snapshot-v1", JSON.stringify(autoPickSnapshot));
    }
  }, [autoPickSnapshot]);

  useEffect(() => {
    if (autoPickCache === null) {
      window.localStorage.removeItem("fifa-auto-pick-cache-v1");
    } else {
      window.localStorage.setItem("fifa-auto-pick-cache-v1", JSON.stringify(autoPickCache));
    }
  }, [autoPickCache]);

  useEffect(() => {
    window.localStorage.setItem("fifa-score-predictions-v1", JSON.stringify(scorePredictions));
  }, [scorePredictions]);

  const projectedStats = useMemo(
    () => fixtures.length ? calculateProjectedStats(fixtures, scorePredictions) : stats,
    [fixtures, scorePredictions, stats]
  );
  const groupPositions = useMemo(
    () => Object.fromEntries(
      groups.flatMap((group) => groupOrder[group.id].map((teamName, index) => [teamName, index + 1]))
    ) as Record<string, number>,
    [groupOrder]
  );
  const predictionContext = useMemo(
    () => ({ stats: projectedStats, rankings, groupPositions }),
    [projectedStats, rankings, groupPositions]
  );

  const bestThirdNames = new Set(thirdOrder.slice(0, 8));
  const roundOf32 = useMemo(
    () => buildRoundOf32(groupOrder, thirdOrder),
    [groupOrder, thirdOrder]
  );
  const roundOf32PreviewReady = hasEveryGroupReachedSecondMatch(projectedStats);
  const champion = findTeam(bracketPicks.m104);
  const knockoutPickCount = officialPickOrder.filter((matchNumber) => bracketPicks[`m${matchNumber}`]).length;

  useEffect(() => {
    setBracketPicks((current) => {
      const sanitized = sanitizeOfficialPicks(current, roundOf32);
      return JSON.stringify(sanitized) === JSON.stringify(current) ? current : sanitized;
    });
  }, [roundOf32]);

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
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
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
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function saveGroupPredictions(groupId: string, groupPredictions: ScorePredictions) {
    const groupFixtureIds = new Set(fixtures.filter((fixture) => fixture.groupId === groupId).map((fixture) => fixture.id));
    const nextPredictions = Object.fromEntries(
      Object.entries({ ...scorePredictions, ...groupPredictions }).filter(([matchId]) => {
        const fixture = fixtures.find((item) => item.id === matchId);
        return !fixture?.completed && (!groupFixtureIds.has(matchId) || groupPredictions[matchId]);
      })
    ) as ScorePredictions;
    const nextStats = calculateProjectedStats(fixtures, nextPredictions);
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

    const rankedGroup = [...group.teams].sort((a, b) => compareTeamsByProjectedStats(a, b, nextStats));
    const nextGroupOrder = { ...groupOrder, [groupId]: rankedGroup.map((team) => team.name) };
    const rankedThirds = groups
      .map((item) => findTeam(nextGroupOrder[item.id][2]))
      .filter((team): team is Team => Boolean(team))
      .sort((a, b) => compareTeamsByProjectedStats(a, b, nextStats));

    setScorePredictions(nextPredictions);
    setGroupOrder(nextGroupOrder);
    setThirdOrder(rankedThirds.map((team) => team.name));
    setBracketPicks({});
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
    setPredictionGroup(null);
  }

  function resetPredictions() {
    const defaults = defaultGroupOrder();
    setGroupOrder(defaults);
    setThirdOrder(groups.map((group) => defaults[group.id][2]));
    setScorePredictions({});
    setPredictionGroup(null);
    setBracketPicks({});
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function selectWinner(matchNumber: number, teamName: string) {
    const pickKey = `m${matchNumber}`;
    if (bracketPicks[pickKey] === teamName) return;

    const manualBaseline = autoPickSnapshot ?? bracketPicks;
    setBracketPicks(
      sanitizeOfficialPicks({ ...manualBaseline, [pickKey]: teamName }, roundOf32)
    );
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function autoPickBracket() {
    if (autoPickSnapshot !== null) {
      setBracketPicks(autoPickSnapshot);
      setAutoPickSnapshot(null);
      return;
    }

    const baseline = sanitizeOfficialPicks(bracketPicks, roundOf32);
    if (autoPickCache && sameBracketPicks(autoPickCache.baseline, baseline)) {
      setAutoPickSnapshot(baseline);
      setBracketPicks(autoPickCache.generated);
      return;
    }

    const next: BracketPicks = { ...baseline };
    officialPickOrder.forEach((matchNumber) => {
      const pickKey = `m${matchNumber}`;
      if (next[pickKey]) return;

      const match = resolveOfficialMatch(matchNumber, roundOf32, next);
      const [teamA, teamB] = match.teams;
      const winner = teamA && teamB
        ? pickProbableWinner(
            teamA,
            teamB,
            predictionContext,
            () => deterministicMatchRandom(matchNumber, teamA, teamB)
          ).winner
        : teamA ?? teamB;
      if (winner) next[pickKey] = winner.name;
    });

    setAutoPickCache({ baseline, generated: next });
    setAutoPickSnapshot(baseline);
    setBracketPicks(next);
  }

  function resetBracket() {
    setBracketPicks({});
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
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
            stats={projectedStats}
            fixtures={fixtures}
            feedState={feedState}
            lastUpdated={lastUpdated}
            onRefresh={() => void refreshStandings()}
            onMoveGroupTeam={moveGroupTeam}
            onMoveThirdTeam={moveThirdTeam}
            onPredictGroup={setPredictionGroup}
            onPreviewOpponents={setOpponentPreviewGroup}
            roundOf32PreviewReady={roundOf32PreviewReady}
            onReset={resetPredictions}
            onContinue={() => switchView("bracket")}
          />
        ) : (
          <KnockoutStage
            roundOf32={roundOf32}
            picks={bracketPicks}
            champion={champion}
            onPick={selectWinner}
            onAutoPick={autoPickBracket}
            autoPickActive={autoPickSnapshot !== null}
            onReset={resetBracket}
            onBack={() => switchView("groups")}
          />
        )}
      </main>
      <Footer />
      {predictionGroup && (
        <GroupMatchesModal
          group={groups.find((group) => group.id === predictionGroup)!}
          fixtures={fixtures.filter((fixture) => fixture.groupId === predictionGroup)}
          predictions={scorePredictions}
          onClose={() => setPredictionGroup(null)}
          onSave={(predictions) => saveGroupPredictions(predictionGroup, predictions)}
        />
      )}
      {opponentPreviewGroup && (
        <GroupOpponentPreviewModal
          group={groups.find((group) => group.id === opponentPreviewGroup)!}
          groupOrder={groupOrder}
          roundOf32={roundOf32}
          stats={projectedStats}
          fixtures={fixtures}
          predictions={scorePredictions}
          onClose={() => setOpponentPreviewGroup(null)}
        />
      )}
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
    { label: "Round of 32", complete: knockoutPickCount === 32, active: view === "bracket" && !champion },
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
  fixtures,
  feedState,
  lastUpdated,
  onRefresh,
  onMoveGroupTeam,
  onMoveThirdTeam,
  onPredictGroup,
  onPreviewOpponents,
  roundOf32PreviewReady,
  onReset,
  onContinue
}: {
  groupOrder: GroupOrder;
  thirdOrder: string[];
  bestThirdNames: Set<string>;
  stats: StatsMap;
  fixtures: GroupFixture[];
  feedState: FeedState;
  lastUpdated: string | null;
  onRefresh: () => void;
  onMoveGroupTeam: (groupId: string, fromIndex: number, toIndex: number) => void;
  onMoveThirdTeam: (fromIndex: number, toIndex: number) => void;
  onPredictGroup: (groupId: string) => void;
  onPreviewOpponents: (groupId: string) => void;
  roundOf32PreviewReady: boolean;
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
            fixtureCount={fixtures.filter((fixture) => fixture.groupId === group.id).length}
            onMove={onMoveGroupTeam}
            onPredict={onPredictGroup}
            onPreviewOpponents={onPreviewOpponents}
            roundOf32PreviewReady={roundOf32PreviewReady}
          />
        ))}
      </div>

      <ThirdPlacePredictor order={thirdOrder} stats={stats} onMove={onMoveThirdTeam} />

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
  fixtureCount,
  onMove,
  onPredict,
  onPreviewOpponents,
  roundOf32PreviewReady
}: {
  group: Group;
  order: string[];
  bestThirdNames: Set<string>;
  stats: StatsMap;
  fixtureCount: number;
  onMove: (groupId: string, fromIndex: number, toIndex: number) => void;
  onPredict: (groupId: string) => void;
  onPreviewOpponents: (groupId: string) => void;
  roundOf32PreviewReady: boolean;
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
      <footer><span>Q automatic · 3Q best third</span><span>Live + predicted stats</span></footer>
      <button
        className="group-matches-button"
        disabled={fixtureCount === 0}
        onClick={() => onPredict(group.id)}
        type="button"
      >
        <span>Predict Group {group.id} matches</span>
        <strong>{fixtureCount || "—"}/6</strong>
      </button>
      <button
        className="group-round32-preview-button"
        disabled={!roundOf32PreviewReady}
        onClick={() => onPreviewOpponents(group.id)}
        title={roundOf32PreviewReady ? `View probable Round of 32 opponents for Group ${group.id}` : "Available after every group has reached two played or predicted matches"}
        type="button"
      >
        <span>Probable Round of 32 opponents</span>
        <strong>{roundOf32PreviewReady ? "View" : "2 MP"}</strong>
      </button>
    </article>
  );
}

function ThirdPlacePredictor({ order, stats, onMove }: { order: string[]; stats: StatsMap; onMove: (fromIndex: number, toIndex: number) => void }) {
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
          const teamStats = stats[team.code] ?? emptyStats;
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
              <span className="third-stat"><b>{teamStats.pts}</b> Pts</span>
              <span className="third-stat">{teamStats.gd > 0 ? "+" : ""}{teamStats.gd} GD</span>
              <span className="third-stat">{teamStats.gf} GF</span>
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
  roundOf32,
  picks,
  champion,
  onPick,
  onAutoPick,
  autoPickActive,
  onReset,
  onBack
}: {
  roundOf32: Map<number, OfficialMatch>;
  picks: BracketPicks;
  champion?: Team;
  onPick: (matchNumber: number, teamName: string) => void;
  onAutoPick: () => void;
  autoPickActive: boolean;
  onReset: () => void;
  onBack: () => void;
}) {
  return (
    <section className="content-section official-knockout-section">
      <header className="section-heading bracket-heading">
        <div>
          <span className="eyebrow">OFFICIAL FIFA PATH · M73–M104</span>
          <h2>Knockout bracket</h2>
          <p>
            Auto-pick preserves manual choices, repeats the same result for the same matchups, and recalculates only paths affected by a changed pick.
          </p>
        </div>
        <div className="bracket-tools">
          <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft size={17} /> Predictor</button>
          <button
            className={`secondary-button accent ${autoPickActive ? "undo-auto-picks" : ""}`}
            onClick={onAutoPick}
            title={autoPickActive ? "Restore your bracket to the point before auto-pick" : "Predict remaining matches from live form and FIFA ranking"}
            type="button"
          >
            {autoPickActive ? <RotateCcw size={17} /> : <Sparkles size={17} />}
            {autoPickActive ? "Undo auto-picks" : "Auto-pick remaining"}
          </button>
          <button className="secondary-button" onClick={onReset} type="button"><RotateCcw size={17} /> Reset</button>
        </div>
      </header>

      {champion && (
        <article className="compact-champion-banner">
          <Trophy size={28} />
          <span>Your champion</span>
          <strong><Flag team={champion} /> {champion.name}</strong>
        </article>
      )}

      <div className="official-bracket-shell" aria-label="FIFA World Cup 2026 knockout bracket">
        <CompactRound title="Round of 32" numbers={leftBracketMatches.round32} roundOf32={roundOf32} picks={picks} onPick={onPick} side="left" />
        <CompactRound title="Round of 16" numbers={leftBracketMatches.round16} roundOf32={roundOf32} picks={picks} onPick={onPick} side="left" />
        <CompactRound title="Quarter-final" numbers={leftBracketMatches.quarterFinals} roundOf32={roundOf32} picks={picks} onPick={onPick} side="left" />
        <CompactRound title="Semi-final" numbers={leftBracketMatches.semiFinals} roundOf32={roundOf32} picks={picks} onPick={onPick} side="left" />

        <section className="bracket-centre-column">
          <header>Finals</header>
          <div className="centre-final">
            <OfficialMatchCard match={resolveOfficialMatch(104, roundOf32, picks)} selected={picks.m104} onPick={onPick} featured />
          </div>
          <div className="centre-third-place">
            <span>Play-off for third place</span>
            <OfficialMatchCard match={resolveOfficialMatch(103, roundOf32, picks)} selected={picks.m103} onPick={onPick} />
          </div>
        </section>

        <CompactRound title="Semi-final" numbers={rightBracketMatches.semiFinals} roundOf32={roundOf32} picks={picks} onPick={onPick} side="right" />
        <CompactRound title="Quarter-final" numbers={rightBracketMatches.quarterFinals} roundOf32={roundOf32} picks={picks} onPick={onPick} side="right" />
        <CompactRound title="Round of 16" numbers={rightBracketMatches.round16} roundOf32={roundOf32} picks={picks} onPick={onPick} side="right" />
        <CompactRound title="Round of 32" numbers={rightBracketMatches.round32} roundOf32={roundOf32} picks={picks} onPick={onPick} side="right" />
      </div>

      <p className="official-bracket-note">
        Third-place opponents are assigned from the exact eight qualifying groups using the
        <a href={fifaRegulationsUrl} target="_blank" rel="noreferrer"> FIFA World Cup 2026 Regulations, Annex C</a>.
      </p>
    </section>
  );
}

function CompactRound({
  title,
  numbers,
  roundOf32,
  picks,
  onPick,
  side
}: {
  title: string;
  numbers: number[];
  roundOf32: Map<number, OfficialMatch>;
  picks: BracketPicks;
  onPick: (matchNumber: number, teamName: string) => void;
  side: "left" | "right";
}) {
  return (
    <section className={`compact-round compact-round-${side} compact-round-${numbers.length}`}>
      <header>{title}</header>
      <div className="compact-round-matches">
        {numbers.map((matchNumber) => (
          <OfficialMatchCard
            key={matchNumber}
            match={resolveOfficialMatch(matchNumber, roundOf32, picks)}
            selected={picks[`m${matchNumber}`]}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}

function OfficialMatchCard({
  match,
  selected,
  onPick,
  featured = false
}: {
  match: OfficialMatch;
  selected?: string;
  onPick: (matchNumber: number, teamName: string) => void;
  featured?: boolean;
}) {
  const isRoundOf32 = match.number >= 73 && match.number <= 88;

  return (
    <article className={`official-match-card ${selected ? "decided" : ""} ${featured ? "featured" : ""}`}>
      <span className="official-match-number">M{match.number}</span>
      {match.teams.map((team, index) =>
        team ? (
          <button
            aria-pressed={selected === team.name}
            className={`${selected === team.name ? "winner" : selected ? "loser" : ""} ${isRoundOf32 ? "round32-team-row" : ""}`}
            key={`${match.number}-${team.name}`}
            onClick={() => onPick(match.number, team.name)}
            type="button"
          >
            {isRoundOf32 ? (
              <>
                <Flag team={team} />
                <span className="official-team-details">
                  <span className="official-team-name">{team.name}</span>
                  <span className="round32-source-label">{formatRoundOf32Slot(match.labels[index])}</span>
                </span>
              </>
            ) : (
              <>
                <span className="official-slot-label">{match.labels[index]}</span>
                <Flag team={team} />
                <span className="official-team-name">{team.name}</span>
              </>
            )}
            <span className="winner-check">{selected === team.name && <Check size={11} />}</span>
          </button>
        ) : (
          <div className={`official-team-placeholder ${isRoundOf32 ? "round32-placeholder" : ""}`} key={`${match.number}-${index}`}>
            <span>{isRoundOf32 ? formatRoundOf32Slot(match.labels[index]) : match.labels[index]}</span>
            <em>Awaiting winner</em>
          </div>
        )
      )}
    </article>
  );
}
function formatRoundOf32Slot(label: string) {
  const position = label.charAt(0);
  const group = label.slice(1);
  const positionLabel = position === "1" ? "1st" : position === "2" ? "2nd" : position === "3" ? "3rd" : position;
  return `Group ${group} \u00B7 ${positionLabel}`;
}

function GroupMatchesModal({
  group,
  fixtures,
  predictions,
  onClose,
  onSave
}: {
  group: Group;
  fixtures: GroupFixture[];
  predictions: ScorePredictions;
  onClose: () => void;
  onSave: (predictions: ScorePredictions) => void;
}) {
  const [draft, setDraft] = useState<ScorePredictions>(() =>
    Object.fromEntries(
      fixtures
        .filter((fixture) => !fixture.completed && new Date(fixture.kickoff).getTime() > Date.now())
        .map((fixture) => [fixture.id, predictions[fixture.id] ?? { home: 0, away: 0 }])
    )
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  function updateScore(matchId: string, side: "home" | "away", value: number) {
    const safeValue = Math.max(0, Math.min(20, Number.isFinite(value) ? Math.floor(value) : 0));
    setDraft((current) => ({
      ...current,
      [matchId]: { ...(current[matchId] ?? { home: 0, away: 0 }), [side]: safeValue }
    }));
  }

  return (
    <div className="modal-backdrop match-prediction-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="match-prediction-title"
        aria-modal="true"
        className="group-match-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="group-match-modal-header">
          <div>
            <span className="eyebrow">GROUP {group.id} · ALL MATCHES</span>
            <h2 id="match-prediction-title">Predict the scorelines</h2>
            <p>Completed FIFA results are locked. Enter scores for upcoming matches to project the table.</p>
          </div>
          <button className="modal-close" aria-label="Close match predictions" onClick={onClose} type="button"><X size={22} /></button>
        </header>

        <div className="group-fixture-list">
          {fixtures.map((fixture) => {
            const homeTeam = findTeamByCode(fixture.homeCode)!;
            const awayTeam = findTeamByCode(fixture.awayCode)!;
            const kickoff = new Date(fixture.kickoff);
            const isPast = kickoff.getTime() <= Date.now();
            const canPredict = !fixture.completed && !isPast;
            const predicted = draft[fixture.id] ?? { home: 0, away: 0 };

            return (
              <article className={`group-fixture ${fixture.completed ? "completed" : canPredict ? "predictable" : "awaiting"}`} key={fixture.id}>
                <div className="fixture-meta">
                  <span>{kickoff.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                  <strong>{kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
                  <em>{fixture.completed ? "Full time" : canPredict ? "Your prediction" : "Awaiting official result"}</em>
                </div>
                <div className="fixture-team home-team">
                  <strong>{homeTeam.name}</strong>
                  <Flag team={homeTeam} />
                </div>
                <div className="fixture-scoreline">
                  {fixture.completed ? (
                    <><strong>{fixture.homeScore}</strong><span>–</span><strong>{fixture.awayScore}</strong></>
                  ) : canPredict ? (
                    <>
                      <input aria-label={`${homeTeam.name} predicted goals`} inputMode="numeric" max="20" min="0" onChange={(event) => updateScore(fixture.id, "home", Number(event.target.value))} type="number" value={predicted.home} />
                      <span>–</span>
                      <input aria-label={`${awayTeam.name} predicted goals`} inputMode="numeric" max="20" min="0" onChange={(event) => updateScore(fixture.id, "away", Number(event.target.value))} type="number" value={predicted.away} />
                    </>
                  ) : (
                    <span className="fixture-pending-score">TBD</span>
                  )}
                </div>
                <div className="fixture-team away-team">
                  <Flag team={awayTeam} />
                  <strong>{awayTeam.name}</strong>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="group-match-modal-footer">
          <div><Check size={16} /><span>Saving recalculates Group {group.id} and the third-place board.</span></div>
          <button className="secondary-button" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" onClick={() => onSave(draft)} type="button">Save predictions <ArrowRight size={17} /></button>
        </footer>
      </section>
    </div>
  );
}

function GroupOpponentPreviewModal({
  group,
  groupOrder,
  roundOf32,
  stats,
  fixtures,
  predictions,
  onClose
}: {
  group: Group;
  groupOrder: GroupOrder;
  roundOf32: Map<number, OfficialMatch>;
  stats: StatsMap;
  fixtures: GroupFixture[];
  predictions: ScorePredictions;
  onClose: () => void;
}) {
  const previews = buildGroupOpponentPreviews({ group, groupOrder, roundOf32, stats, fixtures, predictions });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop match-prediction-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="opponent-preview-title"
        aria-modal="true"
        className="group-match-modal opponent-preview-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="group-match-modal-header">
          <div>
            <span className="eyebrow">GROUP {group.id} · SYSTEM-GENERATED</span>
            <h2 id="opponent-preview-title">Round of 32 scenario routes</h2>
            <p>Only teams with at least one qualifying route are shown. Each route recalculates this group, the third-place table, and the official Round of 32 mapping.</p>
          </div>
          <button className="modal-close" aria-label="Close Round of 32 opponent preview" onClick={onClose} type="button"><X size={22} /></button>
        </header>

        <div className="opponent-preview-body">
          <div className="opponent-preview-system-note">
            <Sparkles size={16} />
            <span>System-generated preview. Win/draw/loss routes use a simple 1-goal model for the team&apos;s next group match and hide eliminated outcomes.</span>
          </div>

          {previews.length === 0 ? (
            <div className="opponent-preview-empty">
              <Info size={22} />
              <strong>No active Round of 32 route</strong>
              <span>The teams in Group {group.id} are currently outside the qualifying routes in this projection.</span>
            </div>
          ) : (
            <div className="opponent-preview-grid scenario-preview-grid">
              {previews.map((preview) => (
                <article className={`scenario-team-card ${preview.fixed ? "exact" : "variable"}`} key={preview.team.name}>
                  <header className="scenario-team-header">
                    <div className="scenario-team-identity">
                      <Flag team={preview.team} />
                      <div>
                        <strong>{preview.team.name}</strong>
                        <span>{formatGroupPosition(preview.currentPosition)} now · {preview.currentStats.mp} MP · {preview.currentStats.pts} Pts · {preview.currentStats.gd > 0 ? "+" : ""}{preview.currentStats.gd} GD</span>
                      </div>
                    </div>
                    <span className={`scenario-status-pill ${preview.fixed ? "exact" : "variable"}`}>
                      {preview.fixed ? "Exact opponent" : "Possible routes"}
                    </span>
                  </header>

                  <p className="scenario-team-note">
                    {preview.fixed
                      ? "Both matchup source groups are complete, so this Round of 32 opponent is locked."
                      : preview.nextMatchOpponent
                        ? <>Next group match: <strong>{preview.team.name}</strong> vs <strong>{preview.nextMatchOpponent.name}</strong></>
                        : "The team side is settled, but the opponent side still has group matches left."}
                  </p>

                  <div className={preview.fixed ? "scenario-exact-grid" : "scenario-outcome-grid"}>
                    {preview.scenarios.map((scenario) => (
                      <article className="scenario-outcome-card" key={`${preview.team.name}-${scenario.outcome}-${scenario.matchNumber}`}>
                        <div className="scenario-outcome-label">
                          <strong>{scenario.outcomeLabel}</strong>
                          <span>{formatGroupPosition(scenario.projectedPosition)} · {formatRoundOf32Slot(scenario.slotLabel)}</span>
                        </div>

                        <div className="scenario-matchup-flow">
                          <div className="scenario-source-slot">
                            <Flag team={preview.team} />
                            <strong>{preview.team.name}</strong>
                          </div>
                          <div className="scenario-match-bridge">
                            <span>M{scenario.matchNumber}</span>
                            <i />
                            <small>Round of 32</small>
                          </div>
                          <div className="scenario-opponent-slot">
                            {scenario.opponent ? <Flag team={scenario.opponent} /> : <div className="preview-empty-flag">?</div>}
                            <strong>{scenario.opponent?.name ?? "Pending"}</strong>
                            <em>{formatRoundOf32Slot(scenario.opponentSlotLabel)}</em>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="group-match-modal-footer opponent-preview-footer">
          <div><Info size={16} /><span>This does not change your table or bracket picks.</span></div>
          <button className="primary-button" onClick={onClose} type="button">Done</button>
        </footer>
      </section>
    </div>
  );
}
function formatGroupPosition(position: number) {
  if (position === 1) return "1st in group";
  if (position === 2) return "2nd in group";
  if (position === 3) return "3rd in group";
  return `${position}th in group`;
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
          <li><span>2</span><div><strong>Predict each group</strong><p>Open the group matches, enter future scorelines, and save to recalculate the table.</p></div></li>
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
