import type { BidInput, ClientGame, Difficulty } from "./types";

type GameEnvelope = {
  game: ClientGame;
};

export async function createGame(difficulty: Difficulty): Promise<ClientGame> {
  const response = await fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty })
  });
  return readGame(response);
}

export async function submitBid(gameId: string, bid: BidInput): Promise<ClientGame> {
  const response = await fetch(`/api/game/${gameId}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bid })
  });
  return readGame(response);
}

export async function submitPlay(gameId: string, cardId: string): Promise<ClientGame> {
  const response = await fetch(`/api/game/${gameId}/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId })
  });
  return readGame(response);
}

async function readGame(response: Response): Promise<ClientGame> {
  const payload = (await response.json()) as GameEnvelope | { error: string };
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : "The bridge table did not respond.");
  }
  return payload.game;
}
