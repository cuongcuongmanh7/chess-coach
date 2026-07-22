import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Chessboard } from "react-chessboard";
import {
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardPaste,
  Cpu,
  KeyRound,
  Link2,
  LoaderCircle,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { analyzePgn, type GameAnalysis, type MoveQuality } from "./analysis";
import { DEMO_PGN } from "./demo";
import { analyzeMoveWithStockfish, type EngineMoveAnalysis } from "./stockfish";

const QUALITY_LABELS: Record<MoveQuality, string> = {
  good: "Nước tốt",
  mistake: "Sai lầm",
  blunder: "Blunder",
};

const OPENAI_MODELS = [
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol", detail: "Chất lượng cao nhất" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra", detail: "Cân bằng chi phí" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna", detail: "Nhanh và tiết kiệm" },
];

const GEMINI_MODELS = [
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", detail: "Nhanh và tiết kiệm" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", detail: "Lý giải sâu hơn" },
];

type AiProvider = "openai" | "gemini";
type AutoExplainMode = "off" | "mistakes" | "visited";
type AiExplanation = { text: string; provider: AiProvider; model: string; cached: boolean };

const PROVIDER_LABELS: Record<AiProvider, string> = { openai: "OpenAI", gemini: "Gemini" };
const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-5.6-sol",
  gemini: "gemini-3.5-flash-lite",
};

const isTauri = () => "__TAURI_INTERNALS__" in window;

function isChessComLink(value: string) {
  return /^https?:\/\/(?:www\.)?chess\.com\/game\/(?:live|daily)\/\d+/i.test(value.trim());
}

function App() {
  const [analysis, setAnalysis] = useState<GameAnalysis>(() => analyzePgn(DEMO_PGN));
  const [currentIndex, setCurrentIndex] = useState(7);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [engineCache, setEngineCache] = useState<Record<number, EngineMoveAnalysis>>({});
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [aiCache, setAiCache] = useState<Record<string, AiExplanation>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [hasApiKeys, setHasApiKeys] = useState<Record<AiProvider, boolean>>({ openai: false, gemini: false });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [provider, setProvider] = useState<AiProvider>(() =>
    localStorage.getItem("kypho-ai-provider") === "openai" ? "openai" : "gemini",
  );
  const [model, setModel] = useState(() => {
    const savedProvider = localStorage.getItem("kypho-ai-provider") === "openai" ? "openai" : "gemini";
    return localStorage.getItem(`kypho-ai-model-${savedProvider}`) || DEFAULT_MODELS[savedProvider];
  });
  const [autoExplainMode, setAutoExplainMode] = useState<AutoExplainMode>(() => {
    const saved = localStorage.getItem("kypho-ai-auto-mode");
    return saved === "off" || saved === "visited" ? saved : "mistakes";
  });
  const aiInFlightRef = useRef(false);
  const cacheLookupsRef = useRef(new Set<string>());
  const cacheMissesRef = useRef(new Set<string>());
  const autoAttemptsRef = useRef(new Set<string>());

  const step = analysis.steps[currentIndex];
  const engine = engineCache[step.ply];
  const aiCacheKey = `${provider}:${model}:${step.fenAfter}`;
  const aiExplanation = aiCache[aiCacheKey];
  const quality = engine?.quality || step.quality;
  const headers = analysis.headers;
  const totalMoves = Math.ceil(analysis.steps.length / 2);
  const hasApiKey = hasApiKeys[provider];
  const providerLabel = PROVIDER_LABELS[provider];
  const models = provider === "gemini" ? GEMINI_MODELS : OPENAI_MODELS;

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
    if (!isTauri()) return;
    Promise.all([
      invoke<boolean>("has_api_key", { provider: "openai" }),
      invoke<boolean>("has_api_key", { provider: "gemini" }),
    ])
      .then(([openai, gemini]) => setHasApiKeys({ openai, gemini }))
      .catch(() => setHasApiKeys({ openai: false, gemini: false }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("textarea, input, select")) return;
      if (event.key === "ArrowLeft") setCurrentIndex((value) => Math.max(0, value - 1));
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

  useEffect(() => {
    if (engineCache[step.ply]) {
      setEngineLoading(false);
      setEngineError("");
      return;
    }
    const controller = new AbortController();
    setEngineLoading(true);
    setEngineError("");

    analyzeMoveWithStockfish(step.fenBefore, step.fenAfter, step.lan, controller.signal)
      .then((result) => setEngineCache((cache) => ({ ...cache, [step.ply]: result })))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setEngineError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEngineLoading(false);
      });

    return () => controller.abort();
  }, [engineCache, step.fenAfter, step.fenBefore, step.lan, step.ply]);

  useEffect(() => {
    setAiError("");
  }, [step.ply]);

  const loadAnalysis = (pgn: string) => {
    const next = analyzePgn(pgn);
    setAnalysis(next);
    setCurrentIndex(0);
    setEngineCache({});
    setAiCache({});
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
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
        if (!isTauri()) throw new Error("Tải link Chess.com cần mở app Tauri. Bản web chỉ nhận PGN.");
        pgn = await invoke<string>("fetch_chess_com_game", { gameUrl: pgn });
      }
      loadAnalysis(pgn);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const saveApiSettings = async () => {
    setSettingsError("");
    try {
      if (!isTauri()) throw new Error("Cấu hình API cần mở app Tauri.");
      if (apiKeyInput.trim()) {
        await invoke("set_api_key", { provider, apiKey: apiKeyInput.trim() });
        setHasApiKeys((values) => ({ ...values, [provider]: true }));
        setApiKeyInput("");
      } else if (!hasApiKey) {
        throw new Error(`Hãy nhập ${providerLabel} API key.`);
      }
      localStorage.setItem("kypho-ai-provider", provider);
      localStorage.setItem(`kypho-ai-model-${provider}`, model);
      localStorage.setItem("kypho-ai-auto-mode", autoExplainMode);
      setSettingsOpen(false);
    } catch (reason) {
      setSettingsError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const clearApiKey = async () => {
    if (!isTauri()) return;
    await invoke("clear_api_key", { provider });
    const available = await invoke<boolean>("has_api_key", { provider });
    setHasApiKeys((values) => ({ ...values, [provider]: available }));
    setApiKeyInput("");
  };

  const clearSavedExplanations = async () => {
    if (!isTauri()) return;
    await invoke("clear_ai_cache");
    setAiCache({});
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
  };

  const changeProvider = (nextProvider: AiProvider) => {
    setProvider(nextProvider);
    setModel(localStorage.getItem(`kypho-ai-model-${nextProvider}`) || DEFAULT_MODELS[nextProvider]);
    setApiKeyInput("");
    setSettingsError("");
  };

  const aiRequest = useMemo(() => {
    if (!engine) return null;
    const playerElo = step.color === "w" ? headers.WhiteElo : headers.BlackElo;
    return {
      player_elo: playerElo || null,
      phase: step.phase,
      move_number: step.moveNumber,
      played_move: step.san,
      fen_before: step.fenBefore,
      fen_after: step.fenAfter,
      evaluation: engine.evaluation,
      centipawn_loss: Math.round(engine.centipawnLoss),
      best_move: engine.bestMoveSan,
      best_line: engine.bestLineSan,
    };
  }, [engine, headers.BlackElo, headers.WhiteElo, step]);

  const explainWithAi = useCallback(async (forceRefresh = false) => {
    if (!engine || !aiRequest || aiInFlightRef.current) return;
    if (!hasApiKey) {
      setSettingsOpen(true);
      return;
    }
    aiInFlightRef.current = true;
    setAiLoading(true);
    setAiError("");
    try {
      const response = await invoke<AiExplanation>("explain_move", {
        provider,
        model,
        request: aiRequest,
        forceRefresh,
      });
      setAiCache((cache) => ({ ...cache, [aiCacheKey]: response }));
      cacheMissesRef.current.delete(aiCacheKey);
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      aiInFlightRef.current = false;
      setAiLoading(false);
    }
  }, [aiCacheKey, aiRequest, engine, hasApiKey, model, provider]);

  useEffect(() => {
    if (!isTauri() || !engine || !aiRequest || aiCache[aiCacheKey]) return;
    const shouldAutoExplain = autoExplainMode === "visited" || (autoExplainMode === "mistakes" && quality !== "good");
    const triggerAutoExplanation = () => {
      if (!shouldAutoExplain || !hasApiKey || aiInFlightRef.current || autoAttemptsRef.current.has(aiCacheKey)) return;
      autoAttemptsRef.current.add(aiCacheKey);
      void explainWithAi(false);
    };

    if (cacheMissesRef.current.has(aiCacheKey)) {
      triggerAutoExplanation();
      return;
    }
    if (cacheLookupsRef.current.has(aiCacheKey)) return;
    cacheLookupsRef.current.add(aiCacheKey);

    invoke<AiExplanation | null>("get_cached_explanation", { provider, model, request: aiRequest })
      .then((saved) => {
        if (saved) {
          setAiCache((cache) => ({ ...cache, [aiCacheKey]: saved }));
          return;
        }
        cacheMissesRef.current.add(aiCacheKey);
        triggerAutoExplanation();
      })
      .catch((reason) => setAiError(reason instanceof Error ? reason.message : String(reason)));
  }, [aiCache, aiCacheKey, aiLoading, aiRequest, autoExplainMode, engine, explainWithAi, hasApiKey, model, provider, quality]);

  const arrows = useMemo(() => {
    const result = [...step.arrows];
    if (engine?.bestMoveUci && engine.bestMoveUci !== step.lan) {
      result.push({
        startSquare: engine.bestMoveUci.slice(0, 2),
        endSquare: engine.bestMoveUci.slice(2, 4),
        color: "#43d9a3",
      });
    }
    return result;
  }, [engine, step.arrows, step.lan]);

  const chessboardOptions = {
    id: "analysis-board",
    position: step.fenAfter,
    boardOrientation: orientation,
    allowDragging: false,
    allowDrawingArrows: false,
    showAnimations: true,
    animationDurationInMs: 220,
    arrows,
    boardStyle: {
      borderRadius: "10px",
      boxShadow: "0 30px 80px rgba(0, 0, 0, 0.42)",
      overflow: "hidden",
    },
    darkSquareStyle: { backgroundColor: "#315f50" },
    lightSquareStyle: { backgroundColor: "#d9d4c4" },
    squareStyles: {
      [step.from]: { boxShadow: "inset 0 0 0 999px rgba(246, 190, 73, 0.25)" },
      [step.to]: { boxShadow: "inset 0 0 0 999px rgba(246, 190, 73, 0.5)" },
    },
    darkSquareNotationStyle: { color: "#d9d4c4", fontSize: "11px", fontWeight: 700 },
    lightSquareNotationStyle: { color: "#315f50", fontSize: "11px", fontWeight: 700 },
  } as const;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">K</div>
          <div>
            <div className="brand-name">Kỳ Phổ <span className="version-badge">v0.2.0</span></div>
            <div className="brand-subtitle">HLV CỜ VUA · STOCKFISH + AI</div>
          </div>
        </div>

        <div className="top-actions">
          <div className={`service-pill ${engine ? "online" : "working"}`}>
            <Cpu size={14} /> {engine ? `Stockfish d${engine.depth}` : "Stockfish đang tính"}
          </div>
          <div className={`service-pill ${hasApiKey ? "online" : ""}`}>
            <Bot size={14} /> {hasApiKey ? `${providerLabel} sẵn sàng` : `${providerLabel}: chưa có key`}
          </div>
          <button className="icon-button top-icon" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt">
            <Settings size={17} />
          </button>
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
              <span className="player-name"><i className="side-badge white-side">Trắng</i>{headers.White || "Trắng"}</span>
              <span className="versus">vs</span>
              <span className="player-name"><i className="side-badge black-side">Đen</i>{headers.Black || "Đen"}</span>
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
              <div><span className="phase-dot" /><strong>{step.phase}</strong><span>Nước {step.moveNumber}{step.color === "b" ? "…" : "."}</span></div>
              <div className="board-tools">
                <div className="evaluation-chip" title="Đánh giá theo phía Trắng">
                  <CircleGauge size={15} /> {engineLoading ? "…" : engine?.evaluation || "—"}
                </div>
                <button className="icon-button" onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))} aria-label="Xoay bàn cờ" title="Xoay bàn cờ">
                  <RotateCcw size={17} />
                </button>
              </div>
            </div>

            <div className="board-wrap"><Chessboard options={chessboardOptions} /></div>

            <div className="arrow-legend">
              <span><i className="legend-line gold" /> Nước vừa đi</span>
              <span><i className="legend-line green" /> Nước Stockfish</span>
              <span><i className="legend-line red" /> Phản đòn</span>
              <span className="keyboard-hint">← → chuyển nước</span>
            </div>
          </div>

          <aside className="coach-panel">
            <div className="coach-progress">
              <span>PHÂN TÍCH NƯỚC ĐI</span>
              <span>{currentIndex + 1} / {analysis.steps.length}</span>
            </div>
            <div className="progress-track"><div style={{ width: `${((currentIndex + 1) / analysis.steps.length) * 100}%` }} /></div>

            <div className="engine-strip">
              <div className="engine-name"><Cpu size={15} /><span>STOCKFISH 18 LITE</span></div>
              {engineLoading && <span className="engine-loading"><LoaderCircle size={14} /> đang tính depth 13</span>}
              {engine && <span className="engine-depth">CPL {Math.round(engine.centipawnLoss)}</span>}
              {engineError && <span className="engine-error">{engineError}</span>}
            </div>

            <div className="move-hero">
              <div className="move-badges">
                <div className={`quality-badge ${quality}`}><span className="quality-icon">{quality === "good" ? "✓" : "!"}</span>{QUALITY_LABELS[quality]}</div>
                <div className={`turn-badge ${step.color === "w" ? "white-turn" : "black-turn"}`}>
                  {step.color === "w" ? "Trắng" : "Đen"} · {step.color === "w" ? headers.White || "Người chơi" : headers.Black || "Người chơi"}
                </div>
              </div>
              <div className="san-display">{step.moveNumber}{step.color === "w" ? "." : "…"} {step.san}</div>
              <h2>{engine ? (quality === "good" ? "Engine đồng ý với nước đi" : `Stockfish chọn ${engine.bestMoveSan}`) : step.title}</h2>
              <p>{engine ? `Nước này mất khoảng ${Math.round(engine.centipawnLoss)} centipawn. Đánh giá sau nước đi: ${engine.evaluation} theo phía Trắng.` : step.comment}</p>
            </div>

            {engine && (
              <div className="best-line-card">
                <div className="best-line-label">BIẾN GỢI Ý</div>
                <div className="best-line-moves">{engine.bestLineSan.length ? engine.bestLineSan.join("  ") : engine.bestMoveSan}</div>
              </div>
            )}

            <div className={`insight-card ${aiExplanation ? "ai-ready" : ""}`}>
              <div className="insight-title">
                <BrainCircuit size={17} /> {aiExplanation ? `${providerLabel} · ${model}` : "Góc nhìn HLV"}
                {aiExplanation?.cached && <span className="saved-badge">Đã lưu</span>}
              </div>
              <p>{aiExplanation?.text || step.insight}</p>
              {aiError && <div className="inline-error">{aiError}</div>}
              {!aiExplanation && (
                <button className="ai-button" onClick={() => void explainWithAi(false)} disabled={!engine || aiLoading}>
                  {aiLoading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                  {aiLoading ? `${providerLabel} đang giải thích…` : `Giải thích bằng ${providerLabel}`}
                </button>
              )}
              {aiExplanation && (
                <button className="refresh-ai-button" onClick={() => void explainWithAi(true)} disabled={aiLoading}>
                  {aiLoading ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Phân tích lại
                </button>
              )}
            </div>

            <div className="tag-row">
              {step.tags.map((tag) => <span key={tag}>{tag}</span>)}
              {engine && <span className="engine-tag">Stockfish xác thực</span>}
            </div>
            <div className="coach-spacer" />

            <div className="step-controls">
              <button onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex === 0}><ChevronLeft size={19} /> Trước</button>
              <div className="move-coordinate">{step.from} → {step.to}</div>
              <button className="next-button" onClick={() => setCurrentIndex((value) => Math.min(analysis.steps.length - 1, value + 1))} disabled={currentIndex === analysis.steps.length - 1}>Tiếp <ChevronRight size={19} /></button>
            </div>
          </aside>
        </section>

        <section className="timeline-section">
          <div className="timeline-header">
            <div><BookOpen size={17} /><strong>Timeline nước đi</strong><span>{totalMoves} nước · {analysis.steps.length} lượt</span></div>
            <div className="timeline-key"><span><i className="dot good" /> Tốt</span><span><i className="dot mistake" /> Sai lầm</span><span><i className="dot blunder" /> Blunder</span></div>
          </div>
          <div className="timeline-scroller">
            {movePairs.map((pair) => (
              <div className="move-pair" key={pair.number}>
                <span className="move-number">{pair.number}.</span>
                {[pair.white, pair.black].map((stepIndex, colorIndex) => {
                  if (stepIndex === undefined) return null;
                  const item = analysis.steps[stepIndex];
                  const itemQuality = engineCache[item.ply]?.quality || item.quality;
                  return (
                    <button key={stepIndex} data-step-index={stepIndex} className={`timeline-move ${itemQuality} ${currentIndex === stepIndex ? "active" : ""}`} onClick={() => setCurrentIndex(stepIndex)} title={`${QUALITY_LABELS[itemQuality]} — ${item.title}`}>
                      <i className={`piece-dot ${colorIndex === 0 ? "white-piece" : "black-piece"}`} />
                      {item.san}<i className={`status-dot ${itemQuality}`} />
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
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setImportOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><ClipboardPaste size={24} /></div>
            <div className="eyebrow">BẮT ĐẦU PHÂN TÍCH</div>
            <h2 id="import-title">Nạp một ván cờ</h2>
            <p>Dán toàn bộ PGN hoặc link ván đấu đã kết thúc trên Chess.com.</p>
            <div className="input-labels"><span><ClipboardPaste size={14} /> PGN</span><span><Link2 size={14} /> Chess.com</span></div>
            <textarea autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder={'[Event "Live Chess"]\n[White "Tên người chơi"]\n\n1. e4 e5 2. Nf3...\n\nhoặc https://www.chess.com/game/live/...'} />
            {error && <div className="error-message">{error}</div>}
            <div className="modal-note">PGN được xử lý local. Stockfish chạy ngay trên máy và không cần Internet.</div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => loadAnalysis(DEMO_PGN)}>Mở ván demo</button>
              <button className="primary-button large" onClick={handleImport} disabled={loading || !input.trim()}>{loading ? "Đang tải ván…" : "Phân tích ngay"} <ArrowRight size={17} /></button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><Settings size={24} /></div>
            <div className="eyebrow">OPENAI · GEMINI · CACHE CỤC BỘ</div>
            <h2 id="settings-title">Cấu hình HLV AI</h2>
            <p>Chọn dịch vụ AI và cách app tự giải thích. Kết quả được lưu trên máy để lần sau hiện ngay, không gọi API lại.</p>

            <label className="field-label">Nhà cung cấp</label>
            <div className="provider-switch" role="group" aria-label="Nhà cung cấp AI">
              {(["gemini", "openai"] as AiProvider[]).map((item) => (
                <button key={item} className={provider === item ? "active" : ""} onClick={() => changeProvider(item)}>
                  <Bot size={15} /> {PROVIDER_LABELS[item]}
                  {hasApiKeys[item] && <span className="provider-ready">Sẵn sàng</span>}
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="model">Model</label>
            <select id="model" value={model} onChange={(event) => setModel(event.target.value)}>
              {models.map((item) => <option value={item.value} key={item.value}>{item.label} — {item.detail}</option>)}
            </select>

            <label className="field-label" htmlFor="auto-mode">Tự động giải thích</label>
            <select id="auto-mode" value={autoExplainMode} onChange={(event) => setAutoExplainMode(event.target.value as AutoExplainMode)}>
              <option value="mistakes">Chỉ Sai lầm + Blunder — khuyên dùng</option>
              <option value="visited">Mọi nước được mở xem</option>
              <option value="off">Tắt — chỉ phân tích khi bấm nút</option>
            </select>

            <label className="field-label" htmlFor="api-key">{providerLabel} API key</label>
            <div className="key-field">
              <KeyRound size={17} />
              <input id="api-key" type="password" autoComplete="off" value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder={hasApiKey ? `${providerLabel} key đã được cấu hình trong phiên này` : provider === "gemini" ? "AIza…" : "sk-…"} />
            </div>
            <div className="security-note"><ShieldCheck size={15} /> Key chỉ nằm trong bộ nhớ Rust và bị xoá khi đóng app. Có thể dùng biến môi trường {provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"}. Lời giải thích được lưu riêng trong SQLite, không kèm API key.</div>
            {settingsError && <div className="error-message">{settingsError}</div>}

            <div className="modal-actions settings-actions">
              <div className="settings-secondary-actions">
                {hasApiKey && <button className="danger-ghost" onClick={clearApiKey}><Trash2 size={15} /> Xoá key</button>}
                <button className="ghost-button" onClick={clearSavedExplanations}><Trash2 size={15} /> Xoá dữ liệu AI</button>
              </div>
              <button className="primary-button large" onClick={saveApiSettings}>Lưu cài đặt <ArrowRight size={17} /></button>
            </div>
          </section>
        </div>
      )}

      <footer>
        <span>Kỳ Phổ v0.2.0 · Stockfish 18 Lite · OpenAI + Gemini</span>
        <span><ShieldCheck size={13} /> PGN ở lại trên máy · Lời giải thích AI được lưu cục bộ</span>
      </footer>
    </div>
  );
}

export default App;
