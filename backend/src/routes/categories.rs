use axum::{extract::{Path, State}, http::StatusCode, Json};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{Category, CreateCategoryRequest, UpdateCategoryRequest},
    state::AppState,
};

pub async fn list_categories(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Category>>, (StatusCode, String)> {
    let records = sqlx::query_as::<_, Category>(
        r#"
        SELECT id, name, color, created_at
        FROM categories
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

pub async fn create_category(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateCategoryRequest>,
) -> Result<Json<Category>, (StatusCode, String)> {
    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Category>(
        r#"
        INSERT INTO categories (id, user_id, name, color)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, color, created_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(payload.name)
    .bind(payload.color)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_category(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(category_id): Path<Uuid>,
    Json(payload): Json<UpdateCategoryRequest>,
) -> Result<Json<Category>, (StatusCode, String)> {
    let record = sqlx::query_as::<_, Category>(
        r#"
        UPDATE categories
        SET name = $1,
            color = $2
        WHERE id = $3 AND user_id = $4
        RETURNING id, name, color, created_at
        "#,
    )
    .bind(payload.name)
    .bind(payload.color)
    .bind(category_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Category not found".into()));
    };

    Ok(Json(record))
}

pub async fn delete_category(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(category_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        r#"
        DELETE FROM categories
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(category_id)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Category not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
