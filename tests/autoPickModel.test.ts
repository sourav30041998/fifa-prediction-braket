import assert from "node:assert/strict";
import {
  calculateTeamStrength,
  calculateWinProbability,
  deterministicMatchRandom,
  pickProbableWinner,
  type PredictionContext
} from "../src/autoPickModel";

const favorite = { name: "Favorite", code: "FAV" };
const underdog = { name: "Underdog", code: "UND" };
const context: PredictionContext = {
  rankings: {
    FAV: { rank: 2, points: 1890 },
    UND: { rank: 70, points: 1330 }
  },
  stats: {
    FAV: { mp: 3, pts: 9, gd: 6, gf: 8 },
    UND: { mp: 3, pts: 3, gd: -2, gf: 2 }
  },
  groupPositions: {
    Favorite: 1,
    Underdog: 3
  }
};

const favoriteStrength = calculateTeamStrength(favorite, context);
const underdogStrength = calculateTeamStrength(underdog, context);
assert.ok(favoriteStrength.total > underdogStrength.total);

const probability = calculateWinProbability(favorite, underdog, context);
assert.ok(probability > 0.5);
assert.ok(probability <= 0.82);

assert.equal(pickProbableWinner(favorite, underdog, context, () => 0).winner.name, "Favorite");
assert.equal(pickProbableWinner(favorite, underdog, context, () => 0.99).winner.name, "Underdog");

const firstDraw = deterministicMatchRandom(73, favorite, underdog);
const repeatedDraw = deterministicMatchRandom(73, favorite, underdog);
const affectedDraw = deterministicMatchRandom(73, favorite, { name: "Changed team", code: "NEW" });
const unrelatedDraw = deterministicMatchRandom(88, favorite, underdog);
assert.equal(firstDraw, repeatedDraw);
assert.notEqual(firstDraw, affectedDraw);
assert.notEqual(firstDraw, unrelatedDraw);

const firstPrediction = pickProbableWinner(favorite, underdog, context, () => firstDraw);
const repeatedPrediction = pickProbableWinner(favorite, underdog, context, () => repeatedDraw);
assert.equal(firstPrediction.winner.name, repeatedPrediction.winner.name);

const evenContext: PredictionContext = {
  rankings: {},
  stats: {},
  groupPositions: {}
};
assert.equal(calculateWinProbability(favorite, underdog, evenContext), 0.5);

console.log("Auto-pick probability model checks passed.");
