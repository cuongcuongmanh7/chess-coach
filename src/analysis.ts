import { Chess, type Color, type Move, type Square } from "chess.js";

export type Phase = "Khai cuộc" | "Trung cuộc" | "Tàn cuộc";
export type MoveQuality = "good" | "mistake" | "blunder";

export type AnalysisArrow = {
  startSquare: string;
  endSquare: string;
  color: string;
};

export type AnalysisStep = {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  lan: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  phase: Phase;
  quality: MoveQuality;
  title: string;
  comment: string;
  insight: string;
  tags: string[];
  arrows: AnalysisArrow[];
};

export type GameAnalysis = {
  headers: Record<string, string>;
  steps: AnalysisStep[];
  rawPgn: string;
};

const PIECE_NAMES: Record<string, string> = {
  p: "tốt",
  n: "mã",
  b: "tượng",
  r: "xe",
  q: "hậu",
  k: "vua",
};

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const opposite = (color: Color): Color => (color === "w" ? "b" : "w");

function materialScore(chess: Chess) {
  return chess
    .board()
    .flat()
    .filter(Boolean)
    .reduce((sum, piece) => sum + PIECE_VALUES[piece!.type], 0);
}

function countPieces(chess: Chess, type: string) {
  return chess
    .board()
    .flat()
    .filter((piece) => piece?.type === type).length;
}

function getPhase(chess: Chess, moveNumber: number): Phase {
  const nonPawnPieces = chess
    .board()
    .flat()
    .filter((piece) => piece && !["p", "k"].includes(piece.type)).length;

  if (moveNumber <= 10 && nonPawnPieces >= 10) return "Khai cuộc";
  if (materialScore(chess) <= 24 || (countPieces(chess, "q") === 0 && moveNumber >= 20)) {
    return "Tàn cuộc";
  }
  return "Trung cuộc";
}

function findKing(chess: Chess, color: Color): string | null {
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.type === "k" && piece.color === color) return piece.square;
    }
  }
  return null;
}

function isPassedPawn(chess: Chess, square: string, color: Color) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const enemy = opposite(color);

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type !== "p" || piece.color !== enemy) continue;
      const enemyFile = piece.square.charCodeAt(0) - 97;
      const enemyRank = Number(piece.square[1]);
      const inFront = color === "w" ? enemyRank > rank : enemyRank < rank;
      if (inFront && Math.abs(enemyFile - file) <= 1) return false;
    }
  }
  return true;
}

function buildStep(move: Move, index: number): AnalysisStep {
  const after = new Chess(move.after);
  const moveNumber = Math.floor(index / 2) + 1;
  const opponentMoves = after.moves({ verbose: true });
  const captureMovedPiece = opponentMoves.find(
    (reply) => reply.to === move.to && Boolean(reply.captured),
  );
  const movedPiece = after.get(move.to as Square);
  const movedValue = movedPiece ? PIECE_VALUES[movedPiece.type] : 0;
  const captureValue = move.captured ? PIECE_VALUES[move.captured] : 0;
  const isFlankPawnEarly =
    move.piece === "p" && ["a", "h"].includes(move.from[0]) && moveNumber <= 6;
  const isCornerKnight =
    move.piece === "n" && ["a1", "h1", "a8", "h8"].includes(move.to) && moveNumber >= 8;
  const passedPawn =
    move.piece === "p" &&
    Number(move.to[1]) >= (move.color === "w" ? 5 : 1) &&
    Number(move.to[1]) <= (move.color === "w" ? 8 : 4) &&
    isPassedPawn(after, move.to, move.color);

  let quality: MoveQuality = "good";
  let title = "Nước đi chắc chắn";
  let comment = `${move.san} cải thiện vị trí mà không tạo ra nguy cơ chiến thuật tức thời.`;
  let insight = "Giữ thói quen kiểm tra nước chiếu, nước bắt và đòn đe doạ trước khi chốt nước đi.";
  let tags = ["Phát triển thế trận"];

  if (after.isCheckmate()) {
    title = "Đòn kết thúc ván đấu";
    comment = `${move.san} là chiếu hết — vua đối phương không còn ô chạy hay cách hoá giải.`;
    insight = "Khi vua lộ, hãy ưu tiên tính tất cả nước chiếu cưỡng bức trước các nước đi khác.";
    tags = ["Chiếu hết", "Nước cưỡng bức"];
  } else if (move.promotion) {
    title = "Phong cấp thành công";
    comment = `${move.san} đưa tốt về đích và tạo lợi thế vật chất quyết định.`;
    insight = "Tốt thông càng tiến sâu càng buộc đối thủ phải chuyển quân sang phòng thủ.";
    tags = ["Tốt thông", "Phong cấp"];
  } else if (captureMovedPiece && movedValue >= 5 && !move.san.includes("+")) {
    quality = "blunder";
    title = "Quân nặng đang bị treo";
    comment = `Sau ${move.san}, ${PIECE_NAMES[move.piece]} ở ${move.to} có thể bị bắt ngay bởi ${captureMovedPiece.san}.`;
    insight = "Trước khi đi, hãy nhìn lại ô đích: đối thủ có nước bắt hợp lệ nào vào ô đó không?";
    tags = ["Treo quân", "Quét nước bắt"];
  } else if (captureMovedPiece && movedValue >= 3 && captureValue < movedValue && !move.san.includes("+")) {
    quality = "mistake";
    title = "Đổi quân chưa có lợi";
    comment = `${move.san} đặt ${PIECE_NAMES[move.piece]} vào tầm bắt của ${captureMovedPiece.san}.`;
    insight = "Một nước chủ động vẫn cần qua bước kiểm tra an toàn của quân vừa di chuyển.";
    tags = ["An toàn quân", "Tính thêm 1 nước"];
  } else if (isFlankPawnEarly) {
    quality = "mistake";
    title = "Mất nhịp trong khai cuộc";
    comment = `${move.san} đẩy tốt biên khi các quân nhẹ vẫn cần được phát triển.`;
    insight = "Ở khai cuộc, mỗi tempo nên giúp chiếm trung tâm, phát triển quân hoặc đưa vua vào an toàn.";
    tags = ["Tempo", "Nguyên tắc khai cuộc"];
  } else if (isCornerKnight) {
    quality = "mistake";
    title = "Săn vật chất, xa trung tâm";
    comment = `${move.san} có thể lấy vật chất, nhưng đưa mã ra góc bàn và làm giảm khả năng tham chiến.`;
    insight = "Đừng chỉ đếm quân vừa ăn; hãy đếm cả số tempo cần để quân quay lại trận địa.";
    tags = ["Săn quân", "Hoạt động của mã"];
  } else if (passedPawn) {
    title = "Tốt thông bắt đầu lên tiếng";
    comment = `${move.san} đẩy tốt thông tiến gần ô phong cấp và buộc đối thủ phải phản ứng.`;
    insight = "Trong tàn cuộc, tốt thông là một tài sản động: đẩy nó khi đối phương thiếu khả năng phong toả.";
    tags = ["Tốt thông", "Tạo sức ép"];
  } else if (move.san.includes("+")) {
    title = "Nước chiếu có tempo";
    comment = `${move.san} buộc vua đối phương phản ứng và giúp bạn giữ quyền chủ động.`;
    insight = "Nước chiếu mạnh nhất khi nó đồng thời phát triển quân, ăn vật chất hoặc tạo thêm đe doạ.";
    tags = ["Chiếu vua", "Tempo"];
  } else if (move.flags.includes("k") || move.flags.includes("q")) {
    title = "Đưa vua vào an toàn";
    comment = `${move.san} hoàn tất nhập thành, kết nối xe và giảm nguy cơ ở trung tâm.`;
    insight = "Nhập thành là tốt khi khu vực vua sắp đến không bị mở tung bởi các cột hoặc đường chéo.";
    tags = ["An toàn vua", "Kết nối xe"];
  } else if (move.captured) {
    title = captureValue >= movedValue ? "Đổi quân hợp lý" : "Nước bắt chủ động";
    comment = `${move.san} dùng ${PIECE_NAMES[move.piece]} để bắt ${PIECE_NAMES[move.captured]}.`;
    insight = "Sau mỗi nước bắt, hãy kiểm tra quân vừa bắt có đường lui và đối thủ có đòn trung gian hay không.";
    tags = ["Nước bắt", "Kiểm tra phản đòn"];
  } else if (move.piece !== "p" && moveNumber <= 10) {
    title = "Phát triển quân";
    comment = `${move.san} đưa ${PIECE_NAMES[move.piece]} vào cuộc và tăng khả năng kiểm soát trung tâm.`;
    insight = "Phát triển hiệu quả là đưa quân tới ô có nhiệm vụ rõ ràng, không chỉ đơn giản rời hàng cuối.";
    tags = ["Phát triển quân", "Kiểm soát trung tâm"];
  }

  const arrows: AnalysisArrow[] = [
    { startSquare: move.from, endSquare: move.to, color: "#f4bf4f" },
  ];

  if (captureMovedPiece) {
    arrows.push({
      startSquare: captureMovedPiece.from,
      endSquare: captureMovedPiece.to,
      color: "#e55c5c",
    });
  } else if (move.san.includes("+")) {
    const kingSquare = findKing(after, opposite(move.color));
    if (kingSquare && kingSquare !== move.to) {
      arrows.push({ startSquare: move.to, endSquare: kingSquare, color: "#e55c5c" });
    }
  }

  return {
    ply: index + 1,
    moveNumber,
    color: move.color,
    san: move.san,
    lan: move.lan,
    from: move.from,
    to: move.to,
    fenBefore: move.before,
    fenAfter: move.after,
    phase: getPhase(after, moveNumber),
    quality,
    title,
    comment,
    insight,
    tags,
    arrows,
  };
}

export function analyzePgn(rawPgn: string): GameAnalysis {
  const cleaned = rawPgn.trim();
  if (!cleaned) throw new Error("Hãy dán PGN hoặc link Chess.com trước.");

  const chess = new Chess();
  try {
    chess.loadPgn(cleaned, { strict: false });
  } catch {
    throw new Error("PGN chưa hợp lệ. Hãy kiểm tra lại phần header và danh sách nước đi.");
  }

  const moves = chess.history({ verbose: true });
  if (!moves.length) throw new Error("Không tìm thấy nước đi nào trong PGN này.");

  return {
    headers: chess.getHeaders(),
    steps: moves.map(buildStep),
    rawPgn: cleaned,
  };
}
