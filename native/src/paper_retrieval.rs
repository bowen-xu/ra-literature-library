//! Original exact paper scope, query, status, expiry and context-hash ordering.
use crate::retrieval_trace::validate_context;
use research_workbench_native_sdk::{
    literature_trace_protocol::TraceDecision,
    paper_retrieval::{PaperRetrievalInputV1, PaperRetrievalOutcomeV1},
    retrieval_trace::MarkSentCondition,
};

pub fn decide(input: PaperRetrievalInputV1) -> PaperRetrievalOutcomeV1 {
    let decision = match validate_context(Some(&input.paper_id), &input.query, input.row.clone()) {
        Ok(_) => TraceDecision::Ready {
            mark_sent: MarkSentCondition::ORIGINAL,
        },
        Err(reason) => TraceDecision::Rejected {
            reason: reason.into(),
        },
    };
    PaperRetrievalOutcomeV1 {
        input: Box::new(input),
        decision,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::retrieval_trace::hash;
    use research_workbench_native_sdk::{
        catalog::{CatalogInput, CatalogOutput},
        retrieval_trace::{RetrievalTraceRow, TraceRejection},
    };

    #[test]
    fn actual_dispatch_reuses_original_scope_and_rejection_order_without_changing_input() {
        let input = PaperRetrievalInputV1 {
            paper_id: " raw-paper ".into(),
            query: " question Ω ".into(),
            row: Some(RetrievalTraceRow {
                paper_id: Some(" raw-paper ".into()),
                query_sha256: hash("question Ω"),
                status: "previewed".into(),
                context_text: "[CN-S1] 原文\n".into(),
                context_sha256: hash("[CN-S1] 原文\n"),
                expired: false,
            }),
        };
        let CatalogOutput::PaperRetrievalTrace { outcome } =
            crate::catalog::dispatch(CatalogInput::DecidePaperRetrievalTrace {
                input: Box::new(input.clone()),
            })
            .unwrap()
        else {
            panic!("paper retrieval outcome")
        };
        assert_eq!(*outcome.input, input);
        assert_eq!(
            outcome.decision,
            TraceDecision::Ready {
                mark_sent: MarkSentCondition::ORIGINAL
            }
        );
        let mut invalid = input.clone();
        let row = invalid.row.as_mut().unwrap();
        row.paper_id = None;
        row.status = "sent".into();
        row.expired = true;
        row.context_sha256 = "broken".into();
        assert_eq!(
            decide(invalid).decision,
            TraceDecision::Rejected {
                reason: TraceRejection::QueryMismatch
            }
        );
        let mut invalid = input.clone();
        let row = invalid.row.as_mut().unwrap();
        row.expired = true;
        row.context_sha256 = "broken".into();
        assert_eq!(
            decide(invalid).decision,
            TraceDecision::Rejected {
                reason: TraceRejection::Expired
            }
        );
        assert!(validate_context(None, &input.query, input.row).is_err());
    }
}
