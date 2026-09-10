use std::collections::HashSet;

use serde_json::Value;

use crate::{
    error::{CommandError, CommandResult},
    models::{CardField, FieldType, TemplateInput},
};

const MAX_TITLE: usize = 160;
const MAX_DESCRIPTION: usize = 2_000;
const MAX_FIELDS: usize = 100;
const MAX_FIELD_LABEL: usize = 120;
const MAX_OPTIONS: usize = 100;

pub fn clean_title(value: &str) -> CommandResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > MAX_TITLE {
        return Err(CommandError::validation());
    }
    Ok(value.to_owned())
}

pub fn validate_template(mut input: TemplateInput) -> CommandResult<TemplateInput> {
    let name = clean_title(&input.name)?;
    let description = input.description.trim().to_owned();
    if description.chars().count() > MAX_DESCRIPTION {
        return Err(CommandError::validation());
    }
    validate_fields(&input.fields, false)?;
    for field in &mut input.fields {
        field.is_custom = false;
    }
    Ok(TemplateInput {
        name,
        description,
        fields: input.fields,
    })
}

pub fn validate_fields(fields: &[CardField], allow_values: bool) -> CommandResult<()> {
    if fields.len() > MAX_FIELDS {
        return Err(CommandError::validation());
    }
    let mut ids = HashSet::new();
    for field in fields {
        if uuid::Uuid::parse_str(&field.id).is_err()
            || !ids.insert(field.id.as_str())
            || field.label.trim().is_empty()
            || field.label.chars().count() > MAX_FIELD_LABEL
            || (!allow_values && field.value.is_some())
        {
            return Err(CommandError::validation());
        }
        if field.field_type == FieldType::Select {
            validate_options(field)?;
        } else if !field.options.is_empty() {
            return Err(CommandError::validation());
        }
        if let Some(value) = &field.value {
            validate_value(field, value)?;
            if allow_values
                && field.required
                && value.as_str().is_some_and(|text| text.trim().is_empty())
            {
                return Err(CommandError::validation());
            }
        } else if allow_values && field.required {
            return Err(CommandError::validation());
        }
    }
    Ok(())
}

fn validate_options(field: &CardField) -> CommandResult<()> {
    if field.options.is_empty() || field.options.len() > MAX_OPTIONS {
        return Err(CommandError::validation());
    }
    let mut ids = HashSet::new();
    for option in &field.options {
        if uuid::Uuid::parse_str(&option.id).is_err()
            || !ids.insert(option.id.as_str())
            || option.label.trim().is_empty()
            || option.label.chars().count() > MAX_FIELD_LABEL
        {
            return Err(CommandError::validation());
        }
    }
    Ok(())
}

fn validate_value(field: &CardField, value: &Value) -> CommandResult<()> {
    let valid = match field.field_type {
        FieldType::Checkbox => value.is_boolean(),
        FieldType::Number => value.is_number(),
        FieldType::Select => value
            .as_str()
            .is_some_and(|selected| field.options.iter().any(|option| option.id == selected)),
        _ => value
            .as_str()
            .is_some_and(|text| text.chars().count() <= 20_000),
    };
    if valid {
        Ok(())
    } else {
        Err(CommandError::validation())
    }
}

pub fn validate_backup_password(password: &str) -> CommandResult<()> {
    if (12..=256).contains(&password.chars().count()) {
        Ok(())
    } else {
        Err(CommandError::new(
            "weak_backup_password",
            "Heslo zálohy musí mít alespoň 12 znaků.",
        ))
    }
}

pub fn validate_app_password(password: &str) -> CommandResult<()> {
    if (6..=64).contains(&password.chars().count()) {
        Ok(())
    } else {
        Err(CommandError::new(
            "invalid_app_password",
            "Heslo KARTA musí mít 6 až 64 znaků.",
        ))
    }
}
