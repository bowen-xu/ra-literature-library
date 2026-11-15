//! Original paper-batch scope, target and metadata-source qualification.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as Error,
    candidate_review::contracts::AiCandidate,
};

pub fn replay(
    paper: &str,
    request: &str,
    stored_paper: &str,
    stored_request: &str,
) -> Result<(), Error> {
    if paper != stored_paper || request != stored_request {
        return Err(Error::InvalidInput("文献确认幂等键已用于其他范围".into()));
    }
    Ok(())
}
pub fn exists(exists: bool) -> Result<(), Error> {
    if !exists {
        return Err(Error::InvalidInput("找不到待确认文献".into()));
    }
    Ok(())
}
pub fn target(candidate: &AiCandidate, paper: &str) -> Result<(), Error> {
    if candidate.evidence_bundle.items.is_empty()
        || candidate
            .evidence_bundle
            .items
            .iter()
            .any(|item| item.paper_id != paper)
    {
        return Err(Error::InvalidInput("候选不属于当前文献".into()));
    }
    Ok(())
}
pub fn metadata(source: Option<(bool, String)>) -> Result<bool, Error> {
    let (confirmed, _) =
        source.ok_or_else(|| Error::InvalidInput("字段没有可确认的来源".into()))?;
    Ok(!confirmed)
}
