use super::*;
use sha2::{Digest, Sha256};

pub fn identifier(value: &Value) -> Result<String, CaptureRejectionV1> {
    let id = match value {
        Value::String(id) => id.clone(),
        Value::Number(id) => id.to_string(),
        _ => return Err(CaptureRejectionV1::InvalidInput),
    };
    if id.is_empty() || id.len() > 200 || id.chars().any(char::is_control) {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    Ok(id)
}

pub fn validate_scope(scope: &str) -> Result<(), CaptureRejectionV1> {
    if scope.is_empty() || scope.len() > 128 || !scope.is_ascii() {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    Ok(())
}

pub fn validate_metadata(value: &Value) -> Result<String, CaptureRejectionV1> {
    fn has_credentials(value: &Value) -> bool {
        match value {
            Value::Object(object) => object.iter().any(|(key, value)| {
                let key = key.to_ascii_lowercase().replace(['_', '-'], "");
                matches!(
                    key.as_str(),
                    "cookie"
                        | "cookies"
                        | "cookiestring"
                        | "cookiesandbox"
                        | "cookiejar"
                        | "headers"
                        | "requestheaders"
                        | "responseheaders"
                        | "httpheaders"
                        | "authorization"
                        | "proxyauthorization"
                        | "accesstoken"
                        | "refreshtoken"
                        | "password"
                ) || has_credentials(value)
            }),
            Value::Array(values) => values.iter().any(has_credentials),
            _ => false,
        }
    }
    if !value.is_object() || has_credentials(value) {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    let serialized = serde_json::to_string(value).map_err(|_| CaptureRejectionV1::InvalidInput)?;
    if serialized.len() > MAX_METADATA_BYTES {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    Ok(serialized)
}

pub fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn text(value: &Value, field: &str) -> Result<String, CaptureRejectionV1> {
    match value.get(field) {
        Some(Value::String(text)) => Ok(text.clone()),
        None | Some(Value::Null) => Ok(String::new()),
        _ => Err(CaptureRejectionV1::InvalidInput),
    }
}
