import { invokeCommand } from "../../../shared/services/tauriClient";
import type {
  Repertoire,
  RepertoireColor,
  RepertoireNode,
  RepertoireNodeSeed,
  RepertoireProgress,
} from "../types";

export const repertoireRepository = {
  save(request: {
    profile_id: number;
    color: RepertoireColor;
    name: string;
    eco: string | null;
    nodes: RepertoireNodeSeed[];
  }) {
    return invokeCommand<{ repertoire_id: string; node_count: number }>(
      "save_repertoire",
      { request },
    );
  },
  list(profileId: number) {
    return invokeCommand<Repertoire[]>("list_repertoires", {
      profileId,
    });
  },
  tree(repertoireId: string) {
    return invokeCommand<RepertoireNode[]>("get_repertoire_tree", {
      repertoireId,
    });
  },
  nextNodes(repertoireId: string) {
    return invokeCommand<RepertoireNode[]>("next_repertoire_nodes", {
      repertoireId,
    });
  },
  review(request: {
    node_id: string;
    profile_id: number;
    correct: boolean;
    hints_used: number;
    failed_attempts: number;
    duration_ms: number;
    centipawn_loss: number;
  }) {
    return invokeCommand<RepertoireProgress>("review_repertoire_node", {
      request,
    });
  },
  addMove(request: {
    repertoire_id: string;
    parent_id: string | null;
    position_key: string;
    fen: string;
    move_san: string;
    move_uci: string;
    side_to_move: RepertoireColor;
    comment: string | null;
  }) {
    return invokeCommand<RepertoireNode>("add_repertoire_move", { request });
  },
};
