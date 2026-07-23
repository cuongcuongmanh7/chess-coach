export const TARGET_LINES = 300;
export const HARD_LIMIT_LINES = 500;

export const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".rs",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
]);

export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "target",
  "dist",
  "firebase-hosting",
  "generated",
  "vendor",
  "fixtures",
]);

// v0.6.2 đã xử lý toàn bộ nợ cũ; không thêm baseline mới nếu chưa có phê duyệt.
export const LEGACY_BASELINE = new Map();

export function countLines(content) {
  if (content.length === 0) return 0;
  const normalized = content.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  return normalized.endsWith("\n") ? lines.length - 1 : lines.length;
}

export function evaluateSourceFiles(
  sourceFiles,
  legacyBaseline = LEGACY_BASELINE,
) {
  const reports = [];

  for (const sourceFile of sourceFiles) {
    const baseline = legacyBaseline.get(sourceFile.relativePath);
    const allowedLines = baseline ?? HARD_LIMIT_LINES;

    if (sourceFile.lines > TARGET_LINES) {
      reports.push({
        ...sourceFile,
        allowedLines,
        baseline: baseline !== undefined,
        failed: sourceFile.lines > allowedLines,
      });
    }
  }

  reports.sort((left, right) => right.lines - left.lines);
  return reports;
}
