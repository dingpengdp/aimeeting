use crate::{agent, AgentState};

use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

const STORE_NAME: &str = "config.json";
const SERVER_URL_KEY: &str = "serverUrl";
const AUTH_TOKEN_KEY: &str = "authToken";

fn read_store_string(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;
    Ok(store.get(key).and_then(|v| v.as_str().map(str::to_owned)))
}

#[tauri::command]
pub async fn get_server_url(app: AppHandle) -> Result<Option<String>, String> {
    read_store_string(&app, SERVER_URL_KEY)
}

#[tauri::command]
pub async fn set_server_url(
    app: AppHandle,
    state: State<'_, Mutex<AgentState>>,
    url: String,
) -> Result<(), String> {
    {
        let mut s = state.lock().unwrap();
        s.server_url = Some(url.clone());
    }

    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;
    store.set(SERVER_URL_KEY, serde_json::json!(url));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_set_credentials(
    app: AppHandle,
    state: State<'_, Mutex<AgentState>>,
    server_url: String,
    token: String,
) -> Result<(), String> {
    {
        let mut s = state.lock().unwrap();
        s.server_url = Some(server_url.clone());
        s.token = Some(token.clone());
    }

    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;
    store.set(SERVER_URL_KEY, serde_json::json!(server_url));
    store.set(AUTH_TOKEN_KEY, serde_json::json!(token));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_join_room(
    app: AppHandle,
    state: State<'_, Mutex<AgentState>>,
    room_id: String,
) -> Result<(), String> {
    let (state_server_url, state_token) = {
        let s = state.lock().unwrap();
        (s.server_url.clone(), s.token.clone())
    };

    let server_url = match state_server_url {
        Some(url) => url,
        None => read_store_string(&app, SERVER_URL_KEY)?.ok_or("No server URL configured")?,
    };
    let token = match state_token {
        Some(token) => token,
        None => read_store_string(&app, AUTH_TOKEN_KEY)?.ok_or("No auth token available")?,
    };

    {
        let mut s = state.lock().unwrap();
        s.server_url = Some(server_url.clone());
        s.token = Some(token.clone());
    }

    // Stop any existing agent
    {
        let mut s = state.lock().unwrap();
        if let Some(tx) = s.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }

    // Spawn new agent task
    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut s = state.lock().unwrap();
        s.shutdown_tx = Some(tx);
    }

    tokio::spawn(agent::run(server_url, token, room_id, rx));
    Ok(())
}

#[tauri::command]
pub async fn agent_clear_credentials(
    app: AppHandle,
    state: State<'_, Mutex<AgentState>>,
) -> Result<(), String> {
    {
        let mut s = state.lock().unwrap();
        if let Some(tx) = s.shutdown_tx.take() {
            let _ = tx.send(());
        }
        s.token = None;
    }

    let store = app.store(STORE_NAME).map_err(|e| e.to_string())?;
    store.delete(AUTH_TOKEN_KEY);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_leave_room(state: State<'_, Mutex<AgentState>>) -> Result<(), String> {
    let mut s = state.lock().unwrap();
    if let Some(tx) = s.shutdown_tx.take() {
        let _ = tx.send(());
    }
    Ok(())
}
