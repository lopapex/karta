mod commands;
mod database;
mod error;
mod models;
mod platform;
mod validation;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            let state = database::AppState::new(directory)
                .map_err(|error| std::io::Error::other(error.code))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::security::get_security_status,
            commands::security::initialize_secure_storage,
            commands::security::unlock_database,
            commands::security::change_password,
            commands::clients::list_clients,
            commands::clients::get_client,
            commands::clients::create_client,
            commands::clients::update_client,
            commands::clients::archive_client,
            commands::clients::restore_client,
            commands::clients::delete_client,
            commands::templates::list_templates,
            commands::templates::get_template,
            commands::templates::create_template,
            commands::templates::update_template,
            commands::templates::delete_template,
            commands::templates::set_default_template,
            commands::visits::list_visits,
            commands::visits::get_visit,
            commands::visits::create_visit,
            commands::visits::update_visit,
            commands::visits::delete_visit,
            commands::backup::export_database,
            commands::backup::import_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
