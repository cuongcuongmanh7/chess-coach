# Quy tắc phát triển Chess Coach

## Phạm vi

Các quy tắc này áp dụng cho toàn bộ repository. Mục tiêu là giữ code theo feature, dễ kiểm thử và ngăn các file trung tâm tiếp tục phình lớn.

## Trước khi sửa

- Với thay đổi logic, schema, luồng dữ liệu hoặc kiến trúc, phải mô tả phương án và hỏi xác nhận trước khi sửa.
- Không ghi đè hoặc dọn các thay đổi đang dở không thuộc phạm vi công việc.
- Trước khi thêm code mới, tìm module chịu trách nhiệm đúng; không mặc định thêm vào `src/App.tsx`, `src-tauri/src/lib.rs` hoặc `src/styles.css`.

## Giới hạn kích thước

- Mục tiêu thông thường: không quá 300 dòng cho một file source.
- Giới hạn cứng: không quá 500 dòng cho file TypeScript, TSX, Rust, JavaScript và CSS.
- Component React hoặc hàm dài hơn 80 dòng phải được xem xét tách; nếu giữ lại phải có lý do về tính kết dính.
- File generated, vendor, dữ liệu đóng gói và fixture lớn được miễn, nhưng không được đặt logic sản phẩm vào các vùng miễn này.
- Các file lớn tồn tại từ trước được ghi trong baseline của `scripts/check-code-size.mjs`:
  - không được tăng quá baseline;
  - khi refactor làm file nhỏ đi đáng kể, phải hạ baseline trong cùng thay đổi;
  - sau milestone v0.6.2 phải xóa ngoại lệ tương ứng.
- Không tạo ngoại lệ mới nếu chưa có xác nhận và lý do được ghi trong tài liệu kiến trúc.

## Kiến trúc frontend

- `App.tsx` chỉ làm nhiệm vụ app shell, layout cấp cao, routing/view switching và ghép feature.
- Mỗi tính năng mới nằm trong `src/features/<feature>/`.
- Một feature nên tách rõ:
  - `components/`: UI;
  - `hooks/`: state và orchestration phía React;
  - `services/`: gọi Tauri, Firebase, Stockfish hoặc API;
  - `types.ts`: kiểu dữ liệu public của feature;
  - `utils.ts`: hàm thuần.
- Thành phần dùng chung nằm trong `src/shared/`; không import ngược từ shared vào feature cụ thể.
- Không trộn UI, persistence, Stockfish và network request trong cùng một component.
- Không thêm modal lớn trực tiếp vào `App.tsx`; mỗi modal là component riêng.
- State chỉ dùng cho một feature phải nằm trong hook/provider của feature đó.

## Kiến trúc Rust/Tauri

- `src-tauri/src/lib.rs` chỉ giữ bootstrap, state cấp ứng dụng và đăng ký command.
- Tauri command được nhóm theo domain trong `commands/`.
- Truy cập SQLite và migration nằm trong `db/`.
- Kiểu request/response dùng chung nằm trong `models/`.
- Logic tích hợp Chess.com, Lichess, OpenAI, Gemini và đồng bộ cloud nằm trong `services/`.
- Command chỉ validate input, gọi service/repository và ánh xạ lỗi; không chứa query dài hoặc business logic phức tạp.
- Migration phải có phiên bản, chạy lặp an toàn và có test nâng cấp từ schema cũ.

## CSS

- `src/styles.css` chỉ giữ design tokens, reset, app shell và rule thực sự dùng chung.
- Style của feature nằm cạnh feature hoặc trong file CSS riêng của feature.
- Không tăng specificity bằng chuỗi selector dài để vá giao diện; ưu tiên class có trách nhiệm rõ.
- Màu sắc, spacing, radius và typography dùng token thay vì lặp literal không cần thiết.

## Chất lượng và kiểm tra

- Mọi tính năng mới cần test cho phần logic thuần; bug fix cần fixture hoặc regression test khi khả thi.
- Chạy trước khi bàn giao:

```powershell
npm run check:code-size
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

- Nếu thay đổi bundle hoặc icon, chạy thêm `npm run tauri build`.
- Không coi việc build thành công là đủ nếu `check:code-size` thất bại.

## Definition of Done cho refactor

- Không thay đổi hành vi người dùng ngoài phạm vi đã xác nhận.
- Không mất dữ liệu SQLite hoặc thay đổi cache key ngoài kế hoạch migration.
- Module mới có tên theo domain, không dùng các tên chung chung như `helpers2`, `misc` hoặc `utils-new`.
- Không để lại cả code cũ và code mới cùng hoạt động.
- Cập nhật `docs/ROADMAP.md` khi hoàn thành một milestone hoặc thay đổi giới hạn kiến trúc.
