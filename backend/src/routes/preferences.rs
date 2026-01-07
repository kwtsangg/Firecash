use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;

use crate::{auth::AuthenticatedUser, state::AppState};

const PREFERENCE_KEYS: [&str; 3] = ["categories", "strategies", "holding_strategies"];

#[derive(Serialize)]
pub struct PreferencesResponse {
    pub categories: Vec<String>,
    pub strategies: Vec<String>,
    pub holding_strategies: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct PreferencesUpdate {
    pub categories: Option<Vec<String>>,
    pub strategies: Option<Vec<String>>,
    pub holding_strategies: Option<HashMap<String, String>>,
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
            _ => {}
        }
    }

    Ok(Json(PreferencesResponse {
        categories,
        strategies,
        holding_strategies,
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

    list_preferences(State(state), user).await
}
