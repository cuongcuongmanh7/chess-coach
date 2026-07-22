# Kỳ Phổ — prototype phân tích cờ vua

Ứng dụng desktop local dùng Tauri 2, Rust, React, TypeScript, `chess.js`, Stockfish 18 Lite và OpenAI Responses API.

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
- Highlight nước vừa đi, phản đòn và nước tốt nhất do Stockfish đề xuất.
- Phân loại khai cuộc, trung cuộc, tàn cuộc.
- Stockfish 18 Lite chạy local ở depth 13 để tính evaluation, centipawn loss, biến chính và phân loại Nước tốt, Sai lầm, Blunder.
- OpenAI viết lời giải thích tiếng Việt dựa trên dữ liệu Stockfish khi người dùng chủ động yêu cầu.
- Dark mode và font Be Vietnam Pro được đóng gói trong app để hỗ trợ tiếng Việt và chạy offline.
- Điều hướng bằng nút, timeline hoặc phím mũi tên trái/phải.

## Cấu hình OpenAI

Mở biểu tượng bánh răng trong app, chọn model và nhập OpenAI API key. Key chỉ được giữ trong bộ nhớ Rust của phiên chạy và bị xoá khi đóng app. Có thể đặt biến môi trường `OPENAI_API_KEY` trước khi mở app để không cần nhập lại.

App mặc định dùng `gpt-5.6-sol`; có thể chọn `gpt-5.6-terra` hoặc `gpt-5.6-luna` để cân bằng chi phí và tốc độ. OpenAI chỉ nhận FEN, nước đi và kết quả engine của bước hiện tại sau khi người dùng bấm **Giải thích bằng OpenAI**.

## Thành phần mã nguồn mở

Stockfish.js 18 Lite Single Thread được phân phối theo GPLv3. Bản quyền và giấy phép nằm trong `public/stockfish/COPYING.txt`; mã nguồn upstream: <https://github.com/nmrugg/stockfish.js>.
