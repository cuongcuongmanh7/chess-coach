import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import type { StoredEngineAnalysis } from "../../shared/types/tauri";
import { normalizeEngineAnalysis, playerEloForColor } from "./moveClassification";
import { withTacticalAnalysis } from "../tactics/detector.ts";
import { TACTICS_VERSION } from "../tactics/types";

export type StoredCacheResult = {
  // Cache engine theo ply, đã chuẩn hoá phân loại + gắn nhãn chiến thuật hiện hành.
  cache: Record<number, EngineMoveAnalysis>;
  // Các nước cần ghi lại vì phân loại/nhãn đã đổi so với bản lưu trong SQLite.
  reclassified: Array<{ step: AnalysisStep; result: EngineMoveAnalysis }>;
};

// Dựng lại cache engine từ kết quả Stockfish đã lưu (SQLite hoặc khôi phục cloud)
// cho một ván. Dùng chung bởi hydrate khi mở ván và bởi lượt dựng lại Mistake Lab
// sau khi đồng bộ, để cả hai áp cùng một cách chuẩn hoá phân loại.
export function buildEngineCacheFromStored(
  steps: AnalysisStep[],
  headers: Record<string, string>,
  stored: StoredEngineAnalysis[],
): StoredCacheResult {
  const cache: Record<number, EngineMoveAnalysis> = {};
  const reclassified: StoredCacheResult["reclassified"] = [];
  for (const item of stored) {
    const step = steps[item.ply - 1];
    if (item.result && item.result.depth >= item.depth && step) {
      const result = withTacticalAnalysis(
        step,
        normalizeEngineAnalysis(
          step,
          item.result,
          playerEloForColor(headers, step.color),
        ),
      );
      cache[item.ply] = result;
      if (
        item.result.quality !== result.quality
        || item.result.displayQuality !== result.displayQuality
        || item.result.expectedPointsLoss === undefined
        || item.result.tactics?.version !== TACTICS_VERSION
      ) {
        reclassified.push({ step, result });
      }
    }
  }
  return { cache, reclassified };
}
