import type { AnalysisStep } from "../../../analysis";
import type { RepertoireColor, RepertoireNodeSeed } from "../types";

// Tra khai cuộc được tiêm vào (openingAtFen) để builder thuần, không phụ thuộc
// openings.json — thuận cho unit test dưới node.
export type ResolveOpening = (fen: string) => { eco: string; name: string } | null;

export type RepertoirePlyEngine = {
  centipawnLoss: number;
  bestMoveUci?: string | null;
  bestMoveSan?: string | null;
};

export type RepertoireGameInput = {
  steps: AnalysisStep[];
  playerColor: RepertoireColor;
  engineByPly?: Record<number, RepertoirePlyEngine>;
};

export type BuildRepertoireOptions = {
  maxPlies?: number;
  minFrequency?: number;
  highCplThreshold?: number;
};

export type BuildRepertoireResult = {
  color: RepertoireColor;
  name: string;
  eco: string | null;
  nodes: RepertoireNodeSeed[];
};

const DEFAULTS = { maxPlies: 24, minFrequency: 2, highCplThreshold: 80 };

function epd(fen: string) {
  return fen.split(" ").slice(0, 4).join(" ");
}

type Agg = {
  nodeKey: string;
  parentKey: string | null;
  positionKey: string;
  fenBefore: string;
  fenAfter: string;
  san: string;
  uci: string;
  side: RepertoireColor;
  isUser: boolean;
  frequency: number;
  cplSum: number;
  cplCount: number;
  bestUci: string | null;
  bestSan: string | null;
};

export function buildRepertoire(
  games: RepertoireGameInput[],
  color: RepertoireColor,
  options: BuildRepertoireOptions = {},
  resolveOpening: ResolveOpening | null = null,
): BuildRepertoireResult {
  const opt = { ...DEFAULTS, ...options };
  const agg = new Map<string, Agg>();

  for (const game of games) {
    if (game.playerColor !== color) continue;
    let parentKey: string | null = null;
    const limit = Math.min(game.steps.length, opt.maxPlies);
    for (let i = 0; i < limit; i += 1) {
      const step = game.steps[i];
      const positionKey = epd(step.fenBefore);
      const uci = step.lan;
      const nodeKey = `${positionKey}|${uci}`;
      const isUser = step.color === color;
      let node = agg.get(nodeKey);
      if (!node) {
        node = {
          nodeKey,
          parentKey,
          positionKey,
          fenBefore: step.fenBefore,
          fenAfter: step.fenAfter,
          san: step.san,
          uci,
          side: step.color as RepertoireColor,
          isUser,
          frequency: 0,
          cplSum: 0,
          cplCount: 0,
          bestUci: null,
          bestSan: null,
        };
        agg.set(nodeKey, node);
      }
      node.frequency += 1;
      const engine = game.engineByPly?.[step.ply];
      if (isUser && engine) {
        if (Number.isFinite(engine.centipawnLoss)) {
          node.cplSum += engine.centipawnLoss;
          node.cplCount += 1;
        }
        if (engine.bestMoveUci) {
          node.bestUci = engine.bestMoveUci;
          node.bestSan = engine.bestMoveSan ?? engine.bestMoveUci;
        }
      }
      parentKey = nodeKey;
    }
  }

  // Prune: giữ node nước-người-dùng đủ tần suất, rồi giữ toàn bộ tổ tiên để cây liền mạch.
  const keep = new Set<string>();
  for (const node of agg.values()) {
    if (node.isUser && node.frequency >= opt.minFrequency) keep.add(node.nodeKey);
  }
  for (const key of [...keep]) {
    let cur = agg.get(key);
    while (cur && cur.parentKey && !keep.has(cur.parentKey)) {
      keep.add(cur.parentKey);
      cur = agg.get(cur.parentKey);
    }
  }

  // Lấp gap: tại node CPL cao, thêm node anh em nước tốt của Stockfish.
  const extras: Agg[] = [];
  for (const key of keep) {
    const node = agg.get(key);
    if (!node || !node.isUser || node.cplCount === 0) continue;
    const avgCpl = node.cplSum / node.cplCount;
    if (avgCpl < opt.highCplThreshold || !node.bestUci || node.bestUci === node.uci) continue;
    const bestKey = `${node.positionKey}|${node.bestUci}`;
    if (agg.has(bestKey) || extras.some((extra) => extra.nodeKey === bestKey)) continue;
    extras.push({
      nodeKey: bestKey,
      parentKey: node.parentKey && keep.has(node.parentKey) ? node.parentKey : null,
      positionKey: node.positionKey,
      fenBefore: node.fenBefore,
      fenAfter: node.fenBefore,
      san: node.bestSan ?? node.bestUci,
      uci: node.bestUci,
      side: node.side,
      isUser: true,
      frequency: 0,
      cplSum: 0,
      cplCount: 0,
      bestUci: null,
      bestSan: null,
    });
  }

  const emit = (node: Agg, source: RepertoireNodeSeed["source"]): RepertoireNodeSeed => ({
    node_key: node.nodeKey,
    parent_key: node.parentKey && keep.has(node.parentKey) ? node.parentKey : null,
    position_key: node.positionKey,
    fen: node.fenBefore,
    move_san: node.san,
    move_uci: node.uci,
    side_to_move: node.side,
    is_user_move: node.isUser,
    source,
    frequency: node.frequency,
    avg_cpl: node.cplCount > 0 ? node.cplSum / node.cplCount : null,
    comment: source === "stockfish" ? "Stockfish gợi ý nước tốt hơn" : null,
  });

  const nodes: RepertoireNodeSeed[] = [];
  for (const key of keep) {
    const node = agg.get(key);
    if (node) nodes.push(emit(node, "history"));
  }
  for (const extra of extras) nodes.push(emit(extra, "stockfish"));

  // Tên/ECO theo biến chính (đi theo con có tần suất cao nhất từ gốc).
  const childrenOf = (parentKey: string | null): Agg[] =>
    [...agg.values()].filter((n) => keep.has(n.nodeKey) && n.parentKey === parentKey);
  let opening: { eco: string; name: string } | null = null;
  let cursor: string | null = null;
  const guard = new Set<string>();
  for (let depth = 0; resolveOpening && depth < opt.maxPlies; depth += 1) {
    const kids: Agg[] = childrenOf(cursor).sort((a, b) => b.frequency - a.frequency);
    const pick: Agg | undefined = kids[0];
    if (!pick || guard.has(pick.nodeKey)) break;
    guard.add(pick.nodeKey);
    const found = resolveOpening(pick.fenAfter);
    if (found) opening = found;
    cursor = pick.nodeKey;
  }
  const colorLabel = color === "w" ? "Trắng" : "Đen";

  return {
    color,
    name: opening ? opening.name : `Repertoire ${colorLabel}`,
    eco: opening ? opening.eco : null,
    nodes,
  };
}
