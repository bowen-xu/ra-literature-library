//! Original marker reset and whole-batch undo qualification.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as Error,
    candidate_review::contracts::AiOverviewFieldConfirmation,
    paper_confirmation::contracts::AiOverviewConfirmationBatch,
};

pub fn whole_batch_key(reset_key_exists: bool) -> Result<(), Error> {
    if reset_key_exists {
        return Err(Error::InvalidInput("撤销幂等键已用于字段恢复".into()));
    }
    Ok(())
}

pub fn replay_key(
    existing_batch: Option<&str>,
    requested_batch: &str,
    paper: bool,
) -> Result<(), Error> {
    if existing_batch.is_some_and(|existing| existing != requested_batch) {
        let message = if paper {
            "撤销幂等键已用于其他文献确认批次"
        } else {
            "撤销幂等键已用于其他批次"
        };
        return Err(Error::InvalidInput(message.into()));
    }
    Ok(())
}

pub fn reset_field<'a>(
    batch: &'a AiOverviewConfirmationBatch,
    field_kind: &str,
) -> Result<&'a AiOverviewFieldConfirmation, Error> {
    batch
        .field_confirmations
        .iter()
        .find(|field| field.field_kind == field_kind)
        .ok_or_else(|| Error::InvalidInput("该批次没有此字段的审核记录".into()))
}

pub fn reset_eligibility(
    field: &AiOverviewFieldConfirmation,
    existing_reset: Option<&str>,
    legacy_key_exists: bool,
) -> Result<bool, Error> {
    if legacy_key_exists || existing_reset.is_some_and(|id| id != field.id) {
        return Err(Error::InvalidInput("恢复幂等键已用于其他审核操作".into()));
    }
    if !field.active && field.review_reset_at.is_none() {
        return Err(Error::InvalidInput("该审核记录已撤销".into()));
    }
    Ok(field.active)
}

pub fn reset_state_flags(field_active: &[bool], revision_editors: &[String]) -> &'static str {
    if field_active.iter().any(|active| *active)
        || revision_editors.iter().any(|editor| editor == "human")
    {
        "edited"
    } else {
        "unreviewed"
    }
}
