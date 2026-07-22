import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Link2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { analyzePgn, type GameAnalysis, type MoveQuality } from "./analysis";
import { DEMO_PGN } from "./demo";

const QUALITY_LABELS: Record<MoveQuality, string> = {
  good: "Nước tốt",
  mistake: "Sai lầm",
  blunder: "Blunder",
};

function isChessComLink(value: string) {
  return /^https?:\/\/(?:www\.)?chess\.com\/game\/(?:live|daily)\/\d+/i.test(value.trim());
}

function App() {
  const [analysis, setAnalysis] = useState<GameAnalysis>(() => analyzePgn(DEMO_PGN));
  const [currentIndex, setCurrentIndex] = useState(7);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [importOpen, setImportOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const step = analysis.steps[currentIndex];
  const headers = analysis.headers;
  const totalMoves = Math.ceil(analysis.steps.length / 2);

  const movePairs = useMemo(() => {
    const pairs: Array<{ number: number; white?: number; black?: number }> = [];
    analysis.steps.forEach((item, index) => {
      const pairIndex = item.moveNumber - 1;
      if (!pairs[pairIndex]) pairs[pairIndex] = { number: item.moveNumber };
      if (item.color === "w") pairs[pairIndex].white = index;
      else pairs[pairIndex].black = index;
    });
    return pairs;
  }, [analysis]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("textarea, input")) return;
      if (event.key === "ArrowLeft") {
        setCurrentIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "ArrowRight") {
        setCurrentIndex((value) => Math.min(analysis.steps.length - 1, value + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analysis.steps.length]);

  useEffect(() => {
    document
      .querySelector(`[data-step-index="${currentIndex}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex]);

  const loadAnalysis = (pgn: string) => {
    const next = analyzePgn(pgn);
    setAnalysis(next);
    setCurrentIndex(0);
    setImportOpen(false);
    setInput("");
    setError("");
  };

  const handleImport = async () => {
    setError("");
    setLoading(true);
    try {
      let pgn = input.trim();
      if (isChessComLink(pgn)) {
        if (!("__TAURI_INTERNALS__" in window)) {
          throw new Error("Tải link Chess.com cần mở app Tauri. Khi chạy bản web, hãy dán PGN.");
        }
        pgn = await invoke<string>("fetch_chess_com_game", { gameUrl: pgn });
      }
      loadAnalysis(pgn);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const goPrevious = () => setCurrentIndex((value) => Math.max(0, value - 1));
  const goNext = () =>
    setCurrentIndex((value) => Math.min(analysis.steps.length - 1, value + 1));

  const chessboardOptions = {
    id: "analysis-board",
    position: step.fenAfter,
    boardOrientation: orientation,
    allowDragging: false,
    allowDrawingArrows: false,
    showAnimations: true,
    animationDurationInMs: 220,
    arrows: step.arrows,
    boardStyle: {
      borderRadius: "10px",
      boxShadow: "0 28px 60px rgba(6, 12, 10, 0.36)",
      overflow: "hidden",
    },
    darkSquareStyle: { backgroundColor: "#2e5b4c" },
    lightSquareStyle: { backgroundColor: "#e9e2cf" },
    squareStyles: {
      [step.from]: { boxShadow: "inset 0 0 0 999px rgba(244, 191, 79, 0.25)" },
      [step.to]: { boxShadow: "inset 0 0 0 999px rgba(244, 191, 79, 0.46)" },
    },
    darkSquareNotationStyle: { color: "#e9e2cf", fontSize: "11px", fontWeight: 700 },
    lightSquareNotationStyle: { color: "#2e5b4c", fontSize: "11px", fontWeight: 700 },
  } as const;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">K</div>
          <div>
            <div className="brand-name">Kỳ Phổ</div>
            <div className="brand-subtitle">HLV cờ vua trực quan</div>
          </div>
        </div>

        <div className="top-actions">
          <div className="local-pill"><ShieldCheck size={14} /> Phân tích cục bộ</div>
          <button className="primary-button" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Nạp ván cờ
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="game-heading">
          <div className="game-title-wrap">
            <div className="eyebrow">{headers.Event || "Ván cờ đã nhập"}</div>
            <h1>
              <span>{headers.White || "Trắng"}</span>
              <span className="versus">vs</span>
              <span>{headers.Black || "Đen"}</span>
            </h1>
          </div>
          <div className="game-meta">
            <span>{headers.WhiteElo || "—"}</span>
            <span className="result">{headers.Result || "*"}</span>
            <span>{headers.BlackElo || "—"}</span>
            <span className="meta-divider" />
            <span>{headers.ECO || "ECO —"}</span>
            <span>{headers.TimeControl ? `${headers.TimeControl}s` : "Không rõ thời gian"}</span>
          </div>
        </section>

        <section className="analysis-grid">
          <div className="board-column">
            <div className="board-toolbar">
              <div>
                <span className="phase-dot" />
                <strong>{step.phase}</strong>
                <span>Nước {step.moveNumber}{step.color === "b" ? "…" : "."}</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))}
                aria-label="Xoay bàn cờ"
                title="Xoay bàn cờ"
              >
                <RotateCcw size={17} />
              </button>
            </div>

            <div className="board-wrap">
              <Chessboard options={chessboardOptions} />
            </div>

            <div className="arrow-legend">
              <span><i className="legend-line gold" /> Nước vừa đi</span>
              <span><i className="legend-line red" /> Ý đồ / phản đòn</span>
              <span className="keyboard-hint">← → để chuyển nước</span>
            </div>
          </div>

          <aside className="coach-panel">
            <div className="coach-progress">
              <span>PHÂN TÍCH NƯỚC ĐI</span>
              <span>{currentIndex + 1} / {analysis.steps.length}</span>
            </div>
            <div className="progress-track">
              <div style={{ width: `${((currentIndex + 1) / analysis.steps.length) * 100}%` }} />
            </div>

            <div className="move-hero">
              <div className={`quality-badge ${step.quality}`}>
                <span className="quality-icon">{step.quality === "good" ? "✓" : "!"}</span>
                {QUALITY_LABELS[step.quality]}
              </div>
              <div className="san-display">{step.moveNumber}{step.color === "w" ? "." : "…"} {step.san}</div>
              <h2>{step.title}</h2>
              <p>{step.comment}</p>
            </div>

            <div className="insight-card">
              <div className="insight-title"><Sparkles size={17} /> Góc nhìn HLV</div>
              <p>{step.insight}</p>
            </div>

            <div className="tag-row">
              {step.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>

            <div className="coach-spacer" />

            <div className="step-controls">
              <button onClick={goPrevious} disabled={currentIndex === 0}>
                <ChevronLeft size={19} /> Trước
              </button>
              <div className="move-coordinate">{step.from} → {step.to}</div>
              <button className="next-button" onClick={goNext} disabled={currentIndex === analysis.steps.length - 1}>
                Tiếp <ChevronRight size={19} />
              </button>
            </div>
          </aside>
        </section>

        <section className="timeline-section">
          <div className="timeline-header">
            <div>
              <BookOpen size={17} />
              <strong>Timeline nước đi</strong>
              <span>{totalMoves} nước · {analysis.steps.length} lượt</span>
            </div>
            <div className="timeline-key">
              <span><i className="dot good" /> Tốt</span>
              <span><i className="dot mistake" /> Sai lầm</span>
              <span><i className="dot blunder" /> Blunder</span>
            </div>
          </div>

          <div className="timeline-scroller">
            {movePairs.map((pair) => (
              <div className="move-pair" key={pair.number}>
                <span className="move-number">{pair.number}.</span>
                {[pair.white, pair.black].map((stepIndex, colorIndex) => {
                  if (stepIndex === undefined) return null;
                  const item = analysis.steps[stepIndex];
                  return (
                    <button
                      key={stepIndex}
                      data-step-index={stepIndex}
                      className={`timeline-move ${item.quality} ${currentIndex === stepIndex ? "active" : ""}`}
                      onClick={() => setCurrentIndex(stepIndex)}
                      title={`${QUALITY_LABELS[item.quality]} — ${item.title}`}
                    >
                      <i className={`piece-dot ${colorIndex === 0 ? "white-piece" : "black-piece"}`} />
                      {item.san}
                      <i className={`status-dot ${item.quality}`} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </main>

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setImportOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><ClipboardPaste size={24} /></div>
            <div className="eyebrow">BẮT ĐẦU PHÂN TÍCH</div>
            <h2 id="import-title">Nạp một ván cờ</h2>
            <p>Dán toàn bộ PGN hoặc link ván đấu công khai trên Chess.com.</p>

            <div className="input-labels">
              <span><ClipboardPaste size={14} /> PGN</span>
              <span><Link2 size={14} /> Chess.com</span>
            </div>
            <textarea
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={'[Event "Live Chess"]\n[White "Tên người chơi"]\n\n1. e4 e5 2. Nf3...\n\nhoặc https://www.chess.com/game/live/...'}
            />
            {error && <div className="error-message">{error}</div>}
            <div className="modal-note">
              Nhận xét hiện dùng heuristic để minh hoạ trải nghiệm; chưa phải đánh giá engine.
            </div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => loadAnalysis(DEMO_PGN)}>Mở ván demo</button>
              <button className="primary-button large" onClick={handleImport} disabled={loading || !input.trim()}>
                {loading ? "Đang tải ván…" : "Phân tích ngay"} <ArrowRight size={17} />
              </button>
            </div>
          </section>
        </div>
      )}

      <footer>
        <span>Kỳ Phổ prototype</span>
        <span><ArrowLeft size={13} /> Dữ liệu ván cờ ở lại trên máy của bạn <ArrowRight size={13} /></span>
      </footer>
    </div>
  );
}

export default App;
