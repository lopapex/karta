use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    error::{CommandError, CommandResult},
    models::{CardField, TemplateInput, TemplateRecord, TemplateSummary},
    validation::validate_template,
};

#[tauri::command]
pub fn list_templates(state: State<'_, AppState>) -> CommandResult<Vec<TemplateSummary>> {
    state.with_connection(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT id, name, description, fields_json, updated_at, is_default
                 FROM templates ORDER BY is_default DESC, name COLLATE NOCASE",
            )
            .map_err(|_| CommandError::storage())?;
        let rows = statement
            .query_map([], |row| {
                let fields_json: String = row.get(3)?;
                let fields: Vec<CardField> =
                    serde_json::from_str(&fields_json).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            3,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?;
                Ok(TemplateSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    field_count: fields.len(),
                    field_labels: fields.iter().map(|field| field.label.clone()).collect(),
                    updated_at: row.get(4)?,
                    is_default: row.get(5)?,
                })
            })
            .map_err(|_| CommandError::storage())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| CommandError::storage())
    })
}

#[tauri::command]
pub fn get_template(id: String, state: State<'_, AppState>) -> CommandResult<TemplateRecord> {
    state.with_connection(|connection| {
        connection
            .query_row(
                "SELECT id, name, description, fields_json, created_at, updated_at, is_default
                 FROM templates WHERE id=?1",
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
                    Ok(TemplateRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        fields,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                        is_default: row.get(6)?,
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
pub fn create_template(
    input: TemplateInput,
    state: State<'_, AppState>,
) -> CommandResult<TemplateRecord> {
    let input = validate_template(input)?;
    let id = Uuid::new_v4().to_string();
    let fields_json = serde_json::to_string(&input.fields).map_err(|_| CommandError::storage())?;
    state.with_connection(|connection| {
        connection
            .execute(
                "INSERT INTO templates(id, name, description, fields_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                params![id, input.name, input.description, fields_json],
            )
            .map_err(|_| CommandError::storage())?;
        Ok(())
    })?;
    get_template(id, state)
}

#[tauri::command]
pub fn update_template(
    id: String,
    input: TemplateInput,
    state: State<'_, AppState>,
) -> CommandResult<TemplateRecord> {
    let input = validate_template(input)?;
    let fields_json = serde_json::to_string(&input.fields).map_err(|_| CommandError::storage())?;
    state.with_connection(|connection| {
        let changed = connection
            .execute(
                "UPDATE templates SET name=?2, description=?3, fields_json=?4,
                   updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?1",
                params![id, input.name, input.description, fields_json],
            )
            .map_err(|_| CommandError::storage())?;
        if changed == 0 {
            Err(CommandError::not_found())
        } else {
            Ok(())
        }
    })?;
    get_template(id, state)
}

#[tauri::command]
pub fn delete_template(id: String, state: State<'_, AppState>) -> CommandResult<()> {
    state.with_connection(|connection| {
        let transaction = connection.unchecked_transaction().map_err(|_| CommandError::storage())?;
        let count: i64 = transaction.query_row("SELECT COUNT(*) FROM templates", [], |row| row.get(0)).map_err(|_| CommandError::storage())?;
        if count <= 1 {
            return Err(CommandError::new("last_template", "Poslední šablonu nelze smazat."));
        }
        let was_default: bool = transaction.query_row("SELECT is_default FROM templates WHERE id=?1", [&id], |row| row.get(0)).map_err(|error| match error { rusqlite::Error::QueryReturnedNoRows => CommandError::not_found(), _ => CommandError::storage() })?;
        let changed = transaction
            .execute("DELETE FROM templates WHERE id=?1", [&id])
            .map_err(|_| CommandError::storage())?;
        if changed == 0 {
            Err(CommandError::not_found())
        } else {
            if was_default {
                transaction.execute("UPDATE templates SET is_default=1 WHERE id=(SELECT id FROM templates ORDER BY created_at, id LIMIT 1)", []).map_err(|_| CommandError::storage())?;
            }
            transaction.commit().map_err(|_| CommandError::storage())
        }
    })
}

#[tauri::command]
pub fn set_default_template(id: String, state: State<'_, AppState>) -> CommandResult<()> {
    state.with_connection(|connection| {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|_| CommandError::storage())?;
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM templates WHERE id=?1)",
                [&id],
                |row| row.get(0),
            )
            .map_err(|_| CommandError::storage())?;
        if !exists {
            return Err(CommandError::not_found());
        }
        transaction
            .execute("UPDATE templates SET is_default=0 WHERE is_default=1", [])
            .map_err(|_| CommandError::storage())?;
        transaction
            .execute("UPDATE templates SET is_default=1 WHERE id=?1", [&id])
            .map_err(|_| CommandError::storage())?;
        transaction.commit().map_err(|_| CommandError::storage())
    })
}
