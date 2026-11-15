//! Original portrait source, evidence and history eligibility. No runtime owner.
use super::AnalysisWorkflowError;

pub fn validate_sources(
    statuses: &[String],
    context_items: usize,
) -> Result<(), AnalysisWorkflowError> {
    if statuses.iter().any(|status| status != "available") || context_items == 0 {
        return Err(AnalysisWorkflowError::InvalidInput(
            "来源文件尚无可读取的解析内容".into(),
        ));
    }
    Ok(())
}

pub fn validate_evidence(status: &str, items: usize) -> Result<(), AnalysisWorkflowError> {
    if status == "valid" && items > 0 {
        Ok(())
    } else {
        Err(AnalysisWorkflowError::InvalidInput(
            "来源文件没有可用依据".into(),
        ))
    }
}

pub fn validate_paper(paper: &str) -> Result<(), AnalysisWorkflowError> {
    if paper.trim().is_empty() || paper.len() > 512 {
        Err(AnalysisWorkflowError::InvalidInput("文献身份无效".into()))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_and_evidence_eligibility_preserve_original_portrait_predicates() {
        assert!(validate_sources(&["available".into()], 1).is_ok());
        assert!(validate_sources(&[], 1).is_ok());
        assert!(validate_sources(&["available".into()], 0).is_err());
        assert!(validate_sources(&["stale".into()], 1).is_err());
        assert!(validate_evidence("valid", 1).is_ok());
        assert!(validate_evidence("valid", 11).is_ok());
        assert!(validate_evidence("valid", 0).is_err());
        assert!(validate_evidence("partial", 1).is_err());
    }
    #[test]
    fn paper_identity_preserves_trim_and_original_utf8_byte_budget() {
        assert!(validate_paper("paper").is_ok());
        assert!(validate_paper(&"Ω".repeat(256)).is_ok());
        assert!(validate_paper(&"Ω".repeat(257)).is_err());
        assert!(validate_paper(" \t\n").is_err());
    }
}
