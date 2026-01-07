use axum::{extract::{Path, State}, http::StatusCode, Json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{Budget, CreateBudgetRequest, UpdateBudgetRequest},
    state::AppState,
};

pub async fn list_budgets(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Budget>>, (StatusCode, String)> {
    let records = sqlx::query_as::<_, Budget>(
        r#"
        SELECT id, category_id, amount, currency_code, period_start, period_end, created_at
        FROM budgets
        WHERE user_id = $1
        ORDER BY period_start DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_budget(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateBudgetRequest>,
) -> Result<Json<Budget>, (StatusCode, String)> {
    let category_owner = sqlx::query(
        r#"
        SELECT user_id
        FROM categories
        WHERE id = $1
        "#,
    )
    .bind(payload.category_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(category_owner) = category_owner else {
        return Err((StatusCode::NOT_FOUND, "Category not found".into()));
    };

    let category_owner_id: Uuid = category_owner
        .try_get("user_id")
        .map_err(crate::auth::internal_error)?;
    if category_owner_id != user.id {
        return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Budget>(
        r#"
        INSERT INTO budgets (
            id, user_id, category_id, amount, currency_code, period_start, period_end
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, category_id, amount, currency_code, period_start, period_end, created_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(payload.category_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.period_start)
    .bind(payload.period_end)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_budget(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(budget_id): Path<Uuid>,
    Json(payload): Json<UpdateBudgetRequest>,
) -> Result<Json<Budget>, (StatusCode, String)> {
    let category_owner = sqlx::query(
        r#"
        SELECT user_id
        FROM categories
        WHERE id = $1
        "#,
    )
    .bind(payload.category_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(category_owner) = category_owner else {
        return Err((StatusCode::NOT_FOUND, "Category not found".into()));
    };

    let category_owner_id: Uuid = category_owner
        .try_get("user_id")
        .map_err(crate::auth::internal_error)?;
    if category_owner_id != user.id {
        return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    let record = sqlx::query_as::<_, Budget>(
        r#"
        UPDATE budgets
        SET category_id = $1,
            amount = $2,
            currency_code = $3,
            period_start = $4,
            period_end = $5
        WHERE id = $6 AND user_id = $7
        RETURNING id, category_id, amount, currency_code, period_start, period_end, created_at
        "#,
    )
    .bind(payload.category_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.period_start)
    .bind(payload.period_end)
    .bind(budget_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Budget not found".into()));
    };

    Ok(Json(record))
}

pub async fn delete_budget(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(budget_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        r#"
        DELETE FROM budgets
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(budget_id)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Budget not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
