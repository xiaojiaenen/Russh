mod commands;
mod models;

use commands::ssh::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let app_state = AppState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::app::get_platform,
            commands::ssh::connect,
            commands::ssh::disconnect,
            commands::ssh::ssh_write,
            commands::ssh::list_connections,
            commands::ssh::save_connection,
            commands::ssh::delete_connection,
            commands::ssh::test_connection,
            commands::config::load_connections,
            commands::config::save_connections,
            commands::config::load_settings,
            commands::config::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
