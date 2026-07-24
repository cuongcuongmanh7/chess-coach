import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  LoaderCircle,
  Pause,
  Play,
  Square,
  X,
} from "lucide-react";
import { useAppControllerContext } from "../AppControllerContext";

const TIME_CLASSES = [
  { value: "all", label: "Tất cả thể loại" },
  { value: "bullet", label: "Bullet" },
  { value: "blitz", label: "Blitz" },
  { value: "rapid", label: "Rapid" },
  { value: "classical", label: "Classical" },
];

export function BatchAnalysisPanel() {
  const {
    batchAnalysis,
    batchSheetOpen,
    setBatchSheetOpen,
    activeProfileLabel,
    countBatchCandidates,
    startBatchAnalysis,
    pauseBatchAnalysis,
    resumeBatchAnalysis,
    cancelBatchAnalysis,
    dismissBatchResult,
  } = useAppControllerContext();
  const [timeClass, setTimeClass] = useState("all");
  const [useLimit, setUseLimit] = useState(false);
  const [limit, setLimit] = useState(20);
  const available = countBatchCandidates(timeClass);
  const plyPercent = batchAnalysis.currentPlyTotal
    ? Math.round((batchAnalysis.currentPly / batchAnalysis.currentPlyTotal) * 100)
    : 0;
  const gamePercent = batchAnalysis.total
    ? Math.round(((batchAnalysis.done + batchAnalysis.failed) / batchAnalysis.total) * 100)
    : 0;
  return (
    <>
      {batchSheetOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setBatchSheetOpen(false)}>
          <section className="modal-card batch-sheet" role="dialog" aria-modal="true" aria-labelledby="batch-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setBatchSheetOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><BarChart3 size={24} /></div>
            <div className="eyebrow">STOCKFISH · HÀNG LOẠT</div>
            <h2 id="batch-title">Phân tích hàng loạt</h2>
            <p>Phân tích tuần tự từng ván chưa có kết quả của {activeProfileLabel}. Ván đã phân tích được bỏ qua, chỉ chạy Stockfish (không gọi AI).</p>

            <label className="field-label" htmlFor="batch-time-class">Thể loại</label>
            <select id="batch-time-class" value={timeClass} onChange={(event) => setTimeClass(event.target.value)}>
              {TIME_CLASSES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>

            <div className="batch-count">Chưa phân tích: <strong>{available} ván</strong></div>

            <div className="batch-scope" role="radiogroup" aria-label="Phạm vi phân tích">
              <label>
                <input type="radio" name="batch-scope" checked={!useLimit} onChange={() => setUseLimit(false)} />
                Tất cả chưa phân tích ({available})
              </label>
              <label>
                <input type="radio" name="batch-scope" checked={useLimit} onChange={() => setUseLimit(true)} />
                Chỉ
                <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} disabled={!useLimit} aria-label="Số ván">
                  {[10, 20, 50, 100].map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
                ván mới nhất
              </label>
            </div>

            <div className="modal-note">Chạy tuần tự 1 ván/lần để không làm nóng máy. Có thể tạm dừng hoặc dừng bất cứ lúc nào.</div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setBatchSheetOpen(false)}>Hủy</button>
              <button
                className="primary-button large"
                disabled={available === 0}
                onClick={() => void startBatchAnalysis(useLimit ? limit : "all", timeClass)}
              >
                Bắt đầu <ArrowRight size={17} />
              </button>
            </div>
          </section>
        </div>
      )}

      {(batchAnalysis.running || batchAnalysis.finished) && (
        <div className={`batch-card ${batchAnalysis.finished ? "done" : ""}`} role="status" aria-live="polite">
          {batchAnalysis.running ? (
            <>
              <div className="batch-card-head">
                <span><LoaderCircle className="spin" size={17} /> Đang phân tích hàng loạt</span>
                <span className="batch-card-count">{batchAnalysis.done + batchAnalysis.failed}/{batchAnalysis.total}</span>
              </div>
              <div className="batch-card-current" title={batchAnalysis.currentLabel}>{batchAnalysis.currentLabel || "Đang chuẩn bị…"}</div>
              <div className="batch-progress"><b style={{ width: `${plyPercent}%` }} /></div>
              <div className="batch-card-sub">Ván hiện tại · {batchAnalysis.currentPly}/{batchAnalysis.currentPlyTotal || "?"} nước</div>
              <div className="batch-progress total"><b style={{ width: `${gamePercent}%` }} /></div>
              <div className="batch-card-sub">Tổng · {batchAnalysis.done} xong · {batchAnalysis.failed} lỗi{batchAnalysis.paused ? " · đã tạm dừng" : ""}</div>
              <div className="batch-card-actions">
                {batchAnalysis.paused ? (
                  <button onClick={resumeBatchAnalysis}><Play size={14} /> Tiếp tục</button>
                ) : (
                  <button onClick={pauseBatchAnalysis}><Pause size={14} /> Tạm dừng</button>
                )}
                <button onClick={cancelBatchAnalysis}><Square size={13} /> Dừng lại</button>
              </div>
            </>
          ) : (
            <div className="batch-card-done">
              <span><CheckCircle2 size={18} /> Đã phân tích {batchAnalysis.done} ván{batchAnalysis.failed ? ` · ${batchAnalysis.failed} lỗi bỏ qua` : ""}</span>
              <button className="batch-card-dismiss" onClick={dismissBatchResult} aria-label="Đóng"><X size={16} /></button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
