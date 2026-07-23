use crate::*;

#[test]
fn api_key_is_persisted_and_deleted_through_secret_store() {
    let state = ApiKeyState::with_secret_store(Box::new(MemorySecretStore::default()));
    let key = "AIzaSyExampleKeyWithEnoughCharacters";

    persist_api_key(&state, "gemini", key).unwrap();
    assert_eq!(
        persisted_api_key(&state, "gemini").unwrap().as_deref(),
        Some(key)
    );

    state.secret_store.delete("gemini").unwrap();
    assert_eq!(persisted_api_key(&state, "gemini").unwrap(), None);
}

#[test]
fn invalid_api_key_is_not_written_to_secret_store() {
    let state = ApiKeyState::with_secret_store(Box::new(MemorySecretStore::default()));

    assert!(persist_api_key(&state, "openai", "too-short").is_err());
    assert_eq!(persisted_api_key(&state, "openai").unwrap(), None);
}
