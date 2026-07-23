# Chess Coach — Kế hoạch phát triển sản phẩm

> Trạng thái: Hoàn thành Mistake Lab
> Mốc hiện tại: v0.7.0
> Cập nhật: 2026-07-23
> Phạm vi: ứng dụng desktop local-first trên Windows

## 1. Mục tiêu sản phẩm

Chess Coach không chỉ chỉ ra nước sai mà phải tạo được vòng lặp học tập:

1. Nạp và phân tích ván thật.
2. Xác định chính xác thời điểm người chơi mất lợi thế.
3. Giải thích ngắn, đúng màu quân và đúng dữ liệu Stockfish.
4. Biến lỗi thành bài tập có thể làm lại.
5. Theo dõi xem lỗi đó đã được khắc phục hay chưa.
6. Dùng lịch sử cá nhân để đề xuất nội dung luyện tập tiếp theo.

Đối tượng chính là người chơi khoảng 800–1800 Elo muốn học từ chính các ván Chess.com/Lichess của mình.

## 2. Nguyên tắc phát triển

- **Stockfish là nguồn sự thật:** LLM chỉ diễn đạt và hướng dẫn, không tự quyết định nước tốt nhất hay nhãn lỗi.
- **Local-first:** PGN, kết quả engine, lịch ôn và API key ưu tiên xử lý trên máy.
- **Không bắt buộc AI:** Phân tích, biểu đồ và luyện tập cơ bản phải dùng được khi chưa cấu hình API.
- **Tái sử dụng dữ liệu:** Không chạy lại Stockfish hoặc gọi lại AI nếu dữ liệu cùng phiên bản đã được lưu.
- **Dạy một việc mỗi lần:** Mỗi vị trí chỉ nên nhấn mạnh một lỗi và một kế hoạch sửa.
- **Phù hợp Elo:** Cách giải thích thay đổi theo trình độ nhưng dữ liệu cờ không thay đổi.
- **Có thể kiểm chứng:** Mọi mũi tên, nhãn tactic và lời giải thích phải truy ngược được về FEN, nước đi và biến Stockfish.
- **Không làm nặng giao diện:** Bàn cờ, nước hiện tại và hành động tiếp theo luôn là trọng tâm.

## 3. Hiện trạng v0.6.0

App hiện đã có:

- Nạp PGN, link Chess.com và đồng bộ các ván gần đây từ Chess.com/Lichess.
- Kho ván SQLite, nhiều hồ sơ người chơi và đồng bộ hồ sơ/PGN qua Firestore.
- Stockfish 18 Lite local, MultiPV 2, cache theo từng ply và phân tích toàn ván.
- Phân loại Best, Tốt, Thiếu chính xác, Sai lầm và Blunder.
- ACPL, tỷ lệ Best/Tốt, thống kê theo màu quân, giai đoạn, khai cuộc và thời gian suy nghĩ.
- OpenAI/Gemini, cache lời giải thích và tổng kết AI.
- Timeline, evaluation bar, best line, phương án thứ hai và phát lại biến trên bàn cờ.
- Chế độ Thử lại với kéo quân, chấm điểm và ba cấp gợi ý.
- Tên khai cuộc/ECO offline và Dashboard theo hồ sơ.

Khoảng trống chính:

- Chế độ Thử lại chưa trở thành kho bài tập dài hạn.
- Chưa có lịch ôn hoặc cơ chế spaced repetition.
- Chưa có biểu đồ evaluation theo toàn bộ nước đi trong một ván.
- Chưa hỏi HLV theo ngữ cảnh hoặc so sánh nước do người dùng tự chọn.
- `tags_json` đã có trong dữ liệu engine nhưng chưa có bộ nhận diện tactic đáng tin cậy.
- Chưa có repertoire/opening trainer cá nhân hóa.
- Chưa xuất PGN có comment, NAG và cây biến phân tích.

## 4. Roadmap tổng thể

| Phiên bản | Chủ đề | Kết quả chính | Ước lượng một lập trình viên |
|---|---|---|---:|
| 0.6.1 ✅ | Code Freeze & Guardrails | Chặn file lớn tiếp tục phình, thêm rule và kiểm tra tự động | Hoàn thành 2026-07-23 |
| 0.6.2 ✅ | Modularization | Tách frontend, Rust, CSS và chuẩn hóa migration | Hoàn thành 2026-07-23 |
| 0.7.0 ✅ | Mistake Lab | Kho bài tập cá nhân + spaced repetition | Hoàn thành 2026-07-23 |
| 0.7.1 | Game Story | Biểu đồ evaluation/thời gian và key moments | 4–6 ngày |
| 0.8.0 | Ask Coach | Hỏi đáp theo vị trí và so sánh candidate move | 6–9 ngày |
| 0.8.1 | Tactical Tags | Nhận diện tactic bằng logic cờ, không dựa vào LLM | 6–10 ngày |
| 0.9.0 | Opening Trainer | Repertoire cá nhân và luyện nước đi lệch theory | 10–15 ngày |
| 1.0.0 | Study Workspace | PGN có chú thích, cây biến và trải nghiệm ổn định | 10–15 ngày |

Ước lượng không gồm thời gian phát hành Microsoft Store hoặc mobile.

## 5. Phase 0 — Làm sạch codebase trước tính năng mới

Phase này là cổng bắt buộc. Không bắt đầu Mistake Lab hoặc tính năng sản phẩm mới cho đến khi hoàn thành v0.6.2.

### Hiện trạng đo ngày 2026-07-23

| File | Số dòng | Vấn đề chính |
|---|---:|---|
| `src-tauri/src/lib.rs` | 3.759 | Command, model, SQLite, migration và service ngoài cùng một file |
| `src/App.tsx` | 2.597 | UI, state, orchestration, modal và luồng nhiều feature trộn lẫn |
| `src/styles.css` | 798 | Style toàn app tập trung, khó xác định ownership |
| `src/firebase.ts` | 386 | Đang gần ngưỡng cảnh báo, cần tách auth và sync |

### Milestone 0.6.1 — Code Freeze & Guardrails

**Trạng thái:** Hoàn thành ngày 2026-07-23.

#### Mục tiêu

Ngăn nợ kỹ thuật tiếp tục tăng trong lúc chuẩn bị tái cấu trúc.

#### Phạm vi

- Tạo `AGENTS.md` ở repository root với quy tắc kiến trúc và kích thước file.
- Thêm `npm run check:code-size`.
- Ngưỡng:
  - mục tiêu 300 dòng/file;
  - giới hạn cứng 500 dòng cho TS, TSX, Rust, JavaScript và CSS;
  - component/hàm trên 80 dòng phải xem xét tách.
- Tạo baseline tạm thời cho ba file đã vượt giới hạn:
  - `src/App.tsx`;
  - `src-tauri/src/lib.rs`;
  - `src/styles.css`.
- Baseline chỉ được giữ nguyên hoặc giảm, không được tăng.
- File mới không được thêm vào baseline nếu chưa có xác nhận và lý do kiến trúc.
- Generated, vendor, dữ liệu đóng gói và fixture được miễn kiểm tra.

#### Tiêu chí nghiệm thu

- `npm run check:code-size` chạy thành công trên codebase hiện tại.
- Thêm dòng vượt baseline vào một file nợ cũ làm lệnh kiểm tra thất bại.
- Tạo file source mới trên 500 dòng làm lệnh kiểm tra thất bại.
- Rule chỉ ra rõ nơi đặt component, hook, service, Tauri command, database và CSS.
- Không thay đổi hành vi ứng dụng.

### Milestone 0.6.2 — Modularization

**Trạng thái:** Hoàn thành ngày 2026-07-23.

### Mục tiêu

Làm sạch codebase, xác lập ownership theo domain và giảm rủi ro trước khi thêm trạng thái luyện tập mới.

### Phạm vi

- Tách frontend theo cấu trúc mục tiêu:

```text
src/
  app/
    App.tsx
  features/
    analysis/
    coach/
    dashboard/
    library/
    profiles/
    settings/
    training/
  shared/
    components/
    hooks/
    services/
    types/
```

- `App.tsx` chỉ giữ app shell, layout cấp cao và điều phối view; mục tiêu dưới 300 dòng.
- Mỗi feature tách rõ component, hook, service và types.
- Tách Rust theo cấu trúc mục tiêu:

```text
src-tauri/src/
  lib.rs
  commands/
  db/
    migrations/
    repositories/
  models/
  services/
```

- `lib.rs` chỉ giữ bootstrap, state cấp ứng dụng và đăng ký command; mục tiêu dưới 250 dòng.
- Tauri command chỉ validate, gọi service/repository và ánh xạ lỗi.
- Tách CSS:
  - `styles.css` chỉ giữ tokens, reset và app shell;
  - style theo feature nằm cạnh feature;
  - không file CSS nào vượt 500 dòng.
- Tách `firebase.ts` thành auth, cloud snapshot/merge và profile sync.
- Tạo lớp truy cập lệnh Tauri có kiểu dữ liệu TypeScript thống nhất.
- Bổ sung cơ chế phiên bản schema SQLite thay cho danh sách `ALTER TABLE` rời rạc.
- Chuẩn hóa khóa cache engine:
  - phiên bản Stockfish;
  - depth;
  - MultiPV;
  - FEN hoặc `game_id + ply`.
- Tạo bộ PGN fixture:
  - khai cuộc ngắn;
  - ván có nhập thành và en passant;
  - thăng cấp;
  - mate;
  - ván có `%clk`;
  - ván có Mistake/Blunder rõ ràng.
- Sao lưu database trước migration có thay đổi cấu trúc đáng kể.
- Mỗi đợt tách file phải nhỏ, có thể review và không trộn với tính năng mới.
- Sau khi một file nợ cũ xuống dưới giới hạn cứng, xóa entry baseline tương ứng ngay.

### Tiêu chí nghiệm thu

- Giao diện và hành vi v0.6.0 không thay đổi.
- Mở database cũ không mất PGN, hồ sơ, kết quả engine hoặc cache AI.
- `App.tsx` không quá 300 dòng.
- `lib.rs` không quá 250 dòng.
- Không còn file source vượt 500 dòng ngoài vùng generated/vendor/fixture.
- Không còn baseline nợ cũ trong script kiểm tra.
- `npm run check:code-size`, `npm run build`, `cargo check` và build Tauri đều thành công.
- Có test cho migration và ít nhất năm PGN fixture.

## 6. Milestone 0.7.0 — Mistake Lab

**Trạng thái:** Hoàn thành ngày 2026-07-23.

**Ghi chú triển khai:** Training card được tạo local sau phân tích toàn ván, dùng khóa ổn định theo hồ sơ/ván/ply/engine. Lịch ôn, lịch sử làm bài và bộ lọc nằm trong SQLite schema v3; Firestore chỉ nhận tiến độ nhỏ gọn, không nhận FEN, engine line hoặc PGN.

### Câu chuyện người dùng

> Sau khi phân tích một ván, tôi muốn các Sai lầm/Blunder của mình tự xuất hiện thành bài tập để tôi có thể luyện lại cho đến khi nhớ được ý tưởng đúng.

### Luồng chính

1. Phân tích toàn ván hoàn tất.
2. App tạo training card cho các nước thuộc bên của hồ sơ đang chọn.
3. Người dùng mở Mistake Lab và thấy số bài đến hạn.
4. Bàn cờ mở ở vị trí trước nước sai, không hiển thị best move.
5. Người dùng đi một candidate move.
6. Stockfish chấm candidate move và yêu cầu tiếp tục thêm 1–2 ply nếu nước đầu đúng.
7. Kết thúc bài, người dùng nhận:
   - kết quả;
   - ý tưởng chính;
   - nước đã đi trong ván;
   - best line;
   - lịch ôn tiếp theo.

### Phạm vi chức năng

- Tự tạo bài từ Mistake/Blunder; cho phép bật thêm Thiếu chính xác.
- Chỉ tạo bài cho màu quân của hồ sơ liên kết với ván.
- Tránh bài trùng bằng `profile_id + game_id + ply + engine_version`.
- Ba cấp gợi ý:
  1. ý tưởng hoặc motif;
  2. quân nên cân nhắc;
  3. mũi tên nước tốt nhất.
- Bộ lọc:
  - đến hạn;
  - mới;
  - đã thuộc;
  - khai cuộc;
  - giai đoạn;
  - màu quân;
  - nhãn tactic;
  - time class;
  - khoảng ngày.
- Đánh dấu sao và tạm ẩn bài không hữu ích.
- Thống kê:
  - số bài đã làm;
  - tỷ lệ đúng lần đầu;
  - số gợi ý trung bình;
  - streak;
  - số lỗi đã chuyển sang trạng thái “đã thuộc”.

### Thuật toán lịch ôn v1

Không cần triển khai SM-2 đầy đủ ngay từ đầu. Dùng lịch dễ giải thích:

| Kết quả | Lịch tiếp theo |
|---|---|
| Sai hoặc xem gợi ý 3 | 10 phút |
| Đúng sau nhiều lần/gợi ý | 1 ngày |
| Đúng lần đầu nhưng chậm | 3 ngày |
| Đúng lần đầu, không gợi ý | 7 ngày |
| Tiếp tục đúng | Nhân khoảng cách với 2 |

Giới hạn khoảng cách tối đa 90 ngày. Một bài được coi là “đã thuộc” sau ba lần đúng liên tiếp ở ba ngày khác nhau.

### Dữ liệu đề xuất

```sql
CREATE TABLE training_cards (
  id TEXT PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  ply INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  fen TEXT NOT NULL,
  side_to_move TEXT NOT NULL,
  played_move TEXT NOT NULL,
  best_move TEXT NOT NULL,
  best_line_json TEXT NOT NULL,
  quality TEXT NOT NULL,
  centipawn_loss REAL NOT NULL,
  phase TEXT NOT NULL,
  opening TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  due_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 0,
  correct_streak INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(profile_id, game_id, ply, engine_version)
);

CREATE TABLE training_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  attempted_move TEXT,
  result TEXT NOT NULL,
  centipawn_loss REAL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  attempted_at TEXT NOT NULL
);
```

### Chính sách đồng bộ

- Engine line, FEN và PGN vẫn local.
- Firestore chỉ đồng bộ tiến độ nhỏ gọn nếu người dùng đăng nhập:
  - `card_id`;
  - `status`;
  - `due_at`;
  - `interval_days`;
  - streak;
  - số lần làm;
  - starred/suspended.
- Khi hai máy xung đột, ưu tiên bản có `updated_at` mới hơn; không cộng dồn attempts nếu chưa có event log.

### Tiêu chí nghiệm thu

- Sau phân tích toàn ván, bài tập được tạo mà không gọi LLM.
- Mở lại app vẫn giữ lịch ôn và lịch sử làm bài.
- Không tạo trùng khi phân tích lại cùng ván.
- Candidate move bất hợp lệ không làm thay đổi tiến độ.
- Bài chỉ được đánh dấu đúng khi candidate nằm trong ngưỡng Best/Tốt đã cấu hình.
- Có thể dùng Mistake Lab hoàn toàn offline.

## 7. Milestone 0.7.1 — Biểu đồ diễn biến ván

### Phạm vi

- Biểu đồ evaluation theo từng ply, luôn quy về góc nhìn Trắng.
- Mate score được ánh xạ ra biên biểu đồ và hiển thị ký hiệu mate riêng.
- Marker theo chất lượng nước:
  - Best/Tốt;
  - Thiếu chính xác;
  - Sai lầm;
  - Blunder.
- Bấm hoặc dùng phím trái/phải trên điểm biểu đồ để nhảy đến vị trí tương ứng.
- Overlay tùy chọn:
  - thời gian suy nghĩ;
  - lỗi đi nhanh;
  - lỗi dưới áp lực thời gian.
- Danh sách key moments được tạo từ:
  - thay đổi evaluation lớn;
  - mate xuất hiện hoặc bị bỏ lỡ;
  - đổi trạng thái thắng/hòa/thua;
  - promotion hoặc passed pawn nguy hiểm.

### Yêu cầu kỹ thuật

- Dùng dữ liệu `engine_analyses.result_json` đã lưu, không chạy engine lại.
- Chuẩn hóa mate score để đồ thị không bị vỡ tỉ lệ.
- Tooltip phải cho biết số nước, SAN, evaluation, CPL và thời gian suy nghĩ.
- Biểu đồ vẫn đọc được với ván 150 ply.

### Tiêu chí nghiệm thu

- Điểm biểu đồ và timeline luôn nhảy tới cùng một ply.
- Không đảo dấu evaluation khi người dùng xoay bàn.
- Ván thiếu `%clk` vẫn hiển thị biểu đồ evaluation bình thường.
- Biểu đồ xuất hiện ngay khi cache phân tích toàn ván đã đủ.

## 8. Milestone 0.8.0 — Ask Coach và candidate move

### Câu chuyện người dùng

> Tôi muốn hỏi vì sao một nước sai, đối thủ đang đe dọa gì hoặc thử một nước khác mà không phải tự đọc biến engine.

### Hành động nhanh

- Tại sao nước này sai?
- Đối thủ đang đe dọa gì?
- Ý tưởng của best move là gì?
- Nếu tôi đi nước khác thì sao?
- So sánh hai candidate move.
- Kế hoạch thực tế trong ba nước tới là gì?

### Luồng candidate move

1. Người dùng bật “Thử phương án”.
2. Kéo một nước hợp lệ trên bàn.
3. Stockfish phân tích candidate ở cùng depth với best move.
4. UI hiển thị ngay:
   - evaluation trước/sau;
   - CPL;
   - best reply;
   - so sánh với best move.
5. Nếu có API key, LLM giải thích sau bằng dữ liệu đã khóa.

### Nguyên tắc prompt

- Gửi FEN, bên tới lượt, nước candidate, best move, hai evaluation và hai biến ngắn.
- Không yêu cầu LLM tự tính nước.
- Không cho phép LLM thêm biến không có trong input.
- Câu trả lời phải nêu rõ quân Trắng/Đen khi có nguy cơ nhầm chủ thể.
- Có `prompt_version` riêng cho từng loại câu hỏi.

### Cache

Khóa cache gồm:

```text
provider + model + prompt_version + FEN + question_type + candidate_moves + engine_version + depth
```

Các câu hỏi preset có thể cache lâu dài. Câu hỏi tự do lưu theo thread nhưng không tự tái sử dụng nếu nội dung khác.

### Dữ liệu đề xuất

```sql
CREATE TABLE coach_threads (
  id TEXT PRIMARY KEY,
  game_id TEXT,
  ply INTEGER,
  fen TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE coach_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  created_at TEXT NOT NULL
);
```

Không đồng bộ API key. Việc đồng bộ lịch sử chat mặc định tắt ở phiên bản đầu.

### Tiêu chí nghiệm thu

- Stockfish trả so sánh candidate ngay cả khi chưa có API key.
- LLM không được gọi khi candidate bất hợp lệ.
- Đổi vị trí trong lúc AI đang trả lời không gắn câu trả lời vào sai ply.
- Mở lại vị trí hiển thị lại câu trả lời đã cache.
- Có nút hủy hoặc bỏ qua khi request AI chậm.

## 9. Milestone 0.8.1 — Tactical Tags và Threat View

### Mục tiêu

Gắn nhãn tactic bằng logic cờ có thể kiểm tra, sau đó dùng LLM để diễn đạt. Không dùng LLM làm bộ phát hiện tactic.

### Nhãn v1

- Check và mate threat.
- Missed capture.
- Hanging piece.
- Fork/double attack.
- Absolute pin.
- Skewer.
- Discovered attack/check.
- Back-rank weakness.
- Passed pawn/promotion threat.
- Removal of defender.

### Pipeline phát hiện

1. Dựng attack map trước và sau nước candidate/best move.
2. Đọc tối đa 3–5 ply đầu của best line.
3. Xác định thay đổi material và quân bị tấn công/phòng thủ.
4. Kiểm tra khả năng bắt lại để giảm false positive.
5. Chỉ gắn motif nếu:
   - có đủ điều kiện hình học;
   - biến engine thể hiện motif;
   - chênh lệch evaluation vượt ngưỡng phù hợp.
6. Lưu nhãn và confidence vào `engine_analyses.tags_json`.

### Threat View

- Toggle “Đe dọa của đối thủ”.
- Mũi tên đỏ: best reply hoặc threat chính.
- Viền đỏ: quân đang treo/nguy hiểm.
- Viền xanh: quân phòng thủ quan trọng.
- Tooltip ngắn, không gọi AI.

### Tiêu chí nghiệm thu

- Có unit test theo từng motif với FEN cố định.
- Không báo fork nếu cả hai mục tiêu đều được bảo vệ và không có lợi material/evaluation.
- Không báo missed capture nếu biến engine cho thấy quân bắt sẽ mất ngay mà không có bù đắp.
- Nhãn tactic được dùng làm bộ lọc trong Mistake Lab và Dashboard.

## 10. Milestone 0.9.0 — Opening Trainer cá nhân hóa

### Chiến lược

Không bắt đầu bằng việc dạy toàn bộ cơ sở dữ liệu khai cuộc. Bắt đầu từ những opening người dùng thực sự chơi.

### Nguồn repertoire

- Các ván đã lưu của hồ sơ.
- Tên opening/ECO offline hiện có.
- Best line Stockfish tại điểm lệch theory.
- Biến người dùng tự thêm hoặc đánh dấu.
- Opening explorer online là tùy chọn sau, không phải yêu cầu của v0.9.0.

### Luồng luyện

1. Chọn Trắng hoặc Đen.
2. Chọn opening/repertoire.
3. App tự đi nước đối phương theo cây biến.
4. Người dùng đi nước đã học.
5. Khi đi lệch:
   - quay lại repertoire;
   - xem giải thích;
   - lưu candidate thành biến phụ;
   - tiếp tục sang chế độ phân tích tự do.
6. Tiến độ được lưu theo node của cây biến.

### Ưu tiên nội dung

- Đường người dùng đã gặp nhiều lần.
- Nước từng gây CPL lớn.
- Biến chưa ôn lâu.
- Biến có tỷ lệ nhớ thấp.
- Opening xuất hiện thường xuyên trong time class đang chọn.

### Dữ liệu đề xuất

- `repertoires`: hồ sơ, màu, tên, ECO.
- `repertoire_nodes`: FEN/key vị trí, move, parent, source, comment.
- `repertoire_progress`: lần đúng/sai, due_at, interval.

### Tiêu chí nghiệm thu

- Tạo repertoire nhỏ từ lịch sử người dùng mà không cần mạng.
- Luyện được cả Trắng và Đen.
- Một vị trí có thể có nhiều nước repertoire hợp lệ.
- Đi lệch không làm hỏng session và có lựa chọn quay lại.
- Tiến độ được lưu riêng theo hồ sơ.

## 11. Milestone 1.0.0 — Study Workspace và PGN có chú thích

### Phạm vi

- Comment tiếng Việt theo từng nước.
- NAG chuẩn:
  - `!`, `?`, `??`;
  - hoặc `$1`, `$2`, `$4` khi xuất PGN.
- Best line và phương án thứ hai là variation, không ghi đè mainline.
- Cho phép người dùng thêm/sửa ghi chú riêng.
- Cây biến có thể mở, thu gọn và phát lại trên bàn cờ.
- Export:
  - PGN gốc;
  - PGN có Stockfish;
  - PGN học tập có Stockfish + AI + ghi chú người dùng.
- Import lại PGN có comment/variation mà không làm mất cấu trúc.

### Spike kỹ thuật bắt buộc

`chess.js` phù hợp cho luật cờ và mainline nhưng không nên tự viết parser variation phức tạp trong UI. Trước khi triển khai cần thử nghiệm một PGN AST parser có:

- comment;
- NAG;
- nested variation;
- custom FEN;
- round-trip import/export ổn định;
- giấy phép phù hợp.

### Tiêu chí nghiệm thu

- Export rồi import lại giữ mainline, comment và ít nhất hai tầng variation.
- Click một node trong cây biến dựng đúng FEN.
- Ghi chú người dùng không bị AI ghi đè.
- PGN xuất ra mở được trên Lichess/Chess.com hoặc công cụ PGN phổ biến.

## 12. Tính năng để sau 1.0

### Local LLM qua Ollama

Lợi ích:

- không phụ thuộc quota;
- dữ liệu không rời khỏi máy;
- có thể dùng khi offline.

Rủi ro:

- yêu cầu RAM/VRAM;
- cài thêm runtime và model;
- chất lượng tiếng Việt/chess không đồng đều;
- thời gian phản hồi chậm trên máy phổ thông.

Nên triển khai dưới dạng provider thử nghiệm, không đóng gói model vào installer.

### Human-like opponent

Có thể nghiên cứu Maia hoặc engine giới hạn Elo để tạo đối thủ mắc lỗi giống người chơi. Chưa ưu tiên vì mục tiêu hiện tại là học từ ván thật, không phải nền tảng chơi cờ.

### Auto-sync chạy nền

Chỉ nên làm sau khi:

- có hàng đợi phân tích ổn định;
- có kiểm soát CPU;
- có lịch chạy và nút tạm dừng;
- không làm chậm app khi người dùng đang xem ván.

### Coach personality

Có thể thêm giọng “ngắn gọn”, “nghiêm khắc” hoặc “giải thích cho người mới”, nhưng không nên tạo nhiều nhân vật trước khi chất lượng nội dung cờ ổn định.

## 13. Ngoài phạm vi hiện tại

- Huấn luyện hoặc fine-tune engine riêng.
- Gắn nhãn Brilliant/Great chỉ để tạo hiệu ứng.
- So sánh nhiều engine trong cùng một vị trí.
- Tournament/server multiplayer.
- Mobile app chính thức.
- Mạng xã hội, leaderboard hoặc hệ thống bạn bè.
- Đồng bộ API key lên cloud.

## 14. Kế hoạch test

### Unit test

- Lịch spaced repetition.
- Sinh `training_card` và chống trùng.
- Candidate move hợp lệ/không hợp lệ.
- Cache key.
- Chuẩn hóa evaluation và mate score.
- Tactical motif theo FEN fixture.
- Round-trip PGN AST.

### Integration test

- Migration SQLite từ database v0.6.0.
- Phân tích toàn ván → tạo bài tập → làm bài → mở lại app.
- Hồ sơ Chess.com/Lichess chỉ thấy đúng bài của mình.
- Đồng bộ tiến độ Firestore không tải engine line hoặc API key.
- Cache AI không gắn nhầm game/ply.

### E2E

- Nạp PGN và phân tích.
- Mở key moment từ biểu đồ.
- Làm bài đến hạn trong Mistake Lab.
- So sánh candidate move.
- Export PGN có chú thích.

### Ngân sách hiệu năng

- Mở Kho ván: dưới 500 ms với 1.000 ván local.
- Mở Mistake Lab: dưới 500 ms với 10.000 training cards.
- Chuyển ply đã cache: phản hồi giao diện dưới 100 ms.
- Vẽ biểu đồ 300 ply: dưới 200 ms.
- Không chạy quá một tác vụ Stockfish nặng cùng lúc trên bản Lite single-thread.

## 15. Telemetry và quyền riêng tư

- Mặc định không gửi analytics.
- API key chỉ nằm trong bộ nhớ phiên hoặc biến môi trường.
- Firestore không nhận:
  - API key;
  - cache AI;
  - kết quả Stockfish chi tiết;
  - lịch sử chat nếu người dùng chưa bật.
- Có nút:
  - xem dữ liệu local;
  - export backup;
  - xóa cache AI;
  - xóa tiến độ luyện;
  - xóa dữ liệu cloud.

## 16. Rủi ro và cách giảm thiểu

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| LLM bịa tactic | Người dùng học sai | Phát hiện bằng logic cờ/Stockfish; LLM chỉ diễn đạt |
| Stockfish Lite depth thấp | Nhãn nước dao động | Lưu depth/version; dùng ngưỡng; cho phân tích sâu lại |
| Database lớn dần | Khởi động và Dashboard chậm | Index, pagination, query theo hồ sơ/ngày |
| App.tsx quá lớn | Sửa một tính năng làm hỏng phần khác | Hoàn thành milestone 0.6.1 trước |
| Lịch ôn gây quá tải | Người dùng bỏ cuộc | Giới hạn bài mới/ngày và có nút hoãn |
| Cloud conflict | Mất tiến độ | `updated_at`, backup và merge có quy tắc rõ |
| Giấy phép repo tham khảo | Ảnh hưởng phát hành | Học ý tưởng; không chép code GPL/AGPL nếu chưa đánh giá |
| AI quota/timeout | Trải nghiệm bị ngắt | Stockfish/rule fallback, cache và nút thử lại |

## 17. Chỉ số thành công

Không dùng số lượt gọi AI làm thước đo chính. Theo dõi local:

- Tỷ lệ người dùng hoàn tất phân tích toàn ván.
- Số training card được tạo và được làm.
- Tỷ lệ đúng lần đầu theo tuần.
- Tỷ lệ lỗi lặp lại cùng opening/tactical tag.
- Số bài chuyển sang “đã thuộc”.
- ACPL trung bình theo 20 ván gần nhất.
- Tỷ lệ Mistake/Blunder khi đi nhanh so với đi đủ thời gian.

Nếu có analytics trong tương lai, chỉ gửi dữ liệu tổng hợp khi người dùng chủ động đồng ý.

## 18. Thứ tự triển khai khuyến nghị

1. Khóa code-size và áp dụng rule kiến trúc.
2. Tách module frontend, Rust, CSS và chuẩn hóa migration.
3. Mistake Lab với lịch ôn đơn giản.
4. Biểu đồ evaluation và key moments.
5. Ask Coach + candidate move.
6. Tactical Tags + Threat View.
7. Opening Trainer cá nhân.
8. PGN annotation và cây biến.
9. Ổn định, backup, test và phát hành 1.0.

Không bắt đầu tính năng mới trước khi hoàn tất phase 0. Sau phase 0, không nên làm Opening Trainer hoặc PGN tree trước Mistake Lab vì hai tính năng đó tạo thêm bề rộng, trong khi Mistake Lab tạo vòng lặp giá trị cốt lõi cho sản phẩm.

## 19. Nguồn tham khảo

- [Blunder Tutor](https://github.com/MrLokans/chess-blunder-trainer): biến lỗi thật thành puzzle, spaced repetition, bộ lọc và dashboard. Repo dùng AGPL-3.0.
- [AI Chess Tutor](https://github.com/stefan-kp/chess_tutor): opening trainer, tactical recognition, chat theo vị trí và xử lý khi đi lệch theory. Source dùng GPL-3.0.
- [LLM-ChessCoach](https://github.com/ai-chess-training/LLM-ChessCoach): pipeline Stockfish + LLM, phản hồi cơ bản trước và phản hồi mở rộng sau, rule-based fallback. Repo dùng MIT.
- [EZ-Chess](https://github.com/AnubhavChoudhery/EZ-Chess): candidate comparison, threat arrows và provider LLM local/cloud. Repo dùng MIT.
- [eval.bar](https://github.com/goodvibs/eval.bar): evaluation graph, key moments, opening explorer và định hướng PGN variation.
- [Maia Chess](https://github.com/CSSLab/maia-chess): engine học hành vi nước đi của người ở các mức Elo khác nhau.

Các nguồn trên dùng để tham khảo sản phẩm và kiến trúc. Trước khi tái sử dụng mã hoặc tài nguyên phải kiểm tra giấy phép của từng file và dependency.
