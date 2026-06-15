export type Seat = "N" | "E" | "S" | "W";
export type Suit = "S" | "H" | "D" | "C";
export type Strain = Suit | "NT";
export type Difficulty = "social" | "club" | "expert";
export type Phase = "bidding" | "play" | "complete" | "passedOut";

export type Card = {
  id: string;
  suit: Suit;
  rank: string;
  rankValue: number;
  hcp: number;
};

export type HiddenCard = {
  id: string;
  hidden: true;
};

export type CardView = Card | HiddenCard;

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
  partnership: "NS" | "EW";
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
  score: {
    nsTricks: number;
    ewTricks: number;
    resultText: string;
    contractPoints: number;
  };
  tableMessage: string;
};
