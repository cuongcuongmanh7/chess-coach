import {
  Cloud,
  Download,
  LoaderCircle,
  LogIn,
  Sparkles,
  Upload,
} from "lucide-react";
import { DEMO_PGN } from "../../../demo";
import { BrandIcon } from "../../../shared/components/BrandIdentity";
import { useAppControllerContext } from "../../../app/AppControllerContext";
import "../home.css";

export function StartupWorkspace() {
  const {
    loadAnalysis,
    setImportMode,
    setImportOpen,
    setAccountOpen,
    firebaseUser,
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
        <p>Nạp một ván PGN hoặc tải lịch sử thi đấu từ Chess.com/Lichess để Stockfish và HLV AI cùng phân tích.</p>
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
            <Download size={17} /> Tải ván từ Chess.com/Lichess
          </button>
        </div>
        <button
          className="startup-account"
          onClick={() => setAccountOpen(true)}
        >
          {firebaseUser ? (
            <><Cloud size={16} /> Tài khoản Google · đồng bộ đám mây</>
          ) : (
            <><BrandIcon brand="google" size={16} /> Đăng nhập Google để đồng bộ đám mây <LogIn size={14} /></>
          )}
        </button>
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
