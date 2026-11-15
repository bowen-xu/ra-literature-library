//! The original manual claim and evidence relationship validation.
use research_workbench_native_sdk::evidence_write::*;
pub mod storage;
pub fn decide(input: &EvidenceWriteInputV1) -> EvidenceWriteDecisionV1 {
    let rejection = match input {
        EvidenceWriteInputV1::Claim {
            statement,
            epistemic_role,
        } => {
            if statement.is_empty() {
                Some(EvidenceWriteRejectionV1::EmptyStatement)
            } else if !matches!(
                epistemic_role.as_str(),
                "assertion"
                    | "source_paraphrase"
                    | "synthesis"
                    | "inference"
                    | "hypothesis"
                    | "question"
                    | "working_note"
            ) {
                Some(EvidenceWriteRejectionV1::InvalidEpistemicRole(
                    epistemic_role.clone(),
                ))
            } else {
                None
            }
        }
        EvidenceWriteInputV1::Stance { stance } => {
            if matches!(stance.as_str(), "supports" | "opposes" | "context") {
                None
            } else {
                Some(EvidenceWriteRejectionV1::InvalidStance(stance.clone()))
            }
        }
    };
    EvidenceWriteDecisionV1 { rejection }
}
#[cfg(test)]
mod tests;
