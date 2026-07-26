import {
  Download,
  LoaderCircle,
  Sparkles,
  Upload,
} from "lucide-react";
import { DEMO_PGN } from "../../../demo";
import { useAppControllerContext } from "../../../app/AppControllerContext";
import "../home.css";

export function StartupWorkspace() {
  const {
    loadAnalysis,
    setImportMode,
    setImportOpen,
    workspaceMode,
  } = useAppControllerContext();

  if (workspaceMode === "booting") {
    return (
      <main className="startup-workspace booting" aria-busy="true">
        <LoaderCircle className="spin" size={25} />
        <span>Đang mở lại phiên gần nhất…</span>
      </main>
    );
  }

  return (
    <main className="startup-workspace">
      <section className="startup-card" aria-labelledby="startup-title">
        <div className="startup-icon"><Sparkles size={25} /></div>
        <div className="eyebrow">CHESS COACH</div>
        <h1 id="startup-title">Bắt đầu với ván cờ của bạn</h1>
        <p>Nạp một ván PGN hoặc đồng bộ lịch sử thi đấu để Stockfish và HLV AI cùng phân tích.</p>
        <div className="startup-actions">
          <button
            className="primary-button"
            onClick={() => {
              setImportMode("single");
              setImportOpen(true);
            }}
          >
            <Upload size={17} /> Nạp ván cờ
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              setImportMode("sync");
              setImportOpen(true);
            }}
          >
            <Download size={17} /> Đồng bộ tài khoản
          </button>
        </div>
        <button
          className="startup-demo"
          onClick={() => loadAnalysis(DEMO_PGN)}
        >
          Chưa có PGN? Mở ván mẫu
        </button>
      </section>
    </main>
  );
}
