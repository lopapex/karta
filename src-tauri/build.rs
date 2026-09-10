fn main() {
    const COMMANDS: &[&str] = &[
        "get_security_status",
        "initialize_secure_storage",
        "unlock_database",
        "change_password",
        "list_clients",
        "get_client",
        "create_client",
        "update_client",
        "archive_client",
        "restore_client",
        "delete_client",
        "list_templates",
        "get_template",
        "create_template",
        "update_template",
        "delete_template",
        "set_default_template",
        "list_visits",
        "get_visit",
        "create_visit",
        "update_visit",
        "delete_visit",
        "export_database",
        "import_database",
    ];

    let app_manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(app_manifest))
        .expect("failed to build KARTA manifest");
}
