use crate::*;

#[derive(Default)]
pub(crate) struct ApiKeyState {
    pub(crate) openai: Mutex<Option<String>>,
    pub(crate) gemini: Mutex<Option<String>>,
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
