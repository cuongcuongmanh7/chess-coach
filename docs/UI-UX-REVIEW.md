# Chess Coach — Review UI/UX toàn diện

> Phạm vi: toàn bộ frontend `src/` (React 19 + Tauri 2, CSS thuần, dark-only, layout desktop cố định).
> Phương pháp: review tĩnh (đọc code), 4 lens — Visual & Consistency · Accessibility · CSS/Kiến trúc UI · Responsive & Layout.
> Khung tiêu chí: skill `ui-ux-pro-max` + WCAG 2.1 AA.
> Ngày: 2026-07-30. Không sửa file nguồn nào — đây là tài liệu đánh giá.

---

## 1. Tóm tắt điều hành

Nền tảng UI **chắc**: kiến trúc feature-sliced sạch, có landmark ngữ nghĩa (`<main>`/`<aside>`/`<header>`/`<section aria-labelledby>`), primitive `Segmented` đạt chuẩn a11y, icon-only button đều có `aria-label`, toast có `aria-live`. Không dùng emoji làm icon, không lỗi thiết kế thô. Đây là mức trên trung bình so với app tự viết CSS.

Điểm yếu tập trung ở **hệ thống hoá** và **a11y chiều sâu**, không phải ở thẩm mỹ bề mặt:

| # | Vấn đề ưu tiên cao | Lens | Ảnh hưởng |
|---|---|---|---|
| 1 | **Modal không đóng được bằng Esc, không có focus trap** (9+ modal) | A11y | Người dùng bàn phím/screen reader kẹt/lạc focus |
| 2 | **Không tôn trọng `prefers-reduced-motion`** (0 chỗ), nhiều animation vô hạn | A11y | Nguy cơ tiền đình, khó chịu |
| 3 | **570 màu hardcode / 24 file CSS**, `:root` chỉ ~15 token | Visual + CSS | Khó bảo trì, tông màu dễ lệch |
| 4 | **Shell modal copy-paste ≥9 nơi** + import icon thừa hàng loạt | CSS/Kiến trúc | Nợ kỹ thuật, sửa 1 chỗ phải sửa nhiều nơi |
| 5 | **Không có thang spacing/radius/shadow/typography** | Visual | Số đo rải rác, nửa-pixel, thiếu nhịp |

**Đòn bẩy lớn nhất:** tách một `<Modal>` primitive (gói sẵn Esc + focus trap + ARIA) — giải quyết đồng thời vấn đề #1 và #4.

---

## 2. Ảnh chụp hệ thống

- **Stack:** React 19, TypeScript, Vite 6, Tauri 2. Không router (điều hướng bằng state `workspaceMode` + cờ boolean modal). Không component library.
- **Styling:** CSS thuần, một file `.css`/feature, import phẳng toàn cục qua [main.tsx](src/main.tsx). Không Tailwind/CSS Modules.
- **Token:** đặt ở `:root` trong [styles.css:8](src/styles.css#L8) — palette dark kiểu chess.com (`--bg`, `--surface`, `--green`, `--gold`, `--mc-*`…). **Chỉ ~15 biến.**
- **Primitive tái dùng:** chỉ có [Segmented.tsx](src/shared/components/Segmented.tsx) (radiogroup), [BrandIdentity.tsx](src/shared/components/BrandIdentity.tsx), [ChessTerm.tsx](src/shared/components/ChessTerm.tsx).
- **Chủ đề:** chỉ dark, không light mode, không `prefers-color-scheme`.

**Điểm mạnh nên giữ:**
- [Segmented.tsx](src/shared/components/Segmented.tsx) — `role="radiogroup"`, roving `tabIndex`, điều hướng phím ←/→/↑/↓, `aria-checked`. Chuẩn mẫu để nhân rộng.
- [AppChrome.tsx:117](src/app/components/AppChrome.tsx#L117) — toast có `role="alert"/"status"` + `aria-live="polite"`.
- [AppChrome.tsx:123](src/app/components/AppChrome.tsx#L123) — `inert` trên sidebar/topbar khi vào candidate focus mode (chặn tương tác nền đúng cách).
- Mọi icon-only button đều có `aria-label` + `title` (vd [AppChrome.tsx:133,154,220](src/app/components/AppChrome.tsx#L133)).
- Move-classification hiển thị bằng **icon + màu** (`MoveQualityIcon`), không chỉ dựa vào màu.
- `focus-visible` ring toàn cục [styles.css:59](src/styles.css#L59); `lang="vi"` + viewport meta đúng [index.html:2](index.html#L2).
- Code-split `GameStoryPanel` bằng `lazy`/`Suspense`.

---

## 3. Phát hiện theo lens

### Lens 1 — Visual & Consistency

| Mức | Phát hiện | Vị trí | Đề xuất |
|---|---|---|---|
| **Cao** | 570 màu hardcode trên 24 file CSS trong khi `:root` chỉ có ~15 token. Rất nhiều grey gần trùng (`#121211`, `#171614`, `#1c1b1a`, `#0f0f0e`, `#34322f`, `#3b3936`, `#3d3a37`…) và mint/teal (`#68dbb1`, `#35b989`, `#70d9b2`, `#7de0ba`, `#84dfbe`…) lặp khắp nơi. | [chrome.css](src/app/chrome.css) (51), [analysis.css](src/features/analysis/analysis.css) (167), [modals.css](src/features/modals/modals.css) (71), [training.css](src/features/training/training.css) (47) | Gom về token: mở rộng `:root` thành thang bề mặt (`--surface-0..3`), thang viền, và **một** hệ xanh-ngọc. |
| **Trung** | Không có thang spacing/radius/shadow. Bán kính rải rác 5–13px, shadow viết inline mỗi nơi một kiểu. | [modals.css:21,30,34…](src/features/modals/modals.css#L21) | Thêm `--radius-sm/md/lg`, `--space-*`, `--shadow-*` và thay thế dần. |
| **Trung** | Cỡ chữ rải rác kèm nửa-pixel (`9.5px`, `10.5px`, `11.5px`, `12.5px`). | [modals.css:197,202,204](src/features/modals/modals.css#L197) | Chuẩn hoá thang chữ (vd 10/11/12/14/16/20/24/29). |
| **Trung** | Hệ xanh-ngọc cloud/sync (`#68dbb1`…) trùng sắc với `--mc-brilliant #26c2a3` nhưng là hệ màu song song, không tokenized → hai tông xanh-ngọc cạnh nhau. | [modals.css:71,77,86](src/features/modals/modals.css#L71) | Thống nhất về một biến `--teal`/`--accent-mint`. |
| **Thấp** | `theme-color` meta `#101816` (ngả xanh) lệch với nền thật `#302e2c` (nâu xám). | [index.html:6](index.html#L6) | Cho khớp `--bg`. |

### Lens 2 — Accessibility (WCAG 2.1 AA)

| Mức | Phát hiện | Vị trí | Đề xuất |
|---|---|---|---|
| **Cao** | **Modal không đóng bằng Esc.** Grep toàn repo: `Escape` chỉ xuất hiện ở candidate-lab, không modal nào có. | [useCandidateBranchKeyboard.ts:14](src/features/candidate-lab/hooks/useCandidateBranchKeyboard.ts#L14) là chỗ duy nhất | Thêm handler Esc trong `<Modal>` primitive (xem Lens 3). |
| **Cao** | **Không có focus trap; không chuyển focus vào dialog khi mở, không trả về trigger khi đóng.** Chỉ Import (single) có `autoFocus` textarea. Tab có thể đi ra nền sau lưng modal. | [ImportSettingsModals.tsx:120,206](src/app/components/ImportSettingsModals.tsx#L120), [LibraryAccountModals.tsx:119,149,208](src/app/components/LibraryAccountModals.tsx#L119), [GameInsightsModals.tsx:116,236](src/app/components/GameInsightsModals.tsx#L116) | Focus trap + lưu/khôi phục focus trong `<Modal>`. |
| **Cao** | **Không tôn trọng `prefers-reduced-motion`** (0 chỗ). Nhiều animation vô hạn: `spin` 0.95–1.15s, `toast-in`, `sync-shimmer`. | [chrome.css:128](src/app/chrome.css#L128), [modals.css:72,78,80](src/features/modals/modals.css#L72) | Thêm `@media (prefers-reduced-motion: reduce)` tắt/giảm animation toàn cục. |
| **Trung** | Contrast một số text phụ trên nền tối có thể < 4.5:1: footer `#66625d` trên `#0e0d0c` (~3.6:1), và các `#726d68`/`#7d7872`/`#7e7872` rải rác. | [modals.css:180](src/features/modals/modals.css#L180), breakdown text [modals.css:148](src/features/modals/modals.css#L148) | Kiểm bằng công cụ contrast, nâng màu mờ nhất lên ≥ 4.5:1 (hoặc 3:1 nếu ≥ 18px). |
| **Trung** | Body mặc định 16px nhưng gần như mọi thứ override xuống 9–12px; có chỗ 8px. | `.match-context 8px`, `.player-copy small 9px` [responsive.css:64,68](src/app/responsive.css#L64) | Chấp nhận được cho app desktop dày dữ liệu, nhưng nâng chữ nhỏ nhất lên ≥ 10–11px. |
| **Tốt** | Backdrop `role="presentation"` + đóng bằng `onMouseDown`, kèm nút X có `aria-label`. Side-badge ghi rõ "Trắng/Đen" chứ không chỉ dùng màu. | — | Giữ nguyên. |

### Lens 3 — CSS / Kiến trúc UI

| Mức | Phát hiện | Vị trí | Đề xuất |
|---|---|---|---|
| **Cao** | **Shell modal copy-paste.** Cùng khối `.modal-backdrop role=presentation onMouseDown` → `.modal-card role=dialog aria-modal aria-labelledby onMouseDown stopPropagation` → `.modal-close` lặp ở ≥9 nơi. | [ImportSettingsModals.tsx:120,206](src/app/components/ImportSettingsModals.tsx#L120), [LibraryAccountModals.tsx:119,149,208](src/app/components/LibraryAccountModals.tsx#L119), [GameInsightsModals.tsx:116,236](src/app/components/GameInsightsModals.tsx#L116), + [BatchAnalysisPanel.tsx](src/app/components/BatchAnalysisPanel.tsx), [TrainingModal.tsx](src/features/training/components/TrainingModal.tsx), [OpeningTrainerModal.tsx](src/features/opening-trainer/components/OpeningTrainerModal.tsx) | **Tách `<Modal>` primitive** đóng gói: backdrop, `role=dialog`, `aria-labelledby`, nút đóng, **Esc + focus trap** (gộp luôn Lens 2 #1,#2). |
| **Cao** | **Import icon trùng lặp & thừa.** 4 file copy gần nguyên khối ~40 icon lucide + `import { Chessboard }` dù phần lớn icon và `Chessboard` không dùng trong file đó. | [AppChrome.tsx:1](src/app/components/AppChrome.tsx#L1), [ImportSettingsModals.tsx:1](src/app/components/ImportSettingsModals.tsx#L1), [LibraryAccountModals.tsx:1](src/app/components/LibraryAccountModals.tsx#L1), [GameInsightsModals.tsx:2](src/app/components/GameInsightsModals.tsx#L2) | Bật lint `no-unused-imports`; chỉ import icon thực dùng. |
| **Trung** | CSS toàn cục không scope (import phẳng ở `main.tsx`), ~40 file dùng class chung → rủi ro đụng tên. | [main.tsx](src/main.tsx) | Cân nhắc CSS Modules hoặc tiền tố nhất quán theo feature. |
| **Trung** | `Segmented` là primitive tốt nhưng đơn độc. Mẫu `primary-button`/`ghost-button`/`danger-ghost`, `field-label`+`select`, thẻ metric… lặp nhiều nhưng chưa thành component. | button base [chrome.css:131](src/app/chrome.css#L131) | Dựng bộ primitive: `Button`, `Field`, `Select`, `Modal`, `MetricCard`. |
| **Thấp** | `GameInsightsModals` giữ state cục bộ `insightsTab` (useState) trong khi phần còn lại đi qua mega-controller. | [GameInsightsModals.tsx:112](src/app/components/GameInsightsModals.tsx#L112) | Chấp nhận được; chỉ lưu ý tính nhất quán. |

### Lens 4 — Responsive & Layout

> App desktop Tauri: grid cố định `318px | 1fr` (collapse `72px`) là hợp lý cho ngữ cảnh này. Đánh giá theo hành vi khi resize cửa sổ, không phải mobile.

| Mức | Phát hiện | Vị trí | Đề xuất |
|---|---|---|---|
| **Trung** | Toàn bộ media query dồn 1 file 144 dòng, nhiều `!important` (vd `.keyboard-hint display:none !important`). Khó map override về từng component; dễ vỡ khi sửa CSS feature. | [responsive.css:76](src/app/responsive.css#L76) | Đưa media query về cạnh CSS của từng feature; bỏ dần `!important`. |
| **Trung** | `< 860px` ẩn hẳn sidebar và chuyển sang mobile actions. Nếu người dùng thu cửa sổ hẹp có thể mất ngữ cảnh điều hướng. | [responsive.css:30-38](src/app/responsive.css#L30) | Test kỹ dải 650–1040px; đảm bảo mọi hành động vẫn với tới. |
| **Trung** | Topbar nhiều nút (Tiến bộ, Mistake Lab, Opening Trainer, Phân tích loạt, Kho ván, Settings, Nạp ván). `~1040px` ẩn service-pill; dải ~900–1040 có thể chật trước khi co về icon ở 650. | [AppChrome.tsx:234-274](src/app/components/AppChrome.tsx#L234), [responsive.css:13,55](src/app/responsive.css#L13) | Cân nhắc gộp nút phụ vào menu "overflow" khi hẹp. |
| **Thấp** | `overflow:hidden` trên `body` + `app-shell`; modal cao dựa vào `max-height ~94vh` + `overflow-y:auto` từng modal. Dashboard/Profiles có, cần đảm bảo **mọi** modal đều có. | [styles.css:31,60](src/styles.css#L31), [modals.css:83,126](src/features/modals/modals.css#L83) | Đưa `max-height`+scroll vào `<Modal>` primitive để phủ hết. |

---

## 4. Cơ hội design system

1. **`<Modal>` primitive** — đòn bẩy số 1. Đóng gói backdrop + `role=dialog` + `aria-labelledby` + nút đóng + **Esc + focus trap + khôi phục focus** + `max-height`/scroll. Refactor 9+ điểm gọi → sửa a11y một lần cho toàn bộ modal.
2. **Token hoá** — mở rộng `:root`: thang bề mặt/viền, spacing, radius, shadow, typography, và hợp nhất hệ xanh-ngọc. Mục tiêu kéo 570 hex hardcode xuống còn số biến quản lý được.
3. **Bộ primitive** — `Button` (gói 3 biến thể hiện có), `Field`+`Select`, `MetricCard`, nối tiếp `Segmented`.
4. **Dọn import** — bật `no-unused-imports`, bỏ `Chessboard` và icon thừa ở 4 file chrome/modal.
5. **`prefers-reduced-motion`** — thêm một block media query toàn cục ở [styles.css](src/styles.css) tắt animation vô hạn.

---

## 5. Bảng ưu tiên

**Quick wins (ít rủi ro, làm ngay):**
- Thêm `@media (prefers-reduced-motion: reduce)` toàn cục.
- Sửa `theme-color` cho khớp nền.
- Bật lint bỏ import thừa; xoá `Chessboard` + icon không dùng.
- Nâng các màu text mờ dưới 4.5:1 (bắt đầu từ footer `#66625d`).

**Việc trung bình:**
- Token hoá màu/spacing/radius/shadow theo từng đợt.
- Dời media query về cạnh CSS feature, giảm `!important`.

**Việc lớn (giá trị cao nhất):**
- `<Modal>` primitive (kèm Esc + focus trap) → refactor toàn bộ modal.
- Dựng bộ primitive design-system quanh `Segmented`.

---

## 6. Phụ lục — checklist đã áp dụng

Nguồn: skill `ui-ux-pro-max` + WCAG 2.1 AA.

- [x] Accessibility: color-contrast, focus-states, aria-labels, keyboard-nav, form-labels
- [x] Touch & Interaction: loading-buttons, error-feedback, cursor-pointer
- [x] Performance: reduced-motion, content-jumping (code-split)
- [x] Layout & Responsive: viewport-meta, readable-font-size, z-index, horizontal-scroll
- [x] Typography & Color: line-height, token consistency, font-pairing
- [x] Animation: duration-timing, reduced-motion
- [x] Style: consistency, no-emoji-icons (đạt), SVG icons (đạt)

> Không kiểm được ở chế độ tĩnh (cần chạy app live): độ chính xác contrast theo pixel thực render, hành vi tab-order runtime, và cảm nhận animation. Nếu cần, dựng dev server + browser pane để chụp và đo trực tiếp.
