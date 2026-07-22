# Kỳ Phổ — prototype phân tích cờ vua

Ứng dụng desktop local dùng Tauri 2, Rust, React, TypeScript, `chess.js`, Stockfish 18 Lite, OpenAI Responses API và Gemini API.

Phiên bản hiện tại: **0.2.0**.

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
- Highlight nước vừa đi, phản đòn, best move và phương án tốt thứ hai do Stockfish đề xuất.
- Phân loại khai cuộc, trung cuộc, tàn cuộc.
- Stockfish 18 Lite chạy local ở depth 13 cho nước đang xem, dùng MultiPV 2 và phân loại Best, Nước tốt, Thiếu chính xác, Sai lầm, Blunder.
- Phân tích toàn ván ở depth 11 với tiến độ nền, ACPL, tỷ lệ Best/Tốt, thống kê lỗi theo từng bên và danh sách vị trí then chốt có thể mở trực tiếp.
- OpenAI hoặc Gemini viết lời giải thích tiếng Việt dựa trên dữ liệu Stockfish.
- Chế độ tự động giải thích Mistake/Blunder hoặc mọi nước đã mở xem.
- Lời giải thích được lưu trong SQLite cục bộ và tái sử dụng khi mở lại vị trí; API key không được ghi vào cơ sở dữ liệu.
- Badge chỉ rõ người cầm Trắng, người cầm Đen và bên vừa đi ở mỗi bước.
- Dark mode và font Be Vietnam Pro được đóng gói trong app để hỗ trợ tiếng Việt và chạy offline.
- Điều hướng bằng nút, timeline hoặc phím mũi tên trái/phải.

## Cấu hình AI

Mở biểu tượng bánh răng trong app, chọn OpenAI hoặc Gemini, chọn model và nhập API key. Key chỉ được giữ trong bộ nhớ Rust của phiên chạy và bị xoá khi đóng app.

- Gemini mặc định dùng `gemini-3.5-flash-lite`; có thể chọn `gemini-3.6-flash`.
- OpenAI hỗ trợ `gpt-5.6-sol`, `gpt-5.6-terra` và `gpt-5.6-luna`.
- Có thể dùng biến môi trường `GEMINI_API_KEY`, `GOOGLE_API_KEY` hoặc `OPENAI_API_KEY`.
- Mặc định app tự giải thích các nước được Stockfish phân loại Sai lầm hoặc Blunder. Có thể đổi sang mọi nước đã xem hoặc tắt tự động trong Cài đặt.

## Thành phần mã nguồn mở

Stockfish.js 18 Lite Single Thread được phân phối theo GPLv3. Bản quyền và giấy phép nằm trong `public/stockfish/COPYING.txt`; mã nguồn upstream: <https://github.com/nmrugg/stockfish.js>.
