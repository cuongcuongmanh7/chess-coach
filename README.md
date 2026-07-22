# Kỳ Phổ — prototype phân tích cờ vua

Ứng dụng desktop local dùng Tauri 2, Rust, React, TypeScript, `chess.js` và `react-chessboard`.

## Chạy trên Windows

Yêu cầu: Node.js, Rust và Microsoft Edge WebView2.

Cách nhanh nhất: nhấp đúp `start-windows.bat`.

Hoặc mở PowerShell trong thư mục này:

```powershell
npm install
npm run tauri dev
```

## Build file cài đặt

```powershell
npm run tauri build
```

File cài đặt NSIS sẽ nằm trong `src-tauri/target/release/bundle/nsis/`.

## Phạm vi prototype

- Đọc PGN và phát lại đúng vị trí sau từng lượt.
- Tải link ván Chess.com đã kết thúc qua dữ liệu công khai.
- Highlight nước vừa đi, mũi tên phản đòn, nhận xét ngắn tiếng Việt.
- Phân loại khai cuộc, trung cuộc, tàn cuộc.
- Gắn nhãn Nước tốt, Sai lầm, Blunder bằng heuristic.
- Điều hướng bằng nút, timeline hoặc phím mũi tên trái/phải.

Nhãn chất lượng hiện là heuristic phục vụ prototype, chưa thay thế phân tích Stockfish.
