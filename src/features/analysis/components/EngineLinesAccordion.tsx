import { ChevronDown, Eye, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { EngineMoveAnalysis } from "../../../stockfish";

export function EngineLinesAccordion({
  engine,
  activeRank,
  activeIndex,
  onOpenVariation,
}: {
  engine?: EngineMoveAnalysis;
  activeRank?: number;
  activeIndex?: number;
  onOpenVariation: (rank: number, moves: string[]) => void;
}) {
  const [showAlternative, setShowAlternative] = useState(false);
  const variations = engine?.variations.slice(0, 2) || [];
  const visibleVariations = showAlternative ? variations : variations.slice(0, 1);
  return (
    <section className="engine-lines-accordion">
      <button
        className="engine-lines-toggle"
        onClick={() => setShowAlternative((value) => !value)}
        disabled={!engine}
        aria-expanded={showAlternative}
      >
        {engine ? <ChevronDown size={14} /> : <LoaderCircle className="spin" size={13} />}
        <span>{engine ? (variations.length > 1 ? "Best · thêm phương án #2" : "Phương án Best") : "Stockfish đang tìm phương án…"}</span>
        {engine && <small>{engine.variations[0]?.evaluation || engine.evaluation}</small>}
      </button>
      {engine && (
        <div className="variation-list">
          {visibleVariations.map((variation) => (
            <button className="variation-row" key={`${variation.rank}-${variation.moveUci}`} onClick={() => onOpenVariation(variation.rank, variation.lineSan)}>
              <span className={`variation-rank rank-${variation.rank}`}>{variation.rank === 1 ? "BEST" : "#2"}</span>
              <span className="variation-eval">{variation.evaluation}</span>
              <span className="best-line-moves">
                {variation.lineSan.length ? variation.lineSan.map((move, moveIndex) => (
                  <span
                    className={`variation-move-token${activeRank === variation.rank && activeIndex === moveIndex + 1 ? " active" : ""}`}
                    key={`${variation.rank}-${moveIndex}-${move}`}
                  >{move}</span>
                )) : <span className="variation-move-token">{variation.moveSan}</span>}
              </span>
              <Eye size={13} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
