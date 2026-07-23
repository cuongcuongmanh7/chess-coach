use crate::*;

pub(crate) struct ApiKeyState {
    pub(crate) secret_store: Box<dyn SecretStore>,
}

impl Default for ApiKeyState {
    fn default() -> Self {
        Self {
            secret_store: Box::new(PlatformSecretStore::default()),
        }
    }
}

#[cfg(test)]
impl ApiKeyState {
    pub(crate) fn with_secret_store(secret_store: Box<dyn SecretStore>) -> Self {
        Self { secret_store }
    }
}

pub(crate) struct ActiveDatabase {
    pub(crate) connection: Connection,
    pub(crate) data_dir: PathBuf,
    pub(crate) active_uid: Option<String>,
    pub(crate) generation: u64,
}

impl Deref for ActiveDatabase {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        &self.connection
    }
}

impl DerefMut for ActiveDatabase {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.connection
    }
}

pub(crate) struct DatabaseState(pub(crate) Mutex<ActiveDatabase>);
