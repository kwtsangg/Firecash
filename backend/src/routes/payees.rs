use axum::{extract::{Path, State}, http::StatusCode, Json};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{CreatePayeeRequest, Payee, UpdatePayeeRequest},
    state::AppState,
};

pub async fn list_payees(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Payee>>, (StatusCode, String)> {
    let records = sqlx::query_as::<_, Payee>(
        r#"
        SELECT id, name, created_at
        FROM payees
        WHERE user_id = $1
        ORDER BY name
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_payee(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreatePayeeRequest>,
) -> Result<Json<Payee>, (StatusCode, String)> {
    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Payee>(
        r#"
        INSERT INTO payees (id, user_id, name)
        VALUES ($1, $2, $3)
        RETURNING id, name, created_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(payload.name)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_payee(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(payee_id): Path<Uuid>,
    Json(payload): Json<UpdatePayeeRequest>,
) -> Result<Json<Payee>, (StatusCode, String)> {
    let record = sqlx::query_as::<_, Payee>(
        r#"
        UPDATE payees
        SET name = $1
        WHERE id = $2 AND user_id = $3
        RETURNING id, name, created_at
        "#,
    )
    .bind(payload.name)
    .bind(payee_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Payee not found".into()));
    };

    Ok(Json(record))
}

pub async fn delete_payee(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(payee_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        r#"
        DELETE FROM payees
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(payee_id)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Payee not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
