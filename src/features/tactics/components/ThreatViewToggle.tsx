import { ShieldAlert } from "lucide-react";

type ThreatViewToggleProps = {
  available: boolean;
  enabled: boolean;
  onToggle: () => void;
};

export function ThreatViewToggle({
  available,
  enabled,
  onToggle,
}: ThreatViewToggleProps) {
  return (
    <button
      type="button"
      className={`threat-view-toggle${enabled ? " active" : ""}`}
      onClick={onToggle}
      disabled={!available}
      aria-pressed={enabled}
      title={available ? "Hiện mối đe dọa chính của đối thủ" : "Chưa có threat data cho vị trí này"}
    >
      <ShieldAlert size={15} />
      <span>{enabled ? "Đang xem đe dọa" : "Đe dọa"}</span>
    </button>
  );
}
