import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Chessboard } from "react-chessboard";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardPaste,
  Clock,
  Cloud,
  CloudOff,
  Database,
  Download,
  Dumbbell,
  Cpu,
  Eye,
  Lightbulb,
  LogIn,
  LogOut,
  KeyRound,
  Library,
  Link2,
  LoaderCircle,
  RotateCcw,
  RefreshCw,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TriangleAlert,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { analyzePgn, type AnalysisStep, type GameAnalysis, type MoveQuality } from "./analysis";
import { DEMO_PGN } from "./demo";
import { analyzeGameWithStockfish, analyzeMoveWithStockfish, type EngineMoveAnalysis } from "./stockfish";
import { buildDashboardStats, type DashboardMoveRecord } from "./dashboard";
import { lastKnownOpening, openingTimeline, type OpeningInfo } from "./openings";
import appIcon from "../src-tauri/icons/128x128.png";
import { playSfx, setSfxEnabled as persistSfxEnabled, sfxEnabled as storedSfxEnabled } from "./sfx";
import {
  deleteCloudGame,
  deleteCloudProfile,
  downloadCloudSnapshot,
  firebaseConfigured,
  firebaseErrorMessage,
  observeFirebaseUser,
  signInWithGoogle,
  signOutFirebase,
  uploadCloudSnapshot,
  type CloudSyncSnapshot,
  type User as FirebaseUser,
} from "./firebase";

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
  played_at: string | null;
  eco: string | null;
  opening: string | null;
  time_control: string | null;
  time_class: string | null;
  source_url: string | null;
  source_platform: SyncPlatform | null;
  analysis_complete: boolean;
  created_at: string;
  last_opened_at: string;
};
type GameOutcome = {
  kind: "win" | "loss" | "draw" | "unknown";
  label: "Thắng" | "Thua" | "Hòa" | "Chưa rõ";
  side: "Trắng" | "Đen" | null;
};
type SavedGameDetail = { id: string; pgn: string };
type StoredEngineAnalysis = { ply: number; depth: number; result: EngineMoveAnalysis };
type SyncPlatform = "chesscom" | "lichess";
type PlayerProfile = {
  id: number;
  platform: SyncPlatform;
  username: string;
  game_count: number;
  last_sync_at: string | null;
  created_at: string;
};
type RetryState = {
  fen: string;
  attempts: number;
  hintLevel: number;
  loading: boolean;
  feedback: { quality: MoveQuality; moveSan: string; bestMoveSan: string; loss: number } | null;
};
type VariationState = {
  rank: number;
  title: string;
  moves: string[];
  positions: string[];
  moveSquares: Array<{ from: string; to: string }>;
  index: number;
};
type SyncNotice = { type: "success" | "info" | "error"; message: string };
type SyncProgress = { phase: "fetching" | "saving"; completed: number; total: number };
type CloudMergeResult = { profiles_added: number; games_added: number };

function gameOutcomeForProfile(game: SavedGameSummary, username?: string): GameOutcome {
  const normalizedUsername = username?.trim().toLocaleLowerCase();
  const isWhite = Boolean(normalizedUsername && game.white.trim().toLocaleLowerCase() === normalizedUsername);
  const isBlack = Boolean(normalizedUsername && game.black.trim().toLocaleLowerCase() === normalizedUsername);
  const side = isWhite ? "Trắng" : isBlack ? "Đen" : null;

  if (["1/2-1/2", "½-½", "0.5-0.5"].includes(game.result || "")) {
    return { kind: "draw", label: "Hòa", side };
  }
  if (game.result === "1-0") {
    if (isWhite) return { kind: "win", label: "Thắng", side };
    if (isBlack) return { kind: "loss", label: "Thua", side };
  }
  if (game.result === "0-1") {
    if (isBlack) return { kind: "win", label: "Thắng", side };
    if (isWhite) return { kind: "loss", label: "Thua", side };
  }
  return { kind: "unknown", label: "Chưa rõ", side };
}

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

function formatVietnamDate(value?: string | null, includeTime = Boolean(value?.includes(":"))) {
  if (!value) return "—";
  const dateOnly = value.trim().match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
  const normalized = value.trim().replace(" ", "T") + (hasTimezone ? "" : "Z");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}${includeTime ? ` ${parts.hour}:${parts.minute}` : ""}`;
}

function getPgnPlayedAt(headers: Record<string, string>) {
  const rawDate = headers.UTCDate || headers.EndDate || headers.Date;
  const dateMatch = rawDate?.match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/);
  if (!dateMatch) return null;
  const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const rawTime = headers.UTCTime || headers.EndTime || headers.StartTime;
  const timeMatch = rawTime?.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  return timeMatch ? `${date} ${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || "00"}` : date;
}

function openingFromHeaders(headers: Record<string, string>): OpeningInfo | null {
  const name = headers.Opening;
  if (!name) return null;
  const separator = name.indexOf(":");
  return {
    eco: headers.ECO || "ECO —",
    name,
    family: separator < 0 ? name : name.slice(0, separator),
    variation: separator < 0 ? null : name.slice(separator + 1).trim(),
  };
}

function formatSeconds(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)} giây`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function inferTimeClass(timeControl?: string) {
  const match = timeControl?.match(/^(\d+)(?:\+(\d+))?$/);
  if (!match) return null;
  const estimated = Number(match[1]) + Number(match[2] || 0) * 40;
  if (estimated < 180) return "bullet";
  if (estimated < 600) return "blitz";
  if (estimated < 1800) return "rapid";
  return "classical";
}

function inferSourcePlatform(value?: string | null): SyncPlatform | null {
  if (!value) return null;
  if (/lichess\.org/i.test(value)) return "lichess";
  if (/chess\.com/i.test(value)) return "chesscom";
  return null;
}

function buildVariation(fen: string, lineSan: string[], rank: number, title: string): VariationState | null {
  const chess = new Chess(fen);
  const positions = [chess.fen()];
  const moves: string[] = [];
  const moveSquares: Array<{ from: string; to: string }> = [];
  for (const san of lineSan) {
    try {
      const move = chess.move(san);
      if (!move) break;
      moves.push(move.san);
      moveSquares.push({ from: move.from, to: move.to });
      positions.push(chess.fen());
    } catch {
      break;
    }
  }
  return moves.length ? { rank, title, moves, positions, moveSquares, index: 0 } : null;
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
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(storedSfxEnabled);
  const [accountOpen, setAccountOpen] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(() =>
    localStorage.getItem("kypho-cloud-last-sync"),
  );
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedGames, setSavedGames] = useState<SavedGameSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [dashboardRecords, setDashboardRecords] = useState<DashboardMoveRecord[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState("");
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [newProfilePlatform, setNewProfilePlatform] = useState<SyncPlatform>("chesscom");
  const [newProfileUsername, setNewProfileUsername] = useState("");
  const [importMode, setImportMode] = useState<"single" | "sync">("single");
  const [syncTimeClass, setSyncTimeClass] = useState("all");
  const [syncStatus, setSyncStatus] = useState("");
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [engineCache, setEngineCache] = useState<Record<number, EngineMoveAnalysis>>({});
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);
  const [variationState, setVariationState] = useState<VariationState | null>(null);
  const [variationPlaying, setVariationPlaying] = useState(false);
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
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null);
  const coachScrollerRef = useRef<HTMLDivElement | null>(null);
  const cloudSyncInFlightRef = useRef(false);
  const cloudSyncedUserRef = useRef<string | null>(null);
  const previousMoveIndexRef = useRef<number | null>(null);
  const modalWasOpenRef = useRef(false);
  const analysisWasCompleteRef = useRef(false);

  const step = analysis.steps[currentIndex];
  const engine = engineCache[step.ply];
  const aiCacheKey = `${provider}:${model}:${step.fenAfter}`;
  const aiExplanation = aiCache[aiCacheKey];
  const quality = engine?.quality || step.quality;
  const headers = analysis.headers;
  const openingsByPly = useMemo(() => openingTimeline(analysis.steps), [analysis.steps]);
  const currentOpening = openingsByPly[currentIndex] || openingFromHeaders(headers);
  const gameOpening = openingsByPly[openingsByPly.length - 1] || openingFromHeaders(headers);
  const totalMoves = Math.ceil(analysis.steps.length / 2);
  const hasApiKey = hasApiKeys[provider];
  const providerLabel = PROVIDER_LABELS[provider];
  const models = provider === "gemini" ? GEMINI_MODELS : OPENAI_MODELS;
  const whiteEvaluationPercent = evaluationToWhitePercent(engine?.whiteScoreCp);
  const evaluationLeader = (engine?.whiteScoreCp || 0) >= 0 ? "white" : "black";
  const evaluationScoreAtTop = evaluationLeader !== orientation;
  const boardMoveBadge = getBoardMoveBadge(step, engine);
  const boardMoveBadgePosition = getBoardBadgePosition(step.to, orientation);
  const dashboardStats = useMemo(() => buildDashboardStats(dashboardRecords), [dashboardRecords]);
  const boardPosition = retryState?.fen || (variationState ? variationState.positions[variationState.index] : step.fenAfter);
  const boardInteractionMode = retryState ? "retry" : variationState ? "variation" : "main";
  const variationMoveSquares = variationState && variationState.index > 0
    ? variationState.moveSquares[variationState.index - 1]
    : null;
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || null;
  const activeProfileLabel = activeProfile
    ? `${activeProfile.platform === "chesscom" ? "Chess.com" : "Lichess"} · ${activeProfile.username}`
    : "Chưa chọn hồ sơ";
  const accountInitial = (firebaseUser?.displayName || firebaseUser?.email || "G").trim().charAt(0).toUpperCase();
  const cloudAccountLabel = firebaseUser
    ? firebaseUser.displayName || firebaseUser.email || "Google"
    : firebaseConfigured ? "Đăng nhập" : "Cloud chưa cấu hình";

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

  const refreshProfiles = useCallback(async (preferredId?: number) => {
    if (!isTauri()) return;
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const nextProfiles = await invoke<PlayerProfile[]>("list_player_profiles");
      setProfiles(nextProfiles);
      setActiveProfileId((current) => {
        const savedId = Number(localStorage.getItem("kypho-active-profile-id"));
        const candidate = preferredId || current || savedId;
        const nextId = nextProfiles.some((profile) => profile.id === candidate)
          ? candidate
          : nextProfiles[0]?.id || null;
        if (nextId) localStorage.setItem("kypho-active-profile-id", String(nextId));
        return nextId;
      });
    } catch (reason) {
      setProfilesError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  const refreshSavedGames = useCallback(async () => {
    if (!isTauri()) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      setSavedGames(await invoke<SavedGameSummary[]>("list_saved_games", { profileId: activeProfileId }));
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  }, [activeProfileId]);

  const syncCloud = useCallback(async (
    targetUser: FirebaseUser | null = firebaseUser,
    showSuccess = true,
  ) => {
    if (!targetUser || cloudSyncInFlightRef.current) return;
    if (!isTauri()) {
      setSyncNotice({ type: "error", message: "Đồng bộ cloud cần chạy trong ứng dụng desktop." });
      return;
    }
    cloudSyncInFlightRef.current = true;
    setCloudSyncing(true);
    try {
      const remoteSnapshot = await downloadCloudSnapshot(targetUser.uid);
      const merged = await invoke<CloudMergeResult>("merge_cloud_snapshot", {
        request: remoteSnapshot,
      });
      const localSnapshot = await invoke<CloudSyncSnapshot>("export_cloud_snapshot");
      await uploadCloudSnapshot(targetUser.uid, localSnapshot);
      const completedAt = new Date().toISOString();
      localStorage.setItem("kypho-cloud-last-sync", completedAt);
      setLastCloudSyncAt(completedAt);
      await Promise.all([refreshProfiles(), refreshSavedGames()]);
      if (showSuccess) {
        const imported = merged.profiles_added + merged.games_added;
        setSyncNotice({
          type: "success",
          message: imported
            ? `Đã nhập ${merged.profiles_added} hồ sơ và ${merged.games_added} ván từ cloud; dữ liệu trên máy cũng đã được tải lên.`
            : `Đã sao lưu ${localSnapshot.profiles.length} hồ sơ và ${localSnapshot.games.length} ván lên Firebase.`,
        });
      }
    } catch (reason) {
      setSyncNotice({ type: "error", message: firebaseErrorMessage(reason) });
    } finally {
      cloudSyncInFlightRef.current = false;
      setCloudSyncing(false);
    }
  }, [firebaseUser, refreshProfiles, refreshSavedGames]);

  const handleGoogleLogin = async () => {
    if (authLoading || cloudSyncing) return;
    setAuthLoading(true);
    setSyncNotice(null);
    try {
      const user = await signInWithGoogle();
      cloudSyncedUserRef.current = user.uid;
      setFirebaseUser(user);
      setAccountOpen(true);
      await syncCloud(user, true);
    } catch (reason) {
      setSyncNotice({ type: "error", message: firebaseErrorMessage(reason) });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    if (cloudSyncing) return;
    try {
      await signOutFirebase();
      cloudSyncedUserRef.current = null;
      setFirebaseUser(null);
      setSyncNotice({ type: "info", message: "Đã đăng xuất. Dữ liệu SQLite vẫn được giữ nguyên trên máy này." });
    } catch (reason) {
      setSyncNotice({ type: "error", message: firebaseErrorMessage(reason) });
    }
  };

  const toggleSfx = () => {
    const next = !sfxEnabled;
    if (!next) playSfx("tap");
    persistSfxEnabled(next);
    setSfxEnabled(next);
    if (next) playSfx("success");
  };

  const persistEngineResult = useCallback(async (
    gameId: string,
    item: AnalysisStep,
    result: EngineMoveAnalysis,
  ) => {
    if (!isTauri()) return;
    await invoke("save_engine_analysis", {
      request: {
        game_id: gameId,
        ply: item.ply,
        depth: result.depth,
        result,
        color: item.color,
        phase: item.phase,
        quality: result.quality,
        centipawn_loss: result.centipawnLoss,
        think_time_seconds: item.thinkTimeSeconds,
        is_quick: item.isQuickMove,
        is_time_pressure: item.isTimePressure,
        tags: item.tags,
      },
    });
  }, []);

  const hydrateEngineCache = useCallback(async (gameId: string, next: GameAnalysis) => {
    if (!isTauri()) return;
    try {
      const stored = await invoke<StoredEngineAnalysis[]>("list_engine_analyses", { gameId });
      const cache = stored.reduce<Record<number, EngineMoveAnalysis>>((values, item) => {
        if (item.result && item.result.depth >= item.depth) values[item.ply] = item.result;
        return values;
      }, {});
      setEngineCache(cache);
      const complete = next.steps.length > 0 && next.steps.every((item) => Boolean(cache[item.ply]));
      if (complete) void invoke("mark_game_analysis_complete", { gameId }).catch(() => undefined);
      setFullAnalysis({
        running: false,
        complete,
        completed: Object.keys(cache).length,
        total: next.steps.length,
        error: "",
      });
    } catch (reason) {
      setEngineError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const openDashboard = useCallback(async () => {
    setDashboardOpen(true);
    setDashboardLoading(true);
    setDashboardError("");
    try {
      if (!isTauri()) throw new Error("Dashboard cần mở trong ứng dụng desktop.");
      if (!activeProfileId) throw new Error("Hãy chọn một hồ sơ người chơi.");
      setDashboardRecords(await invoke<DashboardMoveRecord[]>("get_dashboard_records", { profileId: activeProfileId }));
    } catch (reason) {
      setDashboardError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDashboardLoading(false);
    }
  }, [activeProfileId]);

  const changeActiveProfile = (profileId: number) => {
    setActiveProfileId(profileId);
    localStorage.setItem("kypho-active-profile-id", String(profileId));
    setDashboardRecords([]);
    setDashboardError("");
    setSyncStatus("");
  };

  const addPlayerProfile = async () => {
    if (!isTauri() || profilesLoading) return;
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const created = await invoke<PlayerProfile>("add_player_profile", {
        platform: newProfilePlatform,
        username: newProfileUsername.trim(),
      });
      setNewProfileUsername("");
      await refreshProfiles(created.id);
      if (firebaseUser) void syncCloud(firebaseUser, false);
    } catch (reason) {
      setProfilesError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setProfilesLoading(false);
    }
  };

  const removePlayerProfile = async (profile: PlayerProfile) => {
    if (!isTauri() || profilesLoading) return;
    const platform = profile.platform === "chesscom" ? "Chess.com" : "Lichess";
    if (!window.confirm(`Xoá hồ sơ ${platform} · ${profile.username}? Các ván đã tải vẫn được giữ${firebaseUser ? ", nhưng hồ sơ sẽ bị xoá khỏi các thiết bị đã đồng bộ" : " trên máy"}.`)) return;
    setProfilesLoading(true);
    setProfilesError("");
    try {
      if (firebaseUser) await deleteCloudProfile(firebaseUser.uid, profile);
      await invoke("delete_player_profile", { profileId: profile.id });
      await refreshProfiles();
    } catch (reason) {
      setProfilesError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setProfilesLoading(false);
    }
  };

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

    const timed = analysis.steps.filter((item) => item.thinkTimeSeconds !== null);
    const timedErrors = timed.filter((item) => {
      const result = engineCache[item.ply];
      return result?.quality === "mistake" || result?.quality === "blunder";
    });

    return {
      white: buildPlayerSummary("w"),
      black: buildPlayerSummary("b"),
      critical,
      time: {
        available: timed.length > 0,
        average: timed.length
          ? Math.round(timed.reduce((sum, item) => sum + (item.thinkTimeSeconds || 0), 0) / timed.length)
          : 0,
        quickErrors: timedErrors.filter((item) => item.isQuickMove).length,
        pressureErrors: timedErrors.filter((item) => item.isTimePressure).length,
      },
    };
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
      opening: gameOpening ? `${gameOpening.eco} · ${gameOpening.name}` : headers.ECO || "Không rõ khai cuộc",
      result: headers.Result || "*",
      total_plies: analysis.steps.length,
      white: playerData("white", fullGameSummary.white),
      black: playerData("black", fullGameSummary.black),
      critical_positions: criticalPositions,
    };
  }, [analysis.steps.length, fullAnalysis.complete, fullGameSummary, gameOpening, headers]);

  useEffect(() => observeFirebaseUser((user) => {
    setFirebaseUser(user);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    if (!firebaseUser || cloudSyncedUserRef.current === firebaseUser.uid) return;
    cloudSyncedUserRef.current = firebaseUser.uid;
    void syncCloud(firebaseUser, false);
  }, [firebaseUser, syncCloud]);

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
    if (!syncNotice) return;
    if (syncNotice.type === "success") playSfx("success");
    if (syncNotice.type === "error") playSfx("error");
    const timeout = window.setTimeout(() => setSyncNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [syncNotice]);

  useEffect(() => {
    if (previousMoveIndexRef.current !== null && previousMoveIndexRef.current !== currentIndex) {
      playSfx("move");
    }
    previousMoveIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    const modalOpen = importOpen
      || libraryOpen
      || dashboardOpen
      || profilesOpen
      || settingsOpen
      || accountOpen
      || summaryOpen;
    if (modalOpen && !modalWasOpenRef.current) playSfx("open");
    modalWasOpenRef.current = modalOpen;
  }, [accountOpen, dashboardOpen, importOpen, libraryOpen, profilesOpen, settingsOpen, summaryOpen]);

  useEffect(() => {
    if (fullAnalysis.complete && !analysisWasCompleteRef.current) playSfx("success");
    analysisWasCompleteRef.current = fullAnalysis.complete;
  }, [fullAnalysis.complete]);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    if (activeProfileId) void refreshSavedGames();
  }, [activeProfileId, refreshSavedGames]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("textarea, input, select")) return;
      if (variationState) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setVariationPlaying(false);
          setVariationState((value) => value ? {
            ...value,
            index: event.key === "ArrowLeft"
              ? Math.max(0, value.index - 1)
              : Math.min(value.positions.length - 1, value.index + 1),
          } : value);
        }
        return;
      }
      if (retryState) return;
      if (event.key === "ArrowLeft") setCurrentIndex((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") {
        setCurrentIndex((value) => Math.min(analysis.steps.length - 1, value + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analysis.steps.length, retryState, variationState]);

  useEffect(() => {
    const scroller = timelineScrollerRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-step-index="${currentIndex}"]`);
    if (!scroller || !target) return;
    const centeredLeft = target.offsetLeft - scroller.clientWidth / 2 + target.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, centeredLeft), behavior: "smooth" });
  }, [currentIndex]);

  useLayoutEffect(() => {
    if (coachScrollerRef.current) coachScrollerRef.current.scrollTop = 0;
  }, [step.ply]);

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
      .then((result) => {
        setEngineCache((cache) => {
          if ((cache[step.ply]?.depth || 0) >= result.depth) return cache;
          return { ...cache, [step.ply]: result };
        });
        if (currentGameId) {
          void persistEngineResult(currentGameId, step, result).catch(() => undefined);
        }
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setEngineError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEngineLoading(false);
      });

    return () => controller.abort();
  }, [currentGameId, engine?.depth, persistEngineResult, step]);

  useEffect(() => () => fullAnalysisAbortRef.current?.abort(), []);

  useEffect(() => {
    setAiError("");
    setRetryState(null);
    setPromotionPending(null);
    setVariationState(null);
    setVariationPlaying(false);
  }, [step.ply]);

  useEffect(() => {
    if (!variationPlaying || !variationState) return;
    if (variationState.index >= variationState.positions.length - 1) {
      setVariationPlaying(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setVariationState((value) => value
        ? { ...value, index: Math.min(value.positions.length - 1, value.index + 1) }
        : value);
    }, 850);
    return () => window.clearTimeout(timeout);
  }, [variationPlaying, variationState]);

  const loadAnalysis = (pgn: string, gameId: string | null = null) => {
    const next = analyzePgn(pgn);
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = null;
    setAnalysis(next);
    setCurrentGameId(gameId);
    setCurrentIndex(0);
    setEngineCache({});
    setAiCache({});
    setGameCoachSummary(null);
    setGameCoachError("");
    setGameCoachLoading(false);
    setRetryState(null);
    setPromotionPending(null);
    setVariationState(null);
    setVariationPlaying(false);
    setSummaryOpen(false);
    setLibraryOpen(false);
    setFullAnalysis({ running: false, complete: false, completed: 0, total: next.steps.length, error: "" });
    cacheLookupsRef.current.clear();
    cacheMissesRef.current.clear();
    autoAttemptsRef.current.clear();
    setImportOpen(false);
    setInput("");
    setError("");
    if (gameId) void hydrateEngineCache(gameId, next);
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
      const importedAnalysis = analyzePgn(pgn);
      const inferredOpening = lastKnownOpening(importedAnalysis.steps);
      if (isTauri()) {
        try {
          const gameId = await invoke<string>("save_game", {
            request: {
              pgn: importedAnalysis.rawPgn,
              white: importedAnalysis.headers.White || "Trắng",
              black: importedAnalysis.headers.Black || "Đen",
              white_elo: importedAnalysis.headers.WhiteElo || null,
              black_elo: importedAnalysis.headers.BlackElo || null,
              result: importedAnalysis.headers.Result || null,
              event: importedAnalysis.headers.Event || null,
              date: importedAnalysis.headers.UTCDate || importedAnalysis.headers.Date || null,
              played_at: getPgnPlayedAt(importedAnalysis.headers),
              eco: inferredOpening?.eco || importedAnalysis.headers.ECO || null,
              opening: inferredOpening?.name || importedAnalysis.headers.Opening || null,
              time_control: importedAnalysis.headers.TimeControl || null,
              time_class: inferTimeClass(importedAnalysis.headers.TimeControl) || null,
              source_url: sourceUrl,
              source_platform: inferSourcePlatform(sourceUrl || importedAnalysis.headers.Link || importedAnalysis.headers.Site),
            },
          });
          loadAnalysis(pgn, gameId);
          await refreshSavedGames();
          if (firebaseUser) void syncCloud(firebaseUser, false);
        } catch (reason) {
          setLibraryError(reason instanceof Error ? reason.message : String(reason));
          loadAnalysis(pgn);
        }
      } else {
        loadAnalysis(pgn);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const syncRecentGames = async () => {
    if (!isTauri() || loading) return;
    setError("");
    setSyncStatus("");
    setSyncNotice(null);
    setSyncProgress({ phase: "fetching", completed: 0, total: 20 });
    setLoading(true);
    try {
      if (!activeProfile) throw new Error("Hãy chọn một hồ sơ người chơi.");
      const username = activeProfile.username;
      const pgns = await invoke<string[]>("fetch_recent_games", {
        request: {
          platform: activeProfile.platform,
          username,
          limit: 20,
          time_class: syncTimeClass === "all" ? null : syncTimeClass,
        },
      });
      if (!pgns.length) throw new Error("Không tìm thấy ván phù hợp với bộ lọc.");
      setSyncProgress({ phase: "saving", completed: 0, total: pgns.length });

      const knownIds = new Set(savedGames.map((game) => game.id));
      let imported = 0;
      let skipped = 0;
      for (const [index, pgn] of pgns.entries()) {
        try {
          const parsed = analyzePgn(pgn);
          const inferredOpening = lastKnownOpening(parsed.steps);
          const sourceUrl = parsed.headers.Link || parsed.headers.Site || null;
          const id = await invoke<string>("save_game", {
            request: {
              pgn: parsed.rawPgn,
              white: parsed.headers.White || "Trắng",
              black: parsed.headers.Black || "Đen",
              white_elo: parsed.headers.WhiteElo || null,
              black_elo: parsed.headers.BlackElo || null,
              result: parsed.headers.Result || null,
              event: parsed.headers.Event || null,
              date: parsed.headers.UTCDate || parsed.headers.Date || null,
              played_at: getPgnPlayedAt(parsed.headers),
              eco: inferredOpening?.eco || parsed.headers.ECO || null,
              opening: inferredOpening?.name || parsed.headers.Opening || null,
              time_control: parsed.headers.TimeControl || null,
              time_class: syncTimeClass === "all"
                ? inferTimeClass(parsed.headers.TimeControl)
                : syncTimeClass,
              source_url: sourceUrl,
              source_platform: activeProfile.platform,
            },
          });
          if (knownIds.has(id)) skipped += 1;
          else {
            knownIds.add(id);
            imported += 1;
          }
        } catch {
          skipped += 1;
        } finally {
          setSyncProgress({ phase: "saving", completed: index + 1, total: pgns.length });
        }
      }
      await invoke("mark_profile_synced", { profileId: activeProfile.id });
      await refreshProfiles(activeProfile.id);
      await refreshSavedGames();
      if (firebaseUser) void syncCloud(firebaseUser, false);
      const message = imported > 0
        ? `Đồng bộ hoàn tất: đã thêm ${imported} ván mới${skipped ? `, bỏ qua ${skipped} ván đã có hoặc không hợp lệ` : ""}.`
        : `Đồng bộ hoàn tất: không có ván mới${skipped ? `; ${skipped} ván đã có hoặc không hợp lệ` : ""}.`;
      setSyncStatus(message);
      setSyncNotice({ type: imported > 0 ? "success" : "info", message });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setSyncNotice({ type: "error", message: `Đồng bộ thất bại: ${message}` });
    } finally {
      setSyncProgress(null);
      setLoading(false);
    }
  };

  const openStoredGame = async (id: string) => {
    if (!isTauri() || libraryLoading) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const saved = await invoke<SavedGameDetail>("open_saved_game", { id });
      loadAnalysis(saved.pgn, saved.id);
      await refreshSavedGames();
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  };

  const removeStoredGame = async (game: SavedGameSummary) => {
    if (!isTauri() || libraryLoading) return;
    if (!window.confirm(`Xoá ván ${game.white} — ${game.black} khỏi Kho ván${firebaseUser ? " trên mọi thiết bị đã đồng bộ" : ""}?`)) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      if (firebaseUser) await deleteCloudGame(firebaseUser.uid, game.id);
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
    const persistenceTasks: Promise<void>[] = [];

    try {
      await analyzeGameWithStockfish(
        analysis.steps,
        (ply, result, completed, total) => {
          setEngineCache((cache) => {
            if ((cache[ply]?.depth || 0) >= result.depth) return cache;
            return { ...cache, [ply]: result };
          });
          const analyzedStep = analysis.steps[ply - 1];
          if (currentGameId && analyzedStep) {
            persistenceTasks.push(persistEngineResult(currentGameId, analyzedStep, result));
          }
          setFullAnalysis({ running: true, complete: false, completed, total, error: "" });
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        if (persistenceTasks.length) await Promise.allSettled(persistenceTasks);
        if (currentGameId && isTauri()) {
          await invoke("mark_game_analysis_complete", { gameId: currentGameId });
          void refreshSavedGames();
        }
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

  const beginRetry = () => {
    if (!engine) return;
    setVariationState(null);
    setVariationPlaying(false);
    setOrientation(step.color === "w" ? "white" : "black");
    setRetryState({
      fen: step.fenBefore,
      attempts: 0,
      hintLevel: 0,
      loading: false,
      feedback: null,
    });
  };

  const evaluateRetryMove = (from: string, to: string, promotion?: string) => {
    if (!retryState || retryState.loading || retryState.feedback) return false;
    const chess = new Chess(step.fenBefore);
    try {
      const move = chess.move({ from, to, promotion: promotion || undefined });
      if (!move) return false;
      const nextFen = chess.fen();
      setPromotionPending(null);
      setRetryState((value) => value ? {
        ...value,
        fen: nextFen,
        attempts: value.attempts + 1,
        loading: true,
        feedback: null,
      } : value);
      analyzeMoveWithStockfish(step.fenBefore, nextFen, move.lan)
        .then((result) => setRetryState((value) => value ? {
          ...value,
          loading: false,
          feedback: {
            quality: result.quality,
            moveSan: move.san,
            bestMoveSan: result.bestMoveSan,
            loss: Math.round(result.centipawnLoss),
          },
        } : value))
        .catch((reason) => {
          setEngineError(reason instanceof Error ? reason.message : String(reason));
          setRetryState((value) => value ? { ...value, fen: step.fenBefore, loading: false } : value);
        });
      return true;
    } catch {
      return false;
    }
  };

  const handleRetryDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare || !retryState || retryState.loading || retryState.feedback) return false;
    const chess = new Chess(step.fenBefore);
    const piece = chess.get(sourceSquare as Square);
    const promotes = piece?.type === "p" && (targetSquare.endsWith("8") || targetSquare.endsWith("1"));
    if (promotes) {
      setPromotionPending({ from: sourceSquare, to: targetSquare });
      return false;
    }
    return evaluateRetryMove(sourceSquare, targetSquare);
  };

  const openVariation = (rank: number, lineSan: string[]) => {
    const next = buildVariation(step.fenBefore, lineSan, rank, rank === 1 ? "Phương án tốt nhất" : "Phương án số 2");
    if (!next) return;
    setRetryState(null);
    setVariationPlaying(false);
    setVariationState(next);
  };

  const retryBestPiece = useMemo(() => {
    if (!engine?.bestMoveUci) return "quân phù hợp";
    const chess = new Chess(step.fenBefore);
    const piece = chess.get(engine.bestMoveUci.slice(0, 2) as Square);
    return piece ? ({ p: "tốt", n: "mã", b: "tượng", r: "xe", q: "hậu", k: "vua" } as const)[piece.type] : "quân phù hợp";
  }, [engine?.bestMoveUci, step.fenBefore]);

  const chessboardOptions = {
    id: "analysis-board",
    position: boardPosition,
    boardOrientation: orientation,
    allowDragging: Boolean(retryState && !retryState.loading && !retryState.feedback),
    onPieceDrop: handleRetryDrop,
    allowDrawingArrows: false,
    showAnimations: true,
    animationDurationInMs: 220,
    arrows: boardInteractionMode === "main" ? arrows : [],
    boardStyle: {
      borderRadius: "10px",
      boxShadow: "0 30px 80px rgba(0, 0, 0, 0.42)",
      overflow: "hidden",
    },
    darkSquareStyle: { backgroundColor: "#315f50" },
    lightSquareStyle: { backgroundColor: "#d9d4c4" },
    squareRenderer: ({ square, children }: { square: string; children?: React.ReactNode }) => (
      <div className={`analysis-square-content${boardInteractionMode === "main" && square === step.from ? " last-move-from" : ""}${boardInteractionMode === "main" && square === step.to ? " last-move-to" : ""}${boardInteractionMode === "variation" && square === variationMoveSquares?.from ? " variation-move-from" : ""}${boardInteractionMode === "variation" && square === variationMoveSquares?.to ? " variation-move-to" : ""}`}>
        {children}
      </div>
    ),
    darkSquareNotationStyle: { color: "#d9d4c4", fontSize: "11px", fontWeight: 700 },
    lightSquareNotationStyle: { color: "#315f50", fontSize: "11px", fontWeight: 700 },
    alphaNotationStyle: { zIndex: 50, right: "3px", bottom: "2px", fontSize: "11px", fontWeight: 900, lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,.95), 0 0 2px rgba(255,255,255,.38)", pointerEvents: "none" },
    numericNotationStyle: { zIndex: 50, top: "3px", left: "3px", fontSize: "11px", fontWeight: 900, lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,.95), 0 0 2px rgba(255,255,255,.38)", pointerEvents: "none" },
  } as const;

  return (
    <div className="app-shell">
      {syncNotice && (
        <div className={`sync-toast ${syncNotice.type}`} role={syncNotice.type === "error" ? "alert" : "status"} aria-live="polite">
          {syncNotice.type === "error" ? <TriangleAlert size={19} /> : <CheckCircle2 size={19} />}
          <div><strong>{syncNotice.type === "error" ? "Không thể đồng bộ" : syncNotice.type === "success" ? "Đồng bộ thành công" : "Đồng bộ hoàn tất"}</strong><span>{syncNotice.message}</span></div>
          <button onClick={() => setSyncNotice(null)} aria-label="Đóng thông báo"><X size={16} /></button>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><img src={appIcon} alt="" aria-hidden="true" /></div>
          <div>
            <div className="brand-name">Chess Coach <span className="version-badge">v0.5.0</span></div>
            <div className="brand-subtitle">HLV CỜ VUA · STOCKFISH + AI</div>
          </div>
        </div>

        <div className="top-actions">
          <div className="profile-switcher">
            <UserRound size={15} />
            <select
              aria-label="Hồ sơ đang dùng"
              value={activeProfileId || ""}
              onChange={(event) => changeActiveProfile(Number(event.target.value))}
              disabled={profilesLoading || !profiles.length}
            >
              {!profiles.length && <option value="">Đang tải hồ sơ…</option>}
              {profiles.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.platform === "chesscom" ? "Chess.com" : "Lichess"} · {profile.username}
                </option>
              ))}
            </select>
            <button onClick={() => setProfilesOpen(true)} aria-label="Quản lý hồ sơ" title="Quản lý hồ sơ"><UserPlus size={15} /></button>
          </div>
          <button
            className={`cloud-account-button ${firebaseUser ? "signed-in" : ""}`}
            onClick={() => setAccountOpen(true)}
            aria-label={firebaseUser ? `Tài khoản cloud ${cloudAccountLabel}` : "Đăng nhập Google để đồng bộ"}
            title={firebaseUser ? `Đã đăng nhập: ${cloudAccountLabel}` : "Đăng nhập Google để đồng bộ"}
          >
            {authLoading || cloudSyncing
              ? <LoaderCircle className="spin" size={15} />
              : firebaseUser ? <span className="cloud-avatar">{accountInitial}</span> : <CloudOff size={15} />}
            <span>{cloudSyncing ? "Đang đồng bộ" : cloudAccountLabel}</span>
          </button>
          <div className={`service-pill ${engine ? "online" : "working"}`}>
            <Cpu size={14} /> {engine ? `Stockfish d${engine.depth}` : "Stockfish đang tính"}
          </div>
          <div className={`service-pill ${hasApiKey ? "online" : ""}`}>
            <Bot size={14} /> {hasApiKey ? `${providerLabel} sẵn sàng` : `${providerLabel}: chưa có key`}
          </div>
          <button className="ghost-button dashboard-button" onClick={() => void openDashboard()}>
            <BarChart3 size={16} /> Tiến bộ
          </button>
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
                <span className="match-opening" title={currentOpening?.name}>{currentOpening ? `${currentOpening.eco} · ${currentOpening.name}` : headers.ECO || "ECO —"}</span>
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
              <div className="board-status"><span className="phase-dot" /><strong>{step.phase}</strong><span>Nước {step.moveNumber}{step.color === "b" ? "…" : "."}</span>{currentOpening && <span className="opening-live" title={`${currentOpening.eco} · ${currentOpening.name}`}><BookOpen size={12} /><b>{currentOpening.family}</b>{currentOpening.variation && <em>: {currentOpening.variation}</em>}</span>}</div>
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
                {boardInteractionMode !== "main" && (
                  <div className={`board-mode-badge ${boardInteractionMode}`}>
                    {boardInteractionMode === "retry" ? <><Dumbbell size={13} /> Chế độ thử lại</> : <><Eye size={13} /> {variationState?.title}</>}
                  </div>
                )}
                <Chessboard options={chessboardOptions} />
                {boardInteractionMode === "main" && boardMoveBadge && (
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
                {promotionPending && (
                  <div className="promotion-picker">
                    <span>Phong cấp thành</span>
                    <div>{(["q", "r", "b", "n"] as const).map((piece) => (
                      <button key={piece} onClick={() => evaluateRetryMove(promotionPending.from, promotionPending.to, piece)}>
                        {{ q: "Hậu", r: "Xe", b: "Tượng", n: "Mã" }[piece]}
                      </button>
                    ))}</div>
                    <button className="promotion-cancel" onClick={() => setPromotionPending(null)}>Huỷ</button>
                  </div>
                )}
              </div>
            </div>

            {variationState && (
              <div className="variation-player">
                <button onClick={() => setVariationState((value) => value ? { ...value, index: Math.max(0, value.index - 1) } : value)} disabled={variationState.index === 0}><ChevronLeft size={15} /></button>
                <button onClick={() => setVariationPlaying((value) => !value)}>{variationPlaying ? <RotateCcw size={14} /> : <Play size={14} />}{variationPlaying ? "Dừng" : "Tự chạy"}</button>
                <span>{variationState.index === 0 ? "Vị trí ban đầu" : `${variationState.index}. ${variationState.moves[variationState.index - 1]}`}</span>
                <button onClick={() => setVariationState((value) => value ? { ...value, index: Math.min(value.positions.length - 1, value.index + 1) } : value)} disabled={variationState.index === variationState.positions.length - 1}><ChevronRight size={15} /></button>
                <button className="variation-exit" onClick={() => { setVariationState(null); setVariationPlaying(false); }}>Quay lại ván chính</button>
              </div>
            )}

            {retryState && (
              <div className={`retry-panel ${retryState.feedback?.quality || ""}`}>
                <div className="retry-heading"><Dumbbell size={15} /><strong>Tìm nước tốt hơn</strong><span>Lần thử {retryState.attempts}</span></div>
                {retryState.loading && <p><LoaderCircle className="spin" size={14} /> Stockfish đang chấm nước của bạn…</p>}
                {!retryState.loading && retryState.feedback && (
                  <div className="retry-feedback">
                    <strong>{QUALITY_LABELS[retryState.feedback.quality]} · {retryState.feedback.moveSan}</strong>
                    <span>{retryState.feedback.quality === "best" ? "Bạn đã tìm được nước tốt nhất." : `Mất ${retryState.feedback.loss} cp · Stockfish chọn ${retryState.feedback.bestMoveSan}.`}</span>
                  </div>
                )}
                {!retryState.loading && !retryState.feedback && <p>Kéo quân trên bàn cờ để thử nước của bạn.</p>}
                {retryState.hintLevel > 0 && (
                  <div className="retry-hint"><Lightbulb size={13} />{
                    retryState.hintLevel === 1
                      ? `Tập trung vào ý tưởng: ${step.tags[0] || step.phase}.`
                      : retryState.hintLevel === 2
                        ? `Hãy cân nhắc di chuyển ${retryBestPiece}.`
                        : `Nước tốt nhất là ${engine?.bestMoveSan || "—"}.`
                  }</div>
                )}
                <div className="retry-actions">
                  {retryState.feedback && retryState.feedback.quality !== "best" && <button onClick={() => setRetryState((value) => value ? { ...value, fen: step.fenBefore, feedback: null } : value)}>Thử lại lần nữa</button>}
                  {retryState.hintLevel < 3 && <button onClick={() => setRetryState((value) => value ? { ...value, hintLevel: value.hintLevel + 1 } : value)}><Lightbulb size={13} /> Gợi ý {retryState.hintLevel + 1}</button>}
                  <button onClick={() => { setRetryState(null); setPromotionPending(null); }}>Thoát luyện tập</button>
                </div>
              </div>
            )}

            <div className="arrow-legend">
              <span><i className="legend-line gold" /> Nước vừa đi</span>
              <span><i className="legend-line green" /> Best move</span>
              <span><i className="legend-line blue" /> Phương án 2</span>
              <span><i className="legend-line red" /> Phản đòn</span>
              <span className="keyboard-hint">← → chuyển nước</span>
            </div>
          </div>

          <aside className="coach-panel">
            <div className="coach-scroll-content" ref={coachScrollerRef}>
            <div className="coach-progress">
              <span>PHÂN TÍCH NƯỚC ĐI</span>
              <span className={`coach-engine-inline ${engineLoading ? "working" : ""}`} title={engineError || `Stockfish 18 Lite${engine ? ` · depth ${engine.depth} · CPL ${Math.round(engine.centipawnLoss)}` : " đang tính"}`}>
                <Cpu size={13} /> STOCKFISH 18 LITE
                {engineLoading && <LoaderCircle size={12} />}
                {engine && <i>CPL {Math.round(engine.centipawnLoss)}</i>}
              </span>
              <span>{currentIndex + 1} / {analysis.steps.length}</span>
            </div>
            <div className="progress-track"><div style={{ width: `${((currentIndex + 1) / analysis.steps.length) * 100}%` }} /></div>

            <div className="move-hero">
              <div className="move-badges">
                <div className={`quality-badge ${quality}`}><span className="quality-icon">{quality === "best" ? "★" : quality === "good" ? "✓" : "!"}</span>{QUALITY_LABELS[quality]}</div>
                <div className={`turn-badge ${step.color === "w" ? "white-turn" : "black-turn"}`}>
                  {step.color === "w" ? "Trắng" : "Đen"} · {step.color === "w" ? headers.White || "Người chơi" : headers.Black || "Người chơi"}
                </div>
              </div>
              <div className="san-display">{step.moveNumber}{step.color === "w" ? "." : "…"} {step.san}</div>
              <h2>{step.title}</h2>
              <p>{step.comment}</p>
              <div className={`engine-verdict ${engine ? quality : "loading"}`} aria-live="polite">
                {engine ? (
                  <>
                    <Cpu size={13} />
                    <strong>Stockfish:</strong>
                    <span>{quality === "best"
                      ? "nước tốt nhất"
                      : quality === "good"
                        ? `nước tốt · mất ${Math.round(engine.centipawnLoss)} cp`
                        : `mất ${Math.round(engine.centipawnLoss)} cp · tốt nhất ${engine.bestMoveSan}`}</span>
                    <i>{engine.evaluation}</i>
                    {engineLoading && <LoaderCircle className="spin" size={12} />}
                  </>
                ) : engineError ? (
                  <><TriangleAlert size={13} /><span>{engineError}</span></>
                ) : (
                  <><LoaderCircle className="spin" size={13} /><span>Stockfish đang chấm nước đi…</span></>
                )}
              </div>
              {step.clockSeconds !== null && (
                <div className="move-time-strip">
                  <span><Clock size={13} /> Còn {formatSeconds(step.clockSeconds)}</span>
                  <span>Suy nghĩ {formatSeconds(step.thinkTimeSeconds)}</span>
                  {step.isQuickMove && <i>Đi nhanh</i>}
                  {step.isTimePressure && <i>Áp lực thời gian</i>}
                </div>
              )}
            </div>

            <button className={`training-start-button ${quality === "mistake" || quality === "blunder" ? "recommended" : ""}`} onClick={beginRetry} disabled={!engine || engineLoading}>
              <Dumbbell size={15} /> Thử tìm nước tốt hơn
            </button>

            {engine ? (
              <div className="best-line-card">
                <div className="best-line-label">HAI PHƯƠNG ÁN TỐT NHẤT</div>
                <div className="variation-list">
                  {engine.variations.slice(0, 2).map((variation) => (
                    <button className="variation-row" key={`${variation.rank}-${variation.moveUci}`} onClick={() => openVariation(variation.rank, variation.lineSan)}>
                      <span className={`variation-rank rank-${variation.rank}`}>{variation.rank === 1 ? "BEST" : "#2"}</span>
                      <span className="variation-eval">{variation.evaluation}</span>
                      <span className="best-line-moves">
                        {variation.lineSan.length ? variation.lineSan.map((move, moveIndex) => (
                          <span
                            className={`variation-move-token${variationState?.rank === variation.rank && variationState.index === moveIndex + 1 ? " active" : ""}`}
                            key={`${variation.rank}-${moveIndex}-${move}`}
                          >{move}</span>
                        )) : <span className="variation-move-token">{variation.moveSan}</span>}
                      </span>
                      <Eye size={13} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="best-line-card best-line-loading" aria-label="Stockfish đang tìm phương án">
                <div className="best-line-label">HAI PHƯƠNG ÁN TỐT NHẤT</div>
                <div className="best-line-skeleton"><span /><span /></div>
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
            </div>

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
          <div className="timeline-scroller" ref={timelineScrollerRef}>
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
                <p>{gameOpening ? `${gameOpening.eco} · ${gameOpening.name}` : headers.ECO || "Không rõ khai cuộc"} · {analysis.steps.length} lượt</p>
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

            {fullGameSummary.time.available && (
              <div className="time-summary-card">
                <div><Clock size={17} /><strong>Quản lý thời gian</strong></div>
                <span><strong>{fullGameSummary.time.average}s</strong> trung bình mỗi nước</span>
                <span><strong>{fullGameSummary.time.quickErrors}</strong> lỗi khi đi ≤ 3 giây</span>
                <span><strong>{fullGameSummary.time.pressureErrors}</strong> lỗi dưới áp lực thời gian</span>
              </div>
            )}

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

      {dashboardOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDashboardOpen(false)}>
          <section className="modal-card dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setDashboardOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="summary-heading">
              <div className="modal-icon"><BarChart3 size={24} /></div>
              <div>
                <div className="eyebrow">HỒ SƠ NGƯỜI HỌC · {activeProfileLabel}</div>
                <h2 id="dashboard-title">Tiến bộ của bạn</h2>
                <p>Chỉ dùng các ván đã hoàn tất phân tích Stockfish.</p>
              </div>
            </div>
            {dashboardError && <div className="error-message">{dashboardError}</div>}
            {dashboardLoading ? (
              <div className="dashboard-empty"><LoaderCircle className="spin" size={24} /> Đang tổng hợp dữ liệu…</div>
            ) : dashboardStats.games === 0 ? (
              <div className="dashboard-empty">
                <Database size={30} />
                <strong>Chưa có ván đã phân tích cho {activeProfile?.username || "hồ sơ này"}</strong>
                <span>Đồng bộ ván, mở từng ván và chọn “Phân tích toàn ván” để xây dựng dashboard.</span>
                <button className="primary-button" onClick={() => { setDashboardOpen(false); setImportMode("sync"); setImportOpen(true); }}><Download size={15} /> Đồng bộ 20 ván</button>
              </div>
            ) : (
              <div className="dashboard-content">
                <div className="dashboard-metrics">
                  <div><strong>{dashboardStats.games}</strong><span>Ván đã phân tích</span></div>
                  <div><strong>{dashboardStats.acpl}</strong><span>ACPL cá nhân</span></div>
                  <div><strong>{dashboardStats.bestGoodRate}%</strong><span>Best / Tốt</span></div>
                  <div><strong>{dashboardStats.errors}</strong><span>Sai lầm / Blunder</span></div>
                </div>

                <section className="dashboard-section">
                  <h3>ACPL theo 20 ván gần nhất</h3>
                  <div className="acpl-chart">
                    {dashboardStats.timeline.map((item) => {
                      const max = Math.max(1, ...dashboardStats.timeline.map((point) => point.acpl));
                      return <div className="acpl-column" key={item.id} title={`${formatVietnamDate(item.date)} · ACPL ${item.acpl}`}><span>{item.acpl}</span><i style={{ height: `${Math.max(8, (item.acpl / max) * 100)}%` }} /></div>;
                    })}
                  </div>
                </section>

                <div className="dashboard-grid">
                  {[
                    { title: "Theo giai đoạn", items: dashboardStats.phases },
                    { title: "Theo màu quân", items: dashboardStats.colors },
                    { title: "Theo thể loại", items: dashboardStats.timeClasses },
                    { title: "Khai cuộc thường gặp", items: dashboardStats.openings },
                  ].map((group) => (
                    <section className="dashboard-breakdown" key={group.title}>
                      <h3>{group.title}</h3>
                      {group.items.map((item) => (
                        <div key={item.label}><span title={item.label}>{item.label}</span><strong>{item.acpl} ACPL</strong><i>{item.errors} lỗi / {item.moves} nước</i></div>
                      ))}
                    </section>
                  ))}
                </div>

                <div className="dashboard-grid bottom">
                  <section className="dashboard-breakdown">
                    <h3>Chủ đề cần ưu tiên</h3>
                    {dashboardStats.weaknesses.length ? dashboardStats.weaknesses.map((item) => (
                      <div key={item.label}><span>{item.label}</span><strong>{item.count} lần</strong></div>
                    )) : <p>Chưa có nhóm lỗi lặp lại.</p>}
                  </section>
                  {dashboardStats.timedMoves > 0 && (
                    <section className="dashboard-breakdown time-dashboard">
                      <h3><Clock size={14} /> Quản lý thời gian</h3>
                      <div><span>Thời gian nghĩ trung bình</span><strong>{dashboardStats.averageThinkTime}s</strong></div>
                      <div><span>Lỗi khi đi ≤ 3 giây</span><strong>{dashboardStats.quickErrors}</strong></div>
                      <div><span>Lỗi dưới áp lực</span><strong>{dashboardStats.pressureErrors}</strong></div>
                    </section>
                  )}
                </div>
              </div>
            )}
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
                <p>{savedGames.length ? `${savedGames.length} ván của ${activeProfileLabel} · mới thi đấu gần đây trước` : `Chưa có ván cho ${activeProfileLabel}.`}</p>
              </div>
            </div>
            {libraryError && <div className="error-message">{libraryError}</div>}
            <div className="library-list">
              {libraryLoading && !savedGames.length ? (
                <div className="library-empty"><LoaderCircle className="spin" size={22} /> Đang đọc kho ván…</div>
              ) : savedGames.length ? savedGames.map((game) => {
                const outcome = gameOutcomeForProfile(game, activeProfile?.username);
                return (
                <article className={`library-game outcome-${outcome.kind}`} key={game.id}>
                  <button className="library-game-open" onClick={() => void openStoredGame(game.id)} disabled={libraryLoading}>
                    <div className="library-game-players">
                      <span className="library-player white"><i className="side-badge white-side">Trắng</i><strong>{game.white}</strong><small>{game.white_elo ? `Elo ${game.white_elo}` : "Elo —"}</small></span>
                      <span className={`library-outcome ${outcome.kind}`} aria-label={`${outcome.label}${outcome.side ? ` khi cầm quân ${outcome.side}` : ""}, kết quả ${game.result || "chưa xác định"}`}>
                        <strong>{outcome.label}</strong>
                        <small>{outcome.side ? `${outcome.side} · ` : ""}{game.result || "*"}</small>
                      </span>
                      <span className="library-player black"><strong>{game.black}</strong><small>{game.black_elo ? `Elo ${game.black_elo}` : "Elo —"}</small><i className="side-badge black-side">Đen</i></span>
                    </div>
                    <div className="library-game-meta">
                      <span>{game.event || "Ván cờ đã nhập"}</span>
                      {(game.played_at || game.date) && <span>{formatVietnamDate(game.played_at || game.date)}</span>}
                      {game.eco && <span>{game.eco}</span>}
                      {game.opening && <span className="library-opening" title={game.opening}>{game.opening}</span>}
                      {game.time_control && <span>{game.time_control}s</span>}
                      {game.source_platform && <span>{game.source_platform === "lichess" ? "Lichess" : "Chess.com"}</span>}
                      {game.analysis_complete && <span className="analyzed-game">Đã phân tích</span>}
                      <span className="library-opened">Mở {formatVietnamDate(game.last_opened_at, true)}</span>
                    </div>
                  </button>
                  <button className="library-delete" onClick={() => void removeStoredGame(game)} disabled={libraryLoading} aria-label={`Xoá ván ${game.white} gặp ${game.black}`} title="Xoá khỏi Kho ván"><Trash2 size={16} /></button>
                </article>
                );
              }) : (
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

      {profilesOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setProfilesOpen(false)}>
          <section className="modal-card profiles-modal" role="dialog" aria-modal="true" aria-labelledby="profiles-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setProfilesOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="library-heading">
              <div className="modal-icon"><UserRound size={24} /></div>
              <div>
                <div className="eyebrow">CHESS.COM · LICHESS</div>
                <h2 id="profiles-title">Hồ sơ ván đấu</h2>
                <p>Chọn hồ sơ để lọc Kho ván, Dashboard và đồng bộ 20 ván gần nhất.</p>
              </div>
            </div>

            {profilesError && <div className="error-message">{profilesError}</div>}
            <div className="profile-list">
              {profiles.map((profile) => {
                const selected = profile.id === activeProfileId;
                return (
                  <article className={`profile-item ${selected ? "active" : ""}`} key={profile.id}>
                    <button className="profile-select" onClick={() => changeActiveProfile(profile.id)}>
                      <span className={`profile-platform ${profile.platform}`}>{profile.platform === "chesscom" ? "Chess.com" : "Lichess"}</span>
                      <strong>{profile.username}</strong>
                      <small>{profile.game_count} ván{profile.last_sync_at ? ` · Đồng bộ ${formatVietnamDate(profile.last_sync_at, true)}` : " · Chưa đồng bộ"}</small>
                      {selected && <span className="profile-active-label">Đang dùng</span>}
                    </button>
                    <button className="profile-delete" onClick={() => void removePlayerProfile(profile)} disabled={profilesLoading || profiles.length <= 1} aria-label={`Xoá hồ sơ ${profile.username}`} title={profiles.length <= 1 ? "Cần giữ lại ít nhất một hồ sơ" : "Xoá hồ sơ"}><Trash2 size={15} /></button>
                  </article>
                );
              })}
              {profilesLoading && !profiles.length && <div className="library-empty"><LoaderCircle className="spin" size={22} /> Đang đọc hồ sơ…</div>}
            </div>

            <div className="profile-add-form">
              <h3>Thêm hồ sơ</h3>
              <div className="provider-switch" role="group" aria-label="Nền tảng hồ sơ mới">
                <button className={newProfilePlatform === "chesscom" ? "active" : ""} onClick={() => setNewProfilePlatform("chesscom")}>Chess.com</button>
                <button className={newProfilePlatform === "lichess" ? "active" : ""} onClick={() => setNewProfilePlatform("lichess")}>Lichess</button>
              </div>
              <div className="profile-add-row">
                <input value={newProfileUsername} onChange={(event) => setNewProfileUsername(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addPlayerProfile(); }} placeholder="Nhập username" aria-label="Username hồ sơ mới" />
                <button className="primary-button" onClick={() => void addPlayerProfile()} disabled={profilesLoading || !newProfileUsername.trim()}><UserPlus size={15} /> Thêm</button>
              </div>
            </div>
            <div className="modal-note">Xoá hồ sơ chỉ bỏ liên kết với tài khoản; các ván đã tải vẫn được giữ trên máy.</div>
          </section>
        </div>
      )}

      {accountOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAccountOpen(false)}>
          <section className="modal-card account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAccountOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><Cloud size={24} /></div>
            <div className="eyebrow">GOOGLE · FIREBASE · SQLITE</div>
            <h2 id="account-title">Tài khoản & đồng bộ</h2>
            <p>Đăng nhập Google để sao lưu hồ sơ và kho ván, rồi tiếp tục trên máy khác. SQLite vẫn là bản dữ liệu offline trên máy này.</p>

            {firebaseUser ? (
              <>
                <div className="account-identity">
                  <span className="account-avatar">{accountInitial}</span>
                  <div>
                    <strong>{firebaseUser.displayName || "Tài khoản Google"}</strong>
                    <span>{firebaseUser.email}</span>
                  </div>
                  <i><CheckCircle2 size={13} /> Đã kết nối</i>
                </div>
                <div className="cloud-summary">
                  <div><Database size={16} /><span><strong>{profiles.length} hồ sơ · {savedGames.length} ván đang hiển thị</strong><small>Dữ liệu local sẵn sàng khi offline</small></span></div>
                  <div><RefreshCw size={16} /><span><strong>{lastCloudSyncAt ? `Đồng bộ ${formatVietnamDate(lastCloudSyncAt, true)}` : "Chưa đồng bộ lần đầu"}</strong><small>Hợp nhất hai chiều, không tạo ván trùng</small></span></div>
                </div>
                <div className="security-note"><ShieldCheck size={15} /> Mỗi tài khoản chỉ đọc và ghi vùng dữ liệu theo Firebase UID của chính mình. API key AI và kết quả Stockfish không được tải lên.</div>
                <div className="modal-actions account-actions">
                  <button className="danger-ghost" onClick={() => void handleGoogleLogout()} disabled={cloudSyncing}><LogOut size={15} /> Đăng xuất</button>
                  <button className="primary-button large" onClick={() => void syncCloud(firebaseUser, true)} disabled={cloudSyncing}>
                    {cloudSyncing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                    {cloudSyncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="account-signin-card">
                  <div className="google-mark">G</div>
                  <div><strong>Đăng nhập bằng Google</strong><span>Firebase dùng tài khoản này để tách riêng dữ liệu của mày.</span></div>
                </div>
                {!firebaseConfigured && <div className="error-message">Bản build này chưa có Firebase Web App config. Điền các biến VITE_FIREBASE_* rồi build lại.</div>}
                <div className="security-note"><ShieldCheck size={15} /> App chỉ nhận tên, email và mã UID từ Google. Mật khẩu không đi qua Chess Coach.</div>
                <div className="modal-actions">
                  <button className="ghost-button" onClick={() => setAccountOpen(false)}>Để sau</button>
                  <button className="primary-button large" onClick={() => void handleGoogleLogin()} disabled={!firebaseConfigured || authLoading}>
                    {authLoading ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}
                    {authLoading ? "Đang mở Google…" : "Tiếp tục với Google"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setImportOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon">{importMode === "single" ? <ClipboardPaste size={24} /> : <Download size={24} />}</div>
            <div className="eyebrow">BẮT ĐẦU PHÂN TÍCH</div>
            <h2 id="import-title">Nạp ván cờ</h2>
            <div className="import-tabs" role="tablist" aria-label="Cách nạp ván">
              <button className={importMode === "single" ? "active" : ""} onClick={() => { setImportMode("single"); setError(""); }}><ClipboardPaste size={14} /> Một ván</button>
              <button className={importMode === "sync" ? "active" : ""} onClick={() => { setImportMode("sync"); setError(""); }}><Download size={14} /> Đồng bộ gần đây</button>
            </div>

            {importMode === "single" ? (
              <>
                <p>Dán toàn bộ PGN hoặc link ván đấu đã kết thúc trên Chess.com.</p>
                <div className="input-labels"><span><ClipboardPaste size={14} /> PGN</span><span><Link2 size={14} /> Chess.com</span></div>
                <textarea autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder={'[Event "Live Chess"]\n[White "Tên người chơi"]\n\n1. e4 e5 2. Nf3...\n\nhoặc https://www.chess.com/game/live/...'} />
              </>
            ) : (
              <div className="sync-form">
                <p>Tải 20 ván cờ tiêu chuẩn gần nhất từ hồ sơ công khai. Ván trùng sẽ tự động được bỏ qua.</p>
                <label className="field-label" htmlFor="sync-profile">Hồ sơ cần đồng bộ</label>
                <div className="sync-profile-row">
                  <select id="sync-profile" value={activeProfileId || ""} onChange={(event) => changeActiveProfile(Number(event.target.value))}>
                    {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.platform === "chesscom" ? "Chess.com" : "Lichess"} · {profile.username}</option>)}
                  </select>
                  <button className="ghost-button" onClick={() => { setImportOpen(false); setProfilesOpen(true); }}><UserPlus size={14} /> Quản lý</button>
                </div>
                <label className="field-label" htmlFor="sync-time-class">Thể loại</label>
                <select id="sync-time-class" value={syncTimeClass} onChange={(event) => setSyncTimeClass(event.target.value)}>
                  <option value="all">Tất cả thể loại</option>
                  <option value="bullet">Bullet</option>
                  <option value="blitz">Blitz</option>
                  <option value="rapid">Rapid</option>
                  <option value="classical">Classical</option>
                </select>
                {syncProgress && (
                  <div className="sync-progress" role="status" aria-live="polite">
                    <div className="sync-progress-icon"><LoaderCircle size={20} /></div>
                    <div className="sync-progress-copy">
                      <strong>{syncProgress.phase === "fetching" ? "Đang tải danh sách ván…" : `Đang lưu ${syncProgress.completed}/${syncProgress.total} ván`}</strong>
                      <span>{syncProgress.phase === "fetching" ? `Đang tìm tối đa ${syncProgress.total} ván mới nhất` : "Đang nhận diện khai cuộc và sắp xếp theo thời gian thi đấu"}</span>
                      <i><b style={{ width: `${syncProgress.phase === "fetching" ? 12 : (syncProgress.completed / Math.max(1, syncProgress.total)) * 100}%` }} /></i>
                    </div>
                  </div>
                )}
                {syncStatus && <div className="sync-success">{syncStatus}</div>}
              </div>
            )}
            {error && <div className="error-message">{error}</div>}
            <div className="modal-note">PGN và kết quả Stockfish được lưu cục bộ trên máy.</div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => loadAnalysis(DEMO_PGN)}>Mở ván demo</button>
              {importMode === "single" ? (
                <button className="primary-button large" onClick={handleImport} disabled={loading || !input.trim()}>{loading ? "Đang tải ván…" : "Phân tích ngay"} <ArrowRight size={17} /></button>
              ) : (
                <button className="primary-button large" onClick={() => void syncRecentGames()} disabled={loading || !activeProfile}>{syncProgress?.phase === "saving" ? `Đang lưu ${syncProgress.completed}/${syncProgress.total}` : loading ? "Đang đồng bộ…" : "Đồng bộ 20 ván"} {loading ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}</button>
              )}
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

            <label className="field-label">Âm thanh giao diện</label>
            <div className="sfx-setting">
              <span>{sfxEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}<span><strong>{sfxEnabled ? "Đang bật SFX" : "Đã tắt SFX"}</strong><small>Chuyển nước, mở bảng, hoàn tất và báo lỗi</small></span></span>
              <button type="button" className={sfxEnabled ? "active" : ""} onClick={toggleSfx} aria-pressed={sfxEnabled}>{sfxEnabled ? "Bật" : "Tắt"}</button>
            </div>

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
        <span>Chess Coach v0.5.0 · Stockfish 18 Lite · OpenAI + Gemini</span>
        <span>{firebaseUser ? <Cloud size={13} /> : <ShieldCheck size={13} />} {firebaseUser ? "Hồ sơ + PGN được sao lưu Firebase · AI vẫn cục bộ" : "PGN ở lại trên máy · Đăng nhập Google để sao lưu"}</span>
      </footer>
    </div>
  );
}

export default App;
