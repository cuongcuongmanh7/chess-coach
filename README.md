# Chess Coach — phân tích cờ vua trực quan

Ứng dụng desktop local dùng Tauri 2, Rust, React, TypeScript, `chess.js`, Stockfish 18 Lite, OpenAI Responses API và Gemini API.

Phiên bản hiện tại: **0.8.0**.

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
- Tự động lưu các ván đã nạp vào Kho ván SQLite cục bộ; sidebar có thumbnail, số nước, badge phân tích toàn ván và thông tin mở gần nhất.
- Highlight nước vừa đi, phản đòn, best move và phương án tốt thứ hai do Stockfish đề xuất.
- Phân loại khai cuộc, trung cuộc, tàn cuộc.
- Stockfish 18 Lite chạy local ở depth 13 cho nước đang xem, dùng MultiPV 2; app phân loại theo mức giảm Expected Points và nhận diện Brilliant bằng tiêu chí hy sinh quân gần tối ưu có điều chỉnh theo Elo.
- Phân tích toàn ván ở depth 11 với tiến độ nền, ACPL, tỷ lệ Brilliant/Best/Tốt, thống kê lỗi theo từng bên và danh sách vị trí then chốt có thể mở trực tiếp.
- Sau phân tích toàn ván, một dòng thống kê gọn dưới bàn cờ đếm chất lượng nước đi của hồ sơ đang chọn.
- Tactical Intelligence nhận diện 10 motif bằng hình học bàn cờ + biến Stockfish, lưu confidence/evidence và đưa nhãn vào Mistake Lab/Dashboard.
- Threat View hiển thị best reply, quân nguy hiểm và quân phòng thủ quan trọng trực tiếp trên bàn cờ mà không gọi AI.
- OpenAI hoặc Gemini viết lời giải thích tiếng Việt dựa trên dữ liệu Stockfish.
- Tổng kết HLV AI kiểm tra bắt buộc số liệu dạng chữ số, tự thử lại một lần và dùng fallback deterministic nếu output vẫn sai.
- Chế độ tự động giải thích Mistake/Blunder hoặc mọi nước đã mở xem.
- Lời giải thích được lưu trong SQLite cục bộ và tái sử dụng khi mở lại vị trí; API key nằm trong Windows Credential Manager, không nằm trong cơ sở dữ liệu.
- Badge chỉ rõ người cầm Trắng, người cầm Đen và bên vừa đi ở mỗi bước.
- Dark mode và font Be Vietnam Pro được đóng gói trong app để hỗ trợ tiếng Việt và chạy offline.
- Điều hướng bằng nút, timeline hoặc phím mũi tên trái/phải.
- Chế độ Thử lại cho phép kéo quân, nhận chấm điểm Stockfish và mở dần ba cấp gợi ý.
- Mistake Lab tự tạo bài từ Mistake/Blunder của hồ sơ đang chọn, chống trùng và dùng được hoàn toàn offline.
- Lịch ôn local hỗ trợ bài đến hạn, bài mới, đã thuộc, đánh dấu sao, tạm ẩn, bộ lọc và thống kê streak.
- Tiến độ Mistake Lab được đồng bộ nhỏ gọn qua Firestore; FEN, best line và lịch sử engine vẫn chỉ nằm trên máy.
- Kết quả Stockfish được lưu theo từng nước trong SQLite; mở lại ván có thể tiếp tục phân tích còn dở.
- Quản lý nhiều hồ sơ Chess.com/Lichess; hồ sơ mặc định là `Chess.com · Cuongkool` và `Lichess · chinsu1409`.
- Kho ván và Dashboard được lọc theo hồ sơ đang chọn; một ván có thể liên kết với nhiều hồ sơ nếu các tài khoản gặp nhau.
- Dashboard tiến bộ của từng hồ sơ tổng hợp ACPL, lỗi theo giai đoạn, màu quân, thể loại và khai cuộc.
- Đồng bộ 20 ván gần nhất cho hồ sơ đang chọn theo thể loại; ván trùng tự bỏ qua.
- Đăng nhập Google và hợp nhất hồ sơ + PGN giữa SQLite local với Cloud Firestore; API key và kết quả Stockfish không được tải lên.
- Đồng bộ Firebase theo thay đổi tăng dần: SQLite giữ hàng đợi bền vững, tự retry khi Firebase tạm mất kết nối và tiếp tục khi app mở lại hoặc mạng hoạt động trở lại.
- Thao tác xoá dùng tombstone trên Firestore để truyền sang các thiết bị khác và ngăn thiết bị cũ tải lại ván hoặc hồ sơ đã xoá.
- Mỗi Firebase UID dùng một file SQLite riêng. Kho local cũ chỉ được chuyển một lần cho tài khoản đầu tiên sở hữu nó; đổi tài khoản không tự động trộn dữ liệu giữa các UID.
- Hiển thị tên khai cuộc và biến ECO theo vị trí đang xem bằng bộ dữ liệu offline; Kho ván được sắp theo thời điểm thi đấu và dùng ngày giờ Việt Nam.
- Bấm vào một phương án Stockfish để phát lại biến trực tiếp trên bàn cờ.
- Đọc `%clk` trong PGN để thống kê thời gian suy nghĩ, lỗi đi quá nhanh và lỗi dưới áp lực thời gian.
- Nội dung HLV dài cuộn độc lập, giữ cụm nút Trước/Tiếp luôn hiển thị ở cuối khung.

## Cấu hình AI

Mở biểu tượng bánh răng trong app, chọn OpenAI hoặc Gemini, chọn model và nhập API key. Key được lưu trong Windows Credential Manager và giữ lại khi nâng cấp ứng dụng; app không tải key lên cloud.

- Gemini mặc định dùng `gemini-3.5-flash-lite`; có thể chọn `gemini-3.6-flash`.
- OpenAI hỗ trợ `gpt-5.6-sol`, `gpt-5.6-terra` và `gpt-5.6-luna`.
- Có thể dùng biến môi trường `GEMINI_API_KEY`, `GOOGLE_API_KEY` hoặc `OPENAI_API_KEY`.
- Mặc định app tự giải thích các nước được Stockfish phân loại Sai lầm hoặc Blunder. Có thể đổi sang mọi nước đã xem hoặc tắt tự động trong Cài đặt.

## Cấu hình Firebase

1. Trong Firebase Authentication, bật provider **Google**.
2. Tạo Cloud Firestore ở production mode và deploy file `firestore.rules`.
3. Tạo một Firebase Web App, sao chép `.env.example` thành `.env.local` rồi điền các giá trị `VITE_FIREBASE_*`.
4. Chạy lại `npm run tauri dev`. Nút tài khoản trên thanh đầu sẽ mở Google Sign-In và tự đồng bộ sau khi đăng nhập.

Rules trong repo chỉ cho phép người dùng đã xác thực đọc/ghi đường dẫn `users/{uid}` của chính họ. `.env.local` không được commit; Firebase Web config không thay thế Security Rules.

Schema cloud hiện tại là phiên bản 3. Lần đồng bộ đầu sau khi nâng cấp sẽ đọc dữ liệu schema cũ, đưa các mục local hiện có vào hàng đợi một lần và bổ sung metadata `updatedAt` cần cho các lần đồng bộ tăng dần sau đó. Tombstone được giữ trên Firestore để thiết bị offline lâu ngày vẫn nhận được thao tác xoá.

Các kho theo tài khoản được lưu dưới tên băm SHA-256 trong thư mục dữ liệu ứng dụng; Firebase UID không được dùng trực tiếp làm tên file. Khi đăng xuất, app quay về kho local khách, còn kho của tài khoản vẫn được giữ nguyên để mở lại ở lần đăng nhập sau.

## Thành phần mã nguồn mở

Stockfish.js 18 Lite Single Thread được phân phối theo GPLv3. Bản quyền và giấy phép nằm trong `public/stockfish/COPYING.txt`; mã nguồn upstream: <https://github.com/nmrugg/stockfish.js>.

Tên khai cuộc được tạo từ bộ dữ liệu `lichess-org/chess-openings`, phát hành theo CC0: <https://github.com/lichess-org/chess-openings>. Có thể cập nhật bản dữ liệu đóng gói bằng `npm run update-openings`.
