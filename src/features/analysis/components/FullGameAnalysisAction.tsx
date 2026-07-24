import { ArrowRight, BarChart3, LoaderCircle, TriangleAlert } from "lucide-react";

type FullGameAnalysisActionProps = {
  analysis: {
    running: boolean;
    complete: boolean;
    completed: number;
    total: number;
    error: string;
  };
  onAnalyze: () => Promise<void>;
  disabled?: boolean;
};

export function FullGameAnalysisAction({
  analysis,
  onAnalyze,
  disabled = false,
}: FullGameAnalysisActionProps) {
  return (
    <button
      className={`full-analysis-action ${analysis.complete ? "complete" : analysis.error ? "error" : ""}`}
      onClick={() => void onAnalyze()}
      disabled={analysis.running || disabled}
      title={analysis.error || undefined}
    >
      <i>
        {analysis.running
          ? <LoaderCircle className="spin" size={18} />
          : analysis.error
            ? <TriangleAlert size={18} />
            : <BarChart3 size={18} />}
      </i>
      <span>
        <strong>
          {analysis.running
            ? "Đang phân tích toàn ván"
            : analysis.complete
              ? "Mở Game Story"
              : analysis.error
                ? "Thử lại phân tích"
                : "Phân tích toàn ván"}
        </strong>
        <small>
          {analysis.running
            ? `${analysis.completed}/${analysis.total} lượt đã hoàn tất`
            : analysis.complete
              ? "Evaluation, key moments và tổng kết"
              : "Tìm bước ngoặt và xây câu chuyện ván đấu"}
        </small>
      </span>
      {!analysis.running && <ArrowRight size={16} />}
    </button>
  );
}
