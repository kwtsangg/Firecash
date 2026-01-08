#[derive(Clone, Debug, serde::Serialize)]
pub struct IntegrationProviderCatalog {
    pub key: String,
    pub display_name: String,
    pub description: String,
    pub data_source: String,
    pub refresh_cadence: String,
    pub supports_read_only: bool,
}

pub fn available_providers() -> Vec<IntegrationProviderCatalog> {
    vec![
        IntegrationProviderCatalog {
            key: "manual_csv".to_string(),
            display_name: "Manual CSV Import".to_string(),
            description: "Upload CSV exports from other tools to keep balances fresh.".to_string(),
            data_source: "User uploads".to_string(),
            refresh_cadence: "On demand".to_string(),
            supports_read_only: true,
        },
        IntegrationProviderCatalog {
            key: "plaid_sandbox".to_string(),
            display_name: "Plaid Sandbox".to_string(),
            description: "Demo banking feeds for staging and development teams.".to_string(),
            data_source: "Plaid Sandbox".to_string(),
            refresh_cadence: "Daily".to_string(),
            supports_read_only: false,
        },
        IntegrationProviderCatalog {
            key: "brokerage_sync".to_string(),
            display_name: "Brokerage Holdings Sync".to_string(),
            description: "Pull holdings and prices from a supported brokerage export.".to_string(),
            data_source: "Brokerage APIs".to_string(),
            refresh_cadence: "Every 6 hours".to_string(),
            supports_read_only: true,
        },
    ]
}
