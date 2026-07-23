use crate::*;
use std::sync::atomic::{AtomicU64, Ordering};

const GOOGLE_OAUTH_TIMEOUT: Duration = Duration::from_secs(120);
const GOOGLE_OAUTH_CANCELLED: &str = "Đăng nhập đã được hủy.";
static GOOGLE_OAUTH_SESSION: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, PartialEq)]
enum OAuthWaitStatus {
    Waiting,
    Cancelled,
    TimedOut,
}

fn start_google_oauth_session() -> u64 {
    GOOGLE_OAUTH_SESSION.fetch_add(1, Ordering::SeqCst) + 1
}

fn oauth_wait_status(session: u64, now: Instant, deadline: Instant) -> OAuthWaitStatus {
    if GOOGLE_OAUTH_SESSION.load(Ordering::SeqCst) != session {
        OAuthWaitStatus::Cancelled
    } else if now >= deadline {
        OAuthWaitStatus::TimedOut
    } else {
        OAuthWaitStatus::Waiting
    }
}

pub(crate) fn cancel_google_oauth() {
    GOOGLE_OAUTH_SESSION.fetch_add(1, Ordering::SeqCst);
}

pub(crate) fn open_system_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("rundll32.exe");
        command.args(["url.dll,FileProtocolHandler", url]);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Không thể mở trình duyệt mặc định: {error}"))
}

pub(crate) fn loopback_response(
    stream: &mut std::net::TcpStream,
    status: &str,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nPragma: no-cache\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("Không thể trả phản hồi OAuth: {error}"))
}

pub(crate) fn run_google_oauth_loopback() -> Result<String, String> {
    let session = start_google_oauth_session();
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Không thể mở cổng đăng nhập cục bộ: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Không thể cấu hình cổng đăng nhập: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Không thể đọc cổng đăng nhập: {error}"))?
        .port();

    let mut random_state = [0_u8; 32];
    getrandom::fill(&mut random_state)
        .map_err(|error| format!("Không thể tạo mã bảo vệ đăng nhập: {error}"))?;
    let state = random_state
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let callback = format!("http://127.0.0.1:{port}/oauth/callback");
    let mut bridge_url = Url::parse("https://chess-coach-4b50e.firebaseapp.com/auth-bridge.html")
        .map_err(|error| format!("URL đăng nhập không hợp lệ: {error}"))?;
    bridge_url
        .query_pairs_mut()
        .append_pair("callback", &callback)
        .append_pair("state", &state);
    open_system_browser(bridge_url.as_str())?;

    let deadline = Instant::now() + GOOGLE_OAUTH_TIMEOUT;
    loop {
        match oauth_wait_status(session, Instant::now(), deadline) {
            OAuthWaitStatus::Waiting => {}
            OAuthWaitStatus::Cancelled => return Err(GOOGLE_OAUTH_CANCELLED.into()),
            OAuthWaitStatus::TimedOut => break,
        }
        let (mut stream, _) = match listener.accept() {
            Ok(connection) => connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(error) => return Err(format!("Không thể nhận kết quả đăng nhập: {error}")),
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut request = Vec::with_capacity(4096);
        let mut chunk = [0_u8; 2048];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(count) => {
                    request.extend_from_slice(&chunk[..count]);
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                    if request.len() > 16_384 {
                        return Err("Phản hồi đăng nhập vượt quá giới hạn an toàn.".into());
                    }
                }
                Err(error)
                    if error.kind() == std::io::ErrorKind::WouldBlock
                        || error.kind() == std::io::ErrorKind::TimedOut =>
                {
                    break;
                }
                Err(error) => return Err(format!("Không thể đọc kết quả đăng nhập: {error}")),
            }
        }

        let request_text = String::from_utf8_lossy(&request);
        let Some(target) = request_text
            .lines()
            .next()
            .and_then(|line| line.strip_prefix("GET "))
            .and_then(|line| line.split_whitespace().next())
        else {
            let _ = loopback_response(&mut stream, "400 Bad Request", "Yêu cầu không hợp lệ.");
            continue;
        };
        let parsed = match Url::parse(&format!("http://127.0.0.1:{port}{target}")) {
            Ok(url) if url.path() == "/oauth/callback" => url,
            _ => {
                let _ = loopback_response(&mut stream, "404 Not Found", "Không tìm thấy.");
                continue;
            }
        };
        let values = parsed
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        if values.get("state").map(|value| value.as_ref()) != Some(state.as_str()) {
            let _ = loopback_response(
                &mut stream,
                "403 Forbidden",
                "Mã bảo vệ đăng nhập không khớp.",
            );
            continue;
        }
        if let Some(error) = values.get("error") {
            let message = values
                .get("error_description")
                .map(|value| value.to_string())
                .unwrap_or_else(|| error.to_string());
            let _ = loopback_response(
                &mut stream,
                "200 OK",
                "Đăng nhập đã được hủy. Bạn có thể đóng tab này.",
            );
            return Err(message);
        }
        let Some(access_token) = values.get("access_token").map(|value| value.to_string()) else {
            let _ = loopback_response(&mut stream, "400 Bad Request", "Thiếu token đăng nhập.");
            continue;
        };
        if access_token.len() > 12_000 {
            return Err("Token đăng nhập vượt quá giới hạn an toàn.".into());
        }

        let success_page = r#"<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Đăng nhập thành công</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1411;color:#dce9e2;font:16px system-ui}.card{max-width:420px;padding:32px;border:1px solid #29483b;border-radius:16px;background:#111e19;text-align:center}h1{color:#70e1b5;font-size:22px}p{color:#92a69c;line-height:1.6}</style></head><body><main class="card"><h1>Đăng nhập thành công</h1><p>Bạn có thể đóng tab này và quay lại Chess Coach.</p></main><script>history.replaceState(null,'','/done');setTimeout(()=>window.close(),700)</script></body></html>"#;
        loopback_response(&mut stream, "200 OK", success_page)?;
        return Ok(access_token);
    }

    Err("Đăng nhập quá thời gian. Hãy thử lại.".into())
}

pub(crate) async fn begin_google_oauth() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(run_google_oauth_loopback)
        .await
        .map_err(|error| format!("Luồng đăng nhập bị gián đoạn: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_can_be_cancelled_timed_out_and_restarted() {
        let deadline = Instant::now() + GOOGLE_OAUTH_TIMEOUT;
        let first = start_google_oauth_session();
        assert_eq!(
            oauth_wait_status(first, Instant::now(), deadline),
            OAuthWaitStatus::Waiting
        );

        cancel_google_oauth();
        assert_eq!(
            oauth_wait_status(first, Instant::now(), deadline),
            OAuthWaitStatus::Cancelled
        );

        let second = start_google_oauth_session();
        assert_eq!(
            oauth_wait_status(second, Instant::now(), deadline),
            OAuthWaitStatus::Waiting
        );

        let expired_deadline = Instant::now();
        assert_eq!(
            oauth_wait_status(second, expired_deadline, expired_deadline),
            OAuthWaitStatus::TimedOut
        );
    }
}
