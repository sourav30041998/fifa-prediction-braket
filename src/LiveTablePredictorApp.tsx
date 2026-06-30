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
type PredictionPath = {
  id: string;
  name: string;
  picks: BracketPicks;
  createdAt: string;
  updatedAt: string;
};
type BracketMode = "official" | "prediction";
type BracketRoundKey = "round32" | "round16" | "quarterFinals" | "semiFinals" | "final";
type AccuracyRoundSummary = {
  key: BracketRoundKey;
  label: string;
  correct: number;
  completed: number;
  total: number;
};
type PredictionAccuracy = {
  rounds: AccuracyRoundSummary[];
  correct: number;
  completed: number;
  percentage: number;
  finalCorrect: boolean | null;
};
type AutoPickCache = {
  baseline: BracketPicks;
  generated: BracketPicks;
};
type View = "groups" | "bracket";
type FeedState = "loading" | "live" | "cached" | "error";

type FifaTeamSide = {
  Score?: number | null;
  IdTeam?: string;
  IdCountry?: string;
  Abbreviation?: string;
  TeamName?: Array<{ Description?: string }>;
};

type FifaMatchResult = {
  IdMatch: string;
  StartTime?: string;
  Date?: string;
  LocalDate?: string;
  Result?: number;
  ResultType?: number | null;
  MatchStatus?: number | string | null;
  OfficialityStatus?: number | null;
  IdCompetition?: string;
  IdSeason?: string;
  IdStage?: string;
  IdGroup?: string | null;
  Home?: FifaTeamSide | null;
  Away?: FifaTeamSide | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  HomeTeamId: string;
  AwayTeamId: string;
  MatchNumber?: number | string;
  MatchNo?: number | string;
  MatchCode?: string;
  Description?: string;
  PlaceHolderA?: string;
  PlaceHolderB?: string;
  StageName?: Array<{ Description?: string }>;
  GroupName?: Array<{ Description?: string }>;
  HomeTeamPenaltyScore?: number | null;
  AwayTeamPenaltyScore?: number | null;
  HomeTeamPenalty?: number | null;
  AwayTeamPenalty?: number | null;
  Winner?: string | null;
  WinnerTeamId?: string;
  WinningTeamId?: string;
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
  live: boolean;
  status: FixtureStatus;
  resultStatus: number;
};

type KnockoutFixture = {
  id: string;
  number?: number;
  kickoff: string;
  homeCode: string;
  awayCode: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  labels?: [string, string];
  completed: boolean;
  live: boolean;
  status: FixtureStatus;
  resultStatus: number;
  winnerCode?: string;
};

type FixtureStatus = "scheduled" | "live" | "completed";
type ScorePrediction = { home: number; away: number };
type ScorePredictions = Record<string, ScorePrediction>;

const fifaStandingsPage =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings";
const fifaRegulationsUrl =
  "https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf";
const fifaStandingsApi =
  "https://api.fifa.com/api/v3/calendar/17/285023/289273/standing?language=en&count=500";
const fifaMatchesApi =
  "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&language=en&count=500";
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

function createPredictionPathId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `prediction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBracketPicks(value: unknown): BracketPicks {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key, teamName]) =>
      /^m\d+$/.test(key) && typeof teamName === "string" && teamName.trim()
    )
  ) as BracketPicks;
}

function createPredictionPathRecord(name: string, picks: BracketPicks = {}): PredictionPath {
  const now = new Date().toISOString();
  return {
    id: createPredictionPathId(),
    name,
    picks,
    createdAt: now,
    updatedAt: now
  };
}

function normalizePredictionPath(value: unknown, index: number): PredictionPath | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const now = new Date().toISOString();
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name : `Prediction ${index + 1}`;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : createPredictionPathId(),
    name,
    picks: normalizeBracketPicks(raw.picks),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now
  };
}

function loadPredictionPaths(): PredictionPath[] {
  try {
    const saved = window.localStorage.getItem("fifa-prediction-paths-v1");
    if (saved) {
      const parsed = JSON.parse(saved) as unknown;
      if (Array.isArray(parsed)) {
        const paths = parsed
          .map((path, index) => normalizePredictionPath(path, index))
          .filter((path): path is PredictionPath => Boolean(path));
        if (paths.length > 0) return paths;
      }
    }
  } catch {
    // Fall back to the legacy single-bracket storage below.
  }

  return [createPredictionPathRecord("Prediction 1", loadBracketPicks())];
}

function loadActivePredictionPathId(paths: PredictionPath[]) {
  try {
    const saved = window.localStorage.getItem("fifa-active-prediction-path-v1");
    return saved && paths.some((path) => path.id === saved) ? saved : paths[0]?.id ?? "";
  } catch {
    return paths[0]?.id ?? "";
  }
}

function loadBracketMode(): BracketMode {
  try {
    return window.localStorage.getItem("fifa-dual-bracket-mode-v1") === "official" ? "official" : "prediction";
  } catch {
    return "prediction";
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

function loadCachedKnockoutFixtures(): KnockoutFixture[] {
  try {
    return JSON.parse(window.localStorage.getItem("fifa-knockout-fixtures-cache-v1") ?? "[]");
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

function loadManualSimulationMode() {
  try {
    return window.localStorage.getItem("fifa-manual-simulation-mode-v1") === "true";
  } catch {
    return false;
  }
}

const liveMatchWindowMs = 4 * 60 * 60 * 1000;

function getMatchKickoff(match: FifaMatchResult) {
  return match.StartTime ?? match.Date ?? match.LocalDate ?? "";
}

function getMatchScore(match: FifaMatchResult, side: "Home" | "Away") {
  const score = side === "Home" ? match.HomeTeamScore : match.AwayTeamScore;
  return typeof score === "number" ? score : match[side]?.Score ?? null;
}

function getCalendarTeamCode(team?: FifaTeamSide | null) {
  return normalizeTeamCode(team?.IdCountry ?? team?.Abbreviation);
}

function getFixtureLifecycle(match: FifaMatchResult, hasScore: boolean, now = Date.now()) {
  const kickoffTime = new Date(getMatchKickoff(match)).getTime();
  const hasValidKickoff = Number.isFinite(kickoffTime);
  const resultStatus = Number(match.Result ?? match.ResultType ?? 0);
  const matchStatus = Number(match.MatchStatus ?? 0);
  const isOfficialResult = Number(match.OfficialityStatus ?? 0) > 0;
  const hasWinner = Boolean(match.Winner ?? match.WinnerTeamId ?? match.WinningTeamId);
  const isFinalResult = resultStatus >= 4 || match.ResultType === 1 || isOfficialResult || hasWinner;
  const hasKickedOff = hasValidKickoff && kickoffTime <= now;
  const isInsideLiveWindow = hasKickedOff && now - kickoffTime <= liveMatchWindowMs;
  const statusLooksLive = (resultStatus > 0 && resultStatus < 4) || matchStatus > 1;
  const live = !isFinalResult && (statusLooksLive || isInsideLiveWindow);
  const completed = hasScore && (isFinalResult || (hasKickedOff && !live));
  const status: FixtureStatus = completed ? "completed" : live ? "live" : "scheduled";

  return { completed, live, status, resultStatus };
}

function normalizeTeamCode(value?: string) {
  const code = value?.trim().toUpperCase();
  return code && allTeams.some((team) => team.code === code) ? code : undefined;
}

function readStringField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumberField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function inferKnockoutMatchNumber(match: FifaMatchResult) {
  const raw = match as FifaMatchResult & Record<string, unknown>;
  const directNumber = readNumberField(raw, ["MatchNumber", "MatchNo", "MatchNoLong", "MatchIndex", "Order"]);
  if (directNumber && officialPickOrder.includes(directNumber)) return directNumber;

  const text = [match.MatchNumber, match.MatchNo, match.MatchCode, match.Description, match.IdMatch]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .join(" ");
  const matchNumber = text.match(/(?:^|[^0-9])(?:M)?(7[3-9]|8[0-9]|9[0-9]|10[0-4])(?:[^0-9]|$)/i)?.[1];
  const parsed = matchNumber ? Number(matchNumber) : undefined;
  return parsed && officialPickOrder.includes(parsed) ? parsed : undefined;
}

function getResultTeamCode(match: FifaMatchResult, side: "Home" | "Away", teamCodeById: Record<string, string>) {
  const raw = match as FifaMatchResult & Record<string, unknown>;
  const team = match[side];
  const id = side === "Home" ? match.HomeTeamId : match.AwayTeamId;
  const idFromFlexibleField = readStringField(raw, [`${side}TeamId`, `Id${side}Team`, `${side}IdTeam`]) ?? team?.IdTeam;
  const fromId = teamCodeById[id] ?? (idFromFlexibleField ? teamCodeById[idFromFlexibleField] : undefined);
  const direct = readStringField(raw, [
    `${side}TeamCountryCode`,
    `${side}CountryCode`,
    `${side}TeamCode`,
    `${side}TeamAbbreviation`,
    `${side}TeamIdCountry`,
    `IdCountry${side}`
  ]);
  return normalizeTeamCode(fromId ?? direct) ?? getCalendarTeamCode(team);
}

function getPenaltyScore(match: FifaMatchResult, side: "Home" | "Away") {
  const raw = match as FifaMatchResult & Record<string, unknown>;
  return readNumberField(raw, [
    `${side}TeamPenaltyScore`,
    `${side}TeamPenalty`,
    `${side}PenaltyScore`,
    `${side}TeamPenaltyShootoutScore`
  ]) ?? null;
}

function getCompletedWinnerCode(
  match: FifaMatchResult,
  teamCodeById: Record<string, string>,
  homeCode: string,
  awayCode: string,
  homePenaltyScore: number | null,
  awayPenaltyScore: number | null
) {
  const raw = match as FifaMatchResult & Record<string, unknown>;
  const winnerId = match.Winner ?? match.WinnerTeamId ?? match.WinningTeamId ?? readStringField(raw, ["Winner", "WinnerIdTeam", "WinningTeamId", "WinnerTeamId"]);
  const winnerCode = normalizeTeamCode(winnerId ? teamCodeById[winnerId] ?? winnerId : undefined);
  if (winnerCode) return winnerCode;

  const homeScore = getMatchScore(match, "Home");
  const awayScore = getMatchScore(match, "Away");
  if (homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) return homeCode;
    if (awayScore > homeScore) return awayCode;
  }

  if (homePenaltyScore !== null && awayPenaltyScore !== null) {
    if (homePenaltyScore > awayPenaltyScore) return homeCode;
    if (awayPenaltyScore > homePenaltyScore) return awayCode;
  }

  return undefined;
}

function parseFifaKnockoutFixtures(rows: FifaStanding[]) {
  const teamCodeById = Object.fromEntries(
    rows.flatMap((row) => row.Team?.IdTeam && row.Team.IdCountry ? [[row.Team.IdTeam, row.Team.IdCountry]] : [])
  ) as Record<string, string>;
  const fixtures = new Map<string, KnockoutFixture>();

  rows.forEach((row) => {
    const groupDescription = row.Group?.[0]?.Description ?? "";
    const looksLikeGroupStage = /^Group [A-L]$/i.test(groupDescription.trim());
    row.MatchResults?.forEach((match) => {
      const matchNumber = inferKnockoutMatchNumber(match);
      if (!matchNumber && looksLikeGroupStage) return;
      if (matchNumber && !officialPickOrder.includes(matchNumber)) return;
      if (fixtures.has(match.IdMatch)) return;

      const homeCode = getResultTeamCode(match, "Home", teamCodeById);
      const awayCode = getResultTeamCode(match, "Away", teamCodeById);
      if (!homeCode || !awayCode) return;

      const homeScore = getMatchScore(match, "Home");
      const awayScore = getMatchScore(match, "Away");
      const hasScore = homeScore !== null && awayScore !== null;
      const lifecycle = getFixtureLifecycle(match, hasScore);
      const homePenaltyScore = getPenaltyScore(match, "Home");
      const awayPenaltyScore = getPenaltyScore(match, "Away");
      const winnerCode = lifecycle.completed
        ? getCompletedWinnerCode(match, teamCodeById, homeCode, awayCode, homePenaltyScore, awayPenaltyScore)
        : undefined;

      fixtures.set(match.IdMatch, {
        id: match.IdMatch,
        number: matchNumber,
        kickoff: getMatchKickoff(match),
        homeCode,
        awayCode,
        homeScore,
        awayScore,
        homePenaltyScore,
        awayPenaltyScore,
        labels: match.PlaceHolderA && match.PlaceHolderB ? [match.PlaceHolderA, match.PlaceHolderB] : undefined,
        completed: lifecycle.completed,
        live: lifecycle.live,
        status: lifecycle.status,
        resultStatus: lifecycle.resultStatus,
        winnerCode
      });
    });
  });

  return [...fixtures.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

function parseFifaCalendarKnockoutFixtures(matches: FifaMatchResult[]) {
  const teamCodeById = Object.fromEntries(
    matches.flatMap((match) => [
      match.Home?.IdTeam && getCalendarTeamCode(match.Home) ? [[match.Home.IdTeam, getCalendarTeamCode(match.Home)!]] : [],
      match.Away?.IdTeam && getCalendarTeamCode(match.Away) ? [[match.Away.IdTeam, getCalendarTeamCode(match.Away)!]] : []
    ].flat())
  ) as Record<string, string>;
  const fixtures = new Map<string, KnockoutFixture>();

  matches.forEach((match) => {
    const matchNumber = inferKnockoutMatchNumber(match);
    if (!matchNumber || !officialPickOrder.includes(matchNumber)) return;

    const homeCode = getResultTeamCode(match, "Home", teamCodeById);
    const awayCode = getResultTeamCode(match, "Away", teamCodeById);
    if (!homeCode || !awayCode) return;

    const homeScore = getMatchScore(match, "Home");
    const awayScore = getMatchScore(match, "Away");
    const hasScore = homeScore !== null && awayScore !== null;
    const lifecycle = getFixtureLifecycle(match, hasScore);
    const homePenaltyScore = getPenaltyScore(match, "Home");
    const awayPenaltyScore = getPenaltyScore(match, "Away");
    const winnerCode = lifecycle.completed
      ? getCompletedWinnerCode(match, teamCodeById, homeCode, awayCode, homePenaltyScore, awayPenaltyScore)
      : undefined;

    fixtures.set(match.IdMatch, {
      id: match.IdMatch,
      number: matchNumber,
      kickoff: getMatchKickoff(match),
      homeCode,
      awayCode,
      homeScore,
      awayScore,
      homePenaltyScore,
      awayPenaltyScore,
      labels: match.PlaceHolderA && match.PlaceHolderB ? [match.PlaceHolderA, match.PlaceHolderB] : undefined,
      completed: lifecycle.completed,
      live: lifecycle.live,
      status: lifecycle.status,
      resultStatus: lifecycle.resultStatus,
      winnerCode
    });
  });

  return [...fixtures.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
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
      const homeScore = getMatchScore(match, "Home");
      const awayScore = getMatchScore(match, "Away");
      const hasScore = homeScore !== null && awayScore !== null;
      const lifecycle = getFixtureLifecycle(match, hasScore);
      fixtures.set(match.IdMatch, {
        id: match.IdMatch,
        groupId,
        kickoff: getMatchKickoff(match),
        homeCode,
        awayCode,
        homeScore,
        awayScore,
        completed: lifecycle.completed,
        live: lifecycle.live,
        status: lifecycle.status,
        resultStatus: lifecycle.resultStatus
      });
    });
  });

  return [...fixtures.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

function calculateProjectedStats(fixtures: GroupFixture[], predictions: ScorePredictions) {
  const projected = Object.fromEntries(allTeams.map((team) => [team.code, { ...emptyStats }])) as StatsMap;

  fixtures.forEach((fixture) => {
    const predicted = predictions[fixture.id];
    const liveNow = isFixtureLiveNow(fixture);
    const home = fixture.completed ? fixture.homeScore : liveNow ? undefined : predicted?.home;
    const away = fixture.completed ? fixture.awayScore : liveNow ? undefined : predicted?.away;
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

function hasPlayedTableData(stats: StatsMap) {
  return allTeams.some((team) => (stats[team.code]?.mp ?? 0) > 0);
}

function buildRankedGroupOrderFromStats(stats: StatsMap): GroupOrder {
  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      [...group.teams]
        .sort((left, right) => compareTeamsByProjectedStats(left, right, stats))
        .map((team) => team.name)
    ])
  ) as GroupOrder;
}

function rankThirdNamesForOrder(order: GroupOrder, stats: StatsMap) {
  return groups
    .map((group) => findTeam(order[group.id]?.[2]))
    .filter((team): team is Team => Boolean(team))
    .sort((left, right) => compareTeamsByProjectedStats(left, right, stats))
    .map((team) => team.name);
}

function thirdNamesForOrder(order: GroupOrder) {
  return groups
    .map((group) => order[group.id]?.[2])
    .filter((teamName): teamName is string => Boolean(teamName));
}

function groupOrderKey(order: GroupOrder) {
  return groups.map((group) => (order[group.id] ?? []).join(",")).join("|");
}

function sameGroupOrder(left: GroupOrder, right: GroupOrder) {
  return groupOrderKey(left) === groupOrderKey(right);
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

type GroupOutcomeState = {
  order: string[];
  stats: StatsMap;
  outcomeSummary: string[];
};

type QualificationRoute = {
  key: string;
  label: string;
  position: number;
  status: "automatic" | "third";
  scenarioCount: number;
  pointsRange: [number, number];
  gdRange: [number, number];
  matchNumbers: number[];
  opponentSlotLabels: string[];
  possibleOpponents: Team[];
  slotLabel: string;
  isPositionLocked: boolean;
  isFinalRoute: boolean;
};

type RoundOf32TeamScenarioPreview = {
  team: Team;
  currentPosition: number;
  currentStats: TeamStats;
  routes: QualificationRoute[];
};

type ResultOutcome = "home" | "draw" | "away";

const resultOutcomes: ResultOutcome[] = ["home", "draw", "away"];

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

const bracketRoundDefinitions: Array<{ key: BracketRoundKey; label: string; numbers: number[] }> = [
  { key: "round32", label: "Round of 32", numbers: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88] },
  { key: "round16", label: "Round of 16", numbers: [89, 90, 91, 92, 93, 94, 95, 96] },
  { key: "quarterFinals", label: "Quarter-final", numbers: [97, 98, 99, 100] },
  { key: "semiFinals", label: "Semi-final", numbers: [101, 102] },
  { key: "final", label: "Final", numbers: [104] }
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

function buildRoundOf32FromKnockoutFixtures(fixtures: KnockoutFixture[], fallbackRoundOf32: Map<number, OfficialMatch>) {
  const next = new Map(fallbackRoundOf32);

  fixtures.forEach((fixture) => {
    if (!fixture.number || fixture.number < 73 || fixture.number > 88) return;
    const home = findTeamByCode(fixture.homeCode);
    const away = findTeamByCode(fixture.awayCode);
    if (!home || !away) return;
    const fallback = fallbackRoundOf32.get(fixture.number);
    next.set(fixture.number, {
      number: fixture.number,
      teams: [home, away],
      labels: [
        fixture.labels?.[0] ?? fallback?.labels[0] ?? "TBD",
        fixture.labels?.[1] ?? fallback?.labels[1] ?? "TBD"
      ]
    });
  });

  return next;
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

function matchHasTeamPair(match: OfficialMatch, homeCode: string, awayCode: string) {
  const codes = match.teams.map((team) => team?.code).filter((code): code is string => Boolean(code));
  return codes.length === 2 && codes.includes(homeCode) && codes.includes(awayCode);
}

function getKnockoutFixtureForMatch(
  matchNumber: number,
  fixtures: KnockoutFixture[],
  roundOf32: Map<number, OfficialMatch>,
  officialPicks: BracketPicks
) {
  const direct = fixtures.find((fixture) => fixture.number === matchNumber);
  if (direct) return direct;

  const match = resolveOfficialMatch(matchNumber, roundOf32, officialPicks);
  const [teamA, teamB] = match.teams;
  if (!teamA || !teamB) return undefined;

  return fixtures.find((fixture) => !fixture.number && matchHasTeamPair(match, fixture.homeCode, fixture.awayCode));
}

function buildOfficialKnockoutPicks(fixtures: KnockoutFixture[], roundOf32: Map<number, OfficialMatch>) {
  const officialPicks: BracketPicks = {};

  officialPickOrder.forEach((matchNumber) => {
    const fixture = getKnockoutFixtureForMatch(matchNumber, fixtures, roundOf32, officialPicks);
    if (!fixture?.completed || !fixture.winnerCode) return;

    const winner = findTeamByCode(fixture.winnerCode);
    if (!winner) return;

    const match = resolveOfficialMatch(matchNumber, roundOf32, officialPicks);
    if (match.teams.some((team) => team?.code === winner.code)) {
      officialPicks[`m${matchNumber}`] = winner.name;
    }
  });

  return officialPicks;
}

function buildPredictionAccuracy(predictionPicks: BracketPicks, officialPicks: BracketPicks): PredictionAccuracy {
  const rounds = bracketRoundDefinitions.map((round) => {
    const completed = round.numbers.filter((matchNumber) => Boolean(officialPicks[`m${matchNumber}`]));
    const correct = completed.filter((matchNumber) => predictionPicks[`m${matchNumber}`] === officialPicks[`m${matchNumber}`]).length;
    return {
      key: round.key,
      label: round.label,
      correct,
      completed: completed.length,
      total: round.numbers.length
    };
  });
  const completed = rounds.reduce((total, round) => total + round.completed, 0);
  const correct = rounds.reduce((total, round) => total + round.correct, 0);
  return {
    rounds,
    completed,
    correct,
    percentage: completed ? Math.round((correct / completed) * 100) : 0,
    finalCorrect: officialPicks.m104 ? predictionPicks.m104 === officialPicks.m104 : null
  };
}

function getFixtureStatusLabel(fixture?: KnockoutFixture) {
  if (!fixture) return "Upcoming";
  if (fixture.completed) return "Completed";
  if (fixture.live) return "Live";
  return "Upcoming";
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

function isSlotPositionLocked(slotLabel: string, fixtures: GroupFixture[]) {
  const sourceGroups = getSlotSourceGroups(slotLabel);
  return sourceGroups.length > 0 && sourceGroups.every((groupId) => hasGroupCompletedAllMatches(groupId, fixtures));
}

function isRoundOf32RouteFixed(slotLabel: string, opponentSlotLabels: string[], fixtures: GroupFixture[]) {
  if (opponentSlotLabels.length !== 1) return false;
  const labels = [slotLabel, ...opponentSlotLabels];

  if (labels.some((label) => label.startsWith("3"))) {
    return hasEveryGroupCompletedAllMatches(fixtures);
  }

  const sourceGroups = labels.flatMap(getSlotSourceGroups);
  return sourceGroups.length > 0 && sourceGroups.every((groupId) => hasGroupCompletedAllMatches(groupId, fixtures));
}

function getRouteLabel(status: "automatic" | "third", position: number, isPositionLocked: boolean, isFinalRoute: boolean) {
  if (isFinalRoute) return "Final route";
  if (isPositionLocked) return status === "third" ? "Finished 3rd" : `Finished ${formatOrdinal(position)}`;
  return status === "third" ? "Can qualify as 3rd" : `Can finish ${formatOrdinal(position)}`;
}

function getRouteMetaLabel(route: QualificationRoute) {
  const certainty = route.isFinalRoute
    ? "Final Round of 32 matchup"
    : route.isPositionLocked
      ? `${formatOrdinal(route.position)} place locked`
      : `${route.scenarioCount} table combination${route.scenarioCount === 1 ? "" : "s"}`;

  return `${certainty} · Pts ${formatRange(route.pointsRange)} · GD ${formatRange(route.gdRange)} · ${route.status === "third" ? "Best-third route" : "Automatic route"}`;
}

function getPreviewRouteNote(preview: RoundOf32TeamScenarioPreview, manualSimulationMode: boolean) {
  if (manualSimulationMode) return "This route is taken directly from your current Round of 32 bracket mapping.";
  if (preview.routes.every((route) => route.isFinalRoute)) return "This matchup follows the current FIFA Round of 32 mapping.";
  if (preview.routes.some((route) => routeInvolvesThirdPlace(route.slotLabel, route.opponentSlotLabels))) return "The team position may be set, but the third-place table can still change this Round of 32 route.";
  if (preview.routes.every((route) => route.isPositionLocked)) return "This team has finished its group position; remaining uncertainty is only the opponent route.";
  return "Possible route count is based on all result combinations for the remaining matches in this group.";
}

function getPreviewPillLabel(preview: RoundOf32TeamScenarioPreview) {
  if (preview.routes.every((route) => route.isFinalRoute)) return preview.routes.length === 1 ? "Final route" : "Final routes";
  if (preview.routes.every((route) => route.isPositionLocked)) return "Position locked";
  return `${preview.routes.length} route${preview.routes.length === 1 ? "" : "s"}`;
}

function getPreviewPillClass(preview: RoundOf32TeamScenarioPreview) {
  if (preview.routes.every((route) => route.isFinalRoute)) return "fixed";
  if (preview.routes.every((route) => route.isPositionLocked)) return "locked";
  return "variable";
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

function hasFixtureScore(fixture: GroupFixture) {
  return fixture.homeScore !== null && fixture.awayScore !== null;
}

function isFixtureLiveNow(fixture: GroupFixture, now = Date.now()) {
  const kickoffTime = new Date(fixture.kickoff).getTime();
  const hasValidKickoff = Number.isFinite(kickoffTime);
  const hasKickedOff = hasValidKickoff && kickoffTime <= now;
  const isInsideLiveWindow = hasKickedOff && now - kickoffTime <= liveMatchWindowMs;
  const resultStatus = Number(fixture.resultStatus ?? 0);
  const isExplicitFinal = fixture.status === "completed" || resultStatus >= 4;
  const statusLooksLive = fixture.status === "live" || fixture.live || (resultStatus > 0 && resultStatus < 4);

  return !isExplicitFinal && (statusLooksLive || isInsideLiveWindow);
}

function getFixtureDisplayScore(fixture: GroupFixture): [number, number] | null {
  if (fixture.homeScore !== null && fixture.awayScore !== null) return [fixture.homeScore, fixture.awayScore];
  if (isFixtureLiveNow(fixture)) return [fixture.homeScore ?? 0, fixture.awayScore ?? 0];
  return null;
}

function getLiveFixtureForTeam(team: Team, fixtures: GroupFixture[]) {
  return fixtures.find((fixture) =>
    isFixtureLiveNow(fixture) &&
    (fixture.homeCode === team.code || fixture.awayCode === team.code)
  );
}

function cloneStatsMap(stats: StatsMap) {
  return Object.fromEntries(
    allTeams.map((team) => [team.code, { ...(stats[team.code] ?? emptyStats) }])
  ) as StatsMap;
}

function applyResultOutcome(stats: StatsMap, fixture: GroupFixture, outcome: ResultOutcome) {
  const homeStats = stats[fixture.homeCode];
  const awayStats = stats[fixture.awayCode];
  if (!homeStats || !awayStats) return;

  homeStats.mp += 1;
  awayStats.mp += 1;

  if (outcome === "home") {
    homeStats.w += 1;
    homeStats.pts += 3;
    awayStats.l += 1;
  } else if (outcome === "away") {
    awayStats.w += 1;
    awayStats.pts += 3;
    homeStats.l += 1;
  } else {
    homeStats.d += 1;
    awayStats.d += 1;
    homeStats.pts += 1;
    awayStats.pts += 1;
  }
}

function formatOutcomeLabel(fixture: GroupFixture, outcome: ResultOutcome) {
  const home = findTeamByCode(fixture.homeCode);
  const away = findTeamByCode(fixture.awayCode);
  if (!home || !away) return outcome;
  if (outcome === "home") return `${home.code} win`;
  if (outcome === "away") return `${away.code} win`;
  return `${home.code}-${away.code} draw`;
}

function enumerateGroupOutcomeStates(group: Group, fixtures: GroupFixture[], stats: StatsMap): GroupOutcomeState[] {
  const remainingFixtures = fixtures
    .filter((fixture) => fixture.groupId === group.id && !fixture.completed)
    .sort((left, right) => left.kickoff.localeCompare(right.kickoff));
  const states: GroupOutcomeState[] = [];

  function walk(index: number, currentStats: StatsMap, outcomeSummary: string[]) {
    if (index >= remainingFixtures.length) {
      states.push({
        order: [...group.teams]
          .sort((left, right) => compareTeamsByProjectedStats(left, right, currentStats))
          .map((team) => team.name),
        stats: currentStats,
        outcomeSummary
      });
      return;
    }

    const fixture = remainingFixtures[index];
    resultOutcomes.forEach((outcome) => {
      const nextStats = cloneStatsMap(currentStats);
      applyResultOutcome(nextStats, fixture, outcome);
      walk(index + 1, nextStats, [...outcomeSummary, formatOutcomeLabel(fixture, outcome)]);
    });
  }

  walk(0, cloneStatsMap(stats), []);
  return states;
}

function buildGroupOutcomeMap(fixtures: GroupFixture[], stats: StatsMap) {
  return Object.fromEntries(
    groups.map((group) => [group.id, enumerateGroupOutcomeStates(group, fixtures, stats)])
  ) as Record<string, GroupOutcomeState[]>;
}

function compareStatsForRanking(left: TeamStats, right: TeamStats) {
  return (
    right.pts - left.pts ||
    right.gd - left.gd ||
    right.gf - left.gf
  );
}

function getThirdCandidateForState(groupId: string, state: GroupOutcomeState) {
  const team = findTeam(state.order[2]);
  if (!team) return undefined;
  return { groupId, team, stats: state.stats[team.code] ?? emptyStats };
}

function canThirdPlaceStateQualify(groupId: string, state: GroupOutcomeState, outcomeMap: Record<string, GroupOutcomeState[]>) {
  const candidate = getThirdCandidateForState(groupId, state);
  if (!candidate) return false;

  const guaranteedAbove = groups
    .filter((group) => group.id !== groupId)
    .filter((group) => {
      const otherThirds = outcomeMap[group.id]
        .map((otherState) => getThirdCandidateForState(group.id, otherState))
        .filter((item): item is { groupId: string; team: Team; stats: TeamStats } => Boolean(item));
      return otherThirds.length > 0 && otherThirds.every((other) => compareStatsForRanking(other.stats, candidate.stats) < 0);
    }).length;

  return guaranteedAbove < 8;
}

function isThirdCandidateGuaranteedToQualify(groupId: string, candidate: { team: Team; stats: TeamStats }, outcomeMap: Record<string, GroupOutcomeState[]>) {
  const groupsThatCanFinishAbove = groups
    .filter((group) => group.id !== groupId)
    .filter((group) =>
      outcomeMap[group.id]
        ?.map((state) => getThirdCandidateForState(group.id, state))
        .some((other) => other && compareStatsForRanking(other.stats, candidate.stats) <= 0)
    ).length;

  return groupsThatCanFinishAbove < 8;
}

function getThirdGroupStatuses(outcomeMap: Record<string, GroupOutcomeState[]>) {
  return Object.fromEntries(
    groups.map((group) => {
      const candidates = (outcomeMap[group.id] ?? [])
        .map((state) => getThirdCandidateForState(group.id, state))
        .filter((candidate): candidate is { groupId: string; team: Team; stats: TeamStats } => Boolean(candidate));
      const possible = (outcomeMap[group.id] ?? []).some((state) => canThirdPlaceStateQualify(group.id, state, outcomeMap));
      const guaranteed = candidates.length > 0 && candidates.every((candidate) =>
        isThirdCandidateGuaranteedToQualify(group.id, candidate, outcomeMap)
      );
      const thirdTeamNames = new Set(candidates.map((candidate) => candidate.team.name));

      return [group.id, {
        possible,
        guaranteed,
        thirdTeamLocked: thirdTeamNames.size === 1
      }];
    })
  ) as Record<string, { possible: boolean; guaranteed: boolean; thirdTeamLocked: boolean }>;
}
function teamCanFinishPosition(states: GroupOutcomeState[], teamName: string, position: number) {
  return states.some((state) => state.order[position - 1] === teamName);
}

function possibleTeamsForPosition(outcomeMap: Record<string, GroupOutcomeState[]>, groupId: string, position: number) {
  const names = new Set<string>();
  outcomeMap[groupId]?.forEach((state) => {
    const name = state.order[position - 1];
    if (name) names.add(name);
  });
  return [...names].map(findTeam).filter((team): team is Team => Boolean(team));
}

function teamCanQualifyAsThird(groupId: string, teamName: string, outcomeMap: Record<string, GroupOutcomeState[]>) {
  return outcomeMap[groupId]?.some((state) =>
    state.order[2] === teamName && canThirdPlaceStateQualify(groupId, state, outcomeMap)
  ) ?? false;
}

function possibleTeamsForQualifiedThirdGroup(outcomeMap: Record<string, GroupOutcomeState[]>, groupId: string) {
  const names = new Set<string>();
  outcomeMap[groupId]?.forEach((state) => {
    const name = state.order[2];
    if (name && canThirdPlaceStateQualify(groupId, state, outcomeMap)) names.add(name);
  });
  return [...names].map(findTeam).filter((team): team is Team => Boolean(team));
}

function getTeamStatesForPosition(states: GroupOutcomeState[], teamName: string, position: number) {
  return states.filter((state) => state.order[position - 1] === teamName);
}

function getTeamQualifiedThirdStates(groupId: string, states: GroupOutcomeState[], teamName: string, outcomeMap: Record<string, GroupOutcomeState[]>) {
  return states.filter((state) =>
    state.order[2] === teamName && canThirdPlaceStateQualify(groupId, state, outcomeMap)
  );
}

function getStatRange(states: GroupOutcomeState[], team: Team, stat: keyof Pick<TeamStats, "pts" | "gd">): [number, number] {
  const values = states.map((state) => state.stats[team.code]?.[stat] ?? 0);
  return [Math.min(...values), Math.max(...values)];
}

function uniqueTeams(teams: Team[]) {
  return [...new Map(teams.map((team) => [team.name, team])).values()];
}

const automaticRoundOf32Slots: Record<string, { matchNumber: number; opponentLabel?: string; thirdOpponentForWinner?: keyof ReturnType<typeof getAnnexCAllocation> }> = {
  "2A": { matchNumber: 73, opponentLabel: "2B" },
  "2B": { matchNumber: 73, opponentLabel: "2A" },
  "1E": { matchNumber: 74, thirdOpponentForWinner: "E" },
  "1F": { matchNumber: 75, opponentLabel: "2C" },
  "2C": { matchNumber: 75, opponentLabel: "1F" },
  "1C": { matchNumber: 76, opponentLabel: "2F" },
  "2F": { matchNumber: 76, opponentLabel: "1C" },
  "1I": { matchNumber: 77, thirdOpponentForWinner: "I" },
  "2E": { matchNumber: 78, opponentLabel: "2I" },
  "2I": { matchNumber: 78, opponentLabel: "2E" },
  "1A": { matchNumber: 79, thirdOpponentForWinner: "A" },
  "1L": { matchNumber: 80, thirdOpponentForWinner: "L" },
  "1D": { matchNumber: 81, thirdOpponentForWinner: "D" },
  "1G": { matchNumber: 82, thirdOpponentForWinner: "G" },
  "2K": { matchNumber: 83, opponentLabel: "2L" },
  "2L": { matchNumber: 83, opponentLabel: "2K" },
  "1H": { matchNumber: 84, opponentLabel: "2J" },
  "2J": { matchNumber: 84, opponentLabel: "1H" },
  "1B": { matchNumber: 85, thirdOpponentForWinner: "B" },
  "1J": { matchNumber: 86, opponentLabel: "2H" },
  "2H": { matchNumber: 86, opponentLabel: "1J" },
  "1K": { matchNumber: 87, thirdOpponentForWinner: "K" },
  "2D": { matchNumber: 88, opponentLabel: "2G" },
  "2G": { matchNumber: 88, opponentLabel: "2D" }
};

function chooseGroupSets(values: string[], size: number, required?: string) {
  const results: string[][] = [];
  const sorted = [...values].sort();

  function walk(start: number, picked: string[]) {
    if (picked.length === size) {
      if (!required || picked.includes(required)) results.push([...picked]);
      return;
    }
    for (let index = start; index < sorted.length; index += 1) {
      picked.push(sorted[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  }

  walk(0, []);
  return results;
}

function getPossibleThirdQualifyingGroups(outcomeMap: Record<string, GroupOutcomeState[]>) {
  return groups
    .filter((group) => outcomeMap[group.id].some((state) => canThirdPlaceStateQualify(group.id, state, outcomeMap)))
    .map((group) => group.id);
}

function chooseQualifyingThirdGroupSets(possibleThirdGroups: string[], guaranteedThirdGroups: string[], requiredGroup?: string) {
  const required = new Set(guaranteedThirdGroups);
  if (requiredGroup) required.add(requiredGroup);
  if ([...required].some((groupId) => !possibleThirdGroups.includes(groupId)) || required.size > 8) return [];

  const optionalGroups = possibleThirdGroups.filter((groupId) => !required.has(groupId));
  return chooseGroupSets(optionalGroups, 8 - required.size).map((optionalSet) =>
    [...required, ...optionalSet].sort()
  );
}

function getPossibleThirdSourcesForWinner(
  winnerGroup: keyof ReturnType<typeof getAnnexCAllocation>,
  possibleThirdGroups: string[],
  guaranteedThirdGroups: string[]
) {
  const sources = new Set<string>();
  chooseQualifyingThirdGroupSets(possibleThirdGroups, guaranteedThirdGroups).forEach((groupSet) => {
    try {
      sources.add(getAnnexCAllocation(groupSet)[winnerGroup]);
    } catch {
      // Ignore impossible Annex C keys while exploring broad possibilities.
    }
  });
  return [...sources];
}

function getPossibleWinnerGroupsForThird(thirdGroupId: string, possibleThirdGroups: string[], guaranteedThirdGroups: string[]) {
  const winners = new Set<keyof ReturnType<typeof getAnnexCAllocation>>();
  chooseQualifyingThirdGroupSets(possibleThirdGroups, guaranteedThirdGroups, thirdGroupId).forEach((groupSet) => {
    try {
      const allocation = getAnnexCAllocation(groupSet);
      Object.entries(allocation).forEach(([winnerGroup, sourceGroup]) => {
        if (sourceGroup === thirdGroupId) winners.add(winnerGroup as keyof ReturnType<typeof getAnnexCAllocation>);
      });
    } catch {
      // Ignore impossible Annex C keys while exploring broad possibilities.
    }
  });
  return [...winners];
}

function buildAutomaticRouteOpponents(
  slotLabel: string,
  outcomeMap: Record<string, GroupOutcomeState[]>,
  possibleThirdGroups: string[],
  guaranteedThirdGroups: string[]
) {
  const slot = automaticRoundOf32Slots[slotLabel];
  if (!slot) return { matchNumbers: [] as number[], opponentSlotLabels: [] as string[], possibleOpponents: [] as Team[] };

  if (slot.opponentLabel) {
    const position = Number(slot.opponentLabel.charAt(0));
    const groupId = slot.opponentLabel.slice(1);
    return {
      matchNumbers: [slot.matchNumber],
      opponentSlotLabels: [slot.opponentLabel],
      possibleOpponents: possibleTeamsForPosition(outcomeMap, groupId, position)
    };
  }

  const sourceGroups = getPossibleThirdSourcesForWinner(slot.thirdOpponentForWinner!, possibleThirdGroups, guaranteedThirdGroups);
  return {
    matchNumbers: [slot.matchNumber],
    opponentSlotLabels: sourceGroups.map((groupId) => `3${groupId}`),
    possibleOpponents: uniqueTeams(sourceGroups.flatMap((groupId) => possibleTeamsForQualifiedThirdGroup(outcomeMap, groupId)))
  };
}

function buildThirdRouteOpponents(
  groupId: string,
  outcomeMap: Record<string, GroupOutcomeState[]>,
  possibleThirdGroups: string[],
  guaranteedThirdGroups: string[]
) {
  const winnerGroups = getPossibleWinnerGroupsForThird(groupId, possibleThirdGroups, guaranteedThirdGroups);
  const matchNumbers = winnerGroups
    .map((winnerGroup) => automaticRoundOf32Slots[`1${winnerGroup}`]?.matchNumber)
    .filter((matchNumber): matchNumber is number => Boolean(matchNumber));
  return {
    matchNumbers: [...new Set(matchNumbers)],
    opponentSlotLabels: winnerGroups.map((winnerGroup) => `1${winnerGroup}`),
    possibleOpponents: uniqueTeams(winnerGroups.flatMap((winnerGroup) => possibleTeamsForPosition(outcomeMap, winnerGroup, 1)))
  };
}

function routeInvolvesThirdPlace(slotLabel: string, opponentSlotLabels: string[]) {
  return slotLabel.startsWith("3") || opponentSlotLabels.some((label) => label.startsWith("3"));
}

function getCurrentRoundOf32Route(team: Team, slotLabel: string, roundOf32: Map<number, OfficialMatch>) {
  const currentSlot = getRoundOf32SlotPreview(team, roundOf32);
  if (!currentSlot || currentSlot.slotLabel !== slotLabel || !currentSlot.opponent) return null;

  return {
    matchNumbers: [currentSlot.matchNumber],
    opponentSlotLabels: [currentSlot.opponentSlotLabel],
    possibleOpponents: [currentSlot.opponent]
  };
}

function getThirdGroupIdsFromRoute(slotLabel: string, opponentSlotLabels: string[]) {
  return [slotLabel, ...opponentSlotLabels]
    .filter((label) => label.startsWith("3"))
    .map((label) => label.slice(1));
}

function getLockedCurrentThirdRoute(
  team: Team,
  slotLabel: string,
  opponents: { matchNumbers: number[]; opponentSlotLabels: string[]; possibleOpponents: Team[] },
  isPositionLocked: boolean,
  thirdGroupStatuses: Record<string, { possible: boolean; guaranteed: boolean; thirdTeamLocked: boolean }>,
  roundOf32: Map<number, OfficialMatch>
) {
  if (!isPositionLocked || !routeInvolvesThirdPlace(slotLabel, opponents.opponentSlotLabels)) return null;

  const currentRoute = getCurrentRoundOf32Route(team, slotLabel, roundOf32);
  if (!currentRoute) return null;

  const thirdGroupIds = getThirdGroupIdsFromRoute(slotLabel, currentRoute.opponentSlotLabels);
  const thirdGroupsAreGuaranteed = thirdGroupIds.length > 0 && thirdGroupIds.every((groupId) => {
    const status = thirdGroupStatuses[groupId];
    return status?.guaranteed && status.thirdTeamLocked;
  });
  if (!thirdGroupsAreGuaranteed) return null;

  const routeStillMapsToCurrentSlot = opponents.opponentSlotLabels.length === 1 &&
    opponents.opponentSlotLabels[0] === currentRoute.opponentSlotLabels[0];
  const routeStillMapsToCurrentOpponent = opponents.possibleOpponents.length === 1 &&
    opponents.possibleOpponents[0]?.name === currentRoute.possibleOpponents[0]?.name;

  return routeStillMapsToCurrentSlot && routeStillMapsToCurrentOpponent ? currentRoute : null;
}
function buildQualificationRoute({
  team,
  states,
  label,
  key,
  position,
  status,
  matchNumbers,
  opponentSlotLabels,
  possibleOpponents,
  slotLabel,
  isPositionLocked,
  isFinalRoute
}: {
  team: Team;
  states: GroupOutcomeState[];
  label: string;
  key: string;
  position: number;
  status: "automatic" | "third";
  matchNumbers: number[];
  opponentSlotLabels: string[];
  possibleOpponents: Team[];
  slotLabel: string;
  isPositionLocked: boolean;
  isFinalRoute: boolean;
}): QualificationRoute | null {
  if (states.length === 0) return null;
  return {
    key,
    label,
    position,
    status,
    scenarioCount: states.length,
    pointsRange: getStatRange(states, team, "pts"),
    gdRange: getStatRange(states, team, "gd"),
    matchNumbers,
    opponentSlotLabels,
    possibleOpponents,
    slotLabel,
    isPositionLocked,
    isFinalRoute
  };
}
function buildManualGroupOpponentPreviews({
  group,
  groupOrder,
  stats,
  roundOf32
}: {
  group: Group;
  groupOrder: GroupOrder;
  stats: StatsMap;
  roundOf32: Map<number, OfficialMatch>;
}): RoundOf32TeamScenarioPreview[] {
  const currentOrder = groupOrder[group.id] ?? group.teams.map((team) => team.name);

  return currentOrder
    .map((teamName, index) => {
      const team = findTeam(teamName);
      if (!team) return null;

      const slot = getRoundOf32SlotPreview(team, roundOf32);
      if (!slot) return null;

      const currentStats = stats[team.code] ?? emptyStats;
      const status = slot.slotLabel.startsWith("3") ? "third" : "automatic";
      const currentPosition = index + 1;

      return {
        team,
        currentPosition,
        currentStats,
        routes: [{
          key: `${team.code}-${slot.slotLabel}-manual`,
          label: status === "third" ? "Manual 3rd-place route" : `Manual ${formatOrdinal(currentPosition)} route`,
          position: currentPosition,
          status,
          scenarioCount: 1,
          pointsRange: [currentStats.pts, currentStats.pts],
          gdRange: [currentStats.gd, currentStats.gd],
          matchNumbers: [slot.matchNumber],
          opponentSlotLabels: [slot.opponentSlotLabel],
          possibleOpponents: slot.opponent ? [slot.opponent] : [],
          slotLabel: slot.slotLabel,
          isPositionLocked: false,
          isFinalRoute: false
        }]
      };
    })
    .filter((preview): preview is RoundOf32TeamScenarioPreview => Boolean(preview));
}

function buildGroupOpponentPreviews({
  group,
  groupOrder,
  stats,
  fixtures,
  roundOf32,
  manualSimulationMode
}: {
  group: Group;
  groupOrder: GroupOrder;
  stats: StatsMap;
  fixtures: GroupFixture[];
  roundOf32: Map<number, OfficialMatch>;
  manualSimulationMode: boolean;
}): RoundOf32TeamScenarioPreview[] {
  if (manualSimulationMode) {
    return buildManualGroupOpponentPreviews({ group, groupOrder, stats, roundOf32 });
  }

  const outcomeMap = buildGroupOutcomeMap(fixtures, stats);
  const thirdGroupStatuses = getThirdGroupStatuses(outcomeMap);
  const possibleThirdGroups = getPossibleThirdQualifyingGroups(outcomeMap);
  const guaranteedThirdGroups = groups.filter((group) => thirdGroupStatuses[group.id]?.guaranteed).map((group) => group.id);
  const groupStates = outcomeMap[group.id] ?? [];
  const currentOrder = groupOrder[group.id] ?? group.teams.map((team) => team.name);

  return group.teams
    .map((team) => {
      const currentStats = stats[team.code] ?? emptyStats;
      const currentPosition = currentOrder.indexOf(team.name) + 1 || 4;
      const routes: QualificationRoute[] = [];

      [1, 2].forEach((position) => {
        const positionStates = getTeamStatesForPosition(groupStates, team.name, position);
        const slotLabel = `${position}${group.id}`;
        const broadOpponents = buildAutomaticRouteOpponents(slotLabel, outcomeMap, possibleThirdGroups, guaranteedThirdGroups);
        const isPositionLocked = isSlotPositionLocked(slotLabel, fixtures);
        const currentOpponents = getLockedCurrentThirdRoute(team, slotLabel, broadOpponents, isPositionLocked, thirdGroupStatuses, roundOf32);
        const opponents = currentOpponents ?? broadOpponents;
        const isFinalRoute = Boolean(currentOpponents) || isRoundOf32RouteFixed(slotLabel, opponents.opponentSlotLabels, fixtures);
        const route = buildQualificationRoute({
          team,
          states: positionStates,
          label: getRouteLabel("automatic", position, isPositionLocked, isFinalRoute),
          key: `${team.code}-${slotLabel}`,
          position,
          status: "automatic",
          slotLabel,
          isPositionLocked,
          isFinalRoute,
          ...opponents
        });
        if (route) routes.push(route);
      });

      const thirdStates = getTeamQualifiedThirdStates(group.id, groupStates, team.name, outcomeMap);
      const thirdSlotLabel = `3${group.id}`;
      const broadThirdOpponents = buildThirdRouteOpponents(group.id, outcomeMap, possibleThirdGroups, guaranteedThirdGroups);
      const isThirdPositionLocked = isSlotPositionLocked(thirdSlotLabel, fixtures);
      const currentThirdOpponents = getLockedCurrentThirdRoute(team, thirdSlotLabel, broadThirdOpponents, isThirdPositionLocked, thirdGroupStatuses, roundOf32);
      const thirdOpponents = currentThirdOpponents ?? broadThirdOpponents;
      const isThirdFinalRoute = Boolean(currentThirdOpponents) || isRoundOf32RouteFixed(thirdSlotLabel, thirdOpponents.opponentSlotLabels, fixtures);
      const thirdRoute = buildQualificationRoute({
        team,
        states: thirdStates,
        label: getRouteLabel("third", 3, isThirdPositionLocked, isThirdFinalRoute),
        key: `${team.code}-3${group.id}`,
        position: 3,
        status: "third",
        slotLabel: thirdSlotLabel,
        isPositionLocked: isThirdPositionLocked,
        isFinalRoute: isThirdFinalRoute,
        ...thirdOpponents
      });
      if (thirdRoute) routes.push(thirdRoute);

      if (routes.length === 0) return null;
      return { team, currentPosition, currentStats, routes };
    })
    .filter((preview): preview is RoundOf32TeamScenarioPreview => Boolean(preview));
}

function LiveTablePredictorApp() {
  const initialOrder = useMemo(loadGroupOrder, []);
  const cache = useMemo(loadCachedStats, []);
  const rankingCache = useMemo(loadCachedRankings, []);
  const [view, setView] = useState<View>("groups");
  const [bracketMode, setBracketMode] = useState<BracketMode>(loadBracketMode);
  const [groupOrder, setGroupOrder] = useState<GroupOrder>(initialOrder);
  const [thirdOrder, setThirdOrder] = useState(() => loadThirdOrder(initialOrder));
  const [predictionPaths, setPredictionPaths] = useState<PredictionPath[]>(loadPredictionPaths);
  const [activePredictionPathId, setActivePredictionPathId] = useState(() => loadActivePredictionPathId(predictionPaths));
  const [autoPickSnapshot, setAutoPickSnapshot] = useState<BracketPicks | null>(loadAutoPickSnapshot);
  const [autoPickCache, setAutoPickCache] = useState<AutoPickCache | null>(loadAutoPickCache);
  const [stats, setStats] = useState<StatsMap>(cache.stats);
  const [rankings, setRankings] = useState<RankingMap>(rankingCache.rankings);
  const [fixtures, setFixtures] = useState<GroupFixture[]>(loadCachedFixtures);
  const [knockoutFixtures, setKnockoutFixtures] = useState<KnockoutFixture[]>(loadCachedKnockoutFixtures);
  const [scorePredictions, setScorePredictions] = useState<ScorePredictions>(loadScorePredictions);
  const [manualSimulationMode, setManualSimulationMode] = useState(loadManualSimulationMode);
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
      const results = payload.Results ?? [];
      const nextStats = parseFifaStandings(results);
      const nextFixtures = parseFifaFixtures(results);
      let nextKnockoutFixtures = parseFifaKnockoutFixtures(results);
      try {
        const matchesResponse = await fetch(fifaMatchesApi, {
          headers: { Accept: "application/json" },
          signal
        });
        if (matchesResponse.ok) {
          const matchesPayload = (await matchesResponse.json()) as { Results?: FifaMatchResult[] };
          const calendarKnockoutFixtures = parseFifaCalendarKnockoutFixtures(matchesPayload.Results ?? []);
          if (calendarKnockoutFixtures.length > 0) nextKnockoutFixtures = calendarKnockoutFixtures;
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
      }
      if (Object.keys(nextStats).length < 48 || nextFixtures.length < 72) {
        throw new Error("Incomplete FIFA standings response");
      }
      const updatedAt = new Date().toISOString();
      setStats(nextStats);
      setFixtures(nextFixtures);
      setKnockoutFixtures(nextKnockoutFixtures);
      setLastUpdated(updatedAt);
      setFeedState("live");
      window.localStorage.setItem(
        "fifa-live-standings-cache-v1",
        JSON.stringify({ stats: nextStats, updatedAt })
      );
      window.localStorage.setItem("fifa-live-fixtures-cache-v1", JSON.stringify(nextFixtures));
      window.localStorage.setItem("fifa-knockout-fixtures-cache-v1", JSON.stringify(nextKnockoutFixtures));
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


  useEffect(() => {
    window.localStorage.setItem("fifa-rank-predictor-groups-v1", JSON.stringify(groupOrder));
  }, [groupOrder]);

  useEffect(() => {
    window.localStorage.setItem("fifa-rank-predictor-thirds-v1", JSON.stringify(thirdOrder));
  }, [thirdOrder]);

  const activePredictionPath = useMemo(
    () => predictionPaths.find((path) => path.id === activePredictionPathId) ?? predictionPaths[0],
    [predictionPaths, activePredictionPathId]
  );
  const bracketPicks = activePredictionPath?.picks ?? {};

  useEffect(() => {
    if (predictionPaths.length > 0 && !predictionPaths.some((path) => path.id === activePredictionPathId)) {
      setActivePredictionPathId(predictionPaths[0].id);
    }
  }, [predictionPaths, activePredictionPathId]);

  useEffect(() => {
    window.localStorage.setItem("fifa-prediction-paths-v1", JSON.stringify(predictionPaths));
    window.localStorage.setItem("fifa-rank-predictor-bracket-v1", JSON.stringify(bracketPicks));
  }, [predictionPaths, bracketPicks]);

  useEffect(() => {
    window.localStorage.setItem("fifa-active-prediction-path-v1", activePredictionPathId);
  }, [activePredictionPathId]);

  useEffect(() => {
    window.localStorage.setItem("fifa-dual-bracket-mode-v1", bracketMode);
  }, [bracketMode]);

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

  useEffect(() => {
    window.localStorage.setItem("fifa-manual-simulation-mode-v1", String(manualSimulationMode));
  }, [manualSimulationMode]);

  const projectedStats = useMemo(
    () => fixtures.length ? calculateProjectedStats(fixtures, scorePredictions) : stats,
    [fixtures, scorePredictions, stats]
  );
  const hasProjectedTableData = useMemo(
    () => hasPlayedTableData(projectedStats),
    [projectedStats]
  );
  const rankedGroupOrder = useMemo(
    () => buildRankedGroupOrderFromStats(projectedStats),
    [projectedStats]
  );
  const rankedGroupOrderKey = useMemo(
    () => groupOrderKey(rankedGroupOrder),
    [rankedGroupOrder]
  );

  const activeGroupOrderKey = useMemo(
    () => groupOrderKey(groupOrder),
    [groupOrder]
  );

  useEffect(() => {
    if (!hasProjectedTableData || manualSimulationMode || sameGroupOrder(groupOrder, rankedGroupOrder)) return;
    setGroupOrder(rankedGroupOrder);
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }, [hasProjectedTableData, manualSimulationMode, rankedGroupOrderKey, activeGroupOrderKey]);

  const rankedThirdNames = useMemo(
    () => rankThirdNamesForOrder(groupOrder, projectedStats),
    [activeGroupOrderKey, projectedStats]
  );

  useEffect(() => {
    if (manualSimulationMode) return;
    setThirdOrder((current) =>
      current.join("|") === rankedThirdNames.join("|") ? current : rankedThirdNames
    );
  }, [manualSimulationMode, rankedThirdNames.join("|")]);

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
  const bracketRoundOf32 = useMemo(
    () => buildRoundOf32FromKnockoutFixtures(knockoutFixtures, roundOf32),
    [knockoutFixtures, roundOf32]
  );
  const officialPicks = useMemo(
    () => buildOfficialKnockoutPicks(knockoutFixtures, bracketRoundOf32),
    [knockoutFixtures, bracketRoundOf32]
  );
  const predictionAccuracy = useMemo(
    () => buildPredictionAccuracy(bracketPicks, officialPicks),
    [bracketPicks, officialPicks]
  );
  const activeBracketPicks = bracketMode === "official" ? officialPicks : bracketPicks;
  const roundOf32PreviewReady = hasEveryGroupReachedSecondMatch(projectedStats);
  const predictionChampion = findTeam(bracketPicks.m104);
  const officialChampion = findTeam(officialPicks.m104);
  const activeChampion = bracketMode === "official" ? officialChampion : predictionChampion;
  const knockoutPickCount = officialPickOrder.filter((matchNumber) => bracketPicks[`m${matchNumber}`]).length;

  useEffect(() => {
    setPredictionPaths((current) => {
      let changed = false;
      const now = new Date().toISOString();
      const next = current.map((path) => {
        const sanitized = sanitizeOfficialPicks(path.picks, bracketRoundOf32);
        if (JSON.stringify(sanitized) === JSON.stringify(path.picks)) return path;
        changed = true;
        return { ...path, picks: sanitized, updatedAt: now };
      });
      return changed ? next : current;
    });
  }, [bracketRoundOf32]);

  function updateActivePredictionPicks(nextPicksOrUpdater: BracketPicks | ((current: BracketPicks) => BracketPicks)) {
    setPredictionPaths((current) => {
      const activeId = current.some((path) => path.id === activePredictionPathId)
        ? activePredictionPathId
        : current[0]?.id;
      const now = new Date().toISOString();

      if (!activeId) {
        const nextPicks = typeof nextPicksOrUpdater === "function"
          ? nextPicksOrUpdater({})
          : nextPicksOrUpdater;
        const path = createPredictionPathRecord("Prediction 1", nextPicks);
        setActivePredictionPathId(path.id);
        return [path];
      }

      return current.map((path) => {
        if (path.id !== activeId) return path;
        const nextPicks = typeof nextPicksOrUpdater === "function"
          ? nextPicksOrUpdater(path.picks)
          : nextPicksOrUpdater;
        return { ...path, picks: nextPicks, updatedAt: now };
      });
    });
  }

  function createPredictionPath() {
    const path = createPredictionPathRecord(`Prediction ${predictionPaths.length + 1}`);
    setPredictionPaths((current) => [...current, path]);
    setActivePredictionPathId(path.id);
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
    setBracketMode("prediction");
  }

  function switchPredictionPath(pathId: string) {
    if (!predictionPaths.some((path) => path.id === pathId)) return;
    setActivePredictionPathId(pathId);
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
    setBracketMode("prediction");
  }

  function renamePredictionPath(pathId: string, name: string) {
    const limitedName = name.slice(0, 40);
    setPredictionPaths((current) => current.map((path) =>
      path.id === pathId ? { ...path, name: limitedName, updatedAt: new Date().toISOString() } : path
    ));
  }

  function deletePredictionPath(pathId: string) {
    const remaining = predictionPaths.filter((path) => path.id !== pathId);
    if (remaining.length === 0) {
      const replacement = createPredictionPathRecord("Prediction 1");
      setPredictionPaths([replacement]);
      setActivePredictionPathId(replacement.id);
    } else {
      setPredictionPaths(remaining);
      if (activePredictionPathId === pathId) setActivePredictionPathId(remaining[0].id);
    }
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
    setBracketMode("prediction");
  }

  function switchView(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function moveGroupTeam(groupId: string, fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex > 3 || fromIndex === toIndex) return;
    const nextGroup = [...groupOrder[groupId]];
    const [team] = nextGroup.splice(fromIndex, 1);
    nextGroup.splice(toIndex, 0, team);
    const nextGroupOrder = { ...groupOrder, [groupId]: nextGroup };
    const nextThirdNames = thirdNamesForOrder(nextGroupOrder);

    setManualSimulationMode(true);
    setGroupOrder(nextGroupOrder);
    setThirdOrder((current) => [
      ...current.filter((teamName) => nextThirdNames.includes(teamName)),
      ...nextThirdNames.filter((teamName) => !current.includes(teamName))
    ]);
    updateActivePredictionPicks({});
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function moveThirdTeam(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= thirdOrder.length || fromIndex === toIndex) return;
    setManualSimulationMode(true);
    setThirdOrder((current) => {
      const next = [...current];
      const [team] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, team);
      return next;
    });
    updateActivePredictionPicks({});
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
    setManualSimulationMode(false);
    setGroupOrder(nextGroupOrder);
    setThirdOrder(rankedThirds.map((team) => team.name));
    updateActivePredictionPicks({});
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
    setPredictionGroup(null);
  }

  function syncLiveTable() {
    setManualSimulationMode(false);
    setGroupOrder(rankedGroupOrder);
    setThirdOrder(rankThirdNamesForOrder(rankedGroupOrder, projectedStats));
    updateActivePredictionPicks({});
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function resetPredictions() {
    const defaults = defaultGroupOrder();
    setManualSimulationMode(false);
    setGroupOrder(defaults);
    setThirdOrder(groups.map((group) => defaults[group.id][2]));
    setScorePredictions({});
    setPredictionGroup(null);
    updateActivePredictionPicks({});
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function selectWinner(matchNumber: number, teamName: string) {
    if (bracketMode === "official") return;
    const pickKey = `m${matchNumber}`;
    if (bracketPicks[pickKey] === teamName) return;

    const manualBaseline = autoPickSnapshot ?? bracketPicks;
    updateActivePredictionPicks(sanitizeOfficialPicks({ ...manualBaseline, [pickKey]: teamName }, bracketRoundOf32));
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function resetMatchToOfficial(matchNumber: number) {
    const officialWinner = officialPicks[`m${matchNumber}`];
    if (!officialWinner) return;
    updateActivePredictionPicks((current) => sanitizeOfficialPicks({ ...current, [`m${matchNumber}`]: officialWinner }, bracketRoundOf32));
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function resetRoundToOfficial(roundKey: BracketRoundKey) {
    const round = bracketRoundDefinitions.find((item) => item.key === roundKey);
    if (!round) return;
    updateActivePredictionPicks((current) => {
      const next = { ...current };
      round.numbers.forEach((matchNumber) => {
        const officialWinner = officialPicks[`m${matchNumber}`];
        if (officialWinner) next[`m${matchNumber}`] = officialWinner;
        else delete next[`m${matchNumber}`];
      });
      return sanitizeOfficialPicks(next, bracketRoundOf32);
    });
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function resetBracketToOfficial() {
    updateActivePredictionPicks(sanitizeOfficialPicks(officialPicks, bracketRoundOf32));
    setAutoPickSnapshot(null);
    setAutoPickCache(null);
  }

  function autoPickBracket() {
    if (autoPickSnapshot !== null) {
      updateActivePredictionPicks(autoPickSnapshot);
      setAutoPickSnapshot(null);
      return;
    }

    const baseline = sanitizeOfficialPicks(bracketPicks, bracketRoundOf32);
    if (autoPickCache && sameBracketPicks(autoPickCache.baseline, baseline)) {
      setAutoPickSnapshot(baseline);
      updateActivePredictionPicks(autoPickCache.generated);
      return;
    }

    const next: BracketPicks = { ...baseline };
    officialPickOrder.forEach((matchNumber) => {
      const pickKey = `m${matchNumber}`;
      if (next[pickKey]) return;

      const match = resolveOfficialMatch(matchNumber, bracketRoundOf32, next);
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
    updateActivePredictionPicks(next);
  }

  function resetBracket() {
    updateActivePredictionPicks({});
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
        <Hero view={view} champion={activeChampion} />
        <ProgressBar view={view} knockoutPickCount={knockoutPickCount} champion={predictionChampion} />
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
            manualSimulationMode={manualSimulationMode}
            onSyncLiveTable={syncLiveTable}
            onReset={resetPredictions}
            onContinue={() => switchView("bracket")}
          />
        ) : (
          <KnockoutStage
            roundOf32={bracketRoundOf32}
            mode={bracketMode}
            picks={activeBracketPicks}
            predictionPicks={bracketPicks}
            predictionPaths={predictionPaths}
            activePredictionPathId={activePredictionPathId}
            officialPicks={officialPicks}
            accuracy={predictionAccuracy}
            champion={activeChampion}
            knockoutFixtures={knockoutFixtures}
            onModeChange={setBracketMode}
            onPredictionPathChange={switchPredictionPath}
            onCreatePredictionPath={createPredictionPath}
            onDeletePredictionPath={deletePredictionPath}
            onRenamePredictionPath={renamePredictionPath}
            onPick={selectWinner}
            onAutoPick={autoPickBracket}
            autoPickActive={autoPickSnapshot !== null}
            onResetMatchToOfficial={resetMatchToOfficial}
            onResetRoundToOfficial={resetRoundToOfficial}
            onResetToOfficial={resetBracketToOfficial}
            onClearPredictions={resetBracket}
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
          stats={projectedStats}
          fixtures={fixtures}
          roundOf32={roundOf32}
          manualSimulationMode={manualSimulationMode}
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
  manualSimulationMode,
  onSyncLiveTable,
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
  manualSimulationMode: boolean;
  onSyncLiveTable: () => void;
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
        <div><strong>Positions 1-2</strong><span>Qualify automatically from every group</span></div>
        <div><strong>Position 3</strong><span>Moves into your third-place ranking table</span></div>
        <div><strong>{manualSimulationMode ? "Manual simulation" : "Live statistics"}</strong><span>{manualSimulationMode ? "Live reordering is paused until you sync" : "Refresh automatically every 60 seconds"}</span></div>
      </aside>
      <div className="live-group-grid">
        {groups.map((group) => (
          <LiveGroupCard
            group={group}
            key={group.id}
            order={groupOrder[group.id]}
            bestThirdNames={bestThirdNames}
            stats={stats}
            fixtures={fixtures.filter((fixture) => fixture.groupId === group.id)}
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
        {manualSimulationMode && (
          <button className="secondary-button accent" onClick={onSyncLiveTable} type="button"><RefreshCw size={17} /> Sync live table</button>
        )}
        <div>
          <span>{manualSimulationMode ? "Manual simulation locked · Round of 32 follows your table" : "Your ranking is saved automatically"}</span>
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
  fixtures,
  onMove,
  onPredict,
  onPreviewOpponents,
  roundOf32PreviewReady
}: {
  group: Group;
  order: string[];
  bestThirdNames: Set<string>;
  stats: StatsMap;
  fixtures: GroupFixture[];
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

  const fixtureCount = fixtures.length;

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
            const liveFixture = getLiveFixtureForTeam(team, fixtures);
            const thirdQualified = index === 2 && bestThirdNames.has(teamName);
            return (
              <div
                className={`live-team-row ${index < 2 ? "automatic" : ""} ${thirdQualified ? "third-qualified" : ""} ${liveFixture ? "live-match" : ""} ${dragIndex === index ? "dragging" : ""}`}
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
                  <span className="live-team-flag-score">
                    <Flag team={team} />
                    {liveFixture && <LiveScoreBadge team={team} fixture={liveFixture} />}
                  </span>
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

function LiveScoreBadge({ team, fixture }: { team: Team; fixture: GroupFixture }) {
  const score = getFixtureDisplayScore(fixture);
  if (!score) return null;

  const isHomeTeam = fixture.homeCode === team.code;
  const [homeScore, awayScore] = score;
  const ownScore = isHomeTeam ? homeScore : awayScore;
  const opponentScore = isHomeTeam ? awayScore : homeScore;
  const opponent = findTeamByCode(isHomeTeam ? fixture.awayCode : fixture.homeCode);

  return (
    <span className="live-score-badge" title={`Live vs ${opponent?.name ?? "opponent"}`}>
      <i />
      <span>LIVE</span>
      <strong>{ownScore}-{opponentScore}</strong>
    </span>
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

function PredictionAccuracyPanel({ accuracy }: { accuracy: PredictionAccuracy }) {
  return (
    <aside className="prediction-accuracy-panel" aria-label="Prediction accuracy tracker">
      <div className="accuracy-score-card">
        <span>Prediction accuracy</span>
        <strong>{accuracy.completed ? `${accuracy.percentage}%` : "--"}</strong>
        <em>{accuracy.completed ? `${accuracy.correct}/${accuracy.completed} completed picks correct` : "Starts after knockout results"}</em>
      </div>
      <div className="accuracy-round-list">
        {accuracy.rounds.map((round) => (
          <div className="accuracy-round-row" key={round.key}>
            <span>{round.label}</span>
            <strong>{round.completed ? `${round.correct}/${round.completed}` : `0/${round.total}`}</strong>
          </div>
        ))}
      </div>
      <div className="accuracy-final-row">
        <Trophy size={15} />
        <span>Final winner correct:</span>
        <strong>{accuracy.finalCorrect === null ? "Pending" : accuracy.finalCorrect ? "Yes" : "No"}</strong>
      </div>
    </aside>
  );
}

function KnockoutStage({
  roundOf32,
  mode,
  picks,
  predictionPicks,
  predictionPaths,
  activePredictionPathId,
  officialPicks,
  accuracy,
  champion,
  knockoutFixtures,
  onModeChange,
  onPredictionPathChange,
  onCreatePredictionPath,
  onDeletePredictionPath,
  onRenamePredictionPath,
  onPick,
  onAutoPick,
  autoPickActive,
  onResetMatchToOfficial,
  onResetRoundToOfficial,
  onResetToOfficial,
  onClearPredictions,
  onBack
}: {
  roundOf32: Map<number, OfficialMatch>;
  mode: BracketMode;
  picks: BracketPicks;
  predictionPicks: BracketPicks;
  predictionPaths: PredictionPath[];
  activePredictionPathId: string;
  officialPicks: BracketPicks;
  accuracy: PredictionAccuracy;
  champion?: Team;
  knockoutFixtures: KnockoutFixture[];
  onModeChange: (mode: BracketMode) => void;
  onPredictionPathChange: (pathId: string) => void;
  onCreatePredictionPath: () => void;
  onDeletePredictionPath: (pathId: string) => void;
  onRenamePredictionPath: (pathId: string, name: string) => void;
  onPick: (matchNumber: number, teamName: string) => void;
  onAutoPick: () => void;
  autoPickActive: boolean;
  onResetMatchToOfficial: (matchNumber: number) => void;
  onResetRoundToOfficial: (roundKey: BracketRoundKey) => void;
  onResetToOfficial: () => void;
  onClearPredictions: () => void;
  onBack: () => void;
}) {
  const officialCompletedCount = Object.values(officialPicks).filter(Boolean).length;
  const isPredictionMode = mode === "prediction";
  const activePredictionPath = predictionPaths.find((path) => path.id === activePredictionPathId) ?? predictionPaths[0];

  return (
    <section className="content-section official-knockout-section dual-bracket-section">
      <header className="section-heading bracket-heading">
        <div>
          <span className="eyebrow">DUAL BRACKET MODE � M73-M104</span>
          <h2>{isPredictionMode ? "My prediction bracket" : "Official bracket"}</h2>
          <p>
            {isPredictionMode
              ? "Make private what-if picks without changing official results. Completed matches can be reset back to the official winner anytime."
              : "This view advances teams only from completed official knockout results. Upcoming and live matches stay unpicked until full-time."}
          </p>
        </div>
        <div className="bracket-tools dual-bracket-tools">
          <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft size={17} /> Predictor</button>
          <div className="dual-mode-switch" role="tablist" aria-label="Bracket mode">
            <button
              aria-selected={mode === "official"}
              className={mode === "official" ? "active" : ""}
              onClick={() => onModeChange("official")}
              role="tab"
              type="button"
            >
              Official Bracket
            </button>
            <button
              aria-selected={mode === "prediction"}
              className={mode === "prediction" ? "active" : ""}
              onClick={() => onModeChange("prediction")}
              role="tab"
              type="button"
            >
              My Prediction
            </button>
          </div>
          {isPredictionMode && (
            <>
              <button
                className={`secondary-button accent ${autoPickActive ? "undo-auto-picks" : ""}`}
                onClick={onAutoPick}
                title={autoPickActive ? "Restore your bracket to the point before auto-pick" : "Predict remaining matches from live form and FIFA ranking"}
                type="button"
              >
                {autoPickActive ? <RotateCcw size={17} /> : <Sparkles size={17} />}
                {autoPickActive ? "Undo auto-picks" : "Auto-pick remaining"}
              </button>
              <select
                aria-label="Reset a round to official results"
                className="round-reset-select"
                defaultValue=""
                onChange={(event) => {
                  const roundKey = event.currentTarget.value as BracketRoundKey;
                  if (roundKey) onResetRoundToOfficial(roundKey);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Reset round</option>
                {bracketRoundDefinitions.map((round) => (
                  <option key={round.key} value={round.key}>{round.label}</option>
                ))}
              </select>
              <button className="secondary-button" onClick={onResetToOfficial} type="button"><Check size={17} /> Reset to official</button>
              <button className="secondary-button" onClick={onClearPredictions} type="button"><RotateCcw size={17} /> Clear predictions</button>
            </>
          )}
        </div>
      </header>

      {isPredictionMode && activePredictionPath && (
        <section className="prediction-path-manager" aria-label="Saved prediction paths">
          <div className="prediction-path-copy">
            <span>Saved prediction paths</span>
            <strong>{activePredictionPath.name.trim() || "Untitled prediction"}</strong>
            <p>Create separate brackets for different what-if journeys. Each path keeps its own picks.</p>
          </div>
          <label>
            <span>Open path</span>
            <select value={activePredictionPathId} onChange={(event) => onPredictionPathChange(event.currentTarget.value)}>
              {predictionPaths.map((path) => (
                <option key={path.id} value={path.id}>{path.name.trim() || "Untitled prediction"}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Path name</span>
            <input
              maxLength={40}
              onChange={(event) => onRenamePredictionPath(activePredictionPath.id, event.currentTarget.value)}
              placeholder="Prediction name"
              type="text"
              value={activePredictionPath.name}
            />
          </label>
          <div className="prediction-path-actions">
            <button className="secondary-button accent" onClick={onCreatePredictionPath} type="button"><Sparkles size={16} /> New path</button>
            <button className="secondary-button danger" onClick={() => onDeletePredictionPath(activePredictionPath.id)} type="button"><X size={16} /> Delete path</button>
          </div>
        </section>
      )}

      <div className="dual-bracket-summary-grid">
        <article className="dual-summary-card official-sync-card">
          <span>Official sync</span>
          <strong>{officialCompletedCount} completed knockout picks</strong>
          <p>Official winners are applied only after a match is completed/full-time. Penalty winners count as match winners.</p>
        </article>
        <article className="dual-summary-card what-if-card">
          <span>What-if mode</span>
          <strong>{Object.values(predictionPicks).filter(Boolean).length} user picks saved</strong>
          <p>Your prediction bracket is private and can disagree with the real result without changing the official bracket.</p>
        </article>
        <PredictionAccuracyPanel accuracy={accuracy} />
      </div>

      {champion && (
        <article className={`compact-champion-banner ${mode === "official" ? "official-champion" : "prediction-champion"}`}>
          <Trophy size={28} />
          <span>{mode === "official" ? "Official champion" : "Your champion"}</span>
          <strong><Flag team={champion} /> {champion.name}</strong>
        </article>
      )}

      <div className={`official-bracket-shell dual-bracket-shell ${mode === "official" ? "official-mode" : "prediction-mode"}`} aria-label="FIFA World Cup 2026 knockout bracket">
        <CompactRound title="Round of 32" numbers={leftBracketMatches.round32} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="left" />
        <CompactRound title="Round of 16" numbers={leftBracketMatches.round16} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="left" />
        <CompactRound title="Quarter-final" numbers={leftBracketMatches.quarterFinals} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="left" />
        <CompactRound title="Semi-final" numbers={leftBracketMatches.semiFinals} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="left" />

        <section className="bracket-centre-column">
          <header>Finals</header>
          <div className="centre-final">
            <OfficialMatchCard
              match={resolveOfficialMatch(104, roundOf32, picks)}
              selected={picks.m104}
              predictionSelected={predictionPicks.m104}
              officialSelected={officialPicks.m104}
              fixture={getKnockoutFixtureForMatch(104, knockoutFixtures, roundOf32, officialPicks)}
              mode={mode}
              onPick={onPick}
              onResetToOfficial={onResetMatchToOfficial}
              featured
            />
          </div>
          <div className="centre-third-place">
            <span>Play-off for third place</span>
            <OfficialMatchCard
              match={resolveOfficialMatch(103, roundOf32, picks)}
              selected={picks.m103}
              predictionSelected={predictionPicks.m103}
              officialSelected={officialPicks.m103}
              fixture={getKnockoutFixtureForMatch(103, knockoutFixtures, roundOf32, officialPicks)}
              mode={mode}
              onPick={onPick}
              onResetToOfficial={onResetMatchToOfficial}
            />
          </div>
        </section>

        <CompactRound title="Semi-final" numbers={rightBracketMatches.semiFinals} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="right" />
        <CompactRound title="Quarter-final" numbers={rightBracketMatches.quarterFinals} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="right" />
        <CompactRound title="Round of 16" numbers={rightBracketMatches.round16} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="right" />
        <CompactRound title="Round of 32" numbers={rightBracketMatches.round32} roundOf32={roundOf32} picks={picks} predictionPicks={predictionPicks} officialPicks={officialPicks} knockoutFixtures={knockoutFixtures} mode={mode} onPick={onPick} onResetMatchToOfficial={onResetMatchToOfficial} side="right" />
      </div>

      <p className="official-bracket-note">
        Third-place opponents are assigned from the exact eight qualifying groups using the
        <a href={fifaRegulationsUrl} target="_blank" rel="noreferrer"> FIFA World Cup 2026 Regulations, Annex C</a>.
        Official winners and user predictions are stored separately.
      </p>
    </section>
  );
}

function CompactRound({
  title,
  numbers,
  roundOf32,
  picks,
  predictionPicks,
  officialPicks,
  knockoutFixtures,
  mode,
  onPick,
  onResetMatchToOfficial,
  side
}: {
  title: string;
  numbers: number[];
  roundOf32: Map<number, OfficialMatch>;
  picks: BracketPicks;
  predictionPicks: BracketPicks;
  officialPicks: BracketPicks;
  knockoutFixtures: KnockoutFixture[];
  mode: BracketMode;
  onPick: (matchNumber: number, teamName: string) => void;
  onResetMatchToOfficial: (matchNumber: number) => void;
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
            predictionSelected={predictionPicks[`m${matchNumber}`]}
            officialSelected={officialPicks[`m${matchNumber}`]}
            fixture={getKnockoutFixtureForMatch(matchNumber, knockoutFixtures, roundOf32, officialPicks)}
            mode={mode}
            onPick={onPick}
            onResetToOfficial={onResetMatchToOfficial}
          />
        ))}
      </div>
    </section>
  );
}

function getFixtureScoreForTeam(fixture: KnockoutFixture | undefined, team: Team) {
  if (!fixture) return null;
  const isHome = fixture.homeCode === team.code;
  const isAway = fixture.awayCode === team.code;
  if (!isHome && !isAway) return null;

  const score = isHome ? fixture.homeScore : fixture.awayScore;
  if (score === null) return null;

  const penaltyScore = isHome ? fixture.homePenaltyScore : fixture.awayPenaltyScore;
  return penaltyScore === null ? String(score) : `${score} (${penaltyScore})`;
}

function OfficialMatchCard({
  match,
  selected,
  predictionSelected,
  officialSelected,
  fixture,
  mode,
  onPick,
  onResetToOfficial,
  featured = false
}: {
  match: OfficialMatch;
  selected?: string;
  predictionSelected?: string;
  officialSelected?: string;
  fixture?: KnockoutFixture;
  mode: BracketMode;
  onPick: (matchNumber: number, teamName: string) => void;
  onResetToOfficial: (matchNumber: number) => void;
  featured?: boolean;
}) {
  const isRoundOf32 = match.number >= 73 && match.number <= 88;
  const statusLabel = getFixtureStatusLabel(fixture);
  const statusClass = fixture?.status ?? "scheduled";
  const readOnly = mode === "official";
  const canResetToOfficial = mode === "prediction" && Boolean(officialSelected) && predictionSelected !== officialSelected;
  const officialWinner = officialSelected ? findTeam(officialSelected) : undefined;

  return (
    <article className={`official-match-card ${selected ? "decided" : ""} ${featured ? "featured" : ""} ${readOnly ? "read-only" : ""}`}>
      <div className="official-match-number">
        <span className="match-header-left">
          <span>M{match.number}</span>
          {mode === "prediction" && officialWinner && (
            <span className="match-inline-meta">
              <span className="official-winner-text">Official: {officialWinner.name}</span>
              {predictionSelected && predictionSelected !== officialSelected && <span className="overridden-text">Overridden</span>}
              {predictionSelected === officialSelected && <span className="aligned-text">Aligned</span>}
              {canResetToOfficial && (
                <button className="match-inline-reset" onClick={() => onResetToOfficial(match.number)} type="button">Reset</button>
              )}
            </span>
          )}
        </span>
        <span className={`match-status-pill ${statusClass}`}>{statusLabel}</span>
      </div>
      {match.teams.map((team, index) => {
        const isSelected = selected === team?.name;
        const isOfficialWinner = officialSelected === team?.name;
        const isUserPick = predictionSelected === team?.name;
        const isOverridden = mode === "prediction" && isUserPick && Boolean(officialSelected) && predictionSelected !== officialSelected;
        const teamScore = team ? getFixtureScoreForTeam(fixture, team) : null;
        const buttonClass = [
          isSelected ? "winner" : selected ? "loser" : "",
          isOfficialWinner ? "official-winner" : "",
          isUserPick ? "user-pick" : "",
          isOverridden ? "overridden-pick" : "",
          isRoundOf32 ? "round32-team-row" : "",
          readOnly ? "read-only" : ""
        ].filter(Boolean).join(" ");

        return team ? (
          <button
            aria-pressed={isSelected}
            className={buttonClass}
            disabled={readOnly}
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
            {teamScore !== null && <span className="match-team-score">{teamScore}</span>}
            <span className="winner-check marker-stack">
              {isOfficialWinner && <span className="official-winner-marker" title="Official winner"><Check size={9} /></span>}
              {mode === "prediction" && isUserPick && <span className={`user-pick-marker ${isOverridden ? "overridden" : ""}`} title={isOverridden ? "Overridden user pick" : "User pick"}>{isOverridden ? "!" : "P"}</span>}
            </span>
          </button>
        ) : (
          <div className={`official-team-placeholder ${isRoundOf32 ? "round32-placeholder" : ""}`} key={`${match.number}-${index}`}>
            <span>{isRoundOf32 ? formatRoundOf32Slot(match.labels[index]) : match.labels[index]}</span>
            <em>Team not confirmed</em>
          </div>
        );
      })}

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
            const liveScore = getFixtureDisplayScore(fixture);
            const isLive = isFixtureLiveNow(fixture);
            const canPredict = !fixture.completed && !isLive && !isPast;
            const predicted = draft[fixture.id] ?? { home: 0, away: 0 };

            return (
              <article className={`group-fixture ${fixture.completed ? "completed" : isLive ? "live" : canPredict ? "predictable" : "awaiting"}`} key={fixture.id}>
                <div className="fixture-meta">
                  <span>{kickoff.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                  <strong>{kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
                  <em>{fixture.completed ? "Full time" : isLive ? "Live now" : canPredict ? "Your prediction" : "Awaiting official result"}</em>
                </div>
                <div className="fixture-team home-team">
                  <strong>{homeTeam.name}</strong>
                  <Flag team={homeTeam} />
                </div>
                <div className="fixture-scoreline">
                  {fixture.completed || isLive ? (
                    <><strong>{liveScore?.[0] ?? fixture.homeScore}</strong><span>–</span><strong>{liveScore?.[1] ?? fixture.awayScore}</strong>{isLive && <em className="fixture-live-pill">LIVE</em>}</>
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
  stats,
  fixtures,
  roundOf32,
  manualSimulationMode,
  onClose
}: {
  group: Group;
  groupOrder: GroupOrder;
  stats: StatsMap;
  fixtures: GroupFixture[];
  roundOf32: Map<number, OfficialMatch>;
  manualSimulationMode: boolean;
  onClose: () => void;
}) {
  const previews = buildGroupOpponentPreviews({ group, groupOrder, stats, fixtures, roundOf32, manualSimulationMode });

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
            <h2 id="opponent-preview-title">Round of 32 possible routes</h2>
            <p>{manualSimulationMode ? "This preview follows your current manual table and third-place board before mapping FIFA Round of 32 slots." : `Every remaining Group ${group.id} match is simulated as home win, draw, or away win. The table is recalculated for every combination before mapping FIFA Round of 32 slots.`}</p>
          </div>
          <button className="modal-close" aria-label="Close Round of 32 opponent preview" onClick={onClose} type="button"><X size={22} /></button>
        </header>

        <div className="opponent-preview-body">
          <div className="opponent-preview-system-note">
            <Sparkles size={16} />
            <span>{manualSimulationMode ? "Manual simulation is active, so only teams qualifying from your current table are shown here." : "No fake goal margins are used. Points decide first; if points are level, the preview uses the current GD/GF table as the tie-break estimate."}</span>
          </div>

          {previews.length === 0 ? (
            <div className="opponent-preview-empty">
              <Info size={22} />
              <strong>No active Round of 32 route</strong>
              <span>The teams in Group {group.id} are outside the qualifying routes across the simulated combinations.</span>
            </div>
          ) : (
            <div className="opponent-preview-grid scenario-preview-grid">
              {previews.map((preview) => (
                <article className="scenario-team-card variable" key={preview.team.name}>
                  <header className="scenario-team-header">
                    <div className="scenario-team-identity">
                      <Flag team={preview.team} />
                      <div>
                        <strong>{preview.team.name}</strong>
                        <span>{formatGroupPosition(preview.currentPosition)} now · {preview.currentStats.mp} MP · {preview.currentStats.pts} Pts · {preview.currentStats.gd > 0 ? "+" : ""}{preview.currentStats.gd} GD</span>
                      </div>
                    </div>
                    <span className={`scenario-status-pill ${getPreviewPillClass(preview)}`}>
                      {getPreviewPillLabel(preview)}
                    </span>
                  </header>

                  <p className="scenario-team-note">
                    {getPreviewRouteNote(preview, manualSimulationMode)}
                  </p>

                  <div className="scenario-outcome-grid">
                    {preview.routes.map((route) => (
                      <article className={`scenario-outcome-card ${route.status} ${route.isFinalRoute ? "final-route" : route.isPositionLocked ? "locked-route" : ""}`} key={route.key}>
                        <div className="scenario-outcome-label">
                          <strong>{route.label}</strong>
                          <span>{getRouteMetaLabel(route)}</span>
                        </div>

                        <div className="scenario-matchup-flow">
                          <div className="scenario-source-slot">
                            <Flag team={preview.team} />
                            <strong>{preview.team.name}</strong>
                          </div>
                          <div className="scenario-match-bridge">
                            <span>{route.matchNumbers.length ? route.matchNumbers.map((matchNumber) => `M${matchNumber}`).join("/") : "TBD"}</span>
                            <i />
                            <small>Round of 32</small>
                          </div>
                          <div className="scenario-opponent-slot route-opponent-pool">
                            <em>{route.opponentSlotLabels.length ? route.opponentSlotLabels.join(", ") : "Opponent slot pending"}</em>
                            <PossibleOpponentPool route={route} />
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
          <div><Info size={16} /><span>{manualSimulationMode ? "This follows your manual table and does not change bracket picks." : "This does not change your table or bracket picks."}</span></div>
          <button className="primary-button" onClick={onClose} type="button">Done</button>
        </footer>
      </section>
    </div>
  );
}
function PossibleOpponentPool({ route }: { route: QualificationRoute }) {
  const [expanded, setExpanded] = useState(false);
  const visibleOpponents = expanded ? route.possibleOpponents : route.possibleOpponents.slice(0, 6);
  const hiddenCount = route.possibleOpponents.length - 6;

  return (
    <div className="possible-opponent-list">
      {visibleOpponents.map((opponent) => (
        <span className="possible-opponent-chip" key={`${route.key}-${opponent.name}`}>
          <Flag team={opponent} />
          <strong>{opponent.name}</strong>
        </span>
      ))}
      {route.possibleOpponents.length === 0 && <span className="possible-opponent-empty">Pending</span>}
      {hiddenCount > 0 && (
        <button
          className="possible-opponent-more"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "Show less" : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}

function formatOrdinal(position: number) {
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return `${position}th`;
}

function formatGroupPosition(position: number) {
  return `${formatOrdinal(position)} in group`;
}

function formatRange([minimum, maximum]: [number, number]) {
  return minimum === maximum ? `${minimum}` : `${minimum}-${maximum}`;
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
