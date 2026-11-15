use super::*;
use research_workbench_native_sdk::knowledge_snapshot::KnowledgeConcept;
use serde::Serialize;
use sha2::{Digest, Sha256};

pub(super) const RENDER_VERSION: &str = "concept-identity-v1";

pub fn normalize_term(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn validate_name(value: &str) -> Result<&str, BootstrapRejectionV1> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 500 {
        return Err(BootstrapRejectionV1::InvalidNameLength);
    }
    if name.split('`').any(|part| part.trim().is_empty()) {
        return Err(BootstrapRejectionV1::EmptyNameContext);
    }
    Ok(name)
}

pub fn rejection_message(reason: &BootstrapRejectionV1) -> &'static str {
    match reason {
        BootstrapRejectionV1::EmptyTerm => "语词不能为空",
        BootstrapRejectionV1::TermTooLong => "语词或语言标记过长",
        BootstrapRejectionV1::InvalidNameLength => "概念名称须为 1–500 个字符",
        BootstrapRejectionV1::EmptyNameContext => "分隔符前的名称和分隔符后的语境均不能为空",
        BootstrapRejectionV1::ConceptFieldsTooLong => "概念字段超过允许长度",
        BootstrapRejectionV1::NameUnavailable => "概念名称已存在，请使用不同名称，或用 ` 添加语境",
        BootstrapRejectionV1::InvalidStructure => "关系数据结构无效",
    }
}

pub(super) fn term_validation(text: &str, language: &str) -> TermValidationV1 {
    let text = text.trim();
    let language = language.trim();
    let normalized_text = normalize_term(text);
    let reason = if normalized_text.is_empty() {
        Some(BootstrapRejectionV1::EmptyTerm)
    } else if text.chars().count() > 500 || language.chars().count() > 32 {
        Some(BootstrapRejectionV1::TermTooLong)
    } else {
        None
    };
    match reason {
        Some(reason) => TermValidationV1::Rejected { reason },
        None => TermValidationV1::Prepared {
            trimmed_text: text.into(),
            normalized_text,
            language: language.into(),
        },
    }
}

#[derive(Serialize)]
struct ConceptIdentityDocument<'a> {
    kind: &'static str,
    preferred_term: &'a str,
    aliases: Vec<&'a str>,
    label: &'a str,
    explanation: &'a str,
    disambiguation: &'a str,
    domain: &'a str,
    tradition: &'a str,
    period: &'a str,
}

pub fn render_concept(concept: &KnowledgeConcept) -> Result<String, serde_json::Error> {
    let mut aliases = concept
        .terms
        .iter()
        .filter(|term| term.id != concept.preferred_term.id)
        .map(|term| term.text.as_str())
        .collect::<Vec<_>>();
    aliases.sort_unstable();
    aliases.dedup();
    serde_json::to_string(&ConceptIdentityDocument {
        kind: "concept_identity_v1",
        preferred_term: &concept.preferred_term.text,
        aliases,
        label: &concept.label,
        explanation: &concept.explanation,
        disambiguation: &concept.disambiguation,
        domain: &concept.domain,
        tradition: &concept.tradition,
        period: &concept.period,
    })
}

pub(super) fn render_prepared(
    details: &PreparedConceptDetailsV1,
    text: &str,
) -> Result<String, serde_json::Error> {
    serde_json::to_string(&ConceptIdentityDocument {
        kind: "concept_identity_v1",
        preferred_term: text,
        aliases: vec![],
        label: &details.label,
        explanation: &details.explanation,
        disambiguation: &details.disambiguation,
        domain: &details.domain,
        tradition: &details.tradition,
        period: &details.period,
    })
}

pub fn embedding_space_id(region: &str, model_id: &str) -> String {
    let fingerprint = format!(
        "qwen-embedding|{}|{}|1024|float32|cosine|l2|document|query|{}",
        region.trim(),
        model_id.trim(),
        RENDER_VERSION
    );
    let hash = format!("{:x}", Sha256::digest(fingerprint.as_bytes()));
    format!("space-{}", &hash[..32])
}

pub fn stable_row_id(representation_id: &str, space_id: &str, generation: i64) -> String {
    let fingerprint = format!("{representation_id}|{space_id}|{generation}");
    let hash = format!("{:x}", Sha256::digest(fingerprint.as_bytes()));
    format!("row-{}", &hash[..32])
}

pub(super) fn name_key(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect()
}
