use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};

pub fn decoded_title(metadata: &Value) -> Result<String, CaptureRejectionV1> {
    let title = text(metadata, "title")?;
    // Upstream sends UTF-8 Q words; also accept the standard B representation.
    let lower = title.to_ascii_lowercase();
    let title = if lower.starts_with("=?utf-8?q?") && title.ends_with("?=") {
        let encoded = &title.as_bytes()[10..title.len() - 2];
        let mut decoded = Vec::new();
        let mut position = 0;
        while position < encoded.len() {
            match encoded[position] {
                b'=' => {
                    let pair = encoded
                        .get(position + 1..position + 3)
                        .ok_or(CaptureRejectionV1::InvalidInput)?;
                    let hex =
                        std::str::from_utf8(pair).map_err(|_| CaptureRejectionV1::InvalidInput)?;
                    decoded.push(
                        u8::from_str_radix(hex, 16)
                            .map_err(|_| CaptureRejectionV1::InvalidInput)?,
                    );
                    position += 3;
                }
                b'_' => {
                    decoded.push(b' ');
                    position += 1;
                }
                byte => {
                    decoded.push(byte);
                    position += 1;
                }
            }
        }
        String::from_utf8(decoded).map_err(|_| CaptureRejectionV1::InvalidInput)?
    } else if lower.starts_with("=?utf-8?b?") && title.ends_with("?=") {
        String::from_utf8(
            STANDARD
                .decode(&title[10..title.len() - 2])
                .map_err(|_| CaptureRejectionV1::InvalidInput)?,
        )
        .map_err(|_| CaptureRejectionV1::InvalidInput)?
    } else {
        title
    };
    if title.chars().any(char::is_control) {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    Ok(if title.trim().is_empty() {
        "document.pdf".to_owned()
    } else {
        title
    })
}
