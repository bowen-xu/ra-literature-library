use regex::Regex;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DoiCreator {
    pub family: String,
    pub given: String,
    pub literal: String,
    pub role: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DoiMetadataDraft {
    pub item_type: String,
    pub title: String,
    pub abstract_text: String,
    pub issued_year: Option<i32>,
    pub container_title: String,
    pub conference_name: String,
    pub proceedings_title: String,
    pub place: String,
    pub volume: String,
    pub issue: String,
    pub pages: String,
    pub doi: String,
    pub url: String,
    pub language: String,
    pub creators: Vec<DoiCreator>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct DoiMetadataResult {
    pub draft: DoiMetadataDraft,
    pub raw_payload: String,
    pub source_kind: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum DoiMetadataError {
    #[error("{0}")]
    Request(String),
    #[error("{0}")]
    Parse(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TypeEvidence {
    pub(super) kind: &'static str,
    pub(super) value: String,
}

pub(super) trait NonEmptyString {
    fn or_else_nonempty(self, fallback: impl FnOnce() -> Option<String>) -> String;
}

impl NonEmptyString for String {
    fn or_else_nonempty(self, fallback: impl FnOnce() -> Option<String>) -> String {
        if self.is_empty() {
            fallback().unwrap_or_default()
        } else {
            self
        }
    }
}

pub(super) fn clean_text(value: &str) -> String {
    let without_tags = Regex::new(r"(?is)<[^>]+>")
        .expect("valid metadata tag regex")
        .replace_all(value, " ");
    decode_html(&without_tags)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode_html(value: &str) -> String {
    let mut output = value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");
    let numeric = Regex::new(r"&#(x[0-9a-fA-F]+|[0-9]+);").expect("valid entity regex");
    output = numeric
        .replace_all(&output, |captures: &regex::Captures<'_>| {
            let raw = &captures[1];
            let parsed = raw
                .strip_prefix('x')
                .or_else(|| raw.strip_prefix('X'))
                .and_then(|value| u32::from_str_radix(value, 16).ok())
                .or_else(|| raw.parse::<u32>().ok());
            parsed
                .and_then(char::from_u32)
                .unwrap_or('\u{fffd}')
                .to_string()
        })
        .into_owned();
    output
}

pub(super) fn value_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => clean_text(value),
        Some(Value::Array(values)) => values
            .iter()
            .find_map(|value| value.as_str())
            .map(clean_text)
            .unwrap_or_default(),
        Some(Value::Number(value)) => value.to_string(),
        _ => String::new(),
    }
}

pub(super) fn date_year(value: Option<&Value>) -> Option<i32> {
    value
        .and_then(|value| value.get("date-parts"))
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(Value::as_array)
        .and_then(|part| part.first())
        .and_then(Value::as_i64)
        .and_then(|year| i32::try_from(year).ok())
}

pub(super) fn json_creators(value: Option<&Value>, role: &str) -> Vec<DoiCreator> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|author| DoiCreator {
            family: value_string(author.get("family").or_else(|| author.get("familyName"))),
            given: value_string(author.get("given").or_else(|| author.get("givenName"))),
            literal: value_string(author.get("literal").or_else(|| author.get("name"))),
            role: role.to_owned(),
        })
        .filter(|creator| {
            !creator.family.is_empty() || !creator.given.is_empty() || !creator.literal.is_empty()
        })
        .collect()
}
