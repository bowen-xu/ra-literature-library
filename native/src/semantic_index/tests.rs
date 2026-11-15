use super::*;
use research_workbench_native_sdk::semantic_index::EmbeddingJobSummary;

fn job(status: &str) -> EmbeddingJobSummary {
    EmbeddingJobSummary {
        job_id: "job".into(),
        representation_id: "representation".into(),
        subject_kind: "concept".into(),
        subject_id: "concept".into(),
        status: status.into(),
        attempt: 2,
        error_code: None,
        created_at: "now".into(),
        finished_at: None,
    }
}

#[test]
fn original_retry_reuses_only_pending_or_ready_success() {
    for record_status in ["queued", "running", "ready", "failed", "stale"] {
        for status in ["queued", "running", "succeeded", "failed", "interrupted"] {
            let actual = decide(Input::Retry {
                record_status: record_status.into(),
                latest: Some(job(status)),
            });
            let expected = matches!(status, "queued" | "running")
                || status == "succeeded" && record_status == "ready";
            assert_eq!(matches!(actual, Decision::ReuseJob { .. }), expected);
            if let Decision::ReuseJob { should_start, .. } = actual {
                assert_eq!(should_start, status == "queued");
            }
        }
    }
}

#[test]
fn original_ready_activation_requires_building_and_zero_pending() {
    for status in ["building", "active", "ready", "superseded"] {
        for pending in [-1, 0, 1] {
            assert_eq!(
                decide(Input::Activate {
                    status: status.into(),
                    pending,
                }),
                Decision::Flag {
                    value: status == "building" && pending == 0,
                }
            );
        }
    }
}

#[test]
fn wire_keeps_exact_input_and_float_payload_bits() {
    use research_workbench_native_sdk::semantic_index::{
        ReconciliationRecord, rules::StoredIndexRowV1,
    };
    let input = Input::ReconcileRecord {
        record: ReconciliationRecord {
            record_id: "record".into(),
            representation_id: "representation".into(),
            lance_row_id: "row".into(),
            input_sha256: "hash".into(),
            status: "running".into(),
        },
        stored: Some(StoredIndexRowV1 {
            input_sha256: "hash".into(),
            dataset_version: u64::MAX,
            vector_norm_bits: 0x7fc0_1234,
        }),
    };
    let wire = IndexWireInputV1 {
        cbor_base64: encode_payload(&input).unwrap(),
    };
    let outcome = prepare(wire.clone()).unwrap();
    assert_eq!(*outcome.input, wire);
    assert_eq!(
        decode_payload::<Decision>(&outcome.decision_cbor_base64).unwrap(),
        decide(input)
    );
}
