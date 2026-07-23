import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  HARD_LIMIT_LINES,
  IGNORED_DIRECTORIES,
  SOURCE_EXTENSIONS,
  TARGET_LINES,
  countLines,
  evaluateSourceFiles,
} from "./code-size-rules.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const scanRoots = ["src", "src-tauri/src", "scripts"];

function normalizePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const sourceFiles = (
  await Promise.all(scanRoots.map((root) => collectSourceFiles(path.join(projectRoot, root))))
).flat();

const measuredFiles = await Promise.all(sourceFiles.map(async (filePath) => ({
  relativePath: normalizePath(filePath),
  lines: countLines(await readFile(filePath, "utf8")),
})));
const reports = evaluateSourceFiles(measuredFiles);

if (reports.length === 0) {
  console.log(`✓ Tất cả file source đều không quá mục tiêu ${TARGET_LINES} dòng.`);
  process.exit(0);
}

console.log(
  `Kiểm tra kích thước code — mục tiêu ${TARGET_LINES}, giới hạn cứng ${HARD_LIMIT_LINES} dòng`,
);
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
