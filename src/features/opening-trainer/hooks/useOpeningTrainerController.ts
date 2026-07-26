import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzePgn } from "../../../analysis.ts";
import { lastKnownOpening, openingAtFen } from "../../../openings.ts";
import { playerColorForUsername } from "../../analysis/playerMoveStats.ts";
import { gameRepository } from "../../library/services/gameRepository.ts";
import { analysisRepository } from "../../analysis/services/analysisRepository.ts";
import { isTauri } from "../../../shared/services/tauriClient.ts";
import { repertoireRepository } from "../services/repertoireRepository";
import { buildRepertoire, type RepertoireGameInput } from "../model/buildRepertoire";
import { useRepertoireSession } from "./useRepertoireSession";
import type { Repertoire, RepertoireColor, RepertoireNode, RepertoireNodeSeed } from "../types";

const MAX_GAMES = 80;

export function useOpeningTrainerController(
  activeProfileId: number | null,
  activeUsername: string | null,
  onProgressChanged: () => void,
) {
  const [openingTrainerOpen, setOpeningTrainerOpen] = useState(false);
  const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
  const [selectedRepertoireId, setSelectedRepertoireId] = useState<string | null>(null);
  const [tree, setTree] = useState<RepertoireNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState<RepertoireColor | null>(null);
  const [buildProgress, setBuildProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const autoBuildRef = useRef(false);

  const selectedRepertoire = useMemo(
    () => repertoires.find((item) => item.id === selectedRepertoireId) || null,
    [repertoires, selectedRepertoireId],
  );

  const refreshRepertoires = useCallback(async (): Promise<Repertoire[]> => {
    if (!activeProfileId || !isTauri()) return [];
    setLoading(true);
    try {
      const list = await repertoireRepository.list(activeProfileId);
      setRepertoires(list);
      return list;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeProfileId]);

  const reloadTree = useCallback(async () => {
    if (!selectedRepertoireId) {
      setTree([]);
      return;
    }
    try {
      setTree(await repertoireRepository.tree(selectedRepertoireId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [selectedRepertoireId]);

  // Mở modal: tải danh sách; nếu trống thì tự dựng cho cả hai màu (chỉ 1 lần/lần mở).
  useEffect(() => {
    if (!openingTrainerOpen) {
      autoBuildRef.current = false;
      return;
    }
    if (autoBuildRef.current) return;
    autoBuildRef.current = true;
    void (async () => {
      const list = await refreshRepertoires();
      if (list.length === 0) {
        await buildFromHistory("w");
        await buildFromHistory("b");
      }
    })();
    // buildFromHistory cố tình không nằm trong deps: chỉ chạy khi mở modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingTrainerOpen, refreshRepertoires]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  const sessionController = useRepertoireSession({
    activeProfileId,
    repertoire: selectedRepertoire,
    tree,
    reloadTree,
    onProgressChanged,
    setError,
  });

  const buildFromHistory = useCallback(
    async (color: RepertoireColor) => {
      if (!activeProfileId || !isTauri()) return;
      setBuilding(color);
      setError("");
      try {
        const games = (await gameRepository.list(activeProfileId)).slice(0, MAX_GAMES);
        setBuildProgress({ done: 0, total: games.length });
        // Nhóm ván theo họ khai cuộc để mỗi hệ = 1 repertoire riêng.
        const groups = new Map<string, RepertoireGameInput[]>();
        for (let index = 0; index < games.length; index += 1) {
          const game = games[index];
          setBuildProgress({ done: index + 1, total: games.length });
          const detail = await gameRepository.open(game.id);
          const analysis = analyzePgn(detail.pgn);
          const playerColor = playerColorForUsername(analysis.headers, activeUsername);
          if (playerColor !== color) continue;
          const family = lastKnownOpening(analysis.steps)?.family ?? null;
          if (!family) continue;
          const stored = await analysisRepository.list(game.id);
          const engineByPly: RepertoireGameInput["engineByPly"] = {};
          for (const item of stored) {
            engineByPly[item.ply] = {
              centipawnLoss: item.result.centipawnLoss,
              bestMoveUci: item.result.bestMoveUci,
              bestMoveSan: item.result.bestMoveSan,
            };
          }
          const arr = groups.get(family) ?? [];
          arr.push({ steps: analysis.steps, playerColor, engineByPly });
          groups.set(family, arr);
        }
        // Dựng cây từng họ trong RAM trước; chỉ thay thế khi có kết quả.
        const toSave: Array<{ name: string; eco: string | null; nodes: RepertoireNodeSeed[] }> = [];
        for (const [family, groupInputs] of groups) {
          const minFrequency = groupInputs.length >= 4 ? 2 : 1;
          const result = buildRepertoire(groupInputs, color, { minFrequency }, openingAtFen);
          if (result.nodes.length > 0) toSave.push({ name: family, eco: result.eco, nodes: result.nodes });
        }
        if (toSave.length === 0) {
          setError(
            "Chưa đủ dữ liệu để dựng repertoire cho bên " +
              (color === "w" ? "Trắng" : "Đen") +
              ". Hãy đồng bộ/phân tích thêm ván.",
          );
          return;
        }
        let firstId: string | null = null;
        for (const item of toSave) {
          const saved = await repertoireRepository.save({
            profile_id: activeProfileId,
            color,
            name: item.name,
            eco: item.eco,
            nodes: item.nodes,
          });
          if (!firstId) firstId = saved.repertoire_id;
        }
        await refreshRepertoires();
        if (firstId) setSelectedRepertoireId(firstId);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setBuilding(null);
        setBuildProgress(null);
      }
    },
    [activeProfileId, activeUsername, refreshRepertoires],
  );

  const openOpeningTrainer = useCallback(() => setOpeningTrainerOpen(true), []);
  const closeOpeningTrainer = useCallback(() => {
    setOpeningTrainerOpen(false);
    sessionController.exit();
  }, [sessionController]);

  const selectRepertoire = useCallback((id: string | null) => {
    setSelectedRepertoireId(id);
  }, []);

  return {
    openingTrainerOpen,
    openOpeningTrainer,
    closeOpeningTrainer,
    repertoires,
    selectedRepertoire,
    selectedRepertoireId,
    selectRepertoire,
    tree,
    openingTrainerLoading: loading,
    openingTrainerBuilding: building,
    openingTrainerBuildProgress: buildProgress,
    openingTrainerError: error,
    buildFromHistory,
    repertoireSession: sessionController,
  };
}
