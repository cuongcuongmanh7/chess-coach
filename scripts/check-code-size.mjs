import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const scanRoots = ["src", "src-tauri/src", "scripts"];
const sourceExtensions = new Set([".ts", ".tsx", ".rs", ".css", ".js", ".mjs", ".cjs"]);

const targetLines = 300;
const hardLimitLines = 500;

// Nợ kỹ thuật hiện hữu. Không tăng các số này. Khi file được tách nhỏ,
// hạ baseline trong cùng commit; xóa entry sau khi file xuống dưới hard limit.
const legacyBaseline = new Map([
  ["src/App.tsx", 2597],
  ["src-tauri/src/lib.rs", 3759],
  ["src/styles.css", 798],
]);

const ignoredDirectories = new Set([
  "node_modules",
  "target",
  "dist",
  "firebase-hosting",
  "generated",
  "vendor",
  "fixtures",
]);

function normalizePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function countLines(content) {
  if (content.length === 0) return 0;
  const normalized = content.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  return normalized.endsWith("\n") ? lines.length - 1 : lines.length;
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const sourceFiles = (
  await Promise.all(scanRoots.map((root) => collectSourceFiles(path.join(projectRoot, root))))
).flat();

const reports = [];
for (const filePath of sourceFiles) {
  const relativePath = normalizePath(filePath);
  const content = await readFile(filePath, "utf8");
  const lines = countLines(content);
  const baseline = legacyBaseline.get(relativePath);
  const allowedLines = baseline ?? hardLimitLines;

  if (lines > targetLines) {
    reports.push({
      relativePath,
      lines,
      allowedLines,
      baseline: baseline !== undefined,
      failed: lines > allowedLines,
    });
  }
}

reports.sort((left, right) => right.lines - left.lines);

if (reports.length === 0) {
  console.log(`✓ Tất cả file source đều không quá mục tiêu ${targetLines} dòng.`);
  process.exit(0);
}

console.log(`Kiểm tra kích thước code — mục tiêu ${targetLines}, giới hạn cứng ${hardLimitLines} dòng`);
for (const report of reports) {
  const state = report.failed ? "LỖI" : report.baseline ? "NỢ CŨ" : "CẢNH BÁO";
  const allowance = report.baseline
    ? `baseline ${report.allowedLines}`
    : `giới hạn ${report.allowedLines}`;
  console.log(`${state.padEnd(9)} ${String(report.lines).padStart(5)} dòng  ${report.relativePath} (${allowance})`);
}

const failures = reports.filter((report) => report.failed);
if (failures.length > 0) {
  console.error("\nCode-size check thất bại. Hãy tách module hoặc hạ số dòng trước khi bàn giao.");
  process.exit(1);
}

console.log("\n✓ Không có file nào vượt giới hạn. Các file nợ cũ không được tăng baseline.");
