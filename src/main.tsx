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
import "./features/library/library.css";
import "./features/modals/modals.css";
import "./features/training/training.css";
import "./shared/components/brandIdentity.css";
import "./app/responsive.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
