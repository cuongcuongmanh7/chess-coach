import type { TacticalMotif, TacticalTag } from "./types.ts";

export const TACTIC_LABELS: Record<TacticalMotif, string> = {
  "check-mate-threat": "Đe dọa chiếu/mate",
  "missed-capture": "Bỏ lỡ nước bắt",
  "hanging-piece": "Treo quân",
  fork: "Đòn đôi",
  "absolute-pin": "Ghim tuyệt đối",
  skewer: "Xiên",
  "discovered-attack": "Tấn công mở",
  "back-rank": "Hàng cuối yếu",
  "passed-pawn": "Tốt thông/phong cấp",
  "removal-of-defender": "Loại bỏ quân phòng thủ",
};

export function tacticLabel(value: string) {
  return TACTIC_LABELS[value as TacticalMotif] || value;
}

export function tacticConfidence(tag: TacticalTag) {
  return `${Math.round(tag.confidence * 100)}%`;
}
