import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CandidateLabState } from "../types";

export function CandidateNavigationControls({
  state,
  onSelect,
}: {
  state: CandidateLabState;
  onSelect: (index: number) => void;
}) {
  const selected = state.moves[state.selectedIndex];
  return (
    <div className="step-controls candidate-navigation">
      <button
        onClick={() => onSelect(state.selectedIndex - 1)}
        disabled={state.loading || state.selectedIndex <= -1}
      >
        <ChevronLeft size={19} /> Lùi biến
      </button>
      <div className="move-coordinate">
        {selected ? `${selected.step.from} → ${selected.step.to}` : "Điểm rẽ"}
      </div>
      <button
        className="next-button"
        onClick={() => onSelect(state.selectedIndex + 1)}
        disabled={state.loading || state.selectedIndex >= state.moves.length - 1}
      >
        Tiếp biến <ChevronRight size={19} />
      </button>
    </div>
  );
}
