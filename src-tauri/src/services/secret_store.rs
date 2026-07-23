pub(crate) trait SecretStore: Send + Sync {
    fn get(&self, provider: &str) -> Result<Option<String>, String>;
    fn set(&self, provider: &str, value: &str) -> Result<(), String>;
    fn delete(&self, provider: &str) -> Result<(), String>;
}

const CREDENTIAL_SERVICE: &str = "vn.kypho.chesscoach.ai";

#[cfg(windows)]
#[derive(Default)]
pub(crate) struct PlatformSecretStore;

#[cfg(windows)]
fn credential_entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, provider)
        .map_err(|error| format!("Không thể mở Windows Credential Manager: {error}"))
}

#[cfg(windows)]
impl SecretStore for PlatformSecretStore {
    fn get(&self, provider: &str) -> Result<Option<String>, String> {
        match credential_entry(provider)?.get_password() {
            Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!(
                "Không thể đọc API key từ Windows Credential Manager: {error}"
            )),
        }
    }

    fn set(&self, provider: &str, value: &str) -> Result<(), String> {
        credential_entry(provider)?
            .set_password(value)
            .map_err(|error| {
                format!("Không thể lưu API key vào Windows Credential Manager: {error}")
            })
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        match credential_entry(provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!(
                "Không thể xoá API key khỏi Windows Credential Manager: {error}"
            )),
        }
    }
}

#[cfg(not(windows))]
#[derive(Default)]
pub(crate) struct PlatformSecretStore {
    values: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[cfg(not(windows))]
impl SecretStore for PlatformSecretStore {
    fn get(&self, provider: &str) -> Result<Option<String>, String> {
        self.values
            .lock()
            .map(|values| values.get(provider).cloned())
            .map_err(|_| "Không đọc được trạng thái API key.".to_string())
    }

    fn set(&self, provider: &str, value: &str) -> Result<(), String> {
        self.values
            .lock()
            .map(|mut values| {
                values.insert(provider.to_string(), value.to_string());
            })
            .map_err(|_| "Không thể lưu API key trong phiên này.".to_string())
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        self.values
            .lock()
            .map(|mut values| {
                values.remove(provider);
            })
            .map_err(|_| "Không thể xoá API key khỏi phiên này.".to_string())
    }
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct MemorySecretStore {
    values: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[cfg(test)]
impl SecretStore for MemorySecretStore {
    fn get(&self, provider: &str) -> Result<Option<String>, String> {
        Ok(self.values.lock().unwrap().get(provider).cloned())
    }

    fn set(&self, provider: &str, value: &str) -> Result<(), String> {
        self.values
            .lock()
            .unwrap()
            .insert(provider.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        self.values.lock().unwrap().remove(provider);
        Ok(())
    }
}
