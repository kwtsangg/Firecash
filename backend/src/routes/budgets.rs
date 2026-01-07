use axum::{extract::{Path, State}, http::StatusCode, Json};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{
        Budget, BudgetAlertRule, BudgetPeriod, BudgetPeriodStatus, BudgetWithStatus,
        CreateBudgetAlertRuleRequest, CreateBudgetRequest, UpdateBudgetAlertRuleRequest,
        UpdateBudgetRequest,
    },
    state::AppState,
};

fn current_period_bounds() -> (NaiveDate, NaiveDate) {
    let today = Utc::now().date_naive();
    let start = NaiveDate::from_ymd_opt(today.year(), today.month(), 1)
        .expect("invalid start date");
    let next_month = if today.month() == 12 {
        NaiveDate::from_ymd_opt(today.year() + 1, 1, 1).expect("invalid next date")
    } else {
        NaiveDate::from_ymd_opt(today.year(), today.month() + 1, 1)
            .expect("invalid next date")
    };
    let end = next_month - Duration::days(1);
    (start, end)
}

async fn ensure_current_period(
    state: &AppState,
    budget_id: Uuid,
    budget_amount: f64,
) -> Result<BudgetPeriod, (StatusCode, String)> {
    let (start, end) = current_period_bounds();
    let record = sqlx::query_as::<_, BudgetPeriod>(
        r#"
        SELECT id, budget_id, period_start, period_end, budgeted_amount, created_at
        FROM budget_periods
        WHERE budget_id = $1 AND period_start = $2
        "#,
    )
    .bind(budget_id)
    .bind(start)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if let Some(period) = record {
        return Ok(period);
    }

    let id = Uuid::new_v4();
    let period = sqlx::query_as::<_, BudgetPeriod>(
        r#"
        INSERT INTO budget_periods (id, budget_id, period_start, period_end, budgeted_amount)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, budget_id, period_start, period_end, budgeted_amount, created_at
        "#,
    )
    .bind(id)
    .bind(budget_id)
    .bind(start)
    .bind(end)
    .bind(budget_amount)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(period)
}

async fn build_budget_status(
    state: &AppState,
    user: &AuthenticatedUser,
    budget: Budget,
) -> Result<BudgetWithStatus, (StatusCode, String)> {
    let period = ensure_current_period(state, budget.id, budget.amount).await?;

    let spent_record = sqlx::query(
        r#"
        SELECT COALESCE(SUM(t.amount), 0.0) as spent
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = $1
          AND t.transaction_type = 'expense'
          AND t.currency_code = $2
          AND DATE(t.occurred_at) BETWEEN $3 AND $4
        "#,
    )
    .bind(user.id)
    .bind(&budget.currency_code)
    .bind(period.period_start)
    .bind(period.period_end)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let spent_amount: f64 = spent_record.try_get("spent").map_err(crate::auth::internal_error)?;

    Ok(BudgetWithStatus {
        id: budget.id,
        name: budget.name,
        currency_code: budget.currency_code,
        amount: budget.amount,
        period_interval: budget.period_interval,
        created_at: budget.created_at,
        current_period: BudgetPeriodStatus {
            period_id: period.id,
            period_start: period.period_start,
            period_end: period.period_end,
            budgeted_amount: period.budgeted_amount,
            spent_amount,
            is_over_budget: spent_amount > period.budgeted_amount,
        },
    })
}

pub async fn list_budgets(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<BudgetWithStatus>>, (StatusCode, String)> {
    let records = sqlx::query_as::<_, Budget>(
        r#"
        SELECT id, name, currency_code, amount, period_interval, created_at
        FROM budgets
        WHERE user_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let mut response = Vec::with_capacity(records.len());
    for budget in records {
        response.push(build_budget_status(&state, &user, budget).await?);
    }

    Ok(Json(response))
}

pub async fn create_budget(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateBudgetRequest>,
) -> Result<Json<BudgetWithStatus>, (StatusCode, String)> {
    let id = Uuid::new_v4();
    let period_interval = payload
        .period_interval
        .unwrap_or_else(|| "monthly".to_string());

    let record = sqlx::query_as::<_, Budget>(
        r#"
        INSERT INTO budgets (id, user_id, name, currency_code, amount, period_interval)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, currency_code, amount, period_interval, created_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(payload.name)
    .bind(payload.currency_code)
    .bind(payload.amount)
    .bind(period_interval)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let response = build_budget_status(&state, &user, record).await?;
    Ok(Json(response))
}

pub async fn update_budget(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(budget_id): Path<Uuid>,
    Json(payload): Json<UpdateBudgetRequest>,
) -> Result<Json<BudgetWithStatus>, (StatusCode, String)> {
    let record = sqlx::query_as::<_, Budget>(
        r#"
        UPDATE budgets
        SET name = COALESCE($1, name),
            currency_code = COALESCE($2, currency_code),
            amount = COALESCE($3, amount),
            period_interval = COALESCE($4, period_interval)
        WHERE id = $5 AND user_id = $6
        RETURNING id, name, currency_code, amount, period_interval, created_at
        "#,
    )
    .bind(payload.name)
    .bind(payload.currency_code)
    .bind(payload.amount)
    .bind(payload.period_interval)
    .bind(budget_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let budget = match record {
        Some(record) => record,
        None => return Err((StatusCode::NOT_FOUND, "Budget not found".into())),
    };

    let (start, _) = current_period_bounds();
    sqlx::query(
        r#"
        UPDATE budget_periods
        SET budgeted_amount = $1
        WHERE budget_id = $2 AND period_start = $3
        "#,
    )
    .bind(budget.amount)
    .bind(budget.id)
    .bind(start)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let response = build_budget_status(&state, &user, budget).await?;
    Ok(Json(response))
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

pub async fn list_budget_alert_rules(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(budget_id): Path<Uuid>,
) -> Result<Json<Vec<BudgetAlertRule>>, (StatusCode, String)> {
    let exists = sqlx::query(
        r#"
        SELECT 1
        FROM budgets
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(budget_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if exists.is_none() {
        return Err((StatusCode::NOT_FOUND, "Budget not found".into()));
    }

    let records = sqlx::query_as::<_, BudgetAlertRule>(
        r#"
        SELECT id, budget_id, threshold_type, threshold_value, created_at
        FROM budget_alert_rules
        WHERE budget_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(budget_id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_budget_alert_rule(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(budget_id): Path<Uuid>,
    Json(payload): Json<CreateBudgetAlertRuleRequest>,
) -> Result<Json<BudgetAlertRule>, (StatusCode, String)> {
    let exists = sqlx::query(
        r#"
        SELECT 1
        FROM budgets
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(budget_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if exists.is_none() {
        return Err((StatusCode::NOT_FOUND, "Budget not found".into()));
    }

    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, BudgetAlertRule>(
        r#"
        INSERT INTO budget_alert_rules (id, budget_id, threshold_type, threshold_value)
        VALUES ($1, $2, $3, $4)
        RETURNING id, budget_id, threshold_type, threshold_value, created_at
        "#,
    )
    .bind(id)
    .bind(budget_id)
    .bind(payload.threshold_type)
    .bind(payload.threshold_value)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_budget_alert_rule(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(rule_id): Path<Uuid>,
    Json(payload): Json<UpdateBudgetAlertRuleRequest>,
) -> Result<Json<BudgetAlertRule>, (StatusCode, String)> {
    let record = sqlx::query_as::<_, BudgetAlertRule>(
        r#"
        UPDATE budget_alert_rules
        SET threshold_type = COALESCE($1, threshold_type),
            threshold_value = COALESCE($2, threshold_value)
        FROM budgets
        WHERE budget_alert_rules.id = $3
          AND budget_alert_rules.budget_id = budgets.id
          AND budgets.user_id = $4
        RETURNING budget_alert_rules.id,
                  budget_alert_rules.budget_id,
                  budget_alert_rules.threshold_type,
                  budget_alert_rules.threshold_value,
                  budget_alert_rules.created_at
        "#,
    )
    .bind(payload.threshold_type)
    .bind(payload.threshold_value)
    .bind(rule_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    match record {
        Some(record) => Ok(Json(record)),
        None => Err((StatusCode::NOT_FOUND, "Alert rule not found".into())),
    }
}

pub async fn delete_budget_alert_rule(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(rule_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        r#"
        DELETE FROM budget_alert_rules
        USING budgets
        WHERE budget_alert_rules.id = $1
          AND budget_alert_rules.budget_id = budgets.id
          AND budgets.user_id = $2
        "#,
    )
    .bind(rule_id)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Alert rule not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
