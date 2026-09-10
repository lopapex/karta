use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    error::{CommandError, CommandResult},
    models::{VisitInput, VisitRecord, VisitSummary},
};

fn validate_visit(input: VisitInput) -> CommandResult<VisitInput> {
    let notes = input.notes.trim().to_owned();
    if notes.is_empty() || notes.chars().count() > 100_000 || !valid_date(&input.visit_date) {
        return Err(CommandError::validation());
    }
    Ok(VisitInput {
        visit_date: input.visit_date,
        notes,
    })
}

fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let Ok(year) = value[0..4].parse::<u32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u32>() else {
        return false;
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    day >= 1 && day <= max_day
}

#[tauri::command]
pub fn list_visits(
    client_id: String,
    state: State<'_, AppState>,
) -> CommandResult<Vec<VisitSummary>> {
    state.with_connection(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT id, client_id, visit_date, notes, created_at, updated_at FROM client_visits
             WHERE client_id=?1 ORDER BY visit_date DESC, created_at DESC",
            )
            .map_err(|_| CommandError::storage())?;
        let rows = statement
            .query_map([client_id], |row| {
                let notes: String = row.get(3)?;
                let mut preview: String = notes.chars().take(180).collect();
                if notes.chars().count() > 180 {
                    preview.push('…');
                }
                Ok(VisitSummary {
                    id: row.get(0)?,
                    client_id: row.get(1)?,
                    visit_date: row.get(2)?,
                    notes_preview: preview,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|_| CommandError::storage())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| CommandError::storage())
    })
}

#[tauri::command]
pub fn get_visit(
    client_id: String,
    id: String,
    state: State<'_, AppState>,
) -> CommandResult<VisitRecord> {
    state.with_connection(|connection| get_visit_record(connection, &client_id, &id))
}

fn get_visit_record(
    connection: &rusqlite::Connection,
    client_id: &str,
    id: &str,
) -> CommandResult<VisitRecord> {
    connection.query_row(
        "SELECT id, client_id, visit_date, notes, created_at, updated_at FROM client_visits WHERE id=?1 AND client_id=?2",
        params![id, client_id],
        |row| Ok(VisitRecord { id: row.get(0)?, client_id: row.get(1)?, visit_date: row.get(2)?, notes: row.get(3)?, created_at: row.get(4)?, updated_at: row.get(5)? })
    ).map_err(|error| match error { rusqlite::Error::QueryReturnedNoRows => CommandError::not_found(), _ => CommandError::storage() })
}

#[tauri::command]
pub fn create_visit(
    client_id: String,
    input: VisitInput,
    state: State<'_, AppState>,
) -> CommandResult<VisitRecord> {
    let input = validate_visit(input)?;
    let id = Uuid::new_v4().to_string();
    state.with_connection(|connection| {
        let client_exists: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM clients WHERE id=?1)", [&client_id], |row| row.get(0)).map_err(|_| CommandError::storage())?;
        if !client_exists { return Err(CommandError::not_found()); }
        connection.execute(
            "INSERT INTO client_visits(id, client_id, visit_date, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![id, client_id, input.visit_date, input.notes]
        ).map_err(|_| CommandError::storage())?;
        get_visit_record(connection, &client_id, &id)
    })
}

#[tauri::command]
pub fn update_visit(
    client_id: String,
    id: String,
    input: VisitInput,
    state: State<'_, AppState>,
) -> CommandResult<VisitRecord> {
    let input = validate_visit(input)?;
    state.with_connection(|connection| {
        let changed = connection.execute(
            "UPDATE client_visits SET visit_date=?3, notes=?4, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?1 AND client_id=?2",
            params![id, client_id, input.visit_date, input.notes]
        ).map_err(|_| CommandError::storage())?;
        if changed == 0 { return Err(CommandError::not_found()); }
        get_visit_record(connection, &client_id, &id)
    })
}

#[tauri::command]
pub fn delete_visit(
    client_id: String,
    id: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.with_connection(|connection| {
        let changed = connection
            .execute(
                "DELETE FROM client_visits WHERE id=?1 AND client_id=?2",
                params![id, client_id],
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
    use super::*;
    #[test]
    fn validates_calendar_dates() {
        assert!(valid_date("2024-02-29"));
        assert!(!valid_date("2025-02-29"));
        assert!(!valid_date("2025-13-01"));
    }
}
