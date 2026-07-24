import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playSfx } from "../../sfx";
import {
  checkedKingSquare,
  isIllegalNonKingCheckMove,
  type BoardDropMove,
} from "./checkState";

export function useCheckWarning(fen: string) {
  const kingSquare = useMemo(() => checkedKingSquare(fen), [fen]);
  const [warningActive, setWarningActive] = useState(false);
  const lastCheckFenRef = useRef("");
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setWarningActive(false);
    if (!kingSquare) {
      lastCheckFenRef.current = "";
      return;
    }
    if (lastCheckFenRef.current !== fen) {
      lastCheckFenRef.current = fen;
      playSfx("check");
    }
  }, [fen, kingSquare]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const handleDropResult = useCallback((
    move: BoardDropMove,
    moved: boolean,
  ) => {
    if (moved || !isIllegalNonKingCheckMove(fen, move)) return moved;
    playSfx("warning");
    setWarningActive(false);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      setWarningActive(true);
      timerRef.current = window.setTimeout(() => setWarningActive(false), 560);
    });
    return false;
  }, [fen]);

  return { kingSquare, warningActive, handleDropResult };
}
