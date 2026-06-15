import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createGame, getGame, listGames, submitBid, submitPlay, type Difficulty } from "./bridge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 5173);

const app = express();
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "bridge-table" });
});

app.get("/api/games", (_request, response) => {
  response.json({ games: listGames() });
});

app.post("/api/game", (request, response) => {
  const difficulty = parseDifficulty(request.body?.difficulty);
  response.status(201).json({ game: createGame(difficulty) });
});

app.get("/api/game/:id", (request, response) => {
  try {
    response.json({ game: getGame(request.params.id) });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/game/:id/bid", (request, response) => {
  try {
    response.json({ game: submitBid(request.params.id, request.body?.bid) });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/game/:id/play", (request, response) => {
  try {
    response.json({ game: submitPlay(request.params.id, String(request.body?.cardId ?? "")) });
  } catch (error) {
    sendError(response, error);
  }
});

if (isProduction) {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(root, "dist", "index.html"));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Bridge Table running at http://127.0.0.1:${port}`);
});

function parseDifficulty(value: unknown): Difficulty {
  return value === "social" || value === "expert" || value === "club" ? value : "club";
}

function sendError(response: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Something went wrong at the bridge table.";
  response.status(400).json({ error: message });
}
