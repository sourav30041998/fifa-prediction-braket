import { randomUUID } from "node:crypto";

export const seats = ["N", "E", "S", "W"] as const;
export const suits = ["S", "H", "D", "C"] as const;
export const strains = ["C", "D", "H", "S", "NT"] as const;
export const ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export type Seat = (typeof seats)[number];
export type Suit = (typeof suits)[number];
export type Strain = (typeof strains)[number];
export type Rank = (typeof ranks)[number];
export type Partnership = "NS" | "EW";
export type Phase = "bidding" | "play" | "complete" | "passedOut";
export type Difficulty = "social" | "club" | "expert";

export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
  rankValue: number;
  hcp: number;
};

export type BidInput =
  | { type: "pass" }
  | { type: "bid"; level: number; strain: Strain };

export type BidCall = BidInput & {
  seat: Seat;
  label: string;
  alert?: string;
};

export type Contract = {
  level: number;
  strain: Strain;
  declarer: Seat;
  dummy: Seat;
  partnership: Partnership;
  label: string;
};

export type TrickPlay = {
  seat: Seat;
  card: Card;
};

export type Trick = {
  leader: Seat;
  plays: TrickPlay[];
  winner?: Seat;
};

export type AiAction = {
  id: string;
  seat: Seat;
  kind: "bid" | "play";
  label: string;
  thought: string;
  confidence: number;
  paceMs: number;
  createdAt: number;
};

export type ScoreState = {
  nsTricks: number;
  ewTricks: number;
  resultText: string;
  contractPoints: number;
};

type InternalGame = {
  id: string;
  seed: string;
  rngState: number;
  difficulty: Difficulty;
  phase: Phase;
  dealer: Seat;
  currentTurn: Seat | null;
  hands: Record<Seat, Card[]>;
  bidding: BidCall[];
  contract?: Contract;
  currentTrick?: Trick;
  tricks: Trick[];
  dummyRevealed: boolean;
  aiActions: AiAction[];
  score: ScoreState;
};

export type CardView = Card | { id: string; hidden: true };

export type ClientGame = {
  id: string;
  seed: string;
  difficulty: Difficulty;
  phase: Phase;
  dealer: Seat;
  currentTurn: Seat | null;
  humanSeats: Seat[];
  visibleSeats: Seat[];
  hands: Record<Seat, CardView[]>;
  handStats: Record<Seat, { hcp?: number; count: number; shape?: string }>;
  bidding: BidCall[];
  legalBids: BidInput[];
  legalCards: string[];
  contract?: Contract;
  currentTrick?: Trick;
  tricks: Trick[];
  dummyRevealed: boolean;
  aiActions: AiAction[];
  score: ScoreState;
  tableMessage: string;
};

const games = new Map<string, InternalGame>();

const rankValues: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2
};

const hcpValues: Record<Rank, number> = {
  A: 4,
  K: 3,
  Q: 2,
  J: 1,
  T: 0,
  "9": 0,
  "8": 0,
  "7": 0,
  "6": 0,
  "5": 0,
  "4": 0,
  "3": 0,
  "2": 0
};

const strainOrder: Record<Strain, number> = {
  C: 0,
  D: 1,
  H: 2,
  S: 3,
  NT: 4
};

const suitNames: Record<Strain, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
  NT: "No Trump"
};

const difficultyTemperature: Record<Difficulty, number> = {
  social: 0.75,
  club: 0.45,
  expert: 0.25
};

const playWeights = {
  winsTrick: 2.5,
  cheapWinner: 1.35,
  partnerWinning: -1.8,
  wastesHonor: -1.45,
  trumpControl: 0.55,
  longSuitLead: 0.8,
  topSequenceLead: 0.95,
  discardLow: 0.7,
  rankPressure: 0.5,
  randomHumanTexture: 0.28
};

const bidWeights = {
  hcp: 0.34,
  length: 0.45,
  fit: 0.42,
  balancedNt: 0.95,
  gameTry: 0.45,
  levelPenalty: -0.55,
  opponentRisk: -0.35,
  preemptShape: 0.65,
  randomHumanTexture: 0.25
};

export function createGame(difficulty: Difficulty = "club"): ClientGame {
  const seed = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const rngState = hashSeed(seed);
  const deck = shuffle(buildDeck(), rngState);
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };

  deck.forEach((card, index) => {
    hands[seats[index % 4]].push(card);
  });

  for (const seat of seats) {
    hands[seat] = sortHand(hands[seat]);
  }

  const game: InternalGame = {
    id: randomUUID(),
    seed,
    rngState: hashSeed(`${seed}-play`),
    difficulty,
    phase: "bidding",
    dealer: "S",
    currentTurn: "S",
    hands,
    bidding: [],
    tricks: [],
    dummyRevealed: false,
    aiActions: [],
    score: {
      nsTricks: 0,
      ewTricks: 0,
      resultText: "Bidding has started. South deals.",
      contractPoints: 0
    }
  };

  games.set(game.id, game);
  return toClientGame(game);
}

export function getGame(id: string): ClientGame {
  const game = requireGame(id);
  return toClientGame(game);
}

export function submitBid(id: string, bid: BidInput): ClientGame {
  const game = requireGame(id);
  if (game.phase !== "bidding") {
    throw new Error("This hand is no longer in the bidding phase.");
  }
  if (game.currentTurn !== "S") {
    throw new Error("It is not South's turn to bid.");
  }
  if (!isLegalBid(bid, game.bidding)) {
    throw new Error("That bid is not legal over the current auction.");
  }

  applyBid(game, "S", bid, "Your call was accepted by the table.");
  advanceBots(game);
  return toClientGame(game);
}

export function submitPlay(id: string, cardId: string): ClientGame {
  const game = requireGame(id);
  if (game.phase !== "play" || !game.currentTurn) {
    throw new Error("There is no card to play right now.");
  }
  if (!humanControlledSeats(game).includes(game.currentTurn)) {
    throw new Error("The table is waiting for another player.");
  }
  const legalCards = getLegalCards(game, game.currentTurn);
  if (!legalCards.some((card) => card.id === cardId)) {
    throw new Error("That card cannot be played to this trick.");
  }

  playCard(game, game.currentTurn, cardId, "You followed the legal line.");
  advanceBots(game);
  return toClientGame(game);
}

export function listGames(): ClientGame[] {
  return [...games.values()].map(toClientGame);
}

function requireGame(id: string): InternalGame {
  const game = games.get(id);
  if (!game) {
    throw new Error("That bridge table no longer exists.");
  }
  return game;
}

function advanceBots(game: InternalGame): void {
  let guard = 0;
  while (game.currentTurn && guard < 120) {
    guard += 1;

    if (game.phase === "bidding") {
      if (game.currentTurn === "S") {
        return;
      }
      const decision = chooseBotBid(game, game.currentTurn);
      applyBid(game, game.currentTurn, decision.bid, decision.thought, decision.confidence);
      continue;
    }

    if (game.phase === "play") {
      if (humanControlledSeats(game).includes(game.currentTurn)) {
        return;
      }
      const decision = chooseBotCard(game, game.currentTurn);
      playCard(game, game.currentTurn, decision.card.id, decision.thought, decision.confidence);
      continue;
    }

    return;
  }
}

function applyBid(
  game: InternalGame,
  seat: Seat,
  bid: BidInput,
  thought: string,
  confidence = 0.86
): void {
  const call: BidCall = {
    ...bid,
    seat,
    label: bidLabel(bid)
  };
  if (bid.type === "bid") {
    call.alert = describeBidAlert(game, seat, bid);
  }
  game.bidding.push(call);

  if (seat !== "S") {
    game.aiActions.unshift({
      id: randomUUID(),
      seat,
      kind: "bid",
      label: call.label,
      thought,
      confidence,
      paceMs: botPace(game, confidence),
      createdAt: Date.now()
    });
    game.aiActions = game.aiActions.slice(0, 10);
  }

  const outcome = getBiddingOutcome(game.bidding);
  if (outcome === "passedOut") {
    game.phase = "passedOut";
    game.currentTurn = null;
    game.score.resultText = "Everyone passed. The board is passed out.";
    return;
  }

  if (outcome) {
    game.contract = outcome;
    game.phase = "play";
    game.currentTurn = nextSeat(outcome.declarer);
    game.currentTrick = { leader: game.currentTurn, plays: [] };
    game.score.resultText = `${outcome.label} by ${outcome.declarer}. ${game.currentTurn} is on opening lead.`;
    return;
  }

  game.score.resultText = `${seatLabel(seat)} called ${call.label}.`;
  game.currentTurn = nextSeat(seat);
}

function playCard(
  game: InternalGame,
  seat: Seat,
  cardId: string,
  thought: string,
  confidence = 0.9
): void {
  if (!game.currentTrick) {
    throw new Error("The current trick is missing.");
  }
  const card = removeCard(game.hands[seat], cardId);
  game.currentTrick.plays.push({ seat, card });

  if (!game.dummyRevealed && game.currentTrick.plays.length === 1) {
    game.dummyRevealed = true;
  }

  if (seat !== "S" && !humanControlledSeats(game).includes(seat)) {
    game.aiActions.unshift({
      id: randomUUID(),
      seat,
      kind: "play",
      label: `${card.rank}${card.suit}`,
      thought,
      confidence,
      paceMs: botPace(game, confidence),
      createdAt: Date.now()
    });
    game.aiActions = game.aiActions.slice(0, 10);
  }

  if (game.currentTrick.plays.length === 4) {
    const winner = trickWinner(game.currentTrick, game.contract?.strain ?? "NT");
    game.currentTrick.winner = winner;
    game.tricks.push(game.currentTrick);
    if (partnershipOf(winner) === "NS") {
      game.score.nsTricks += 1;
    } else {
      game.score.ewTricks += 1;
    }

    if (game.tricks.length === 13) {
      finishHand(game);
      return;
    }

    game.currentTurn = winner;
    game.currentTrick = { leader: winner, plays: [] };
    game.score.resultText = `${winner} won trick ${game.tricks.length}.`;
    return;
  }

  game.currentTurn = nextSeat(seat);
}

function finishHand(game: InternalGame): void {
  if (!game.contract) {
    return;
  }
  game.phase = "complete";
  game.currentTurn = null;
  const declaringTricks = game.contract.partnership === "NS" ? game.score.nsTricks : game.score.ewTricks;
  const target = game.contract.level + 6;
  const delta = declaringTricks - target;
  const contractPoints = scoreContract(game.contract, Math.max(delta, 0));
  game.score.contractPoints = delta >= 0 ? contractPoints : 0;
  game.score.resultText =
    delta >= 0
      ? `${game.contract.label} made ${delta > 0 ? `with ${delta} overtrick${delta === 1 ? "" : "s"}` : "exactly"}.`
      : `${game.contract.label} went down ${Math.abs(delta)}.`;
}

function chooseBotBid(game: InternalGame, seat: Seat): { bid: BidInput; thought: string; confidence: number } {
  const hand = game.hands[seat];
  const profile = evaluateHand(hand);
  const lastContract = lastContractBid(game.bidding);
  const partner = partnerOf(seat);
  const partnerBid = [...game.bidding].reverse().find((call) => call.seat === partner && call.type === "bid");
  const seatHasBid = game.bidding.some((call) => call.seat === seat && call.type === "bid");
  const candidates: Array<{ bid: BidInput; score: number; thought: string }> = [];

  candidates.push({
    bid: { type: "pass" },
    score: baselinePassScore(profile, Boolean(lastContract)),
    thought: `${seat} has ${profile.hcp} HCP and keeps the auction quiet.`
  });

  if (!lastContract) {
    addOpeningCandidates(game, candidates, profile);
  } else if (partnershipOf(lastContract.seat) === partnershipOf(seat)) {
    if (lastContract.seat === partner && partnerBid && !seatHasBid) {
      addResponderCandidates(game, candidates, profile, partnerBid);
    }
  } else if (!seatHasBid || lastContract.level < 3) {
    addCompetitiveCandidates(game, candidates, profile, lastContract);
  }

  const legal = candidates.filter((candidate) => isLegalBid(candidate.bid, game.bidding));
  const chosen = sampleByScore(game, legal.length ? legal : candidates.slice(0, 1), difficultyTemperature[game.difficulty]);
  const confidence = clamp(0.58 + Math.abs(chosen.score) / 8, 0.58, 0.96);
  return {
    bid: chosen.bid,
    thought: chosen.thought,
    confidence
  };
}

function addOpeningCandidates(
  game: InternalGame,
  candidates: Array<{ bid: BidInput; score: number; thought: string }>,
  profile: HandProfile
): void {
  const longest = profile.longestSuit;
  const texture = nextRandom(game) * bidWeights.randomHumanTexture;
  if (profile.hcp >= 20) {
    candidates.push({
      bid: { type: "bid", level: 2, strain: "C" },
      score: 6.6 + profile.hcp * 0.08 + texture,
      thought: `A big ${profile.hcp}-point hand starts with the forcing 2C call.`
    });
  }
  if (profile.balanced && profile.hcp >= 15 && profile.hcp <= 17) {
    candidates.push({
      bid: { type: "bid", level: 1, strain: "NT" },
      score: 5.5 + bidWeights.balancedNt + texture,
      thought: `Balanced shape and ${profile.hcp} HCP point to a natural 1NT opening.`
    });
  }
  if (profile.hcp >= 12) {
    const strain = longest;
    candidates.push({
      bid: { type: "bid", level: 1, strain },
      score:
        profile.hcp * bidWeights.hcp +
        profile.lengths[strain] * bidWeights.length +
        (strain === "H" || strain === "S" ? 0.4 : 0) +
        texture,
      thought: `${profile.shape} shape and ${profile.hcp} HCP make ${suitNames[strain]} the natural opening.`
    });
  }
  if (profile.hcp >= 6 && profile.hcp <= 10 && profile.lengths[longest] >= 6) {
    candidates.push({
      bid: { type: "bid", level: profile.lengths[longest] >= 7 ? 3 : 2, strain: longest },
      score: profile.lengths[longest] * bidWeights.preemptShape - profile.hcp * 0.04 + texture,
      thought: `A long ${suitNames[longest]} suit invites a pressure bid.`
    });
  }
}

function addResponderCandidates(
  game: InternalGame,
  candidates: Array<{ bid: BidInput; score: number; thought: string }>,
  profile: HandProfile,
  partnerBid: BidCall
): void {
  if (partnerBid.type !== "bid") {
    return;
  }
  const partnerStrain = partnerBid.strain;
  const texture = nextRandom(game) * bidWeights.randomHumanTexture;
  if (partnerStrain !== "NT" && profile.lengths[partnerStrain] >= 3) {
    const raiseLevel = profile.hcp >= 13 ? Math.min(4, partnerBid.level + 2) : profile.hcp >= 9 ? partnerBid.level + 1 : partnerBid.level;
    candidates.push({
      bid: { type: "bid", level: raiseLevel, strain: partnerStrain },
      score:
        profile.hcp * bidWeights.hcp +
        profile.lengths[partnerStrain] * bidWeights.fit +
        raiseLevel * bidWeights.levelPenalty +
        texture,
      thought: `Fit found: ${profile.lengths[partnerStrain]} ${suitNames[partnerStrain]} with ${profile.hcp} HCP.`
    });
  }
  if (profile.balanced && profile.hcp >= 10) {
    const ntLevel = profile.hcp >= 13 ? 3 : 2;
    candidates.push({
      bid: { type: "bid", level: ntLevel, strain: "NT" },
      score: profile.hcp * bidWeights.hcp + bidWeights.balancedNt + ntLevel * bidWeights.levelPenalty + texture,
      thought: `Balanced values suggest ${ntLevel}NT rather than inventing a suit.`
    });
  }
  const longest = profile.longestSuit;
  if (profile.hcp >= 8 && profile.lengths[longest] >= 4 && longest !== partnerStrain) {
    candidates.push({
      bid: { type: "bid", level: minimumLegalLevel(longest, game.bidding), strain: longest },
      score: profile.hcp * bidWeights.hcp + profile.lengths[longest] * bidWeights.length + texture,
      thought: `The model explores a new ${suitNames[longest]} suit with useful values.`
    });
  }
}

function addCompetitiveCandidates(
  game: InternalGame,
  candidates: Array<{ bid: BidInput; score: number; thought: string }>,
  profile: HandProfile,
  lastContract: BidCall
): void {
  if (lastContract.type !== "bid") {
    return;
  }
  const texture = nextRandom(game) * bidWeights.randomHumanTexture;
  const longest = profile.longestSuit;
  if (profile.hcp >= 8 && profile.lengths[longest] >= 5) {
    const level = minimumLegalLevel(longest, game.bidding);
    if (level <= maxCompetitiveLevel(profile, longest)) {
      candidates.push({
        bid: { type: "bid", level, strain: longest },
        score:
          profile.hcp * bidWeights.hcp +
          profile.lengths[longest] * bidWeights.length +
          level * bidWeights.levelPenalty +
          bidWeights.opponentRisk +
          texture,
        thought: `${seatLabel(lastContract.seat)} opened the auction, but a ${profile.lengths[longest]}-card suit can compete.`
      });
    }
  }
  if (profile.balanced && profile.hcp >= 16) {
    const level = minimumLegalLevel("NT", game.bidding);
    if (level <= (profile.hcp >= 19 ? 4 : 3)) {
      candidates.push({
        bid: { type: "bid", level, strain: "NT" },
        score: profile.hcp * bidWeights.hcp + bidWeights.balancedNt + level * bidWeights.levelPenalty + texture,
        thought: `Balanced strength makes a notrump overcall plausible.`
      });
    }
  }
}

function maxCompetitiveLevel(profile: HandProfile, suit: Suit): number {
  const length = profile.lengths[suit];
  if (profile.hcp >= 18 && length >= 7) return 5;
  if (profile.hcp >= 15 && length >= 6) return 4;
  if (profile.hcp >= 10 && length >= 6) return 3;
  if (profile.hcp >= 8 && length >= 5) return 2;
  if (profile.hcp >= 6 && length >= 7) return 3;
  return 1;
}

function chooseBotCard(game: InternalGame, seat: Seat): { card: Card; thought: string; confidence: number } {
  const legalCards = getLegalCards(game, seat);
  const trick = game.currentTrick;
  if (!trick) {
    throw new Error("Cannot choose a card without an active trick.");
  }
  const trump = game.contract?.strain ?? "NT";
  const partner = partnerOf(seat);
  const currentWinner = trick.plays.length ? trickWinner({ ...trick, plays: [...trick.plays] }, trump) : null;
  const partnerWinning = currentWinner === partner;
  const leadSuit = trick.plays[0]?.card.suit;
  const options = legalCards.map((card) => {
    const wouldWin = trick.plays.length === 0 || trickWinner({ ...trick, plays: [...trick.plays, { seat, card }] }, trump) === seat;
    const isTrump = trump !== "NT" && card.suit === trump;
    const suitLength = game.hands[seat].filter((held) => held.suit === card.suit).length;
    const rankNorm = (card.rankValue - 2) / 12;
    const lowestLegal = legalCards.every((other) => card.rankValue <= other.rankValue || other.suit !== card.suit);
    const highestLegal = legalCards.every((other) => card.rankValue >= other.rankValue || other.suit !== card.suit);
    const following = leadSuit ? card.suit === leadSuit : false;
    const topSequence = trick.plays.length === 0 && highestLegal && card.rankValue >= 11;

    let score = nextRandom(game) * playWeights.randomHumanTexture;
    if (wouldWin) score += playWeights.winsTrick;
    if (wouldWin && !highestLegal) score += playWeights.cheapWinner;
    if (partnerWinning) score += playWeights.partnerWinning;
    if (partnerWinning && card.rankValue >= 11) score += playWeights.wastesHonor;
    if (isTrump) score += playWeights.trumpControl;
    if (trick.plays.length === 0 && suitLength >= 4) score += playWeights.longSuitLead;
    if (topSequence) score += playWeights.topSequenceLead;
    if (!wouldWin && lowestLegal) score += playWeights.discardLow;
    if (following && trick.plays.length === 3 && wouldWin) score += playWeights.rankPressure;
    if (card.rankValue <= 6 && !wouldWin) score += 0.35;
    if (partnerWinning && lowestLegal) score += 1.2;
    if (!partnerWinning && currentWinner && wouldWin) score += 0.9;

    return { card, score };
  });

  const chosen = sampleByScore(game, options, difficultyTemperature[game.difficulty]);
  const confidence = clamp(0.62 + Math.abs(chosen.score) / 6, 0.62, 0.97);
  const thought = describePlayThought(game, seat, chosen.card, partnerWinning);
  return { card: chosen.card, thought, confidence };
}

function getBiddingOutcome(bidding: BidCall[]): Contract | "passedOut" | null {
  const contractCalls = bidding.filter((call): call is BidCall & { type: "bid" } => call.type === "bid");
  if (contractCalls.length === 0 && bidding.length >= 4 && bidding.slice(-4).every((call) => call.type === "pass")) {
    return "passedOut";
  }
  if (contractCalls.length === 0 || bidding.length < 4 || !bidding.slice(-3).every((call) => call.type === "pass")) {
    return null;
  }

  const finalBid = contractCalls[contractCalls.length - 1];
  const partnership = partnershipOf(finalBid.seat);
  const declarer =
    contractCalls.find((call) => partnershipOf(call.seat) === partnership && call.strain === finalBid.strain)?.seat ?? finalBid.seat;
  const dummy = partnerOf(declarer);
  return {
    level: finalBid.level,
    strain: finalBid.strain,
    declarer,
    dummy,
    partnership,
    label: `${finalBid.level}${finalBid.strain}`
  };
}

function isLegalBid(bid: BidInput, bidding: BidCall[]): boolean {
  if (bid.type === "pass") {
    return true;
  }
  if (bid.level < 1 || bid.level > 7) {
    return false;
  }
  const last = lastContractBid(bidding);
  if (!last || last.type !== "bid") {
    return true;
  }
  return bid.level > last.level || (bid.level === last.level && strainOrder[bid.strain] > strainOrder[last.strain]);
}

function getLegalBids(bidding: BidCall[]): BidInput[] {
  const legal: BidInput[] = [{ type: "pass" }];
  for (let level = 1; level <= 7; level += 1) {
    for (const strain of strains) {
      const bid: BidInput = { type: "bid", level, strain };
      if (isLegalBid(bid, bidding)) {
        legal.push(bid);
      }
    }
  }
  return legal;
}

function getLegalCards(game: InternalGame, seat: Seat): Card[] {
  const hand = game.hands[seat];
  const leadSuit = game.currentTrick?.plays[0]?.card.suit;
  if (!leadSuit) {
    return hand;
  }
  const followSuit = hand.filter((card) => card.suit === leadSuit);
  return followSuit.length ? followSuit : hand;
}

function lastContractBid(bidding: BidCall[]): (BidCall & { type: "bid" }) | undefined {
  return [...bidding].reverse().find((call): call is BidCall & { type: "bid" } => call.type === "bid");
}

function minimumLegalLevel(strain: Strain, bidding: BidCall[]): number {
  const last = lastContractBid(bidding);
  if (!last) {
    return 1;
  }
  if (strainOrder[strain] > strainOrder[last.strain]) {
    return last.level;
  }
  return Math.min(7, last.level + 1);
}

function trickWinner(trick: Trick, trump: Strain): Seat {
  const leadSuit = trick.plays[0]?.card.suit;
  if (!leadSuit) {
    throw new Error("Cannot score a trick before a lead.");
  }
  return trick.plays.reduce((best, play) => {
    if (beats(play.card, best.card, leadSuit, trump)) {
      return play;
    }
    return best;
  }).seat;
}

function beats(card: Card, best: Card, leadSuit: Suit, trump: Strain): boolean {
  const cardTrump = trump !== "NT" && card.suit === trump;
  const bestTrump = trump !== "NT" && best.suit === trump;
  if (cardTrump && !bestTrump) return true;
  if (!cardTrump && bestTrump) return false;
  if (card.suit === best.suit) return card.rankValue > best.rankValue;
  return card.suit === leadSuit && best.suit !== leadSuit;
}

function toClientGame(game: InternalGame): ClientGame {
  const visibleSeats = getVisibleSeats(game);
  const humanSeats = humanControlledSeats(game);
  const hands = Object.fromEntries(
    seats.map((seat) => {
      const cards = game.hands[seat];
      const view = visibleSeats.includes(seat)
        ? cards
        : cards.map((_, index) => ({ id: `${seat}-hidden-${index}`, hidden: true as const }));
      return [seat, view];
    })
  ) as Record<Seat, CardView[]>;

  const legalCards =
    game.phase === "play" && game.currentTurn && humanSeats.includes(game.currentTurn)
      ? getLegalCards(game, game.currentTurn).map((card) => card.id)
      : [];

  return {
    id: game.id,
    seed: game.seed,
    difficulty: game.difficulty,
    phase: game.phase,
    dealer: game.dealer,
    currentTurn: game.currentTurn,
    humanSeats,
    visibleSeats,
    hands,
    handStats: Object.fromEntries(
      seats.map((seat) => {
        const stats = evaluateHand(game.hands[seat]);
        return [
          seat,
          {
            hcp: visibleSeats.includes(seat) ? stats.hcp : undefined,
            count: game.hands[seat].length,
            shape: visibleSeats.includes(seat) ? stats.shape : undefined
          }
        ];
      })
    ) as Record<Seat, { hcp?: number; count: number; shape?: string }>,
    bidding: game.bidding,
    legalBids: game.phase === "bidding" && game.currentTurn === "S" ? getLegalBids(game.bidding) : [],
    legalCards,
    contract: game.contract,
    currentTrick: game.currentTrick,
    tricks: game.tricks,
    dummyRevealed: game.dummyRevealed,
    aiActions: game.aiActions,
    score: game.score,
    tableMessage: tableMessage(game)
  };
}

function getVisibleSeats(game: InternalGame): Seat[] {
  if (game.phase === "complete" || game.phase === "passedOut") {
    return [...seats];
  }
  const visible = new Set<Seat>(["S"]);
  if (game.phase === "play") {
    if (game.contract?.partnership === "NS") {
      visible.add("N");
    }
    if (game.dummyRevealed && game.contract) {
      visible.add(game.contract.dummy);
    }
  }
  return [...visible];
}

function humanControlledSeats(game: InternalGame): Seat[] {
  if ((game.phase === "play" || game.phase === "complete") && game.contract?.partnership === "NS") {
    return ["N", "S"];
  }
  return ["S"];
}

function tableMessage(game: InternalGame): string {
  if (game.phase === "bidding") {
    return game.currentTurn === "S" ? "Your call, South." : `${game.currentTurn} is thinking about the auction.`;
  }
  if (game.phase === "play") {
    const turn = game.currentTurn ? `${game.currentTurn} to play` : "Resolving trick";
    const contract = game.contract ? `${game.contract.label} by ${game.contract.declarer}` : "Contract set";
    return `${contract}. ${turn}.`;
  }
  return game.score.resultText;
}

function buildDeck(): Card[] {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      id: `${suit}${rank}`,
      suit,
      rank,
      rankValue: rankValues[rank],
      hcp: hcpValues[rank]
    }))
  );
}

function shuffle(deck: Card[], initialState: number): Card[] {
  const cards = [...deck];
  let state = initialState;
  const random = () => {
    state = nextState(state);
    return stateToUnit(state);
  };
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const suitDiff = suits.indexOf(a.suit) - suits.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return b.rankValue - a.rankValue;
  });
}

function removeCard(hand: Card[], cardId: string): Card {
  const index = hand.findIndex((card) => card.id === cardId);
  if (index === -1) {
    throw new Error("That card is not in the hand.");
  }
  const [card] = hand.splice(index, 1);
  return card;
}

type HandProfile = {
  hcp: number;
  lengths: Record<Suit, number>;
  shape: string;
  balanced: boolean;
  longestSuit: Suit;
};

function evaluateHand(hand: Card[]): HandProfile {
  const lengths = Object.fromEntries(suits.map((suit) => [suit, hand.filter((card) => card.suit === suit).length])) as Record<
    Suit,
    number
  >;
  const sortedLengths = suits.map((suit) => lengths[suit]).sort((a, b) => b - a);
  const longestSuit = suits.reduce((best, suit) => {
    if (lengths[suit] > lengths[best]) return suit;
    if (lengths[suit] === lengths[best] && strainOrder[suit] > strainOrder[best]) return suit;
    return best;
  }, "C" as Suit);
  return {
    hcp: hand.reduce((total, card) => total + card.hcp, 0),
    lengths,
    shape: suits.map((suit) => lengths[suit]).join("-"),
    balanced:
      sortedLengths[0] <= 5 &&
      sortedLengths[1] <= 4 &&
      sortedLengths[2] >= 2 &&
      sortedLengths[3] >= 2,
    longestSuit
  };
}

function baselinePassScore(profile: HandProfile, contested: boolean): number {
  const shapeNoise = Object.values(profile.lengths).some((length) => length >= 6) ? -0.45 : 0.2;
  return contested ? 1.6 - profile.hcp * 0.12 + shapeNoise : 3.4 - profile.hcp * 0.25 + shapeNoise;
}

function sampleByScore<T extends { score: number }>(game: InternalGame, options: T[], temperature: number): T {
  const maxScore = Math.max(...options.map((option) => option.score));
  const weights = options.map((option) => Math.exp((option.score - maxScore) / Math.max(temperature, 0.1)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = nextRandom(game) * total;
  for (let index = 0; index < options.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      return options[index];
    }
  }
  return options[options.length - 1];
}

function nextRandom(game: InternalGame): number {
  game.rngState = nextState(game.rngState);
  return stateToUnit(game.rngState);
}

function nextState(state: number): number {
  let next = (state + 0x6d2b79f5) | 0;
  next = Math.imul(next ^ (next >>> 15), next | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
  return next ^ (next >>> 14);
}

function stateToUnit(state: number): number {
  return ((state >>> 0) / 4_294_967_296);
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function bidLabel(bid: BidInput): string {
  return bid.type === "pass" ? "Pass" : `${bid.level}${bid.strain}`;
}

function describeBidAlert(game: InternalGame, seat: Seat, bid: BidInput & { type: "bid" }): string {
  const profile = evaluateHand(game.hands[seat]);
  if (bid.strain === "NT") return `Balanced-leaning, ${profile.hcp} HCP.`;
  return `${profile.lengths[bid.strain]}+ ${suitNames[bid.strain].toLowerCase()}, ${profile.hcp} HCP.`;
}

function describePlayThought(game: InternalGame, seat: Seat, card: Card, partnerWinning: boolean): string {
  const trickSize = game.currentTrick?.plays.length ?? 0;
  if (trickSize === 0) {
    return `${seat} leads from ${suitNames[card.suit]} with table texture in mind.`;
  }
  if (partnerWinning) {
    return `${seat} protects partner's trick and sheds ${card.rank}${card.suit}.`;
  }
  return `${seat} chooses ${card.rank}${card.suit} after weighing trick gain against card economy.`;
}

function scoreContract(contract: Contract, overtricks: number): number {
  const trickValue = contract.strain === "C" || contract.strain === "D" ? 20 : 30;
  const base =
    contract.strain === "NT"
      ? 40 + (contract.level - 1) * 30
      : contract.level * trickValue;
  const overtrickValue = contract.strain === "C" || contract.strain === "D" ? 20 : 30;
  return base + overtricks * overtrickValue;
}

function botPace(game: InternalGame, confidence: number): number {
  const base = game.difficulty === "expert" ? 900 : game.difficulty === "club" ? 1200 : 1500;
  return Math.round(base + (1 - confidence) * 950 + nextRandom(game) * 550);
}

function nextSeat(seat: Seat): Seat {
  return seats[(seats.indexOf(seat) + 1) % seats.length];
}

function partnerOf(seat: Seat): Seat {
  return seat === "N" ? "S" : seat === "S" ? "N" : seat === "E" ? "W" : "E";
}

function partnershipOf(seat: Seat): Partnership {
  return seat === "N" || seat === "S" ? "NS" : "EW";
}

function seatLabel(seat: Seat): string {
  return { N: "North", E: "East", S: "South", W: "West" }[seat];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
