import { Chess, type Square } from "chess.js";
import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import {
  PIECE_VALUES,
  applyUci,
  attackedTargets,
  isPassedPawn,
  opposite,
  pieces,
} from "./board.ts";
import {
  absolutePin,
  discoveredAttack,
  removalOfDefender,
  skewer,
} from "./geometry.ts";
import {
  TACTICS_VERSION,
  type TacticalAnalysis,
  type TacticalMotif,
  type TacticalTag,
  type ThreatViewData,
} from "./types.ts";

const LOSS_GATE_CP = 35;

function addTag(tags: TacticalTag[], tag: TacticalTag | null) {
  if (!tag || tags.some((item) => item.motif === tag.motif)) return;
  tags.push(tag);
}

function tacticalTag(
  motif: TacticalMotif,
  confidence: number,
  source: TacticalTag["evidence"]["source"],
  squares: string[],
  line: string[],
  description: string,
): TacticalTag {
  return {
    motif,
    confidence,
    evidence: { source, squares: [...new Set(squares)], line, description },
  };
}

function buildThreatView(step: AnalysisStep, engine: EngineMoveAnalysis): ThreatViewData {
  const position = new Chess(step.fenAfter);
  const mover = step.color;
  const opponent = opposite(mover);
  const replyTarget = engine.bestReplyUci.slice(2, 4) as Square;
  const dangerSquares = pieces(position, mover)
    .filter(({ square, piece }) => {
      if (piece.type === "k") return false;
      const attackers = position.attackers(square, opponent);
      const defenders = position.attackers(square, mover);
      return attackers.length > 0
        && (attackers.length > defenders.length || square === replyTarget);
    })
    .map(({ square }) => square);
  const defenderSquares = [...new Set(dangerSquares.flatMap((square) =>
    position.attackers(square, mover),
  ))].filter((square) => !dangerSquares.includes(square));
  const arrow = engine.bestReplyUci.length >= 4
    ? {
        startSquare: engine.bestReplyUci.slice(0, 2),
        endSquare: engine.bestReplyUci.slice(2, 4),
        color: "#ef6a62",
      }
    : null;
  const summary = engine.bestReplySan
    ? `Đối thủ ưu tiên ${engine.bestReplySan}${dangerSquares.length ? `; ${dangerSquares.length} quân cần kiểm tra.` : "."}`
    : "Không có nước đáp hợp lệ trong vị trí này.";
  return { arrow, dangerSquares, defenderSquares, summary };
}

export function detectTactics(
  step: AnalysisStep,
  engine: EngineMoveAnalysis,
): TacticalAnalysis {
  const tags: TacticalTag[] = [];
  const before = new Chess(step.fenBefore);
  const bestAfter = new Chess(step.fenBefore);
  const bestMove = applyUci(bestAfter, engine.bestMoveUci);
  const lossSupportsMiss = engine.centipawnLoss >= LOSS_GATE_CP;
  const bestLine = engine.bestLineSan.slice(0, 5);

  const forcingMove = bestLine[0] || engine.bestMoveSan;
  const replyForcing = engine.bestReplySan;
  if (/[+#]$/.test(forcingMove) || /[+#]$/.test(replyForcing)) {
    const isMate = forcingMove.endsWith("#") || replyForcing.endsWith("#");
    addTag(tags, tacticalTag(
      "check-mate-threat",
      isMate ? 0.98 : 0.9,
      /[+#]$/.test(replyForcing) ? "played-position" : "best-line",
      [bestMove?.from || step.from, bestMove?.to || step.to],
      /[+#]$/.test(replyForcing) ? engine.replyLineSan : bestLine,
      isMate ? "Biến Stockfish chứa đe dọa chiếu hết." : "Biến Stockfish bắt đầu bằng nước chiếu cưỡng bức.",
    ));
  }

  if (bestMove?.captured && lossSupportsMiss && engine.playedMoveUci !== engine.bestMoveUci) {
    const capturedValue = PIECE_VALUES[bestMove.captured];
    const moverValue = PIECE_VALUES[bestMove.piece];
    if (capturedValue >= moverValue || /[+#]$/.test(bestMove.san)) {
      addTag(tags, tacticalTag(
        "missed-capture", 0.87, "best-line", [bestMove.from, bestMove.to], bestLine,
        "Stockfish ưu tiên một nước bắt có lợi mà nước đã đi bỏ lỡ.",
      ));
    }
  }

  const threat = buildThreatView(step, engine);
  const replyTarget = engine.bestReplyUci.slice(2, 4) as Square;
  const hangingPiece = threat.dangerSquares.find((square) => {
    const piece = new Chess(step.fenAfter).get(square as Square);
    return square === replyTarget && piece && PIECE_VALUES[piece.type] >= 3;
  });
  if (hangingPiece && lossSupportsMiss) {
    addTag(tags, tacticalTag(
      "hanging-piece", 0.96, "played-position",
      [engine.bestReplyUci.slice(0, 2), hangingPiece], engine.replyLineSan,
      "Best reply bắt ngay một quân có giá trị đang thiếu bảo vệ.",
    ));
  }

  if (bestMove) {
    const forkTargets = attackedTargets(bestAfter, bestMove.to, bestMove.color)
      .filter(({ piece }) => PIECE_VALUES[piece.type] >= 3);
    if (forkTargets.length >= 2 && (lossSupportsMiss || engine.playedMoveUci === engine.bestMoveUci)) {
      addTag(tags, tacticalTag(
        "fork", 0.9, "best-line",
        [bestMove.to, ...forkTargets.map(({ square }) => square)], bestLine,
        "Quân vừa đi tấn công đồng thời ít nhất hai mục tiêu có giá trị.",
      ));
    }

    const pinSquares = absolutePin(bestAfter, bestMove.color);
    if (pinSquares && (lossSupportsMiss || engine.playedMoveUci === engine.bestMoveUci)) {
      addTag(tags, tacticalTag(
        "absolute-pin", 0.88, "best-line", pinSquares, bestLine,
        "Một quân bị ghim trên đường thẳng tới vua nên không thể rời vị trí.",
      ));
    }

    const skewerSquares = skewer(bestAfter, bestMove.color);
    if (skewerSquares && /[+#]$/.test(bestMove.san)) {
      addTag(tags, tacticalTag(
        "skewer", 0.9, "best-line", skewerSquares, bestLine,
        "Mục tiêu giá trị cao bị buộc rời đi và để lộ quân phía sau.",
      ));
    }

    const discoveredSquares = discoveredAttack(before, bestAfter, bestMove, bestMove.color);
    if (discoveredSquares && (lossSupportsMiss || /[+#]$/.test(bestMove.san))) {
      addTag(tags, tacticalTag(
        "discovered-attack", 0.87, "best-line", discoveredSquares, bestLine,
        "Nước đi mở đường tấn công của một quân trượt phía sau.",
      ));
    }

    const destinationRank = Number(bestMove.to[1]);
    if (
      bestMove.piece === "p"
      && (bestMove.promotion || destinationRank >= 6 && bestMove.color === "w"
        || destinationRank <= 3 && bestMove.color === "b")
      && isPassedPawn(bestAfter, bestMove.to, bestMove.color)
    ) {
      addTag(tags, tacticalTag(
        "passed-pawn", bestMove.promotion ? 0.98 : 0.86, "best-line",
        [bestMove.from, bestMove.to], bestLine,
        bestMove.promotion ? "Biến chính phong cấp ngay." : "Tốt thông tiến sâu và tạo đe dọa phong cấp.",
      ));
    }
  }

  const replyPosition = new Chess(step.fenAfter);
  const bestReply = applyUci(replyPosition, engine.bestReplyUci);
  if (bestReply && ["r", "q"].includes(bestReply.piece) && /[+#]$/.test(bestReply.san)) {
    const kingSquare = pieces(replyPosition, step.color).find(({ piece }) => piece.type === "k")?.square;
    const homeRank = step.color === "w" ? "1" : "8";
    if (kingSquare?.endsWith(homeRank) && bestReply.to.endsWith(homeRank)) {
      addTag(tags, tacticalTag(
        "back-rank", bestReply.san.endsWith("#") ? 0.98 : 0.9, "played-position",
        [bestReply.from, bestReply.to, kingSquare], engine.replyLineSan,
        "Xe hoặc hậu xâm nhập hàng cuối với tempo chiếu.",
      ));
    }
  }

  const removalSquares = removalOfDefender(step, engine);
  if (removalSquares && lossSupportsMiss) {
    addTag(tags, tacticalTag(
      "removal-of-defender", 0.92, "best-line", removalSquares, bestLine,
      "Biến chính bắt quân phòng thủ trước khi thu mục tiêu phía sau.",
    ));
  }

  return {
    version: TACTICS_VERSION,
    tags: tags.sort((left, right) => right.confidence - left.confidence),
    threat,
  };
}

export function withTacticalAnalysis(
  step: AnalysisStep,
  engine: EngineMoveAnalysis,
): EngineMoveAnalysis {
  if (engine.tactics?.version === TACTICS_VERSION) return engine;
  return { ...engine, tactics: detectTactics(step, engine) };
}

export function tacticCodes(engine: EngineMoveAnalysis) {
  return engine.tactics?.tags.map((tag) => tag.motif) || [];
}
