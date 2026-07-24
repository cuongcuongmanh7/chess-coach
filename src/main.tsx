import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./styles.css";
import "./app/chrome.css";
import "./features/analysis/analysis.css";
import "./features/analysis/components/gameHeading.css";
import "./features/analysis/components/fullGameAnalysis.css";
import "./features/analysis/components/moveAnalysisSummary.css";
import "./features/analysis/components/gameReportCard.css";
import "./features/analysis/components/engineLinesAccordion.css";
import "./features/analysis/components/playerMoveStats.css";
import "./features/analysis/components/timeline.css";
import "./features/candidate-lab/candidate-lab.css";
import "./features/game-story/game-story.css";
import "./features/library/library.css";
import "./features/modals/modals.css";
import "./features/training/training.css";
import "./features/tactics/tactics.css";
import "./shared/components/brandIdentity.css";
import "./shared/components/chessTerm.css";
import "./shared/chess/check-warning.css";
import "./app/responsive.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
