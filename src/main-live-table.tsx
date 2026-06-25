import React from "react";
import ReactDOM from "react-dom/client";
import LiveTablePredictorApp from "./LiveTablePredictorApp";
import "./bracket.css";
import "./qualification.css";
import "./rank-predictor.css";
import "./live-table.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LiveTablePredictorApp />
  </React.StrictMode>
);
