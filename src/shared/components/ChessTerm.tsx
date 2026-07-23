import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import type { DisplayMoveQuality } from "../../features/analysis/moveClassification";

export type ChessTermKey =
  | DisplayMoveQuality
  | "acpl"
  | "cpl"
  | "cp"
  | "depth"
  | "eco"
  | "evaluation"
  | "expectedPoints"
  | "bestGood";

const CHESS_TERMS: Record<ChessTermKey, { label: string; description: string }> = {
  acpl: {
    label: "ACPL",
    description: "Average Centipawn Loss: số centipawn trung bình bị mất mỗi nước so với lựa chọn tốt nhất. Càng thấp càng tốt.",
  },
  cpl: {
    label: "CPL",
    description: "Centipawn Loss: lượng lợi thế bị mất sau một nước so với lựa chọn tốt nhất của engine.",
  },
  cp: {
    label: "cp",
    description: "Centipawn là đơn vị đánh giá của engine; 100 cp xấp xỉ giá trị một quân tốt.",
  },
  depth: {
    label: "Depth",
    description: "Độ sâu tìm kiếm của Stockfish. Số cao hơn thường cho kết quả ổn định hơn nhưng cần nhiều thời gian hơn.",
  },
  eco: {
    label: "ECO",
    description: "Encyclopaedia of Chess Openings: hệ mã dùng để phân loại các khai cuộc và biến phổ biến.",
  },
  evaluation: {
    label: "Evaluation",
    description: "Đánh giá thế cờ của Stockfish. Số dương nghiêng về Trắng, số âm nghiêng về Đen; M là thế chiếu hết.",
  },
  expectedPoints: {
    label: "Expected Points",
    description: "Ước lượng cơ hội đạt kết quả tốt từ evaluation và Elo. Mức giảm sau nước đi được dùng để phân loại sai số.",
  },
  bestGood: {
    label: "Best / Tốt",
    description: "Tỷ lệ Brilliant, Best và Nước tốt trong toàn bộ các nước đã được Stockfish phân tích.",
  },
  brilliant: {
    label: "Brilliant",
    description: "Theo tiêu chí Kỳ Phổ: nước gần tối ưu có ý tưởng hy sinh quân, vẫn giữ thế cạnh tranh và đủ khó theo Elo người chơi.",
  },
  best: {
    label: "Best move",
    description: "Nước tốt nhất của Stockfish hoặc nước không làm giảm Expected Points đáng kể.",
  },
  good: {
    label: "Nước tốt",
    description: "Nước làm giảm Expected Points không quá 0,05 so với phương án tối ưu.",
  },
  inaccuracy: {
    label: "Thiếu chính xác",
    description: "Nước làm giảm Expected Points trên 0,05 đến 0,10.",
  },
  mistake: {
    label: "Sai lầm",
    description: "Nước làm giảm Expected Points trên 0,10 đến 0,20.",
  },
  blunder: {
    label: "Blunder",
    description: "Nước làm giảm Expected Points trên 0,20 và có thể thay đổi mạnh kết quả dự kiến của ván.",
  },
};

type ChessTermProps = {
  term: ChessTermKey;
  children?: ReactNode;
  className?: string;
};

export function ChessTerm({ term, children, className = "" }: ChessTermProps) {
  const tooltipId = useId();
  const entry = CHESS_TERMS[term];
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const placeTooltip = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    const anchorBox = anchor.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = Math.max(
      8,
      Math.min(window.innerWidth - width - 8, anchorBox.left + anchorBox.width / 2 - width / 2),
    );
    const below = anchorBox.bottom + 7;
    const top = below + height <= window.innerHeight - 8
      ? below
      : Math.max(8, anchorBox.top - height - 7);
    setPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    placeTooltip();
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, true);
    return () => {
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, true);
    };
  }, [open, placeTooltip]);

  return (
    <span
      ref={anchorRef}
      className={`chess-term ${className}`.trim()}
      tabIndex={0}
      aria-describedby={tooltipId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="chess-term-label">{children || entry.label}</span>
      <CircleHelp aria-hidden="true" size={11} />
      {open && createPortal(
        <span
          ref={tooltipRef}
          className="chess-term-tooltip"
          id={tooltipId}
          role="tooltip"
          style={position}
        >
          <strong>{entry.label}</strong>
          {entry.description}
        </span>,
        document.body,
      )}
    </span>
  );
}
