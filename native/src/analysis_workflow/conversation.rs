//! Original paper-generation conversation decisions. Core owns all reads/writes.
use super::AnalysisWorkflowError;
use uuid::Uuid;

pub fn validate_generation_availability(
    portrait_active: bool,
    analysis_active: bool,
) -> Result<(), AnalysisWorkflowError> {
    if portrait_active || analysis_active {
        return Err(AnalysisWorkflowError::InvalidInput(
            "本文生成任务仍在运行，请先等待结束或取消。".into(),
        ));
    }
    Ok(())
}

pub fn existing_conversation(
    unarchived: Option<&str>,
) -> Result<Option<Uuid>, AnalysisWorkflowError> {
    unarchived
        .map(|id| Uuid::parse_str(id).map_err(|_| AnalysisWorkflowError::TemporaryUnavailable))
        .transpose()
}
