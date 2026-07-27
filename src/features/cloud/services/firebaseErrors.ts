// Ánh xạ lỗi firebase sang thông báo tiếng Việt mà KHÔNG import firebase.
//
// `FirebaseError` được nhận bằng hình dạng (`name` + `code`) thay vì `instanceof`,
// để hàm này gọi được từ đường render/xử lý lỗi đồng bộ mà không kéo SDK vào
// chunk khởi động.
function firebaseErrorCode(reason: unknown) {
  if (!reason || typeof reason !== "object") return null;
  const candidate = reason as { name?: unknown; code?: unknown };
  if (candidate.name !== "FirebaseError" || typeof candidate.code !== "string") return null;
  return candidate.code;
}

export function firebaseErrorMessage(reason: unknown) {
  const code = firebaseErrorCode(reason);
  if (!code) {
    return reason instanceof Error ? reason.message : String(reason);
  }
  switch (code) {
    case "auth/popup-closed-by-user":
      return "Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.";
    case "auth/popup-blocked":
      return "Cửa sổ Google bị chặn. Hãy cho phép popup rồi thử lại.";
    case "auth/invalid-credential":
      return "Google không chấp nhận phiên đăng nhập vừa nhận. Hãy thử đăng nhập lại.";
    case "auth/unauthorized-domain":
      return "Domain hiện tại chưa được cho phép trong Firebase Authentication.";
    case "auth/operation-not-allowed":
      return "Google Sign-In chưa được bật trong Firebase Console.";
    case "permission-denied":
      return "Tài khoản này không có quyền đọc hoặc ghi dữ liệu Firestore.";
    case "unavailable":
      return "Firebase đang mất kết nối. Dữ liệu trên máy vẫn an toàn.";
    default: {
      const message = (reason as { message?: unknown }).message;
      return typeof message === "string" && message ? message : code;
    }
  }
}

export function isGoogleSignInCancelled(reason: unknown) {
  return String(reason).includes("Đăng nhập đã được hủy.");
}
