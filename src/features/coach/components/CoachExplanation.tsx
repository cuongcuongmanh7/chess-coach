const COACH_LINE_LABELS = ["ĐÁNH GIÁ", "Ý TƯỞNG", "SO SÁNH", "KẾ HOẠCH"];
const COACH_TOKEN_PATTERN = /((?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[+-]\d+(?:\.\d+)?))/g;
const COACH_MOVE_PATTERN = /^(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)$/;
const COACH_EVAL_PATTERN = /^[+-]\d+(?:\.\d+)?$/;

function renderCoachInline(text: string) {
  return text.split(COACH_TOKEN_PATTERN).filter(Boolean).map((part, index) => {
    if (COACH_EVAL_PATTERN.test(part)) {
      return <span className="coach-token eval" key={`${part}-${index}`}>{part}</span>;
    }
    if (COACH_MOVE_PATTERN.test(part)) {
      return <span className="coach-token move" key={`${part}-${index}`}>{part}</span>;
    }
    return part;
  });
}

export function CoachExplanation({ text }: { text: string }) {
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
    : normalizedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((line) => line.trim()).filter(Boolean)
      || [normalizedText];

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

export function GameCoachSummaryView({ text }: { text: string }) {
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
  const findSection = (
    side: "TRẮNG" | "ĐEN",
    topic: "ĐIỂM MẠNH" | "CẦN CẢI THIỆN" | "ƯU TIÊN",
  ) => [...sections.entries()].find(
    ([label]) => label.includes(side) && label.includes(topic),
  )?.[1] || "Chưa có nhận xét.";
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
