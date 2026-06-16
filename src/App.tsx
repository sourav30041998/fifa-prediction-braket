import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  ChevronDown,
  Club,
  Coins,
  Crown,
  Diamond,
  Gem,
  Heart,
  Lightbulb,
  MessageCircle,
  Menu,
  RefreshCw,
  Settings,
  Share2,
  Shield,
  Spade,
  Sparkles,
  Star,
  Trophy,
  Undo2,
  UserRound,
  Users,
  ShoppingCart,
  X
} from "lucide-react";
import { createGame, submitBid, submitPlay } from "./api";
import type { BidCall, BidInput, Card, CardView, ClientGame, Difficulty, Seat, Strain, Suit, Trick } from "./types";

const seats: Seat[] = ["N", "E", "S", "W"];
const auctionColumns: Seat[] = ["W", "N", "E", "S"];
const strains: Strain[] = ["C", "D", "H", "S", "NT"];
const CARD_REVEAL_STAGGER_MS = 180;
const FINAL_CARD_READ_MS = 1400;
const TRICK_COLLECT_MS = 620;
const TRICK_COLLECT_START_MS = CARD_REVEAL_STAGGER_MS * 3 + FINAL_CARD_READ_MS;
const TRICK_SEQUENCE_MS = TRICK_COLLECT_START_MS + TRICK_COLLECT_MS;

const seatNames: Record<Seat, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West"
};

const suitSymbol: Record<Suit, string> = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663"
};

const suitIcon = {
  S: Spade,
  H: Heart,
  D: Diamond,
  C: Club,
  NT: Shield
};

const difficultyLabels: Record<Difficulty, string> = {
  social: "Social",
  club: "Club",
  expert: "Expert"
};

const lobbyChallenges = [
  { label: "Play 3 Hands", value: "3 / 3", reward: 100, progress: 100, complete: true },
  { label: "Make 2 Game Contracts", value: "1 / 2", reward: 150, progress: 50, complete: false },
  { label: "Score 500 Points", value: "320 / 500", reward: 200, progress: 64, complete: false }
];

const dailyDealCards: Array<{ rank: string; suit: Suit }> = [
  { rank: "Q", suit: "H" },
  { rank: "J", suit: "H" },
  { rank: "9", suit: "H" },
  { rank: "A", suit: "S" }
];

type Screen = "lobby" | "bidding" | "game" | "stats";

function App() {
  const [game, setGame] = useState<ClientGame | null>(null);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [difficulty, setDifficulty] = useState<Difficulty>("social");
  const [selectedBid, setSelectedBid] = useState<BidInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!game?.legalBids.length) {
      setSelectedBid(null);
      return;
    }
    const currentStillLegal = selectedBid && game.legalBids.some((bid) => bidKey(bid) === bidKey(selectedBid));
    if (!currentStillLegal) {
      const firstContract = game.legalBids.find((bid) => bid.type === "bid") ?? null;
      setSelectedBid(firstContract);
    }
  }, [game?.id, game?.legalBids, selectedBid]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "passedOut") {
      setScreen("stats");
      return;
    }
    if (game.phase === "complete") {
      if (screen !== "stats") {
        const timeout = window.setTimeout(() => setScreen("stats"), screen === "game" ? TRICK_SEQUENCE_MS : 0);
        return () => window.clearTimeout(timeout);
      }
      return;
    }
    if (screen === "bidding" && game.phase === "play") {
      setScreen("game");
    }
  }, [game, screen]);

  async function startGame(nextDifficulty = difficulty) {
    setBusy(true);
    setError(null);
    try {
      const fresh = await createGame(nextDifficulty);
      setGame(fresh);
      setDifficulty(nextDifficulty);
      setScreen("bidding");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a table.");
    } finally {
      setBusy(false);
    }
  }

  async function callBid(bid: BidInput) {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await submitBid(game.id, bid);
      setGame(updated);
      if (updated.phase === "play") {
        setScreen("game");
      } else if (updated.phase === "passedOut" || updated.phase === "complete") {
        setScreen("stats");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That call was rejected.");
    } finally {
      setBusy(false);
    }
  }

  async function play(cardId: string) {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await submitPlay(game.id, cardId);
      setGame(updated);
      if (updated.phase === "passedOut") {
        setScreen("stats");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That card was rejected.");
    } finally {
      setBusy(false);
    }
  }

  const legalContracts = useMemo(
    () => game?.legalBids.filter((bid): bid is BidInput & { type: "bid" } => bid.type === "bid") ?? [],
    [game?.legalBids]
  );

  const legalLevels = useMemo(() => [...new Set(legalContracts.map((bid) => bid.level))], [legalContracts]);
  const chosenContract = selectedBid?.type === "bid" ? selectedBid : legalContracts[0];
  const chosenLevel = chosenContract?.level ?? legalLevels[0] ?? 1;
  const legalStrainsForLevel = legalContracts.filter((bid) => bid.level === chosenLevel).map((bid) => bid.strain);

  if (screen === "lobby") {
    return <LobbyScreen busy={busy} error={error} onCasualPlay={() => void startGame("social")} />;
  }

  if (!game) {
    return (
      <main className="min-h-screen bg-baize-900 text-ivory">
        <div className="flex min-h-screen items-center justify-center">
          <div className="table-loader" />
        </div>
      </main>
    );
  }

  if (screen === "bidding") {
    return <BiddingScreen game={game} busy={busy} error={error} onBid={callBid} />;
  }

  if (screen === "stats") {
    return <StatsScreen game={game} onPlayAgain={() => void startGame(difficulty)} />;
  }

  return <TableScreen game={game} busy={busy} error={error} onPlay={play} />;
}

function TableScreen({
  game,
  busy,
  error,
  onPlay
}: {
  game: ClientGame;
  busy: boolean;
  error: string | null;
  onPlay: (cardId: string) => Promise<void>;
}) {
  const legalSet = new Set(game.legalCards);

  return (
    <main className="table-screen-page text-ivory">
      <div className="table-screen-texture" />
      <section className="table-stage" aria-label="Bridge Masters table play">
        <div className="table-screen-title">
          <span />
          <strong>
            <em>3</em>
            Table / Play Screen
          </strong>
          <span />
        </div>

        <div className="play-table-frame">
          <section className="play-table-felt" aria-label="Bridge play table">
            <TableBoardPanel game={game} />
            <TableTrickPanel game={game} />

            <TableHand
              game={game}
              seat="N"
              className="table-hand-north"
              legalSet={legalSet}
              disabled={busy}
              onPlay={onPlay}
            />
            <TableSideSeat game={game} seat="W" className="table-seat-west" />
            <TableSideSeat game={game} seat="E" className="table-seat-east" />
            <TableCenter game={game} busy={busy} />
            <TableHand
              game={game}
              seat="S"
              className="table-hand-south"
              legalSet={legalSet}
              disabled={busy}
              onPlay={onPlay}
            />

            <div className="table-actions-left">
              <button type="button">
                <Shield size={25} />
                <span>Claim</span>
              </button>
              <button type="button">
                <RefreshCw size={25} />
                <span>Concede</span>
              </button>
            </div>

            <div className="table-actions-right">
              <button type="button">
                <Undo2 size={27} />
                <span>Undo</span>
              </button>
              <button type="button">
                <Lightbulb size={28} />
                <span>Hint</span>
              </button>
            </div>

            {error && <div className="table-screen-error">{error}</div>}
          </section>
        </div>
      </section>
    </main>
  );
}

function TableBoardPanel({ game }: { game: ClientGame }) {
  return (
    <aside className="table-board-panel" aria-label="Board details">
      <span>Board</span>
      <strong>{boardNumber(game.seed)}</strong>
      <hr />
      <span>Dealer</span>
      <strong>{game.dealer}</strong>
      <hr />
      <span>Vulnerable</span>
      <strong>None</strong>
    </aside>
  );
}

function TableTrickPanel({ game }: { game: ClientGame }) {
  return (
    <aside className="table-trick-panel" aria-label="Trick count">
      <span>Tricks</span>
      <div>
        <strong>NS</strong>
        <b>{game.score.nsTricks}/13</b>
      </div>
      <div>
        <strong>EW</strong>
        <b>{game.score.ewTricks}/13</b>
      </div>
    </aside>
  );
}

function StatsScreen({ game, onPlayAgain }: { game: ClientGame; onPlayAgain: () => void }) {
  const stats = buildPostMatchStats(game);
  const topHand = groupCardsBySuit(game.hands[stats.topSeat]);

  return (
    <main className="stats-page text-ivory">
      <div className="stats-texture" />
      <section className="stats-stage" aria-label="Bridge Masters post-match stats">
        <header className="stats-topline">
          <div className="stats-brand">
            <div className="stats-logo">
              <Spade size={30} fill="currentColor" strokeWidth={1.6} />
            </div>
            <div>
              <h1>Bridge</h1>
              <p>Masters</p>
            </div>
          </div>
          <div className="stats-screen-title">
            <strong>4. Post-Match / Stats Screen</strong>
            <span />
          </div>
        </header>

        <div className="stats-frame">
          <section className="stats-result-row">
            <article className="match-result-card">
              <span>Match Result</span>
              <strong className={`result-${stats.outcome}`}>{stats.resultTitle}</strong>
              <p>{stats.resultDetail}</p>
            </article>

            <article className="stats-metric-card">
              <span>IMP</span>
              <strong>
                <em className={stats.impNs >= stats.impEw ? "positive" : ""}>{stats.impNs}</em>
                <i>-</i>
                <em className={stats.impEw > stats.impNs ? "negative" : ""}>{stats.impEw}</em>
              </strong>
              <p>{stats.impDeltaText}</p>
            </article>

            <article className="stats-metric-card">
              <span>MP</span>
              <strong>
                <em className={stats.mpPercent >= 50 ? "positive" : "negative"}>{stats.mpPercent}%</em>
              </strong>
              <p>Board estimate</p>
            </article>

            <div className="stats-actions">
              <button type="button">
                <Share2 size={18} />
                <span>Share</span>
              </button>
              <button className="play-again-button" onClick={onPlayAgain} type="button">
                <ChevronRight size={20} />
                <span>Play Again</span>
              </button>
            </div>
          </section>

          <section className="stats-main-grid">
            <article className="score-summary-panel">
              <h2>Score Summary</h2>
              <div className="score-summary-table">
                <div className="score-summary-head">
                  <span>Contract</span>
                  <span>By</span>
                  <span>NS</span>
                  <span>EW</span>
                  <span>Result</span>
                  <span>IMPs</span>
                </div>
                <div className="score-summary-row">
                  <span>{stats.contractLabel}</span>
                  <span>{stats.declarerLabel}</span>
                  <span>{stats.nsScoreText}</span>
                  <span>{stats.ewScoreText}</span>
                  <span>{stats.contractResult}</span>
                  <span className={stats.impDelta >= 0 ? "positive" : "negative"}>{formatSigned(stats.impDelta)}</span>
                </div>
                <div className="score-summary-row">
                  <span>Tricks</span>
                  <span>{stats.declarerLabel}</span>
                  <span>{game.score.nsTricks}</span>
                  <span>{game.score.ewTricks}</span>
                  <span>{stats.trickResult}</span>
                  <span>{stats.targetText}</span>
                </div>
                <div className="score-summary-row">
                  <span>Auction</span>
                  <span>{stats.openingBidder}</span>
                  <span>{stats.nsBidCount}</span>
                  <span>{stats.ewBidCount}</span>
                  <span>{stats.auctionLength} calls</span>
                  <span>{stats.averageBid}</span>
                </div>
                <div className="score-total-row">
                  <strong>Total</strong>
                  <span className={stats.rawNsScore >= 0 ? "positive" : "negative"}>{stats.nsScoreText}</span>
                </div>
              </div>
            </article>

            <article className="top-hand-panel">
              <h2>Top Hand</h2>
              <div className="top-hand-summary">
                <span>Board {stats.board}</span>
                <span>Dealer {game.dealer}</span>
                <span>Vul None</span>
              </div>
              <div className="top-hand-list">
                {(["S", "H", "D", "C"] as Suit[]).map((suit) => (
                  <div key={suit} className={suit === "H" || suit === "D" ? "is-red" : ""}>
                    <i>{suitSymbol[suit]}</i>
                    <span>{formatSideRanks(topHand[suit])}</span>
                  </div>
                ))}
              </div>
              <StatsHandDiagram game={game} />
            </article>

            <article className="performance-panel">
              <h2>Your Performance</h2>
              <div className="chart-heading">
                <span>MP Progress</span>
                <strong>This Match</strong>
              </div>
              <svg className="performance-chart" viewBox="0 0 420 190" role="img" aria-label="Matchpoint progress chart">
                <g className="chart-grid">
                  {[0, 25, 50, 75, 100].map((tick) => (
                    <line key={tick} x1="32" x2="408" y1={170 - tick * 1.45} y2={170 - tick * 1.45} />
                  ))}
                </g>
                <polyline points={stats.progressPolyline} />
                {stats.progressPoints.map((point, index) => (
                  <circle key={`${point.x}-${index}`} cx={point.x} cy={point.y} r="3.5" />
                ))}
                <g className="chart-labels">
                  <text x="4" y="172">0%</text>
                  <text x="0" y="100">50%</text>
                  <text x="0" y="28">100%</text>
                </g>
              </svg>
            </article>

            <article className="key-stats-panel">
              <h2>Key Stats</h2>
              <div className="key-stat-list">
                <div>
                  <span>Contract Made</span>
                  <strong>{stats.contractMadeText}</strong>
                </div>
                <div>
                  <span>Overtricks</span>
                  <strong>{formatSigned(stats.overtricks)}</strong>
                </div>
                <div>
                  <span>Declarer Tricks</span>
                  <strong>
                    {stats.declarerTricks} / {stats.targetTricks}
                  </strong>
                </div>
                <div>
                  <span>Average Bid</span>
                  <strong>{stats.averageBid}</strong>
                </div>
                <div>
                  <span>Alerts Made</span>
                  <strong>{stats.alertsMade}</strong>
                </div>
                <div>
                  <span>AI Decisions</span>
                  <strong>{game.aiActions.length}</strong>
                </div>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}

function StatsHandDiagram({ game }: { game: ClientGame }) {
  return (
    <div className="stats-hand-diagram" aria-label="Final hand diagram">
      {seats.map((seat) => (
        <div key={seat} className={`diagram-hand diagram-${seat.toLowerCase()}`}>
          <strong>{seat}</strong>
          {(["S", "H", "D", "C"] as Suit[]).map((suit) => {
            const cards = groupCardsBySuit(game.hands[seat])[suit];
            return (
              <span key={suit} className={suit === "H" || suit === "D" ? "is-red" : ""}>
                <i>{suitSymbol[suit]}</i>
                {formatSideRanks(cards)}
              </span>
            );
          })}
        </div>
      ))}
      <div className="diagram-compass">
        <span>N</span>
        <span>W</span>
        <span>E</span>
        <span>S</span>
      </div>
    </div>
  );
}

function TableHand({
  game,
  seat,
  className,
  legalSet,
  disabled,
  onPlay
}: {
  game: ClientGame;
  seat: Seat;
  className: string;
  legalSet: Set<string>;
  disabled: boolean;
  onPlay: (cardId: string) => Promise<void>;
}) {
  const hand = game.hands[seat];
  const visible = game.visibleSeats.includes(seat);
  const controlled = game.humanSeats.includes(seat);
  const isTurn = game.currentTurn === seat;
  const isDealer = game.dealer === seat;

  return (
    <section className={`table-hand-row ${className} ${isTurn ? "is-turn" : ""}`} aria-label={`${seatNames[seat]} hand`}>
      <TableSeatBadge seat={seat} isHuman={controlled} isDealer={isDealer} />
      <div className="table-card-row">
        {hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            playable={controlled && isTurn && visibleCard(card) && legalSet.has(card.id)}
            disabled={disabled}
            onPlay={onPlay}
          />
        ))}
      </div>
      {!visible && <span className="hidden-hand-note">{hand.length} cards concealed</span>}
    </section>
  );
}

function TableSeatBadge({ seat, isHuman, isDealer }: { seat: Seat; isHuman: boolean; isDealer: boolean }) {
  return (
    <div className="table-seat-badge">
      <strong>{seatNames[seat]}</strong>
      {isHuman && <span className="you-tag">You</span>}
      {isDealer && <span className="dealer-tag">D</span>}
    </div>
  );
}

function TableSideSeat({ game, seat, className }: { game: ClientGame; seat: Seat; className: string }) {
  const hand = game.hands[seat];
  const visible = game.visibleSeats.includes(seat);
  const isTurn = game.currentTurn === seat;
  const isDealer = game.dealer === seat;
  const grouped = groupCardsBySuit(hand);

  return (
    <aside className={`table-side-seat ${className} ${isTurn ? "is-turn" : ""}`} aria-label={`${seatNames[seat]} summary`}>
      <span className="side-online-dot" />
      <header>
        <strong>{seatNames[seat]}</strong>
        {isDealer && <span className="dealer-tag">D</span>}
      </header>
      <div className="side-suit-list">
        {(["S", "H", "D", "C"] as Suit[]).map((suit) => (
          <div key={suit} className={suit === "H" || suit === "D" ? "is-red" : ""}>
            <i>{suitSymbol[suit]}</i>
            <span>{visible ? formatSideRanks(grouped[suit]) : concealedSuitLine(hand.length, suit)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function TableCenter({ game, busy }: { game: ClientGame; busy: boolean }) {
  const [completedTrickView, setCompletedTrickView] = useState<{
    trick: Trick;
    stage: "reveal" | "collect";
    existingCardIds: Set<string>;
  } | null>(null);
  const visibleCardIdsRef = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    const latestTrick = game.tricks.at(-1);
    if (!latestTrick || latestTrick.plays.length < 4) {
      setCompletedTrickView(null);
      return;
    }

    const existingCardIds = new Set(visibleCardIdsRef.current);
    setCompletedTrickView({ trick: latestTrick, stage: "reveal", existingCardIds });
    const collectTimeout = window.setTimeout(() => {
      setCompletedTrickView((current) =>
        current?.trick === latestTrick ? { ...current, trick: latestTrick, stage: "collect" } : current
      );
    }, TRICK_COLLECT_START_MS);
    const clearTimeout = window.setTimeout(() => setCompletedTrickView(null), TRICK_SEQUENCE_MS);
    return () => {
      window.clearTimeout(collectTimeout);
      window.clearTimeout(clearTimeout);
    };
  }, [game.id, game.tricks.length]);

  const displayTrick = completedTrickView?.trick ?? game.currentTrick;
  const transitioningCompletedTrick = Boolean(completedTrickView);
  const collectingTrick = completedTrickView?.stage === "collect";
  const winningSeat = completedTrickView?.trick.winner;
  const existingCompletedPlayCount =
    displayTrick?.plays.filter((play) => completedTrickView?.existingCardIds.has(play.card.id)).length ?? 0;

  useLayoutEffect(() => {
    visibleCardIdsRef.current = new Set((displayTrick?.plays ?? []).map((play) => play.card.id));
  }, [displayTrick]);

  const trickSlots = seats.map((seat) => {
    const play = displayTrick?.plays.find((item) => item.seat === seat);
    const rawPlayIndex = play ? displayTrick?.plays.findIndex((item) => item.seat === seat) ?? 0 : 0;
    const existingPlay = play ? Boolean(completedTrickView?.existingCardIds.has(play.card.id)) : false;
    const playIndex = transitioningCompletedTrick ? Math.max(0, rawPlayIndex - existingCompletedPlayCount) : rawPlayIndex;
    return { seat, play, playIndex, existingPlay };
  });
  const message =
    transitioningCompletedTrick && winningSeat
      ? `${seatNames[winningSeat]} won the trick`
      : busy
        ? "Table thinking..."
        : game.tableMessage;

  return (
    <section
      className={`table-center-play ${transitioningCompletedTrick ? "is-completed-trick" : ""} ${
        collectingTrick && winningSeat ? `is-collecting-trick collect-winner-${winningSeat.toLowerCase()}` : ""
      }`}
      aria-label="Current trick"
    >
      <div className="table-center-ring" />
      <div className="compass-core" aria-hidden="true">
        <span className="compass-n">N</span>
        <span className="compass-e">E</span>
        <span className="compass-s">S</span>
        <span className="compass-w">W</span>
        <span className="compass-diamond" />
      </div>
      {trickSlots.map(({ seat, play, playIndex, existingPlay }) => {
        return (
          <div
            key={seat}
            className={`table-play-slot table-play-${seat.toLowerCase()} ${game.currentTurn === seat ? "is-next" : ""} ${
              transitioningCompletedTrick && winningSeat === seat ? "is-winner" : ""
            } ${existingPlay ? "is-existing-play" : "is-new-play"}`}
            style={play ? ({ "--play-index": playIndex } as CSSProperties) : undefined}
          >
            {play ? <PlayingCard key={play.card.id} card={play.card} table /> : <div className="table-empty-card" />}
          </div>
        );
      })}
      <div className="table-message-chip">{message}</div>
    </section>
  );
}

function BiddingScreen({
  game,
  busy,
  error,
  onBid
}: {
  game: ClientGame;
  busy: boolean;
  error: string | null;
  onBid: (bid: BidInput) => Promise<void>;
}) {
  const legalKeys = new Set(game.legalBids.map(bidKey));
  const contractBids: Array<BidInput & { type: "bid" }> = [];
  for (let level = 1; level <= 7; level += 1) {
    for (const strain of strains) {
      contractBids.push({ type: "bid", level, strain });
    }
  }
  const lastCall = game.bidding[game.bidding.length - 1];
  const isHumanTurn = game.phase === "bidding" && game.currentTurn === "S";

  return (
    <main className="bidding-page text-ivory">
      <div className="bidding-texture" />
      <section className="bidding-stage" aria-label="Bridge Masters bidding">
        <div className="bidding-screen-title">
          <span />
          <strong>2. Bidding Screen</strong>
          <span />
        </div>

        <div className="bidding-table-frame">
          <section className="bidding-felt" aria-label="Auction table">
            <BiddingBoardPanel game={game} />
            <BiddingContractPanel game={game} />

            <BiddingSeatPanel game={game} seat="N" className="bid-seat-north" />
            <BiddingSeatPanel game={game} seat="W" className="bid-seat-west" />
            <BiddingSeatPanel game={game} seat="E" className="bid-seat-east" />

            <AuctionMatrix game={game} />

            <section className="bidding-pad" aria-label="Available calls">
              <BiddingSouthHand game={game} />

              <div className="bidding-pad-row">
                <button
                  className="bid-call-button pass-call"
                  disabled={busy || !legalKeys.has("P")}
                  onClick={() => void onBid({ type: "pass" })}
                  type="button"
                >
                  Pass
                </button>

                <div className="nt-ladder" aria-label="No trump bids">
                  {[1, 2, 3, 4, 5, 6, 7].map((level) => {
                    const bid: BidInput & { type: "bid" } = { type: "bid", level, strain: "NT" };
                    const legal = legalKeys.has(bidKey(bid));
                    return (
                      <button
                        key={`${level}NT`}
                        className="bid-call-button bid-nt"
                        disabled={busy || !legal}
                        onClick={() => void onBid(bid)}
                        type="button"
                      >
                        {level}NT
                      </button>
                    );
                  })}
                </div>

                <div className="bidding-pad-tools">
                  <button className="bid-tool-button" type="button">
                    <AlertTriangle size={22} />
                    <span>Alert</span>
                  </button>
                  <button className="bid-tool-button" type="button">
                    <MessageCircle size={22} />
                    <span>Explain</span>
                  </button>
                </div>
              </div>

              <div className="contract-bid-grid" aria-label="Suit bids">
                {contractBids
                  .filter((bid): bid is BidInput & { type: "bid"; strain: Suit } => bid.strain !== "NT")
                  .map((bid) => {
                    const legal = legalKeys.has(bidKey(bid));
                    return (
                      <button
                        key={bidKey(bid)}
                        className={`bid-call-button suit-bid suit-${bid.strain}`}
                        disabled={busy || !legal}
                        onClick={() => void onBid(bid)}
                        type="button"
                      >
                        <span>{bid.level}</span>
                        <i>{suitSymbol[bid.strain]}</i>
                      </button>
                    );
                  })}
              </div>

              <div className="bidding-status-line">
                <span>{busy ? "Table thinking..." : isHumanTurn ? "Your call, South." : game.tableMessage}</span>
                {lastCall && (
                  <strong>
                    Last call: {seatNames[lastCall.seat]} {lastCall.label}
                  </strong>
                )}
              </div>

              {error && <div className="bidding-error">{error}</div>}
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}

function BiddingSouthHand({ game }: { game: ClientGame }) {
  const lastCall = [...game.bidding].reverse().find((call) => call.seat === "S");
  const isTurn = game.currentTurn === "S" && game.phase === "bidding";
  const isDealer = game.dealer === "S";

  return (
    <section className={`bidding-south-hand ${isTurn ? "is-turn" : ""}`} aria-label="South bidding hand">
      <div className="bidding-hand-heading">
        <div>
          <strong>South</strong>
          <span className="you-tag">You</span>
          {isDealer && <span className="dealer-tag">D</span>}
        </div>
        <p>{lastCall ? `Last call: ${lastCall.label}` : "Your hand for the auction"}</p>
      </div>
      <div className="bidding-hand-cards">
        {game.hands.S.map((card) => (
          <PlayingCard key={card.id} card={card} compact />
        ))}
      </div>
    </section>
  );
}

function BiddingBoardPanel({ game }: { game: ClientGame }) {
  return (
    <aside className="bidding-board-panel" aria-label="Board details">
      <span>Board</span>
      <strong>{boardNumber(game.seed)}</strong>
      <hr />
      <span>Dealer</span>
      <strong>{game.dealer}</strong>
      <hr />
      <span>Vulnerable</span>
      <strong>None</strong>
    </aside>
  );
}

function BiddingContractPanel({ game }: { game: ClientGame }) {
  const latestContract = [...game.bidding].reverse().find((call) => call.type === "bid");
  const declarer = game.contract?.declarer ?? latestContract?.seat;

  return (
    <aside className="bidding-contract-panel" aria-label="Contract preview">
      <span>Contract</span>
      <strong>{game.contract?.label ?? latestContract?.label ?? "-"}</strong>
      <p>{declarer ? `By ${seatNames[declarer]}` : "Auction open"}</p>
      <hr />
      <span>Result</span>
      <strong className="contract-result">-</strong>
    </aside>
  );
}

function BiddingSeatPanel({ game, seat, className }: { game: ClientGame; seat: Seat; className: string }) {
  const lastCall = [...game.bidding].reverse().find((call) => call.seat === seat);
  const isTurn = game.currentTurn === seat && game.phase === "bidding";
  const isHuman = game.humanSeats.includes(seat);
  const isDealer = game.dealer === seat;

  return (
    <article className={`bidding-seat-panel ${className} ${isTurn ? "is-turn" : ""}`}>
      <header>
        <strong>{seatNames[seat]}</strong>
        {isHuman && <span className="you-tag">You</span>}
        {isDealer && <span className="dealer-tag">D</span>}
      </header>
      <div>{lastCall?.label ?? (isTurn ? "..." : "-")}</div>
    </article>
  );
}

function AuctionMatrix({ game }: { game: ClientGame }) {
  const rows = auctionRows(game);

  return (
    <section className="auction-matrix" aria-label="Auction history">
      <div className="auction-matrix-head">
        {auctionColumns.map((seat) => (
          <span key={seat}>{seat}</span>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div className="auction-matrix-row" key={rowIndex}>
          {auctionColumns.map((seat) => {
            const call = row[seat];
            const isLast = call && game.bidding[game.bidding.length - 1] === call;
            return (
              <span
                key={seat}
                className={`${call?.type === "pass" ? "is-pass" : ""} ${isLast ? "is-last" : ""}`}
                title={call?.alert ?? ""}
              >
                {call?.label ?? ""}
              </span>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function LobbyScreen({
  busy,
  error,
  onCasualPlay
}: {
  busy: boolean;
  error: string | null;
  onCasualPlay: () => void;
}) {
  return (
    <main className="lobby-page text-ivory">
      <div className="lobby-texture" />
      <section className="lobby-stage" aria-label="Bridge Masters lobby">
        <div className="lobby-title">
          <span className="title-rule" />
          <strong>1. HOME / LOBBY</strong>
          <span className="title-rule" />
        </div>

        <div className="lobby-frame">
          <header className="lobby-topbar">
            <div className="lobby-brand">
              <button className="lobby-square-button" title="Menu" type="button">
                <Menu size={30} />
              </button>
              <div className="lobby-logo" aria-hidden="true">
                <Spade size={30} fill="currentColor" strokeWidth={1.6} />
              </div>
              <div>
                <h1>Bridge</h1>
                <p>Masters</p>
              </div>
            </div>

            <div className="lobby-wallet" aria-label="Player balances">
              <span>
                <Star size={28} fill="currentColor" />
                1,250
              </span>
              <span>
                <Gem size={28} />
                48,750
              </span>
              <button className="lobby-square-button has-badge" title="Notifications" type="button">
                <Bell size={28} />
              </button>
              <button className="lobby-square-button" title="Settings" type="button">
                <Settings size={28} />
              </button>
            </div>
          </header>

          <div className="lobby-content">
            <aside className="lobby-profile" aria-label="Player profile">
              <section className="profile-hero">
                <div className="profile-topline">
                  <div className="avatar-frame">
                    <div className="avatar-portrait">
                      <span className="avatar-hair" />
                      <span className="avatar-face" />
                      <span className="avatar-suit" />
                    </div>
                    <span className="online-dot" />
                  </div>
                  <div className="profile-name">
                    <h2>NorthStar</h2>
                    <p>Expert</p>
                  </div>
                </div>
                <div className="xp-row">
                  <span className="level-badge">23</span>
                  <div>
                    <strong>2,850 / 5,000 XP</strong>
                    <span className="progress-track">
                      <span style={{ width: "57%" }} />
                    </span>
                  </div>
                  <em>+9</em>
                </div>
              </section>

              <section className="profile-card">
                <div className="profile-card-heading">
                  <span>Partnership Rating</span>
                  <strong>A%</strong>
                </div>
                <div className="rating-row">
                  <div>
                    <strong>78%</strong>
                    <p>Top 12%</p>
                  </div>
                  <svg className="rating-chart" viewBox="0 0 160 72" role="img" aria-label="Partnership rating trend">
                    <path d="M4 58 L18 51 L31 47 L44 38 L58 40 L72 31 L86 33 L100 24 L114 22 L128 16 L142 25 L156 12" />
                  </svg>
                </div>
              </section>

              <section className="profile-pill">
                <Users size={34} />
                <div>
                  <strong>Friends</strong>
                  <span>12 Online</span>
                </div>
              </section>

              <section className="profile-pill">
                <Shield size={34} />
                <div>
                  <strong>Club</strong>
                  <span>Emerald Club</span>
                </div>
              </section>
            </aside>

            <section className="lobby-main" aria-label="Play modes">
              <h2>Play</h2>

              <div className="mode-grid">
                <button className="mode-card is-casual" disabled={busy} onClick={onCasualPlay} type="button">
                  <Spade size={58} fill="currentColor" strokeWidth={1.6} />
                  <strong>Casual Play</strong>
                  <span>Relaxed games at your pace</span>
                </button>

                <button className="mode-card is-disabled" disabled type="button">
                  <Crown size={64} fill="currentColor" strokeWidth={1.5} />
                  <strong>Ranked Match</strong>
                  <span>Compete and climb the ranks</span>
                </button>

                <button className="mode-card is-disabled" disabled type="button">
                  <Trophy size={60} fill="currentColor" strokeWidth={1.5} />
                  <strong>Tournaments</strong>
                  <span>Events and championships</span>
                </button>
              </div>

              <div className="lobby-lower">
                <section className="challenge-panel" aria-label="Daily challenges">
                  <h3>Daily Challenges</h3>
                  <div className="challenge-list">
                    {lobbyChallenges.map((challenge) => (
                      <article key={challenge.label} className="challenge-row">
                        <div>
                          <strong>{challenge.label}</strong>
                          <span className="progress-track">
                            <span style={{ width: `${challenge.progress}%` }} />
                          </span>
                        </div>
                        <span className="challenge-progress">{challenge.value}</span>
                        <span className="reward">
                          <Coins size={18} />
                          {challenge.reward}
                        </span>
                        {challenge.complete ? <Award size={18} /> : <ChevronRight size={18} />}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="daily-deal" aria-label="Daily deal">
                  <h3>Daily Deal</h3>
                  <p>
                    <Sparkles size={16} />
                    10h 24m
                  </p>
                  <div className="deal-card-fan" aria-hidden="true">
                    {dailyDealCards.map((card, index) => (
                      <span
                        key={`${card.rank}-${card.suit}`}
                        className={card.suit === "H" || card.suit === "D" ? "is-red" : "is-black"}
                      >
                        <b>{card.rank}</b>
                        <i>{suitSymbol[card.suit]}</i>
                      </span>
                    ))}
                  </div>
                  <button type="button">Claim</button>
                </section>
              </div>

              {error && <div className="lobby-error">{error}</div>}
            </section>
          </div>

          <nav className="lobby-nav" aria-label="Lobby navigation">
            <a className="is-active" href="#home">
              <Spade size={27} fill="currentColor" />
              <span>Home</span>
            </a>
            <a href="#social">
              <Users size={27} />
              <span>Social</span>
            </a>
            <a href="#learn">
              <BookOpen size={27} />
              <span>Learn</span>
            </a>
            <a href="#store">
              <ShoppingCart size={27} />
              <span>Store</span>
            </a>
            <a href="#profile">
              <UserRound size={27} />
              <span>Profile</span>
            </a>
          </nav>
        </div>
      </section>
    </main>
  );
}

function BoardBadge({ game }: { game: ClientGame }) {
  return (
    <div className="board-badge">
      <span>Board</span>
      <strong>{boardNumber(game.seed)}</strong>
      <span>Dealer</span>
      <strong>{game.dealer}</strong>
      <span>Vulnerable</span>
      <strong>None</strong>
    </div>
  );
}

function TrickBadge({ game }: { game: ClientGame }) {
  return (
    <div className="trick-badge">
      <span>Tricks</span>
      <strong>NS {game.score.nsTricks}/13</strong>
      <strong>EW {game.score.ewTricks}/13</strong>
    </div>
  );
}

function TableActionBar({
  game,
  busy,
  legalContracts,
  legalLevels,
  legalStrainsForLevel,
  chosenContract,
  chosenLevel,
  selectedBid,
  setSelectedBid,
  callBid
}: {
  game: ClientGame;
  busy: boolean;
  legalContracts: Array<BidInput & { type: "bid" }>;
  legalLevels: number[];
  legalStrainsForLevel: Strain[];
  chosenContract?: BidInput & { type: "bid" };
  chosenLevel: number;
  selectedBid: BidInput | null;
  setSelectedBid: (bid: BidInput | null) => void;
  callBid: (bid: BidInput) => Promise<void>;
}) {
  const isBiddingTurn = game.phase === "bidding" && game.currentTurn === "S";
  const activeKey = selectedBid ? bidKey(selectedBid) : chosenContract ? bidKey(chosenContract) : "";

  return (
    <div className="table-action-bar">
      {isBiddingTurn ? (
        <>
          <button className="pass-button" disabled={busy} onClick={() => void callBid({ type: "pass" })}>
            Pass
          </button>

          <label className="select-shell level-picker">
            <span>Level</span>
            <select
              value={chosenLevel}
              disabled={!legalContracts.length || busy}
              onChange={(event) => {
                const level = Number(event.target.value);
                const first = legalContracts.find((bid) => bid.level === level);
                setSelectedBid(first ?? null);
              }}
            >
              {legalLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </label>

          <div className="strain-grid">
            {strains.map((strain) => {
              const Icon = suitIcon[strain];
              const legal = legalStrainsForLevel.includes(strain);
              const active = activeKey === `${chosenLevel}${strain}`;
              return (
                <button
                  key={strain}
                  className={active ? "is-active" : ""}
                  disabled={!legal || busy}
                  onClick={() => setSelectedBid({ type: "bid", level: chosenLevel, strain })}
                  title={strainName(strain)}
                >
                  <Icon size={17} />
                  <span>{strain}</span>
                </button>
              );
            })}
          </div>

          <button
            className="bid-button"
            disabled={!chosenContract || busy}
            onClick={() => chosenContract && void callBid(chosenContract)}
          >
            Bid {chosenContract ? `${chosenContract.level}${chosenContract.strain}` : ""}
          </button>

          <button className="explain-button" type="button">
            <Sparkles size={16} />
            Explain
          </button>
        </>
      ) : (
        <div className="action-status">
          <Crown size={18} />
          <span>{game.tableMessage}</span>
        </div>
      )}
    </div>
  );
}

function PlayerMat({
  seat,
  game,
  className,
  onPlay,
  disabled,
  orientation
}: {
  seat: Seat;
  game: ClientGame;
  className: string;
  onPlay: (cardId: string) => Promise<void>;
  disabled: boolean;
  orientation: "horizontal" | "vertical";
}) {
  const hand = game.hands[seat];
  const stats = game.handStats[seat];
  const isTurn = game.currentTurn === seat;
  const controlled = game.humanSeats.includes(seat);
  const visible = game.visibleSeats.includes(seat);
  const legalSet = new Set(game.legalCards);

  return (
    <section className={`player-mat ${className} ${isTurn ? "is-turn" : ""}`}>
      <div className="player-label">
        <span className="seat-chip">{seat}</span>
        <div>
          <strong>{seatNames[seat]}</strong>
          <span>
            {visible && stats.hcp !== undefined ? `${stats.hcp} HCP · ${stats.shape}` : `${stats.count} cards`}
            {game.contract?.dummy === seat && game.dummyRevealed ? " · Dummy" : ""}
          </span>
        </div>
      </div>
      <div className={`hand-strip ${orientation === "vertical" ? "is-vertical" : ""}`}>
        {hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            compact={orientation === "vertical"}
            playable={controlled && isTurn && !("hidden" in card) && legalSet.has(card.id)}
            disabled={disabled}
            onPlay={onPlay}
          />
        ))}
      </div>
    </section>
  );
}

function CenterTable({ game, busy }: { game: ClientGame; busy: boolean }) {
  const trickSlots = seats.map((seat) => game.currentTrick?.plays.find((play) => play.seat === seat));

  return (
    <section className="center-table">
      <div className="center-glow" />
      <div className="trick-grid">
        {trickSlots.map((play, index) => {
          const seat = seats[index];
          return (
            <div key={seat} className={`trick-slot trick-${seat.toLowerCase()} ${game.currentTurn === seat ? "is-next" : ""}`}>
              <span>{seat}</span>
              {play ? <PlayingCard card={play.card} table /> : <div className="empty-card" />}
            </div>
          );
        })}
      </div>
      <div className="table-core">
        <div className="pulse-dot" />
        <strong>{game.phase === "bidding" ? "Auction" : game.contract?.label ?? "Bridge"}</strong>
        <span>{busy ? "Table thinking" : game.currentTurn ? `${seatNames[game.currentTurn]} turn` : game.phase}</span>
      </div>
    </section>
  );
}

function PlayingCard({
  card,
  playable = false,
  disabled = false,
  compact = false,
  table = false,
  onPlay
}: {
  card: CardView;
  playable?: boolean;
  disabled?: boolean;
  compact?: boolean;
  table?: boolean;
  onPlay?: (cardId: string) => Promise<void>;
}) {
  if ("hidden" in card) {
    return <div className={`playing-card card-back ${compact ? "is-compact" : ""} ${table ? "is-table" : ""}`} />;
  }

  const red = card.suit === "H" || card.suit === "D";
  const displayRank = card.rank === "T" ? "10" : card.rank;

  return (
    <button
      className={`playing-card ${red ? "is-red" : "is-black"} ${playable ? "is-playable" : ""} ${
        compact ? "is-compact" : ""
      } ${table ? "is-table" : ""}`}
      disabled={!playable || disabled}
      onClick={() => playable && onPlay?.(card.id)}
      title={`${displayRank} of ${strainName(card.suit)}`}
    >
      <span className="simple-card-face">
        <b>{displayRank}</b>
        <i>{suitSymbol[card.suit]}</i>
      </span>
    </button>
  );
}

function AuctionPanel({ game }: { game: ClientGame }) {
  const rows = [];
  for (let index = 0; index < Math.max(game.bidding.length, 4); index += 4) {
    rows.push(game.bidding.slice(index, index + 4));
  }

  return (
    <div className="panel-section">
      <div className="panel-title">
        <Sparkles size={18} />
        <span>Auction</span>
      </div>
      <div className="auction-table">
        <div className="auction-head">
          {seats.map((seat) => (
            <span key={seat}>{seat}</span>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div className="auction-row" key={rowIndex}>
            {seats.map((seat, seatIndex) => {
              const call = row.find((item) => item.seat === seat);
              const absoluteIndex = rowIndex * 4 + seatIndex;
              const fallback = absoluteIndex < game.bidding.length ? "" : "·";
              return (
                <span key={seat} title={call?.alert ?? ""}>
                  {call?.label ?? fallback}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function BotPanel({ game }: { game: ClientGame }) {
  return (
    <div className="panel-section">
      <div className="panel-title">
        <BrainCircuit size={18} />
        <span>Table Read</span>
      </div>
      <div className="bot-feed">
        {game.aiActions.length === 0 && <p className="muted">Waiting for the first table inference.</p>}
        {game.aiActions.slice(0, 4).map((action) => (
          <article key={action.id}>
            <div>
              <strong>
                {action.seat} {action.kind === "bid" ? "called" : "played"} {action.label}
              </strong>
              <span>{Math.round(action.confidence * 100)}%</span>
            </div>
            <p>{action.thought}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function strainName(strain: Strain): string {
  return {
    C: "Clubs",
    D: "Diamonds",
    H: "Hearts",
    S: "Spades",
    NT: "No Trump"
  }[strain];
}

function boardNumber(seed: string): number {
  return (seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % 16) + 1;
}

function visibleCard(card: CardView): card is Card {
  return !("hidden" in card);
}

function groupCardsBySuit(hand: CardView[]): Record<Suit, Card[]> {
  return (["S", "H", "D", "C"] as Suit[]).reduce(
    (groups, suit) => {
      groups[suit] = hand.filter((card): card is Card => visibleCard(card) && card.suit === suit);
      return groups;
    },
    { S: [], H: [], D: [], C: [] } as Record<Suit, Card[]>
  );
}

function formatSideRanks(cards: Card[]): string {
  if (!cards.length) return "-";
  return cards.map((card) => (card.rank === "T" ? "10" : card.rank)).join(" ");
}

function concealedSuitLine(cardCount: number, suit: Suit): string {
  return suit === "S" ? `${cardCount} cards` : "-";
}

type PostMatchStats = {
  board: number;
  outcome: "win" | "loss" | "draw";
  resultTitle: string;
  resultDetail: string;
  contractLabel: string;
  declarerLabel: string;
  contractResult: string;
  trickResult: string;
  targetText: string;
  targetTricks: number;
  declarerTricks: number;
  rawNsScore: number;
  nsScoreText: string;
  ewScoreText: string;
  impNs: number;
  impEw: number;
  impDelta: number;
  impDeltaText: string;
  mpPercent: number;
  overtricks: number;
  contractMadeText: string;
  topSeat: Seat;
  topHcp: number;
  openingBidder: string;
  auctionLength: number;
  nsBidCount: number;
  ewBidCount: number;
  averageBid: string;
  alertsMade: number;
  progressPoints: Array<{ x: number; y: number }>;
  progressPolyline: string;
};

function buildPostMatchStats(game: ClientGame): PostMatchStats {
  const board = boardNumber(game.seed);
  const contract = game.contract;
  const auctionLength = game.bidding.length;
  const contractCalls = game.bidding.filter((call): call is BidCall & { type: "bid" } => call.type === "bid");
  const nsBidCount = contractCalls.filter((call) => call.seat === "N" || call.seat === "S").length;
  const ewBidCount = contractCalls.length - nsBidCount;
  const averageBid =
    contractCalls.length > 0
      ? (contractCalls.reduce((sum, call) => sum + call.level, 0) / contractCalls.length).toFixed(1)
      : "-";
  const alertsMade = game.bidding.filter((call) => Boolean(call.alert)).length;

  let rawNsScore = 0;
  let contractLabel = "Passed Out";
  let declarerLabel = "-";
  let contractResult = "Flat";
  let trickResult = "No contract";
  let targetText = "-";
  let targetTricks = 0;
  let declarerTricks = 0;
  let overtricks = 0;

  if (contract) {
    contractLabel = contract.label;
    declarerLabel = contract.declarer;
    targetTricks = contract.level + 6;
    declarerTricks = contract.partnership === "NS" ? game.score.nsTricks : game.score.ewTricks;
    overtricks = declarerTricks - targetTricks;
    const declarerScore = duplicateBridgeScore(contract, overtricks);
    rawNsScore = contract.partnership === "NS" ? declarerScore : -declarerScore;
    contractResult =
      overtricks >= 0
        ? overtricks === 0
          ? "Made"
          : `+${overtricks}`
        : `${overtricks}`;
    trickResult = `${declarerTricks} tricks`;
    targetText = `${targetTricks} target`;
  }

  const outcome: PostMatchStats["outcome"] = rawNsScore > 0 ? "win" : rawNsScore < 0 ? "loss" : "draw";
  const resultTitle = outcome === "win" ? "You Won!" : outcome === "loss" ? "You Lost" : "Draw";
  const resultDetail =
    game.phase === "passedOut"
      ? "The board was passed out with no contract score."
      : `${contractLabel} ${contractResult.toLowerCase()} for ${formatScore(Math.abs(rawNsScore))} points.`;

  const impDelta = rawNsScore === 0 ? 0 : scoreToImps(Math.abs(rawNsScore)) * Math.sign(rawNsScore);
  const impNs = impDelta > 0 ? impDelta : 0;
  const impEw = impDelta < 0 ? Math.abs(impDelta) : 0;
  const mpPercent = Math.round(clamp(50 + rawNsScore / 12, 5, 95) * 10) / 10;
  const progressPoints = buildProgressPoints(game, mpPercent);

  const topSeat = seats.reduce((best, seat) => (handHcp(game.hands[seat]) > handHcp(game.hands[best]) ? seat : best), "S" as Seat);
  const topHcp = handHcp(game.hands[topSeat]);

  return {
    board,
    outcome,
    resultTitle,
    resultDetail,
    contractLabel,
    declarerLabel,
    contractResult,
    trickResult,
    targetText,
    targetTricks,
    declarerTricks,
    rawNsScore,
    nsScoreText: rawNsScore === 0 ? "-" : rawNsScore > 0 ? String(rawNsScore) : "-",
    ewScoreText: rawNsScore === 0 ? "-" : rawNsScore < 0 ? String(Math.abs(rawNsScore)) : "-",
    impNs,
    impEw,
    impDelta,
    impDeltaText: `${formatSigned(impDelta)} IMP${Math.abs(impDelta) === 1 ? "" : "s"}`,
    mpPercent,
    overtricks: Math.max(overtricks, 0),
    contractMadeText: contract ? (overtricks >= 0 ? "1 / 1" : "0 / 1") : "0 / 0",
    topSeat,
    topHcp,
    openingBidder: contractCalls[0]?.seat ?? "-",
    auctionLength,
    nsBidCount,
    ewBidCount,
    averageBid,
    alertsMade,
    progressPoints,
    progressPolyline: progressPoints.map((point) => `${point.x},${point.y}`).join(" ")
  };
}

function duplicateBridgeScore(contract: NonNullable<ClientGame["contract"]>, trickDelta: number): number {
  if (trickDelta < 0) {
    return -50 * Math.abs(trickDelta);
  }

  const trickValue = contract.strain === "C" || contract.strain === "D" ? 20 : 30;
  const base = contract.strain === "NT" ? 40 + (contract.level - 1) * 30 : contract.level * trickValue;
  const overtrickValue = contract.strain === "C" || contract.strain === "D" ? 20 : 30;
  const gameBonus = base >= 100 ? 300 : 50;
  const slamBonus = contract.level === 6 ? 500 : contract.level === 7 ? 1000 : 0;
  return base + trickDelta * overtrickValue + gameBonus + slamBonus;
}

function scoreToImps(score: number): number {
  const scale = [
    [20, 1],
    [50, 2],
    [90, 3],
    [130, 4],
    [170, 5],
    [220, 6],
    [270, 7],
    [320, 8],
    [370, 9],
    [430, 10],
    [500, 11],
    [600, 12],
    [750, 13],
    [900, 14],
    [1100, 15],
    [1300, 16],
    [1500, 17],
    [1750, 18],
    [2000, 19],
    [2250, 20],
    [2500, 21],
    [3000, 22],
    [3500, 23]
  ];
  const found = scale.find(([limit]) => score <= limit);
  return found?.[1] ?? 24;
}

function buildProgressPoints(game: ClientGame, finalMp: number): Array<{ x: number; y: number }> {
  const tricks = game.tricks.length ? game.tricks : [];
  const values = tricks.map((_, index) => {
    const nsWins = tricks.slice(0, index + 1).filter((trick) => trick.winner === "N" || trick.winner === "S").length;
    const trickShare = (nsWins / (index + 1)) * 100;
    return Math.round((trickShare * 0.45 + finalMp * 0.55) * 10) / 10;
  });
  const series = [50, ...values, finalMp].slice(-14);
  if (series.length === 1) series.push(finalMp);
  return series.map((value, index) => {
    const x = 32 + (376 / Math.max(series.length - 1, 1)) * index;
    const y = 170 - clamp(value, 0, 100) * 1.45;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

function handHcp(hand: CardView[]): number {
  return hand.reduce((sum, card) => (visibleCard(card) ? sum + card.hcp : sum), 0);
}

function formatScore(score: number): string {
  return score.toLocaleString("en-US");
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function auctionRows(game: ClientGame): Array<Partial<Record<Seat, BidCall>>> {
  const rows: Array<Partial<Record<Seat, BidCall>>> = [];
  let row: Partial<Record<Seat, BidCall>> = {};

  for (const call of game.bidding) {
    if (row[call.seat]) {
      rows.push(row);
      row = {};
    }
    row[call.seat] = call;
  }

  rows.push(row);
  while (rows.length < 3) {
    rows.push({});
  }

  return rows.slice(-5);
}

function bidKey(bid: BidInput | null): string {
  if (!bid) return "";
  return bid.type === "pass" ? "P" : `${bid.level}${bid.strain}`;
}

export default App;
