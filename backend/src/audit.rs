use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn record_audit_event(
    pool: &PgPool,
    user_id: Option<Uuid>,
    action: &str,
    context: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO audit_logs (id, user_id, action, context)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(action)
    .bind(context)
    .execute(pool)
    .await?;

    Ok(())
}
