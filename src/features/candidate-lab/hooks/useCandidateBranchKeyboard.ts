import { useEffect } from "react";
import type { CandidateLabState } from "../types";

export function useCandidateBranchKeyboard(
  state: CandidateLabState,
  onSelect: (index: number) => void,
  onExit: () => void,
) {
  useEffect(() => {
    if (!state.active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("textarea, input, select")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextIndex = state.selectedIndex + (event.key === "ArrowLeft" ? -1 : 1);
      onSelect(Math.max(-1, Math.min(state.moves.length - 1, nextIndex)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit, onSelect, state]);
}
