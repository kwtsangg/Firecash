use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Serialize, FromRow)]
pub struct Account {
    pub id: Uuid,
    pub name: String,
    pub currency_code: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateAccountRequest {
    pub name: String,
    pub currency_code: String,
}

#[derive(Serialize, FromRow)]
pub struct AccountGroup {
    pub id: Uuid,
    pub name: String,
}

#[derive(Deserialize)]
pub struct CreateAccountGroupRequest {
    pub name: String,
    pub account_ids: Vec<Uuid>,
}

#[derive(Serialize, FromRow)]
pub struct Transaction {
    pub id: Uuid,
    pub account_id: Uuid,
    pub category_id: Option<Uuid>,
    pub payee_id: Option<Uuid>,
    pub amount: f64,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub occurred_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateTransactionRequest {
    pub account_id: Uuid,
    pub category_id: Option<Uuid>,
    pub payee_id: Option<Uuid>,
    pub amount: f64,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub occurred_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
pub struct RecurringTransaction {
    pub id: Uuid,
    pub account_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub interval_days: i32,
    pub next_occurs_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateRecurringTransactionRequest {
    pub account_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub interval_days: i32,
    pub next_occurs_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
pub struct TotalsResponse {
    pub total: f64,
    pub currency_code: String,
    pub totals_by_currency: Vec<CurrencyTotal>,
}

#[derive(Serialize, FromRow)]
pub struct CurrencyTotal {
    pub currency_code: String,
    pub total: f64,
}

#[derive(Serialize, FromRow)]
pub struct HistoryPoint {
    pub date: NaiveDate,
    pub value: f64,
}

#[derive(Serialize, FromRow)]
pub struct FxRate {
    pub base_currency: String,
    pub quote_currency: String,
    pub rate: f64,
    pub recorded_on: NaiveDate,
}

#[derive(Serialize, FromRow)]
pub struct Asset {
    pub id: Uuid,
    pub account_id: Uuid,
    pub symbol: String,
    pub asset_type: String,
    pub quantity: f64,
    pub currency_code: String,
}

#[derive(Deserialize)]
pub struct CreateAssetRequest {
    pub account_id: Uuid,
    pub symbol: String,
    pub asset_type: String,
    pub quantity: f64,
    pub currency_code: String,
}

#[derive(Serialize, FromRow)]
pub struct Category {
    pub id: Uuid,
    pub name: String,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateCategoryRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateCategoryRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct Payee {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreatePayeeRequest {
    pub name: String,
}

#[derive(Deserialize)]
pub struct UpdatePayeeRequest {
    pub name: String,
}

#[derive(Serialize, FromRow)]
pub struct Budget {
    pub id: Uuid,
    pub category_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateBudgetRequest {
    pub category_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
}

#[derive(Deserialize)]
pub struct UpdateBudgetRequest {
    pub category_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
}
