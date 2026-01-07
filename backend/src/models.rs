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

#[derive(Deserialize)]
pub struct UpdateAccountRequest {
    pub name: Option<String>,
    pub currency_code: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct UpdateAccountResponse {
    pub id: Uuid,
    pub name: String,
    pub currency_code: String,
    pub created_at: DateTime<Utc>,
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

#[derive(Deserialize)]
pub struct UpdateAccountGroupRequest {
    pub name: Option<String>,
    pub account_ids: Option<Vec<Uuid>>,
}

#[derive(Serialize, FromRow)]
pub struct UpdateAccountGroupResponse {
    pub id: Uuid,
    pub name: String,
}

#[derive(Serialize, FromRow)]
pub struct Transaction {
    pub id: Uuid,
    pub account_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub occurred_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateTransactionRequest {
    pub account_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub occurred_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct UpdateTransactionRequest {
    pub account_id: Option<Uuid>,
    pub amount: Option<f64>,
    pub currency_code: Option<String>,
    pub transaction_type: Option<String>,
    pub description: Option<String>,
    pub occurred_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, FromRow)]
pub struct UpdateTransactionResponse {
    pub id: Uuid,
    pub account_id: Uuid,
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
    pub is_enabled: bool,
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
    pub is_enabled: Option<bool>,
}

#[derive(Deserialize)]
pub struct UpdateRecurringTransactionRequest {
    pub account_id: Option<Uuid>,
    pub amount: Option<f64>,
    pub currency_code: Option<String>,
    pub transaction_type: Option<String>,
    pub description: Option<String>,
    pub interval_days: Option<i32>,
    pub next_occurs_at: Option<DateTime<Utc>>,
    pub is_enabled: Option<bool>,
}

#[derive(Serialize, FromRow)]
pub struct UpdateRecurringTransactionResponse {
    pub id: Uuid,
    pub account_id: Uuid,
    pub amount: f64,
    pub currency_code: String,
    pub transaction_type: String,
    pub description: Option<String>,
    pub interval_days: i32,
    pub next_occurs_at: DateTime<Utc>,
    pub is_enabled: bool,
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
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateAssetRequest {
    pub account_id: Uuid,
    pub symbol: String,
    pub asset_type: String,
    pub quantity: f64,
    pub currency_code: String,
}

#[derive(Deserialize)]
pub struct UpdateAssetRequest {
    pub account_id: Option<Uuid>,
    pub symbol: Option<String>,
    pub asset_type: Option<String>,
    pub quantity: Option<f64>,
    pub currency_code: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct UpdateAssetResponse {
    pub id: Uuid,
    pub account_id: Uuid,
    pub symbol: String,
    pub asset_type: String,
    pub quantity: f64,
    pub currency_code: String,
    pub created_at: DateTime<Utc>,
}
