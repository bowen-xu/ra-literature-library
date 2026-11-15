//! Single original structured-content policy, independent of Core runtime and SQL.
mod candidate_schema;
mod knowledge_candidate_schema;
mod paper_concept_map_schema;
mod paper_portrait;
mod research_candidate_schema;
mod template;
#[cfg(test)]
mod tests;
pub use candidate_schema::decode_candidate_value;
pub use paper_portrait::DIMENSIONS as PORTRAIT_DIMENSIONS;
use research_workbench_native_sdk::candidate_contracts::{
    CandidatePayload, CandidateValidationError as AiError, EvidenceQuote,
};
use serde_json::Value;
use std::collections::HashSet;

pub fn structured(kind: &str, value: Value, bundle: &[EvidenceQuote]) -> Result<Value, AiError> {
    let payload = candidate_schema::decode_candidate_value(value, &evidence_keys(bundle))?;
    let expected = if kind == "portrait" {
        "paper_portrait_v1"
    } else {
        "paper_overview_unit_v1"
    };
    if payload.kind() != expected {
        return Err(AiError::Validation {
            path: "$.kind".into(),
            message: "内容类型与目标资源不匹配".into(),
        });
    }
    quotes(&payload, bundle)?;
    serde_json::to_value(payload).map_err(|_| AiError::InvalidInput("无法规范化结构化内容".into()))
}

pub fn quotes(payload: &CandidatePayload, bundle: &[EvidenceQuote]) -> Result<(), AiError> {
    paper_portrait::validate_quotes(payload, bundle)?;
    template::validate_quotes(payload, bundle)
}

fn evidence_keys(bundle: &[EvidenceQuote]) -> HashSet<String> {
    bundle
        .iter()
        .map(|item| item.citation_key.clone())
        .collect()
}
