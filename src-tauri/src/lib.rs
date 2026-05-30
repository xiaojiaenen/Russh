mod commands;
mod models;

use commands::ssh::AppState;
use commands::tunnel::TunnelManager;
use tauri::{Manager, WindowEvent};
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let app_state = AppState::default();
    let tunnel_manager = TunnelManager::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(app_state)
        .manage(tunnel_manager)
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
            commands::sftp::sftp_list_dir,
            commands::sftp::sftp_upload_file,
            commands::sftp::sftp_download_file,
            commands::sftp::sftp_delete,
            commands::sftp::sftp_rename,
            commands::sftp::sftp_mkdir,
            commands::monitor::get_cpu_usage,
            commands::monitor::get_memory_usage,
            commands::monitor::get_disk_usage,
            commands::monitor::get_network_usage,
            commands::monitor::get_process_list,
            commands::monitor::kill_process,
            commands::tunnel::tunnel_create_local,
            commands::tunnel::tunnel_create_remote,
            commands::tunnel::tunnel_create_dynamic,
            commands::tunnel::tunnel_close,
            commands::tunnel::tunnel_list,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Moved(position) = event {
                // Save window position on move
                if let Ok(store) = window.store("russh.json") {
                    let key = format!("window_position_{}", window.label());
                    let value = serde_json::json!({
                        "x": position.x,
                        "y": position.y,
                    });
                    store.set(key, value);
                }
            }
            if let WindowEvent::Resized(size) = event {
                // Save window size on resize
                if let Ok(store) = window.store("russh.json") {
                    let key = format!("window_size_{}", window.label());
                    let value = serde_json::json!({
                        "width": size.width,
                        "height": size.height,
                    });
                    store.set(key, value);
                }
            }
        })
        .setup(|app| {
            // Restore window size and position
            let window = app.get_webview_window("main").unwrap();
            let store = app.store("russh.json").map_err(|e| e.to_string())?;

            // Restore size
            let size_key = format!("window_size_{}", window.label());
            if let Some(size_val) = store.get(&size_key) {
                if let (Some(w), Some(h)) = (size_val.get("width"), size_val.get("height")) {
                    if let (Some(w), Some(h)) = (w.as_f64(), h.as_f64()) {
                        let _ = window.set_size(tauri::LogicalSize::new(w, h));
                    }
                }
            }

            // Restore position
            let pos_key = format!("window_position_{}", window.label());
            if let Some(pos_val) = store.get(&pos_key) {
                if let (Some(x), Some(y)) = (pos_val.get("x"), pos_val.get("y")) {
                    if let (Some(x), Some(y)) = (x.as_f64(), y.as_f64()) {
                        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
