import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Chessboard } from "react-chessboard";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardPaste,
  Cpu,
  KeyRound,
  Library,
  Link2,
  LoaderCircle,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { analyzePgn, type AnalysisStep, type GameAnalysis, type MoveQuality } from "./analysis";
import { DEMO_PGN } from "./demo";
import { analyzeGameWithStockfish, analyzeMoveWithStockfish, type EngineMoveAnalysis } from "./stockfish";

const QUALITY_LABELS: Record<MoveQuality, string> = {
  best: "Best move",
  good: "Nước tốt",
  inaccuracy: "Thiếu chính xác",
  mistake: "Sai lầm",
  blunder: "Blunder",
};

const QUALITY_ORDER: MoveQuality[] = ["best", "good", "inaccuracy", "mistake", "blunder"];

type BoardMoveBadge = Exclude<MoveQuality, "good"> | "brilliant";

const BOARD_MOVE_BADGES: Record<BoardMoveBadge, { symbol: string; label: string }> = {
  brilliant: { symbol: "!!", label: "Brilliant" },
  best: { symbol: "★", label: "Best move" },
  inaccuracy: { symbol: "?!", label: "Thiếu chính xác" },
  mistake: { symbol: "?", label: "Sai lầm" },
  blunder: { symbol: "??", label: "Blunder" },
};

const BOARD_PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
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
type PlayerSummary = {
  moves: number;
  acpl: number;
  bestGoodRate: number;
  counts: Record<MoveQuality, number>;
};
type SavedGameSummary = {
  id: string;
  white: string;
  black: string;
  white_elo: string | null;
  black_elo: string | null;
  result: string | null;
  event: string | null;
  date: string | null;
  eco: string | null;
  time_control: string | null;
  source_url: string | null;
  created_at: string;
  last_opened_at: string;
};
type SavedGameDetail = { id: string; pgn: string };

const PROVIDER_LABELS: Record<AiProvider, string> = { openai: "OpenAI", gemini: "Gemini" };
const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-5.6-sol",
  gemini: "gemini-3.5-flash-lite",
};

const isTauri = () => "__TAURI_INTERNALS__" in window;
const COACH_LINE_LABELS = ["ĐÁNH GIÁ", "Ý TƯỞNG", "SO SÁNH", "KẾ HOẠCH"];
const COACH_TOKEN_PATTERN = /((?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[+-]\d+(?:\.\d+)?))/g;
const COACH_MOVE_PATTERN = /^(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)$/;
const COACH_EVAL_PATTERN = /^[+-]\d+(?:\.\d+)?$/;

function evaluationToWhitePercent(whiteScoreCp?: number) {
  if (whiteScoreCp === undefined) return 50;
  const clampedScore = Math.max(-2000, Math.min(2000, whiteScoreCp));
  const probability = 100 / (1 + Math.exp(-0.00368208 * clampedScore));
  return Math.max(3, Math.min(97, probability));
}

function formatSavedTimestamp(value: string) {
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function isBrilliantMove(step: AnalysisStep, engine: EngineMoveAnalysis) {
  if (engine.quality !== "best" || engine.centipawnLoss > 10) return false;

  const before = new Chess(step.fenBefore);
  const after = new Chess(step.fenAfter);
  const movedPiece = after.get(step.to as Square);
  if (!movedPiece || BOARD_PIECE_VALUES[movedPiece.type] < 3) return false;

  const capturedPiece = before.get(step.to as Square);
  const capturedValue = capturedPiece ? BOARD_PIECE_VALUES[capturedPiece.type] : 0;
  const movedValue = BOARD_PIECE_VALUES[movedPiece.type];
  if (capturedValue >= movedValue) return false;

  const canBeCaptured = after.moves({ verbose: true }).some(
    (reply) => reply.to === step.to && reply.captured === movedPiece.type,
  );
  if (!canBeCaptured) return false;

  const moverScoreCp = engine.whiteScoreCp * (step.color === "w" ? 1 : -1);
  return moverScoreCp >= -100;
}

function getBoardMoveBadge(step: AnalysisStep, engine?: EngineMoveAnalysis): BoardMoveBadge | null {
  if (!engine || engine.quality === "good") return null;
  if (isBrilliantMove(step, engine)) return "brilliant";
  return engine.quality;
}

function getBoardBadgePosition(square: string, orientation: "white" | "black") {
  const fileIndex = square.charCodeAt(0) - 97;
  const rankIndex = Number(square[1]) - 1;
  const column = orientation === "white" ? fileIndex : 7 - fileIndex;
  const row = orientation === "white" ? 7 - rankIndex : rankIndex;
  return { left: `${column * 12.5}%`, top: `${row * 12.5}%` };
}

function renderCoachInline(text: string) {
  return text.split(COACH_TOKEN_PATTERN).filter(Boolean).map((part, index) => {
    if (COACH_EVAL_PATTERN.test(part)) return <span className="coach-token eval" key={`${part}-${index}`}>{part}</span>;
    if (COACH_MOVE_PATTERN.test(part)) return <span className="coach-token move" key={`${part}-${index}`}>{part}</span>;
    return part;
  });
}

function CoachExplanation({ text }: { text: string }) {
  const normalizedText = text.replace(/\*\*/g, "");
  const explicitLines = normalizedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const groupedLines: string[] = [];
  let currentSection = -1;
  explicitLines.forEach((line) => {
    const labeled = line.match(/^(ĐÁNH GIÁ|Ý TƯỞNG|SO SÁNH|KẾ HOẠCH)\s*(?::|·|\||$)\s*(.*)$/i);
    if (labeled) {
      groupedLines.push(`${labeled[1].toUpperCase()}: ${labeled[2]}`.trim());
      currentSection = groupedLines.length - 1;
      return;
    }
    if (currentSection >= 0) {
      groupedLines[currentSection] = `${groupedLines[currentSection]} ${line}`.trim();
    } else {
      groupedLines.push(line);
    }
  });
  const lines = groupedLines.length > 1
    ? groupedLines
    : normalizedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((line) => line.trim()).filter(Boolean) || [normalizedText];

  return (
    <div className="coach-explanation">
      {lines.map((line, index) => {
        const labeled = line.match(/^(ĐÁNH GIÁ|Ý TƯỞNG|SO SÁNH|KẾ HOẠCH)\s*[:·|]\s*(.*)$/i);
        const label = labeled?.[1]?.toUpperCase() || COACH_LINE_LABELS[index] || "NHẬN XÉT";
        const content = labeled?.[2] || line;
        return (
          <div className="coach-explanation-row" key={`${label}-${index}`}>
            <span className="coach-explanation-label">{label}</span>
            <span className="coach-explanation-copy">{renderCoachInline(content)}</span>
          </div>
        );
      })}
    </div>
  );
}

function GameCoachSummaryView({ text }: { text: string }) {
  const sections = new Map<string, string>();
  const fallback: string[] = [];
  text.replace(/\*\*/g, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) {
      fallback.push(line);
      return;
    }
    const label = match[1].toUpperCase().replace(/[—-]/g, "·").replace(/\s+/g, " ").trim();
    sections.set(label, match[2]);
  });

  const findSection = (side: "TRẮNG" | "ĐEN", topic: "ĐIỂM MẠNH" | "CẦN CẢI THIỆN" | "ƯU TIÊN") =>
    [...sections.entries()].find(([label]) => label.includes(side) && label.includes(topic))?.[1] || "Chưa có nhận xét.";
  const overview = sections.get("TỔNG QUAN") || fallback.join(" ") || "Chưa có tổng quan.";

  return (
    <div className="game-coach-result">
      <div className="game-coach-overview"><strong>Tổng quan</strong><p>{renderCoachInline(overview)}</p></div>
      <div className="game-coach-players">
        {(["TRẮNG", "ĐEN"] as const).map((side) => (
          <article className={`game-coach-player ${side === "TRẮNG" ? "white" : "black"}`} key={side}>
            <div className="game-coach-player-title"><i className={`side-badge ${side === "TRẮNG" ? "white-side" : "black-side"}`}>{side === "TRẮNG" ? "Trắng" : "Đen"}</i><strong>Đánh giá sơ bộ</strong></div>
            <div className="game-coach-point strength"><span>Điểm mạnh</span><p>{renderCoachInline(findSection(side, "ĐIỂM MẠNH"))}</p></div>
            <div className="game-coach-point improve"><span>Cần cải thiện</span><p>{renderCoachInline(findSection(side, "CẦN CẢI THIỆN"))}</p></div>
            <div className="game-coach-point priority"><span>Ưu tiên luyện tập</span><p>{renderCoachInline(findSection(side, "ƯU TIÊN"))}</p></div>
          </article>
        ))}
      </div>
    </div>
  );
}

function isChessComLink(value: string) {
  return /^https?:\/\/(?:www\.)?chess\.com\/game\/(?:live|daily)\/\d+/i.test(value.trim());
}

function App() {
  const [analysis, setAnalysis] = useState<GameAnalysis>(() => analyzePgn(DEMO_PGN));
  const [currentIndex, setCurrentIndex] = useState(7);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [importOpen, setImportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedGames, setSavedGames] = useState<SavedGameSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [engineCache, setEngineCache] = useState<Record<number, EngineMoveAnalysis>>({});
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [fullAnalysis, setFullAnalysis] = useState({ running: false, complete: false, completed: 0, total: 0, error: "" });
  const [gameCoachSummary, setGameCoachSummary] = useState<AiExplanation | null>(null);
  const [gameCoachLoading, setGameCoachLoading] = useState(false);
  const [gameCoachError, setGameCoachError] = useState("");
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
  const fullAnalysisAbortRef = useRef<AbortController | null>(null);

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
  const whiteEvaluationPercent = evaluationToWhitePercent(engine?.whiteScoreCp);
  const evaluationLeader = (engine?.whiteScoreCp || 0) >= 0 ? "white" : "black";
  const evaluationScoreAtTop = evaluationLeader !== orientation;
  const boardMoveBadge = getBoardMoveBadge(step, engine);
  const boardMoveBadgePosition = getBoardBadgePosition(step.to, orientation);

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

  const refreshSavedGames = useCallback(async () => {
    if (!isTauri()) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      setSavedGames(await invoke<SavedGameSummary[]>("list_saved_games"));
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const fullGameSummary = useMemo(() => {
    const buildPlayerSummary = (color: "w" | "b"): PlayerSummary => {
      const results = analysis.steps
        .filter((item) => item.color === color)
        .map((item) => engineCache[item.ply])
        .filter((item): item is EngineMoveAnalysis => Boolean(item));
      const counts: Record<MoveQuality, number> = {
        best: 0,
        good: 0,
        inaccuracy: 0,
        mistake: 0,
        blunder: 0,
      };
      results.forEach((item) => { counts[item.quality] += 1; });
      const totalLoss = results.reduce((sum, item) => sum + item.centipawnLoss, 0);
      return {
        moves: results.length,
        acpl: results.length ? Math.round(totalLoss / results.length) : 0,
        bestGoodRate: results.length ? Math.round(((counts.best + counts.good) / results.length) * 100) : 0,
        counts,
      };
    };

    const critical = analysis.steps
      .map((item, index) => ({ item, index, engine: engineCache[item.ply] }))
      .filter(({ engine: result }) => result?.quality === "mistake" || result?.quality === "blunder");

    return { white: buildPlayerSummary("w"), black: buildPlayerSummary("b"), critical };
  }, [analysis.steps, engineCache]);

  const gameSummaryRequest = useMemo(() => {
    if (!fullAnalysis.complete) return null;
    const playerData = (side: "white" | "black", stats: PlayerSummary) => ({
      name: side === "white" ? headers.White || "Trắng" : headers.Black || "Đen",
      elo: side === "white" ? headers.WhiteElo || null : headers.BlackElo || null,
      moves: stats.moves,
      acpl: stats.acpl,
      best_good_rate: stats.bestGoodRate,
      counts: stats.counts,
    });
    const allCriticalPositions = fullGameSummary.critical
      .flatMap(({ item, engine: result }) => result ? [{
        move_number: item.moveNumber,
        side: item.color === "w" ? "Trắng" : "Đen",
        played_move: item.san,
        quality: QUALITY_LABELS[result.quality],
        centipawn_loss: Math.round(result.centipawnLoss),
        evaluation: result.evaluation,
        best_move: result.bestMoveSan,
      }] : []);
    const criticalPositions = (["Trắng", "Đen"] as const).flatMap((side) =>
      allCriticalPositions
        .filter((position) => position.side === side)
        .sort((left, right) => right.centipawn_loss - left.centipawn_loss)
        .slice(0, 4),
    );
    return {
      opening: headers.Opening || headers.ECO || "Không rõ khai cuộc",
      result: headers.Result || "*",
      total_plies: analysis.steps.length,
      white: playerData("white", fullGameSummary.white),
      black: playerData("black", fullGameSummary.black),
      critical_positions: criticalPositions,
    };
  }, [analysis.steps.length, fullAnalysis.complete, fullGameSummary, headers]);

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
    void refreshSavedGames();
  }, [refreshSavedGames]);

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
    if (engine?.depth && engine.depth >= 13) {
      setEngineLoading(false);
      setEngineError("");
      return;
    }
    const controller = new AbortController();
    setEngineLoading(true);
    setEngineError("");

    analyzeMoveWithStockfish(step.fenBefore, step.fenAfter, step.lan, controller.signal)
      .then((result) => setEngineCache((cache) => {
        if ((cache[step.ply]?.depth || 0) >= result.depth) return cache;
        return { ...cache, [step.ply]: result };
      }))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setEngineError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEngineLoading(false);
      });

    return () => controller.abort();
  }, [engine?.depth, step.fenAfter, step.fenBefore, step.lan, step.ply]);

  useEffect(() => () => fullAnalysisAbortRef.current?.abort(), []);

  useEffect(() => {
    setAiError("");
  }, [step.ply]);

  const loadAnalysis = (pgn: string) => {
    const next = analyzePgn(pgn);
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = null;
    setAnalysis(next);
    setCurrentIndex(0);
    setEngineCache({});
    setAiCache({});
    setGameCoachSummary(null);
    setGameCoachError("");
    setGameCoachLoading(false);
    setSummaryOpen(false);
    setLibraryOpen(false);
    setFullAnalysis({ running: false, complete: false, completed: 0, total: next.steps.length, error: "" });
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
    setImportOpen(false);
    setInput("");
    setError("");
    return next;
  };

  const handleImport = async () => {
    setError("");
    setLoading(true);
    try {
      const importedValue = input.trim();
      const sourceUrl = isChessComLink(importedValue) ? importedValue : null;
      let pgn = importedValue;
      if (sourceUrl) {
        if (!isTauri()) throw new Error("Tải link Chess.com cần mở app Tauri. Bản web chỉ nhận PGN.");
        pgn = await invoke<string>("fetch_chess_com_game", { gameUrl: pgn });
      }
      const importedAnalysis = loadAnalysis(pgn);
      if (isTauri()) {
        try {
          await invoke<string>("save_game", {
            request: {
              pgn: importedAnalysis.rawPgn,
              white: importedAnalysis.headers.White || "Trắng",
              black: importedAnalysis.headers.Black || "Đen",
              white_elo: importedAnalysis.headers.WhiteElo || null,
              black_elo: importedAnalysis.headers.BlackElo || null,
              result: importedAnalysis.headers.Result || null,
              event: importedAnalysis.headers.Event || null,
              date: importedAnalysis.headers.Date || null,
              eco: importedAnalysis.headers.ECO || null,
              time_control: importedAnalysis.headers.TimeControl || null,
              source_url: sourceUrl,
            },
          });
          await refreshSavedGames();
        } catch (reason) {
          setLibraryError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const openStoredGame = async (id: string) => {
    if (!isTauri() || libraryLoading) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const saved = await invoke<SavedGameDetail>("open_saved_game", { id });
      loadAnalysis(saved.pgn);
      await refreshSavedGames();
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  };

  const removeStoredGame = async (game: SavedGameSummary) => {
    if (!isTauri() || libraryLoading) return;
    if (!window.confirm(`Xoá ván ${game.white} — ${game.black} khỏi Kho ván?`)) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      await invoke<boolean>("delete_saved_game", { id: game.id });
      await refreshSavedGames();
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  };

  const startFullGameAnalysis = async () => {
    if (fullAnalysis.running) return;
    if (fullAnalysis.complete) {
      setSummaryOpen(true);
      return;
    }

    const controller = new AbortController();
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = controller;
    setFullAnalysis({ running: true, complete: false, completed: 0, total: analysis.steps.length, error: "" });

    try {
      await analyzeGameWithStockfish(
        analysis.steps,
        (ply, result, completed, total) => {
          setEngineCache((cache) => {
            if ((cache[ply]?.depth || 0) >= result.depth) return cache;
            return { ...cache, [ply]: result };
          });
          setFullAnalysis({ running: true, complete: false, completed, total, error: "" });
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setFullAnalysis({ running: false, complete: true, completed: analysis.steps.length, total: analysis.steps.length, error: "" });
        setSummaryOpen(true);
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setFullAnalysis((value) => ({
        ...value,
        running: false,
        error: reason instanceof Error ? reason.message : String(reason),
      }));
    } finally {
      if (fullAnalysisAbortRef.current === controller) fullAnalysisAbortRef.current = null;
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
    setGameCoachSummary(null);
    setGameCoachError("");
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
  };

  const changeProvider = (nextProvider: AiProvider) => {
    setProvider(nextProvider);
    setModel(localStorage.getItem(`kypho-ai-model-${nextProvider}`) || DEFAULT_MODELS[nextProvider]);
    setApiKeyInput("");
    setSettingsError("");
    setGameCoachSummary(null);
    setGameCoachError("");
  };

  const changeModel = (nextModel: string) => {
    setModel(nextModel);
    setGameCoachSummary(null);
    setGameCoachError("");
  };

  const aiRequest = useMemo(() => {
    if (!engine) return null;
    const playerElo = step.color === "w" ? headers.WhiteElo : headers.BlackElo;
    return {
      player_elo: playerElo || null,
      side_just_moved: step.color === "w" ? "Trắng" : "Đen",
      side_to_move: step.color === "w" ? "Đen" : "Trắng",
      phase: step.phase,
      move_number: step.moveNumber,
      played_move: step.san,
      fen_before: step.fenBefore,
      fen_after: step.fenAfter,
      evaluation: engine.evaluation,
      centipawn_loss: Math.round(engine.centipawnLoss),
      best_move: engine.bestMoveSan,
      best_line: engine.bestLineSan,
      best_reply: engine.bestReplySan || null,
      reply_line: engine.replyLineSan,
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

  const summarizeGameWithAi = useCallback(async (forceRefresh = false) => {
    if (!gameSummaryRequest || gameCoachLoading) return;
    if (!hasApiKey) {
      setSummaryOpen(false);
      setSettingsOpen(true);
      return;
    }
    setGameCoachLoading(true);
    setGameCoachError("");
    try {
      const response = await invoke<AiExplanation>("summarize_game", {
        provider,
        model,
        request: gameSummaryRequest,
        forceRefresh,
      });
      setGameCoachSummary(response);
    } catch (reason) {
      setGameCoachError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setGameCoachLoading(false);
    }
  }, [gameCoachLoading, gameSummaryRequest, hasApiKey, model, provider]);

  useEffect(() => {
    if (!isTauri() || !engine || !aiRequest || aiCache[aiCacheKey]) return;
    const shouldAutoExplain = autoExplainMode === "visited" || (autoExplainMode === "mistakes" && (quality === "mistake" || quality === "blunder"));
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
    engine?.variations.slice(0, 2).forEach((variation, index) => {
      if (!variation.moveUci || variation.moveUci === step.lan) return;
      result.push({
        startSquare: variation.moveUci.slice(0, 2),
        endSquare: variation.moveUci.slice(2, 4),
        color: index === 0 ? "#43d9a3" : "#67a7ff",
      });
    });
    return result;
  }, [engine?.variations, step.arrows, step.lan]);

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
    squareRenderer: ({ square, children }: { square: string; children?: React.ReactNode }) => (
      <div className={`analysis-square-content${square === step.from ? " last-move-from" : ""}${square === step.to ? " last-move-to" : ""}`}>
        {children}
      </div>
    ),
    darkSquareNotationStyle: { color: "#d9d4c4", fontSize: "11px", fontWeight: 700 },
    lightSquareNotationStyle: { color: "#315f50", fontSize: "11px", fontWeight: 700 },
  } as const;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">CC</div>
          <div>
            <div className="brand-name">Chess Coach <span className="version-badge">v0.4.1</span></div>
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
          <button className="ghost-button library-button" onClick={() => { setLibraryOpen(true); void refreshSavedGames(); }}>
            <Library size={16} /> Kho ván {savedGames.length > 0 && <span className="library-count">{savedGames.length}</span>}
          </button>
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
          <div className="eyebrow game-event">{headers.Event || "Ván cờ đã nhập"}</div>
          <div className="game-matchup">
            <div className="matchup-player white-player">
              <i className="side-badge white-side">Trắng</i>
              <span className="player-copy"><strong>{headers.White || "Trắng"}</strong><small>Elo {headers.WhiteElo || "—"}</small></span>
            </div>
            <div className="matchup-center">
              <span className="match-result">{headers.Result || "*"}</span>
              <div className="match-context">
                <span>{headers.ECO || "ECO —"}</span>
                <span>{headers.TimeControl ? `${headers.TimeControl}s` : "Không rõ thời gian"}</span>
              </div>
            </div>
            <div className="matchup-player black-player">
              <span className="player-copy"><strong>{headers.Black || "Đen"}</strong><small>Elo {headers.BlackElo || "—"}</small></span>
              <i className="side-badge black-side">Đen</i>
            </div>
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

            <div className="board-stage">
              <div
                className={`evaluation-bar orientation-${orientation}`}
                role="meter"
                aria-label={`Đánh giá vị trí: ${engine?.evaluation || "đang tính"}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(whiteEvaluationPercent)}
                title={`Trắng ${Math.round(whiteEvaluationPercent)}% · Đen ${Math.round(100 - whiteEvaluationPercent)}%`}
              >
                <div className="evaluation-bar-side black" style={{ height: `${100 - whiteEvaluationPercent}%` }} />
                <div className="evaluation-bar-side white" style={{ height: `${whiteEvaluationPercent}%` }} />
                <span className={`evaluation-bar-score ${evaluationLeader} ${evaluationScoreAtTop ? "top" : "bottom"}`}>
                  {engineLoading ? "…" : engine?.evaluation || "0.00"}
                </span>
              </div>
              <div className="board-wrap">
                <Chessboard options={chessboardOptions} />
                {boardMoveBadge && (
                  <div className="board-move-badge-square" style={boardMoveBadgePosition}>
                    <span
                      className={`board-move-badge ${boardMoveBadge}`}
                      aria-label={BOARD_MOVE_BADGES[boardMoveBadge].label}
                      title={BOARD_MOVE_BADGES[boardMoveBadge].label}
                    >
                      {boardMoveBadge === "best"
                        ? <Star aria-hidden="true" fill="currentColor" strokeWidth={2.2} />
                        : BOARD_MOVE_BADGES[boardMoveBadge].symbol}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="arrow-legend">
              <span><i className="legend-line gold" /> Nước vừa đi</span>
              <span><i className="legend-line green" /> Best move</span>
              <span><i className="legend-line blue" /> Phương án 2</span>
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
                <div className={`quality-badge ${quality}`}><span className="quality-icon">{quality === "best" ? "★" : quality === "good" ? "✓" : "!"}</span>{QUALITY_LABELS[quality]}</div>
                <div className={`turn-badge ${step.color === "w" ? "white-turn" : "black-turn"}`}>
                  {step.color === "w" ? "Trắng" : "Đen"} · {step.color === "w" ? headers.White || "Người chơi" : headers.Black || "Người chơi"}
                </div>
              </div>
              <div className="san-display">{step.moveNumber}{step.color === "w" ? "." : "…"} {step.san}</div>
              <h2>{engine ? (quality === "best" ? "Nước tốt nhất của Stockfish" : quality === "good" ? "Engine đồng ý với nước đi" : `Stockfish chọn ${engine.bestMoveSan}`) : step.title}</h2>
              <p>{engine ? `Nước này mất khoảng ${Math.round(engine.centipawnLoss)} centipawn. Đánh giá sau nước đi: ${engine.evaluation} theo phía Trắng.` : step.comment}</p>
            </div>

            {engine && (
              <div className="best-line-card">
                <div className="best-line-label">HAI PHƯƠNG ÁN TỐT NHẤT</div>
                <div className="variation-list">
                  {engine.variations.slice(0, 2).map((variation) => (
                    <div className="variation-row" key={`${variation.rank}-${variation.moveUci}`}>
                      <span className={`variation-rank rank-${variation.rank}`}>{variation.rank === 1 ? "BEST" : "#2"}</span>
                      <span className="variation-eval">{variation.evaluation}</span>
                      <span className="best-line-moves">{variation.lineSan.length ? variation.lineSan.join("  ") : variation.moveSan}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`insight-card ${aiExplanation ? "ai-ready" : ""}`}>
              <div className="insight-title">
                <BrainCircuit size={17} /> {aiExplanation ? `${providerLabel} · ${model}` : "Góc nhìn HLV"}
                {aiExplanation?.cached && <span className="saved-badge">Đã lưu</span>}
              </div>
              {aiExplanation ? <CoachExplanation text={aiExplanation.text} /> : <p>{step.insight}</p>}
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
            <div className="timeline-summary-actions">
              <button className={`summary-button ${fullAnalysis.complete ? "complete" : ""}`} onClick={() => void startFullGameAnalysis()} disabled={fullAnalysis.running} title={fullAnalysis.error || undefined}>
                {fullAnalysis.running ? <LoaderCircle className="spin" size={13} /> : <BarChart3 size={13} />}
                {fullAnalysis.running ? `Đang phân tích ${fullAnalysis.completed}/${fullAnalysis.total}` : fullAnalysis.complete ? "Xem tổng kết" : fullAnalysis.error ? "Thử lại phân tích" : "Phân tích toàn ván"}
              </button>
              <div className="timeline-key">
                <span><i className="dot best" /> Best</span>
                <span><i className="dot good" /> Tốt</span>
                <span><i className="dot inaccuracy" /> Thiếu CX</span>
                <span><i className="dot mistake" /> Sai</span>
                <span><i className="dot blunder" /> Blunder</span>
              </div>
            </div>
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

      {summaryOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSummaryOpen(false)}>
          <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="summary-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSummaryOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="summary-heading">
              <div className="modal-icon"><BarChart3 size={24} /></div>
              <div>
                <div className="eyebrow">STOCKFISH · DEPTH 11 · TOÀN VÁN</div>
                <h2 id="summary-title">Tổng kết ván đấu</h2>
                <p>{headers.Opening || headers.ECO || "Không rõ khai cuộc"} · {analysis.steps.length} lượt</p>
              </div>
            </div>

            <div className="summary-players">
              {([
                { side: "white", label: "Trắng", name: headers.White || "Trắng", elo: headers.WhiteElo, stats: fullGameSummary.white },
                { side: "black", label: "Đen", name: headers.Black || "Đen", elo: headers.BlackElo, stats: fullGameSummary.black },
              ] as const).map((player) => (
                <article className={`summary-player ${player.side}`} key={player.side}>
                  <div className="summary-player-name"><i className={`side-badge ${player.side === "white" ? "white-side" : "black-side"}`}>{player.label}</i><strong>{player.name}</strong><span>{player.elo ? `Elo ${player.elo}` : "Elo —"}</span></div>
                  <div className="summary-metrics">
                    <div><strong>{player.stats.acpl}</strong><span>ACPL</span></div>
                    <div><strong>{player.stats.bestGoodRate}%</strong><span>Best / Tốt</span></div>
                    <div><strong>{player.stats.moves}</strong><span>Nước đã tính</span></div>
                  </div>
                  <div className="quality-counts">
                    {QUALITY_ORDER.map((item) => <span className={item} key={item}><i className={`dot ${item}`} />{QUALITY_LABELS[item]} <strong>{player.stats.counts[item]}</strong></span>)}
                  </div>
                </article>
              ))}
            </div>

            <div className={`game-coach-card ${gameCoachSummary ? "ready" : ""}`}>
              <div className="game-coach-heading">
                <div><BrainCircuit size={17} /><strong>Nhận xét của HLV AI</strong></div>
                {gameCoachSummary && <span>{PROVIDER_LABELS[gameCoachSummary.provider]} · {gameCoachSummary.model}{gameCoachSummary.cached ? " · Đã lưu" : ""}</span>}
              </div>
              {gameCoachSummary ? (
                <>
                  <GameCoachSummaryView text={gameCoachSummary.text} />
                  <button className="refresh-ai-button" onClick={() => void summarizeGameWithAi(true)} disabled={gameCoachLoading}>
                    {gameCoachLoading ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Đánh giá lại toàn ván
                  </button>
                </>
              ) : (
                <div className="game-coach-empty">
                  <p>Dựa trên ACPL, tỷ lệ nước tốt và các vị trí then chốt để nêu điểm mạnh, điểm cần cải thiện của cả hai bên.</p>
                  <button className="summary-ai-button" onClick={() => void summarizeGameWithAi(false)} disabled={gameCoachLoading || !gameSummaryRequest}>
                    {gameCoachLoading ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                    {gameCoachLoading ? `${providerLabel} đang tổng kết…` : hasApiKey ? `HLV ${providerLabel} đánh giá ván đấu` : `Cấu hình ${providerLabel} để đánh giá`}
                  </button>
                </div>
              )}
              {gameCoachError && <div className="inline-error">{gameCoachError}</div>}
            </div>

            <div className="critical-section">
              <div className="critical-heading"><Target size={16} /><strong>Vị trí then chốt</strong><span>{fullGameSummary.critical.length} Mistake/Blunder</span></div>
              <div className="critical-list">
                {fullGameSummary.critical.length ? fullGameSummary.critical.map(({ item, index, engine: result }) => (
                  <button key={item.ply} onClick={() => { setCurrentIndex(index); setSummaryOpen(false); }}>
                    <span className={`critical-quality ${result?.quality}`}>{result ? QUALITY_LABELS[result.quality] : "—"}</span>
                    <strong>{item.moveNumber}{item.color === "w" ? "." : "…"} {item.san}</strong>
                    <span>{item.color === "w" ? headers.White || "Trắng" : headers.Black || "Đen"}</span>
                    <span className="critical-loss">−{Math.round(result?.centipawnLoss || 0)} cp</span>
                    <ChevronRight size={15} />
                  </button>
                )) : <div className="empty-critical">Không có Mistake hoặc Blunder trong ván này.</div>}
              </div>
            </div>
          </section>
        </div>
      )}

      {libraryOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setLibraryOpen(false)}>
          <section className="modal-card library-modal" role="dialog" aria-modal="true" aria-labelledby="library-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setLibraryOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="library-heading">
              <div className="modal-icon"><Library size={24} /></div>
              <div>
                <div className="eyebrow">LƯU CỤC BỘ · KHÔNG ĐỒNG BỘ CLOUD</div>
                <h2 id="library-title">Kho ván</h2>
                <p>{savedGames.length ? `${savedGames.length} ván đã nạp · mới mở gần đây trước` : "Các ván bạn nạp sẽ tự động xuất hiện tại đây."}</p>
              </div>
            </div>
            {libraryError && <div className="error-message">{libraryError}</div>}
            <div className="library-list">
              {libraryLoading && !savedGames.length ? (
                <div className="library-empty"><LoaderCircle className="spin" size={22} /> Đang đọc kho ván…</div>
              ) : savedGames.length ? savedGames.map((game) => (
                <article className="library-game" key={game.id}>
                  <button className="library-game-open" onClick={() => void openStoredGame(game.id)} disabled={libraryLoading}>
                    <div className="library-game-players">
                      <span className="library-player white"><i className="side-badge white-side">Trắng</i><strong>{game.white}</strong><small>{game.white_elo ? `Elo ${game.white_elo}` : "Elo —"}</small></span>
                      <span className="library-result">{game.result || "*"}</span>
                      <span className="library-player black"><strong>{game.black}</strong><small>{game.black_elo ? `Elo ${game.black_elo}` : "Elo —"}</small><i className="side-badge black-side">Đen</i></span>
                    </div>
                    <div className="library-game-meta">
                      <span>{game.event || "Ván cờ đã nhập"}</span>
                      {game.date && <span>{game.date}</span>}
                      {game.eco && <span>{game.eco}</span>}
                      {game.time_control && <span>{game.time_control}s</span>}
                      {game.source_url && <span>Chess.com</span>}
                      <span className="library-opened">Mở {formatSavedTimestamp(game.last_opened_at)}</span>
                    </div>
                  </button>
                  <button className="library-delete" onClick={() => void removeStoredGame(game)} disabled={libraryLoading} aria-label={`Xoá ván ${game.white} gặp ${game.black}`} title="Xoá khỏi Kho ván"><Trash2 size={16} /></button>
                </article>
              )) : (
                <div className="library-empty"><Library size={28} /><strong>Kho ván đang trống</strong><span>Nạp PGN hoặc link Chess.com để lưu ván đầu tiên.</span></div>
              )}
            </div>
            <div className="modal-actions library-actions">
              <span>PGN chỉ được lưu trong database trên máy này.</span>
              <button className="primary-button" onClick={() => { setLibraryOpen(false); setImportOpen(true); }}><Upload size={15} /> Nạp ván mới</button>
            </div>
          </section>
        </div>
      )}

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
            <select id="model" value={model} onChange={(event) => changeModel(event.target.value)}>
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
        <span>Chess Coach v0.4.1 · Stockfish 18 Lite · OpenAI + Gemini</span>
        <span><ShieldCheck size={13} /> PGN ở lại trên máy · Lời giải thích AI được lưu cục bộ</span>
      </footer>
    </div>
  );
}

export default App;
