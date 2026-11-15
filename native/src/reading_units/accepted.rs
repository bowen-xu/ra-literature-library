//! Original AI-reviewed reading-unit checks at the original write boundary.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as AiError,
    reading_units::accepted::AcceptedReadingUnitV1,
};
pub fn validate(draft: &AcceptedReadingUnitV1) -> Result<(), AiError> {
    if draft.title.trim().chars().count() > 240
        || draft.body.trim().is_empty()
        || draft.anchor_ids.is_empty()
        || !super::UNIT_KINDS.contains(&draft.unit_kind.as_str())
    {
        return Err(AiError::InvalidInput(
            "AI 审查生成的阅读单元内容无效".into(),
        ));
    }
    if !matches!(
        draft.provenance_kind.as_str(),
        "ai_accepted_unchanged" | "ai_accepted_after_edit"
    ) || !super::EPISTEMIC_ROLES.contains(&draft.epistemic_role.as_str())
    {
        return Err(AiError::InvalidInput("AI 审查来源或认识角色无效".into()));
    }
    Ok(())
}
pub fn static_sql() -> [&'static str; 3] {
    [
        include_str!("../../data/reading-unit-accepted-insert.v1.sql"),
        include_str!("../../data/reading-unit-accepted-evidence.v1.sql"),
        include_str!("../../data/nal-bootstrap-research-revision-insert.v1.sql"),
    ]
}
