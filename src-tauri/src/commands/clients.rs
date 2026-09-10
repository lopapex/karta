use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    error::{CommandError, CommandResult},
    models::{
        CardField, ClientRecord, ClientSummary, CreateClientInput, FieldType, ListClientsInput,
        UpdateClientInput,
    },
    validation::{clean_title, validate_fields},
};

#[tauri::command]
pub fn list_clients(
    input: ListClientsInput,
    state: State<'_, AppState>,
) -> CommandResult<Vec<ClientSummary>> {
    let query = input.query.trim();
    if query.chars().count() > 160 {
        return Err(CommandError::validation());
    }
    let pattern = format!("%{query}%");
    state.with_connection(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT id, title, archived_at, updated_at FROM clients
                 WHERE ((?1 = 1 AND archived_at IS NOT NULL) OR (?1 = 0 AND archived_at IS NULL))
                   AND title LIKE ?2 ESCAPE '\\' COLLATE NOCASE
                 ORDER BY updated_at DESC",
            )
            .map_err(|_| CommandError::storage())?;
        let rows = statement
            .query_map(params![input.archived, pattern], |row| {
                Ok(ClientSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    archived_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })
            .map_err(|_| CommandError::storage())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| CommandError::storage())
    })
}

#[tauri::command]
pub fn get_client(id: String, state: State<'_, AppState>) -> CommandResult<ClientRecord> {
    state.with_connection(|connection| {
        connection
            .query_row(
                "SELECT id, title, source_template_id, fields_json, archived_at, created_at, updated_at
                 FROM clients WHERE id=?1",
                [id],
                |row| {
                    let fields_json: String = row.get(3)?;
                    let fields = serde_json::from_str(&fields_json).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            3,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?;
                    Ok(ClientRecord {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        source_template_id: row.get(2)?,
                        fields,
                        archived_at: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => CommandError::not_found(),
                _ => CommandError::storage(),
            })
    })
}

#[tauri::command]
pub fn create_client(
    input: CreateClientInput,
    state: State<'_, AppState>,
) -> CommandResult<ClientRecord> {
    let title = clean_title(&input.title)?;
    state.with_connection(|connection| {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM templates WHERE id=?1)",
                [&input.template_id],
                |row| row.get(0),
            )
            .map_err(|_| CommandError::storage())?;
        if exists {
            Ok(())
        } else {
            Err(CommandError::not_found())
        }
    })?;
    validate_fields(&input.fields, true)?;
    let fields = snapshot_supplied_fields(input.fields);
    validate_fields(&fields, true)?;
    let id = Uuid::new_v4().to_string();
    let fields_json = serde_json::to_string(&fields).map_err(|_| CommandError::storage())?;
    state.with_connection(|connection| {
        connection
            .execute(
                "INSERT INTO clients(id, title, source_template_id, fields_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                params![id, title, input.template_id, fields_json],
            )
            .map_err(|_| CommandError::storage())?;
        Ok(())
    })?;
    get_client(id, state)
}

fn snapshot_supplied_fields(fields: Vec<CardField>) -> Vec<CardField> {
    fields
        .into_iter()
        .map(|mut field| {
            field.id = Uuid::new_v4().to_string();
            let selected = if field.field_type == FieldType::Select {
                field
                    .value
                    .as_ref()
                    .and_then(|value| value.as_str())
                    .map(str::to_owned)
            } else {
                None
            };
            let mut replacement = None;
            for option in &mut field.options {
                let previous = option.id.clone();
                option.id = Uuid::new_v4().to_string();
                if selected.as_deref() == Some(previous.as_str()) {
                    replacement = Some(option.id.clone());
                }
            }
            if let Some(replacement) = replacement {
                field.value = Some(serde_json::Value::String(replacement));
            }
            field
        })
        .collect()
}

#[tauri::command]
pub fn update_client(
    id: String,
    input: UpdateClientInput,
    state: State<'_, AppState>,
) -> CommandResult<ClientRecord> {
    let title = clean_title(&input.title)?;
    validate_fields(&input.fields, true)?;
    let fields_json = serde_json::to_string(&input.fields).map_err(|_| CommandError::storage())?;
    state.with_connection(|connection| {
        let changed = connection
            .execute(
                "UPDATE clients SET title=?2, fields_json=?3,
                   updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?1",
                params![id, title, fields_json],
            )
            .map_err(|_| CommandError::storage())?;
        if changed == 0 {
            Err(CommandError::not_found())
        } else {
            Ok(())
        }
    })?;
    get_client(id, state)
}

#[tauri::command]
pub fn archive_client(id: String, state: State<'_, AppState>) -> CommandResult<()> {
    set_archive_state(&id, true, &state)
}

#[tauri::command]
pub fn restore_client(id: String, state: State<'_, AppState>) -> CommandResult<()> {
    set_archive_state(&id, false, &state)
}

#[tauri::command]
pub fn delete_client(
    id: String,
    confirmation: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.with_connection(|connection| {
        let title: String = connection
            .query_row("SELECT title FROM clients WHERE id=?1", [&id], |row| {
                row.get(0)
            })
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => CommandError::not_found(),
                _ => CommandError::storage(),
            })?;
        if confirmation != title {
            return Err(CommandError::new(
                "confirmation_mismatch",
                "Název karty se neshoduje.",
            ));
        }
        connection
            .execute("DELETE FROM clients WHERE id=?1", [id])
            .map_err(|_| CommandError::storage())?;
        Ok(())
    })
}

fn set_archive_state(id: &str, archived: bool, state: &State<'_, AppState>) -> CommandResult<()> {
    state.with_connection(|connection| {
        let archived_at = if archived {
            "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
        } else {
            "NULL"
        };
        let changed = connection
            .execute(
                &format!(
                    "UPDATE clients SET archived_at={archived_at},
                       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?1"
                ),
                [id],
            )
            .map_err(|_| CommandError::storage())?;
        if changed == 0 {
            Err(CommandError::not_found())
        } else {
            Ok(())
        }
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::models::SelectOption;

    #[test]
    fn snapshot_gets_new_ids_and_remaps_selected_option() {
        let template_field_id = Uuid::new_v4().to_string();
        let template_option_id = Uuid::new_v4().to_string();
        let template = vec![CardField {
            id: template_field_id.clone(),
            label: "Preferovaný kontakt".to_owned(),
            field_type: FieldType::Select,
            required: true,
            options: vec![SelectOption {
                id: template_option_id.clone(),
                label: "Telefon".to_owned(),
            }],
            is_custom: false,
            value: Some(json!(template_option_id)),
        }];
        let snapshot = snapshot_supplied_fields(template.clone());

        assert_eq!(template[0].id, template_field_id);
        assert_ne!(snapshot[0].id, template[0].id);
        assert_ne!(snapshot[0].options[0].id, template[0].options[0].id);
        assert_eq!(
            snapshot[0].value,
            Some(json!(snapshot[0].options[0].id.clone()))
        );
    }
}
