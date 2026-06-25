import React from "react";
import ReactDOM from "react-dom/client";
import RankPredictorApp from "./RankPredictorApp";
import "./bracket.css";
import "./qualification.css";
import "./rank-predictor.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RankPredictorApp />
  </React.StrictMode>
);
