mod agent;
mod commands;
mod mouse;

use std::sync::Mutex;

pub struct AgentState {
    pub server_url: Option<String>,
    pub token: Option<String>,
    pub shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(Mutex::new(AgentState {
            server_url: None,
            token: None,
            shutdown_tx: None,
        }))
        .invoke_handler(tauri::generate_handler![
            commands::get_server_url,
            commands::set_server_url,
            commands::agent_set_credentials,
            commands::agent_clear_credentials,
            commands::agent_join_room,
            commands::agent_leave_room,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
