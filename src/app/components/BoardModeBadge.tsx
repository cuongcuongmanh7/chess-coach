import { Dumbbell, Eye, FlaskConical } from "lucide-react";

export function BoardModeBadge({
  mode,
  variationTitle,
  candidateColor,
}: {
  mode: "retry" | "variation" | "candidate";
  variationTitle?: string;
  candidateColor?: "w" | "b";
}) {
  return (
    <div className={`board-mode-badge ${mode}`}>
      {mode === "retry"
        ? <><Dumbbell size={13} /> Chế độ thử lại</>
        : mode === "candidate"
          ? <><FlaskConical size={13} /> Biến nháp · Bạn cầm {candidateColor === "b" ? "Đen" : "Trắng"}</>
          : <><Eye size={13} /> {variationTitle}</>}
    </div>
  );
}
