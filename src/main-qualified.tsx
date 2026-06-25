import React from "react";
import ReactDOM from "react-dom/client";
import QualifiedBracketApp from "./QualifiedBracketApp";
import "./bracket.css";
import "./qualification.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QualifiedBracketApp />
  </React.StrictMode>
);
