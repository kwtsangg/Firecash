use axum::{
    extract::{Multipart, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use csv::Trim;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::{collections::HashMap, io::Cursor};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{CreateTransactionRequest, Transaction},
    state::AppState,
};

#[derive(Deserialize)]
pub struct ExportTransactionsQuery {
    pub start: Option<NaiveDate>,
    pub end: Option<NaiveDate>,
    pub account_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct CsvImportMapping {
    pub account_id: String,
    pub amount: String,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub occurred_at: String,
}

#[derive(Deserialize)]
pub struct CsvImportPayload {
    pub mapping: CsvImportMapping,
}

#[derive(Serialize)]
pub struct CsvImportResponse {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

pub async fn list_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Transaction>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, Transaction>(
        r#"
        SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
               t.description, t.occurred_at
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = $1
        ORDER BY t.occurred_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateTransactionRequest>,
) -> Result<Json<Transaction>, (axum::http::StatusCode, String)> {
    let account_owner = sqlx::query(
        r#"
        SELECT user_id
        FROM accounts
        WHERE id = $1
        "#,
    )
    .bind(payload.account_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let owner_id: Uuid = account_owner
        .try_get("user_id")
        .map_err(crate::auth::internal_error)?;

    if owner_id != user.id {
        return Err((axum::http::StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Transaction>(
        r#"
        INSERT INTO transactions (
            id, account_id, amount, currency_code, transaction_type, description, occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, account_id, amount, currency_code, transaction_type, description, occurred_at
        "#,
    )
    .bind(id)
    .bind(payload.account_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.transaction_type)
    .bind(payload.description)
    .bind(payload.occurred_at)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn export_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<ExportTransactionsQuery>,
) -> Result<Response, (StatusCode, String)> {
    let start = query
        .start
        .map(|date| Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap()));
    let end = query
        .end
        .map(|date| Utc.from_utc_datetime(&date.and_hms_opt(23, 59, 59).unwrap()));

    let records = sqlx::query_as::<_, Transaction>(
        r#"
        SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
               t.description, t.occurred_at
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = $1
          AND ($2::uuid IS NULL OR t.account_id = $2)
          AND ($3::timestamptz IS NULL OR t.occurred_at >= $3)
          AND ($4::timestamptz IS NULL OR t.occurred_at <= $4)
        ORDER BY t.occurred_at DESC
        "#,
    )
    .bind(user.id)
    .bind(query.account_id)
    .bind(start)
    .bind(end)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let mut writer = csv::Writer::from_writer(vec![]);
    writer
        .write_record([
            "account_id",
            "amount",
            "currency_code",
            "transaction_type",
            "description",
            "occurred_at",
        ])
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    for record in records {
        writer
            .write_record([
                record.account_id.to_string(),
                record.amount.to_string(),
                record.currency_code,
                record.transaction_type,
                record.description.unwrap_or_default(),
                record.occurred_at.to_rfc3339(),
            ])
            .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    }

    let data = writer
        .into_inner()
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "text/csv".parse().unwrap());
    headers.insert(
        header::CONTENT_DISPOSITION,
        "attachment; filename=\"transactions.csv\"".parse().unwrap(),
    );

    Ok((headers, data).into_response())
}

pub async fn import_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    mut multipart: Multipart,
) -> Result<Json<CsvImportResponse>, (StatusCode, String)> {
    let mut file_bytes = None;
    let mut mapping_json = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(crate::auth::internal_error)?
    {
        match field.name() {
            Some("file") => {
                file_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(crate::auth::internal_error)?,
                );
            }
            Some("mapping") => {
                mapping_json = Some(
                    field
                        .text()
                        .await
                        .map_err(crate::auth::internal_error)?,
                );
            }
            _ => {}
        }
    }

    let file_bytes = file_bytes.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "CSV file is required under the 'file' field.".to_string(),
        )
    })?;
    let mapping_json = mapping_json.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Mapping JSON is required under the 'mapping' field.".to_string(),
        )
    })?;
    let payload: CsvImportPayload = serde_json::from_str(&mapping_json)
        .map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?;

    let account_rows = sqlx::query(
        r#"
        SELECT id
        FROM accounts
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let allowed_accounts: Vec<Uuid> = account_rows
        .iter()
        .map(|row| row.try_get("id").map_err(crate::auth::internal_error))
        .collect::<Result<Vec<Uuid>, _>>()?;

    let mut reader = csv::ReaderBuilder::new()
        .trim(Trim::All)
        .from_reader(Cursor::new(file_bytes));

    let headers = reader
        .headers()
        .map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?
        .clone();
    let header_map: HashMap<String, usize> = headers
        .iter()
        .enumerate()
        .map(|(idx, name)| (name.to_string(), idx))
        .collect();

    let mut errors = Vec::new();
    let mut imported = 0;
    let mut skipped = 0;
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(crate::auth::internal_error)?;

    for (row_index, row_result) in reader.records().enumerate() {
        let row_number = row_index + 2;
        let record = match row_result {
            Ok(record) => record,
            Err(err) => {
                skipped += 1;
                errors.push(format!("Row {}: {}", row_number, err));
                continue;
            }
        };

        let row_result = parse_import_row(
            &record,
            row_number,
            &header_map,
            &payload.mapping,
            &allowed_accounts,
        );

        let row = match row_result {
            Ok(row) => row,
            Err(err) => {
                skipped += 1;
                errors.push(err);
                continue;
            }
        };

        sqlx::query(
            r#"
            INSERT INTO transactions (
                id, account_id, amount, currency_code, transaction_type, description, occurred_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(row.account_id)
        .bind(row.amount)
        .bind(row.currency_code)
        .bind(row.transaction_type)
        .bind(row.description)
        .bind(row.occurred_at)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;

        imported += 1;
    }

    tx.commit().await.map_err(crate::auth::internal_error)?;

    Ok(Json(CsvImportResponse {
        imported,
        skipped,
        errors,
    }))
}

struct ParsedImportRow {
    account_id: Uuid,
    amount: f64,
    currency_code: String,
    transaction_type: String,
    description: Option<String>,
    occurred_at: DateTime<Utc>,
}

fn parse_import_row(
    record: &csv::StringRecord,
    row_number: usize,
    header_map: &HashMap<String, usize>,
    mapping: &CsvImportMapping,
    allowed_accounts: &[Uuid],
) -> Result<ParsedImportRow, String> {
    let account_id = parse_uuid_field(record, row_number, header_map, &mapping.account_id)?;
    if !allowed_accounts.contains(&account_id) {
        return Err(format!(
            "Row {}: account {} is not available to this user.",
            row_number, account_id
        ));
    }
    let amount = parse_f64_field(record, row_number, header_map, &mapping.amount)?;
    let currency_code = parse_string_field(record, row_number, header_map, &mapping.currency_code)?
        .to_string();
    let transaction_type =
        parse_string_field(record, row_number, header_map, &mapping.transaction_type)?
            .to_string();
    let description = match &mapping.description {
        Some(column) => {
            let value = parse_string_field(record, row_number, header_map, column)?;
            if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            }
        }
        None => None,
    };
    let occurred_at_value =
        parse_string_field(record, row_number, header_map, &mapping.occurred_at)?;
    let occurred_at = parse_datetime(occurred_at_value).map_err(|err| {
        format!(
            "Row {}: invalid occurred_at value '{}': {}",
            row_number, occurred_at_value, err
        )
    })?;

    Ok(ParsedImportRow {
        account_id,
        amount,
        currency_code,
        transaction_type,
        description,
        occurred_at,
    })
}

fn parse_uuid_field(
    record: &csv::StringRecord,
    row_number: usize,
    header_map: &HashMap<String, usize>,
    column: &str,
) -> Result<Uuid, String> {
    let value = parse_string_field(record, row_number, header_map, column)?;
    Uuid::parse_str(value)
        .map_err(|_| format!("Row {}: invalid UUID in column '{}'.", row_number, column))
}

fn parse_f64_field(
    record: &csv::StringRecord,
    row_number: usize,
    header_map: &HashMap<String, usize>,
    column: &str,
) -> Result<f64, String> {
    let value = parse_string_field(record, row_number, header_map, column)?;
    value.parse::<f64>().map_err(|_| {
        format!(
            "Row {}: invalid number '{}' in column '{}'.",
            row_number, value, column
        )
    })
}

fn parse_string_field<'a>(
    record: &'a csv::StringRecord,
    row_number: usize,
    header_map: &HashMap<String, usize>,
    column: &str,
) -> Result<&'a str, String> {
    let index = header_map.get(column).ok_or_else(|| {
        format!(
            "Row {}: missing column '{}' in CSV header.",
            row_number, column
        )
    })?;
    Ok(record.get(*index).unwrap_or("").trim())
}

fn parse_datetime(value: &str) -> Result<DateTime<Utc>, String> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Ok(parsed.with_timezone(&Utc));
    }
    if let Ok(date) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        return Ok(Utc.from_utc_datetime(
            &date.and_hms_opt(0, 0, 0).ok_or("invalid date")?,
        ));
    }
    Err("expected RFC3339 timestamp or YYYY-MM-DD date".into())
}
