use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;

use chrono::Duration;
use crate::{audit::record_audit_event, auth::AuthenticatedUser, state::AppState};

const PREFERENCE_KEYS: [&str; 7] = [
    "categories",
    "strategies",
    "holding_strategies",
    "retention_days",
    "export_redaction",
    "asset_refresh_cadence",
    "asset_data_source",
];

#[derive(Serialize)]
pub struct PreferencesResponse {
    pub categories: Vec<String>,
    pub strategies: Vec<String>,
    pub holding_strategies: HashMap<String, String>,
    pub retention_days: Option<i64>,
    pub export_redaction: String,
    pub asset_refresh_cadence: String,
    pub asset_data_source: String,
}

#[derive(Deserialize)]
pub struct PreferencesUpdate {
    pub categories: Option<Vec<String>>,
    pub strategies: Option<Vec<String>>,
    pub holding_strategies: Option<HashMap<String, String>>,
    pub retention_days: Option<i64>,
    pub export_redaction: Option<String>,
    pub asset_refresh_cadence: Option<String>,
    pub asset_data_source: Option<String>,
}

pub async fn list_preferences(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<PreferencesResponse>, (StatusCode, String)> {
    let keys: Vec<String> = PREFERENCE_KEYS.iter().map(|key| key.to_string()).collect();
    let rows = sqlx::query(
        r#"
        SELECT key, value
        FROM user_preferences
        WHERE user_id = $1 AND key = ANY($2)
        "#,
    )
    .bind(user.id)
    .bind(&keys)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let mut categories: Vec<String> = Vec::new();
    let mut strategies: Vec<String> = Vec::new();
    let mut holding_strategies: HashMap<String, String> = HashMap::new();
    let mut retention_days: Option<i64> = None;
    let mut export_redaction = "none".to_string();
    let mut asset_refresh_cadence = "daily".to_string();
    let mut asset_data_source = "stooq".to_string();

    for row in rows {
        let key: String = row.try_get("key").map_err(crate::auth::internal_error)?;
        let value: Value = row.try_get("value").map_err(crate::auth::internal_error)?;
        match key.as_str() {
            "categories" => {
                if let Ok(parsed) = serde_json::from_value::<Vec<String>>(value) {
                    categories = parsed;
                }
            }
            "strategies" => {
                if let Ok(parsed) = serde_json::from_value::<Vec<String>>(value) {
                    strategies = parsed;
                }
            }
            "holding_strategies" => {
                if let Ok(parsed) = serde_json::from_value::<HashMap<String, String>>(value) {
                    holding_strategies = parsed;
                }
            }
            "retention_days" => {
                if let Ok(parsed) = serde_json::from_value::<i64>(value) {
                    retention_days = Some(parsed);
                }
            }
            "export_redaction" => {
                if let Ok(parsed) = serde_json::from_value::<String>(value) {
                    export_redaction = parsed;
                }
            }
            "asset_refresh_cadence" => {
                if let Ok(parsed) = serde_json::from_value::<String>(value) {
                    asset_refresh_cadence = parsed;
                }
            }
            "asset_data_source" => {
                if let Ok(parsed) = serde_json::from_value::<String>(value) {
                    asset_data_source = parsed;
                }
            }
            _ => {}
        }
    }

    Ok(Json(PreferencesResponse {
        categories,
        strategies,
        holding_strategies,
        retention_days,
        export_redaction,
        asset_refresh_cadence,
        asset_data_source,
    }))
}

pub async fn update_preferences(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<PreferencesUpdate>,
) -> Result<Json<PreferencesResponse>, (StatusCode, String)> {
    let mut updates: Vec<(&str, Value)> = Vec::new();
    if let Some(categories) = payload.categories {
        updates.push(("categories", serde_json::to_value(categories).unwrap_or(Value::Null)));
    }
    if let Some(strategies) = payload.strategies {
        updates.push(("strategies", serde_json::to_value(strategies).unwrap_or(Value::Null)));
    }
    if let Some(holding_strategies) = payload.holding_strategies {
        updates.push((
            "holding_strategies",
            serde_json::to_value(holding_strategies).unwrap_or(Value::Null),
        ));
    }
    if let Some(retention_days) = payload.retention_days {
        let value = if retention_days > 0 {
            serde_json::to_value(retention_days).unwrap_or(Value::Null)
        } else {
            Value::Null
        };
        updates.push(("retention_days", value));
    }
    if let Some(export_redaction) = payload.export_redaction {
        let normalized = export_redaction.trim().to_lowercase();
        if !matches!(normalized.as_str(), "none" | "pii") {
            return Err((StatusCode::BAD_REQUEST, "Invalid export redaction".into()));
        }
        updates.push((
            "export_redaction",
            serde_json::to_value(normalized).unwrap_or(Value::Null),
        ));
    }
    if let Some(asset_refresh_cadence) = payload.asset_refresh_cadence {
        let normalized = asset_refresh_cadence.trim().to_lowercase();
        if !matches!(normalized.as_str(), "hourly" | "daily" | "weekly" | "manual") {
            return Err((StatusCode::BAD_REQUEST, "Invalid refresh cadence".into()));
        }
        updates.push((
            "asset_refresh_cadence",
            serde_json::to_value(normalized).unwrap_or(Value::Null),
        ));
    }
    if let Some(asset_data_source) = payload.asset_data_source {
        let normalized = asset_data_source.trim().to_lowercase();
        if !matches!(normalized.as_str(), "stooq" | "manual" | "broker" | "custom") {
            return Err((StatusCode::BAD_REQUEST, "Invalid data source".into()));
        }
        updates.push((
            "asset_data_source",
            serde_json::to_value(normalized).unwrap_or(Value::Null),
        ));
    }

    for (key, value) in updates {
        sqlx::query(
            r#"
            INSERT INTO user_preferences (user_id, key, value)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, key)
            DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            "#,
        )
        .bind(user.id)
        .bind(key)
        .bind(value)
        .execute(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    if let Some(retention_days) = payload.retention_days {
        if retention_days > 0 {
            let cutoff = chrono::Utc::now() - Duration::days(retention_days);
            let deleted = sqlx::query(
                r#"
                DELETE FROM transactions
                USING accounts
                WHERE transactions.account_id = accounts.id
                  AND accounts.user_id = $1
                  AND transactions.occurred_at < $2
                "#,
            )
            .bind(user.id)
            .bind(cutoff)
            .execute(&state.pool)
            .await
            .map_err(crate::auth::internal_error)?;

            let _ = record_audit_event(
                &state.pool,
                Some(user.id),
                "retention.applied",
                serde_json::json!({ "retention_days": retention_days, "deleted": deleted.rows_affected() }),
            )
            .await;
        }
    }

    list_preferences(State(state), user).await
}
