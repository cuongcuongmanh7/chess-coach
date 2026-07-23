import { Crosshair, ShieldAlert } from "lucide-react";
import type { TacticalAnalysis } from "../types";
import {
  tacticConfidence,
  tacticLabel,
} from "../presentation.ts";

export function TacticalInsights({
  analysis,
  threatViewEnabled,
}: {
  analysis: TacticalAnalysis | null;
  threatViewEnabled: boolean;
}) {
  if (!analysis?.tags.length && !threatViewEnabled) return null;
  return (
    <section className="tactical-insights" aria-label="Nhãn chiến thuật đã xác thực">
      <div className="tactical-insights-heading">
        <Crosshair size={14} />
        <strong>Tactical Intelligence</strong>
        <span>Detector v{analysis?.version || 1}</span>
      </div>
      {analysis?.tags.length ? (
        <div className="tactical-tag-list">
          {analysis.tags.map((tag) => (
            <span
              className="tactical-tag"
              key={tag.motif}
              title={`${tag.evidence.description} Confidence ${tacticConfidence(tag)}.`}
            >
              {tacticLabel(tag.motif)}
              <i>{tacticConfidence(tag)}</i>
            </span>
          ))}
        </div>
      ) : (
        <p>Detector chưa tìm thấy motif đủ confidence ở vị trí này.</p>
      )}
      {threatViewEnabled && analysis?.threat && (
        <div className="tactical-threat-summary">
          <ShieldAlert size={13} />
          <span>{analysis.threat.summary}</span>
        </div>
      )}
    </section>
  );
}
