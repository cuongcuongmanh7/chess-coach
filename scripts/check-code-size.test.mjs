import assert from "node:assert/strict";
import test from "node:test";
import {
  HARD_LIMIT_LINES,
  IGNORED_DIRECTORIES,
  LEGACY_BASELINE,
  SOURCE_EXTENSIONS,
  countLines,
  evaluateSourceFiles,
} from "./code-size-rules.mjs";

test("đếm đúng LF, CRLF và dòng cuối không có newline", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\r\nb"), 2);
});

test("baseline được truyền vào vẫn chặn file nợ cũ tăng thêm", () => {
  const baseline = HARD_LIMIT_LINES + 100;
  const legacyBaseline = new Map([["src/legacy.ts", baseline]]);

  const [report] = evaluateSourceFiles([
    { relativePath: "src/legacy.ts", lines: baseline + 1 },
  ], legacyBaseline);

  assert.equal(report.baseline, true);
  assert.equal(report.allowedLines, baseline);
  assert.equal(report.failed, true);
});

test("v0.6.2 không còn baseline nợ cũ", () => {
  assert.equal(LEGACY_BASELINE.size, 0);
});

test("file source mới trên giới hạn cứng làm kiểm tra thất bại", () => {
  const [report] = evaluateSourceFiles([
    { relativePath: "src/features/example/TooLarge.tsx", lines: HARD_LIMIT_LINES + 1 },
  ]);

  assert.equal(report.baseline, false);
  assert.equal(report.allowedLines, HARD_LIMIT_LINES);
  assert.equal(report.failed, true);
});

test("file đúng giới hạn cứng chỉ tạo cảnh báo", () => {
  const [report] = evaluateSourceFiles([
    { relativePath: "src/features/example/AtLimit.ts", lines: HARD_LIMIT_LINES },
  ]);

  assert.equal(report.failed, false);
});

test("danh sách loại trừ và phần mở rộng bao phủ đúng phạm vi", () => {
  for (const directory of ["generated", "vendor", "fixtures"]) {
    assert.equal(IGNORED_DIRECTORIES.has(directory), true);
  }

  for (const extension of [".ts", ".tsx", ".rs", ".css", ".js"]) {
    assert.equal(SOURCE_EXTENSIONS.has(extension), true);
  }
});
