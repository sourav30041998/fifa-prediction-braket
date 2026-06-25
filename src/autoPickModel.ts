export type PredictionTeam = {
  name: string;
  code: string;
};

export type PredictionStats = {
  mp: number;
  gf: number;
  gd: number;
  pts: number;
};

export type PredictionRanking = {
  rank: number;
  points: number;
};

export type PredictionContext = {
  stats: Record<string, PredictionStats | undefined>;
  rankings: Record<string, PredictionRanking | undefined>;
  groupPositions: Record<string, number | undefined>;
};

export type TeamStrengthBreakdown = {
  fifaRanking: number;
  tournamentPoints: number;
  goalDifference: number;
  attackingForm: number;
  qualificationPosition: number;
  total: number;
};

const MODEL_WEIGHTS = {
  fifaRanking: 0.55,
  tournamentPoints: 0.2,
  goalDifference: 0.12,
  attackingForm: 0.05,
  qualificationPosition: 0.08
} as const;

const MIN_WIN_PROBABILITY = 0.18;
const MAX_WIN_PROBABILITY = 0.82;
const AUTO_PICK_MODEL_VERSION = "probability-v2";

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rankingScore(ranking?: PredictionRanking) {
  if (!ranking) return 0.5;
  const pointsScore = clamp((ranking.points - 900) / 1000);
  const rankScore = clamp(1 - (ranking.rank - 1) / 100);
  return pointsScore * 0.8 + rankScore * 0.2;
}

function groupPositionScore(position?: number) {
  return [1, 0.82, 0.62, 0.4][(position ?? 2) - 1] ?? 0.5;
}

export function calculateTeamStrength(
  team: PredictionTeam,
  context: PredictionContext
): TeamStrengthBreakdown {
  const stats = context.stats[team.code];
  const matchesPlayed = stats?.mp ?? 0;
  const fifaRanking = rankingScore(context.rankings[team.code]);
  const tournamentPoints = matchesPlayed > 0 ? clamp((stats?.pts ?? 0) / (matchesPlayed * 3)) : 0.5;
  const goalDifference =
    matchesPlayed > 0 ? clamp(0.5 + (stats?.gd ?? 0) / matchesPlayed / 6) : 0.5;
  const attackingForm =
    matchesPlayed > 0 ? clamp((stats?.gf ?? 0) / matchesPlayed / 3) : 0.5;
  const qualificationPosition = groupPositionScore(context.groupPositions[team.name]);
  const total =
    fifaRanking * MODEL_WEIGHTS.fifaRanking +
    tournamentPoints * MODEL_WEIGHTS.tournamentPoints +
    goalDifference * MODEL_WEIGHTS.goalDifference +
    attackingForm * MODEL_WEIGHTS.attackingForm +
    qualificationPosition * MODEL_WEIGHTS.qualificationPosition;

  return {
    fifaRanking,
    tournamentPoints,
    goalDifference,
    attackingForm,
    qualificationPosition,
    total
  };
}

export function calculateWinProbability(
  teamA: PredictionTeam,
  teamB: PredictionTeam,
  context: PredictionContext
) {
  const strengthA = calculateTeamStrength(teamA, context).total;
  const strengthB = calculateTeamStrength(teamB, context).total;
  const logisticProbability = 1 / (1 + Math.exp(-(strengthA - strengthB) * 5));
  return clamp(logisticProbability, MIN_WIN_PROBABILITY, MAX_WIN_PROBABILITY);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicMatchRandom(
  matchNumber: number,
  teamA: PredictionTeam,
  teamB: PredictionTeam
) {
  const seed = [
    AUTO_PICK_MODEL_VERSION,
    matchNumber,
    teamA.code,
    teamB.code
  ].join(":");
  return hashString(seed) / 4294967296;
}

export function pickProbableWinner(
  teamA: PredictionTeam,
  teamB: PredictionTeam,
  context: PredictionContext,
  random = Math.random
) {
  const teamAProbability = calculateWinProbability(teamA, teamB, context);
  return {
    winner: random() < teamAProbability ? teamA : teamB,
    teamAProbability
  };
}
