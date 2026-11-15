//! Original candidate hash/kind predicate and workflow recovery status choices.
use research_workbench_native_sdk::analysis_workflow::recovery::{
    CandidateRecoveryInputV1, CandidateRecoveryPolicyV1,
};
use sha2::{Digest, Sha256};

pub fn candidate_policy(input: &CandidateRecoveryInputV1) -> Option<CandidateRecoveryPolicyV1> {
    let computed = format!("{:x}", Sha256::digest(input.payload_json.as_bytes()));
    let valid = input.original_payload_hash == input.revision_payload_hash
        && input.revision_payload_hash == computed
        && matches!(
            (input.task_kind.as_str(), input.candidate_kind.as_str()),
            ("paper_overview", "paper_overview_unit_v1")
                | ("paper_concept_map", "paper_concept_map_v1")
        );
    if !valid {
        return None;
    }
    let overview = input.task_kind == "paper_overview";
    Some(CandidateRecoveryPolicyV1 {
        expected_workflow_status: if overview { "failed" } else { "partial" }.into(),
        running_workflow_status: if overview {
            "overview_running"
        } else {
            "concepts_running"
        }
        .into(),
        completion_with_concept: if overview {
            "overview_ready"
        } else {
            "needs_review"
        }
        .into(),
        completion_without_concept: "needs_review".into(),
        recovery_reasons: [
            "validated_candidate_committed_without_matching_workflow".into(),
            "validated_candidate_committed_before_post_commit_read_failed".into(),
            "validated_candidate_committed_with_ambiguous_workflow".into(),
        ],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_recovery_rejects_wrong_kind_and_either_changed_hash() {
        let payload = "{\"kind\":\"paper_overview_unit_v1\",\"schemaVersion\":1}";
        let hash = format!("{:x}", Sha256::digest(payload.as_bytes()));
        let input = CandidateRecoveryInputV1 {
            task_kind: "paper_overview".into(),
            candidate_kind: "paper_overview_unit_v1".into(),
            original_payload_hash: hash.clone(),
            revision_payload_hash: hash,
            payload_json: payload.into(),
        };
        let policy = candidate_policy(&input).unwrap();
        assert_eq!(policy.expected_workflow_status, "failed");
        assert_eq!(policy.running_workflow_status, "overview_running");
        assert_eq!(policy.completion_with_concept, "overview_ready");
        assert_eq!(policy.completion_without_concept, "needs_review");
        let mut invalid = input.clone();
        invalid.original_payload_hash = "c".repeat(64);
        assert_eq!(candidate_policy(&invalid), None);
        let mut invalid = input.clone();
        invalid.revision_payload_hash = "d".repeat(64);
        assert_eq!(candidate_policy(&invalid), None);
        let mut invalid = input;
        invalid.task_kind = "paper_concept_map".into();
        assert_eq!(candidate_policy(&invalid), None);
    }
}
