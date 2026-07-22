import { mkdir, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";

const SOURCE_BASE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const OUTPUT = new URL("../src/data/openings.json", import.meta.url);
const volumes = ["a", "b", "c", "d", "e"];
const positions = new Map();

for (const volume of volumes) {
  const response = await fetch(`${SOURCE_BASE}/${volume}.tsv`);
  if (!response.ok) throw new Error(`Không tải được ${volume}.tsv: HTTP ${response.status}`);

  const [, ...rows] = (await response.text()).trim().split(/\r?\n/);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    if (!eco || !name || !pgn) continue;

    const chess = new Chess();
    try {
      chess.loadPgn(pgn);
    } catch {
      continue;
    }

    const epd = chess.fen().split(" ").slice(0, 4).join(" ");
    positions.set(epd, { eco, name });
  }
}

const output = Object.fromEntries([...positions.entries()].sort(([left], [right]) => left.localeCompare(right)));
await mkdir(new URL(".", OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Đã tạo ${positions.size} vị trí khai cuộc tại ${OUTPUT.pathname}`);
