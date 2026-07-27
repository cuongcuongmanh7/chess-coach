import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tách bundle theo nhóm phụ thuộc thay vì dồn tất cả vào một chunk:
// - dữ liệu khai cuộc là ~0,5 MB JSON tĩnh, không nên nằm cùng code UI;
// - firebase chỉ cần khi người dùng đăng nhập;
// - recharts chỉ được Game Story (đã lazy) dùng, nên giữ riêng để không bị kéo
//   vào lượt tải đầu.
function chunkFor(id: string) {
  const path = id.replace(/\\/g, "/");
  if (path.includes("/src/data/openings.json")) return "openings-data";
  if (!path.includes("node_modules")) return undefined;
  if (path.includes("/firebase/") || path.includes("/@firebase/")) return "vendor-firebase";
  if (path.includes("/recharts/") || path.includes("/d3-") || path.includes("/victory-vendor/")) {
    return "vendor-charts";
  }
  if (path.includes("/chess.js/") || path.includes("/react-chessboard/")) return "vendor-chess";
  if (path.includes("/lucide-react/")) return "vendor-icons";
  if (path.includes("/react-dom/") || path.includes("/scheduler/")) return "vendor-react";
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    rollupOptions: {
      output: {
        manualChunks: chunkFor,
      },
    },
  },
});
