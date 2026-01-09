use axum::{
    http::StatusCode,
    response::Html,
};
use reqwest::header;

pub async fn finviz_heatmap() -> Result<Html<String>, (StatusCode, String)> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://finviz.com/map.ashx")
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (compatible; Firecash/1.0; +https://firecash.app)",
        )
        .header(header::ACCEPT, "text/html")
        .send()
        .await
        .map_err(|err| (StatusCode::BAD_GATEWAY, format!("Request failed: {err}")))?;

    if !response.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Heatmap returned status {}", response.status()),
        ));
    }

    let mut html = response
        .text()
        .await
        .map_err(|err| (StatusCode::BAD_GATEWAY, format!("Read failed: {err}")))?;

    if html.contains("<head>") {
        html = html.replace("<head>", "<head><base href=\"https://finviz.com/\">");
    }

    Ok(Html(html))
}
