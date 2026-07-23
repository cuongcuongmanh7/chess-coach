import { useMemo, useState, type CSSProperties } from "react";
import type { EngineMoveAnalysis } from "../../../stockfish";

export function useTacticsController(engine: EngineMoveAnalysis | undefined) {
  const [threatViewEnabled, setThreatViewEnabled] = useState(false);
  const threat = engine?.tactics?.threat;
  const threatViewAvailable = Boolean(
    threat?.arrow || threat?.dangerSquares.length || threat?.defenderSquares.length,
  );
  const threatSquareStyles = useMemo(() => {
    if (!threatViewEnabled || !threat) return {};
    const styles: Record<string, CSSProperties> = {};
    threat.defenderSquares.forEach((square) => {
      styles[square] = {
        boxShadow: "inset 0 0 0 4px rgba(67, 217, 163, .82)",
      };
    });
    threat.dangerSquares.forEach((square) => {
      styles[square] = {
        boxShadow: "inset 0 0 0 4px rgba(239, 106, 98, .9)",
      };
    });
    return styles;
  }, [threat, threatViewEnabled]);

  const toggleThreatView = () => {
    if (threatViewAvailable) setThreatViewEnabled((value) => !value);
  };

  return {
    tacticalAnalysis: engine?.tactics || null,
    threatViewAvailable,
    threatViewEnabled,
    threatSquareStyles,
    toggleThreatView,
  };
}
