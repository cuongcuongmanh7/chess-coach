export type BatchScope = number | "all";

// Chọn các ván sẽ đưa vào hàng đợi phân tích: chỉ ván chưa phân tích, lọc theo
// thể loại, và cắt theo số lượng nếu scope là số. Giữ nguyên thứ tự đầu vào
// (danh sách đã sắp mới nhất trước). Hàm thuần, không phụ thuộc Tauri/engine.
export function selectBatchCandidates<T extends { analysis_complete: boolean; time_class: string | null }>(
  games: T[],
  timeClass: string,
  scope: BatchScope,
): T[] {
  const pool = games.filter((game) =>
    !game.analysis_complete && (timeClass === "all" || game.time_class === timeClass));
  return typeof scope === "number" ? pool.slice(0, scope) : pool;
}
