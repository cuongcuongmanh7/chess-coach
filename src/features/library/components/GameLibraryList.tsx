import { Library, LoaderCircle, Trash2 } from "lucide-react";
import type { SavedGameSummary } from "../../../shared/types/tauri";
import { formatVietnamDate } from "../../../shared/utils/format";
import { gameOutcomeForProfile } from "../utils";
import { GamePositionThumbnail } from "./GamePositionThumbnail";

type GameLibraryListProps = {
  games: SavedGameSummary[];
  activeGameId?: string | null;
  activeProfileUsername?: string;
  loading: boolean;
  error: string;
  variant: "sidebar" | "modal";
  onOpen: (id: string) => void;
  onDelete: (game: SavedGameSummary) => void;
};

export function GameLibraryList({
  games,
  activeGameId,
  activeProfileUsername,
  loading,
  error,
  variant,
  onOpen,
  onDelete,
}: GameLibraryListProps) {
  return (
    <div className={`library-list ${variant === "sidebar" ? "sidebar-library-list" : "modal-library-list"}`}>
      {error && <div className="error-message library-inline-error">{error}</div>}
      {loading && !games.length ? (
        <div className="library-empty"><LoaderCircle className="spin" size={22} /> Đang đọc kho ván…</div>
      ) : games.length ? games.map((game) => {
        const outcome = gameOutcomeForProfile(game, activeProfileUsername);
        const orientation = activeProfileUsername
          && game.black.toLocaleLowerCase() === activeProfileUsername.toLocaleLowerCase()
          ? "b"
          : "w";
        return (
          <article className={`library-game outcome-${outcome.kind}${game.id === activeGameId ? " active" : ""}`} key={game.id}>
            <button className="library-game-open" onClick={() => onOpen(game.id)} disabled={loading} aria-current={game.id === activeGameId ? "true" : undefined}>
              <div className="library-game-layout">
                {variant === "sidebar" && game.final_fen && <GamePositionThumbnail fen={game.final_fen} orientation={orientation} />}
                <div className="library-game-copy">
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
                </div>
              </div>
            </button>
            <button className="library-delete" onClick={() => onDelete(game)} disabled={loading} aria-label={`Xoá ván ${game.white} gặp ${game.black}`} title="Xoá khỏi Kho ván"><Trash2 size={16} /></button>
          </article>
        );
      }) : (
        <div className="library-empty"><Library size={28} /><strong>Kho ván đang trống</strong><span>Nạp PGN hoặc link Chess.com để lưu ván đầu tiên.</span></div>
      )}
    </div>
  );
}
