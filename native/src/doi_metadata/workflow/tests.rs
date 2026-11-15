use super::*;
use crate::catalog::{CatalogInput, CatalogItemRows, CatalogOutput, CatalogRelatedRows, dispatch};
use research_workbench_native_sdk::{
    catalog::CatalogOperation,
    catalog_save::CatalogDraft,
    data::{DataRows, DataValue},
    doi_metadata::{DoiHttpBodyV1, DoiHttpErrorV1},
};
use serde_json::json;

const DOI: &str = "10.1000/example";
const CHAPTER: &str = r#"{"type":"book-chapter","title":"Chapter"}"#;

fn run(input: DoiPreviewInputV1) -> Result<DoiPreviewOutcomeV1, CatalogDecodeError> {
    let input = CatalogInput::DoiPreview {
        input: Box::new(input),
    };
    assert_eq!(input.operation(), CatalogOperation::DoiPreview);
    let output = dispatch(serde_json::from_slice(&serde_json::to_vec(&input).unwrap()).unwrap())?;
    assert_eq!(output.operation(), CatalogOperation::DoiPreview);
    let output = serde_json::from_slice(&serde_json::to_vec(&output).unwrap()).unwrap();
    let CatalogOutput::DoiPreview { outcome } = output else {
        unreachable!()
    };
    Ok(*outcome)
}

fn body(body: &str, final_https: bool) -> DoiHttpBodyV1 {
    DoiHttpBodyV1 {
        content_type: "application/json".into(),
        body: body.into(),
        final_https,
    }
}

fn translation() -> DoiTranslationV1 {
    let outcome = run(DoiPreviewInputV1::Translate {
        normalized_doi: DOI.into(),
        resolver: Ok(body(r#"{"type":"journal-article","title":"New"}"#, true)),
        publisher: None,
    })
    .unwrap();
    let DoiPreviewOutcomeV1::Translated { translation } = outcome else {
        unreachable!()
    };
    translation
}

fn candidate(item_id: Option<&str>, current: Option<CatalogItemRows>) -> DoiPreviewInputV1 {
    DoiPreviewInputV1::Candidate {
        id: "candidate\0id".into(),
        import_job_id: "job".into(),
        item_id: item_id.map(str::to_owned),
        normalized_doi: DOI.into(),
        translation: Box::new(translation()),
        current,
        current_normalized_doi: DOI.into(),
    }
}

#[test]
fn start_retains_blank_before_invalid_doi_and_the_original_job_policy() {
    for normalized_doi in [None, Some(DOI.into())] {
        assert_eq!(
            run(DoiPreviewInputV1::Start {
                raw_input: " \u{2003}\n".into(),
                normalized_doi,
            })
            .unwrap(),
            rejected("invalid_input", "DOI 不能为空")
        );
    }
    assert_eq!(
        run(DoiPreviewInputV1::Start {
            raw_input: "not a DOI".into(),
            normalized_doi: None,
        })
        .unwrap(),
        rejected("invalid_input", "未识别到有效 DOI，请检查输入内容")
    );
    assert_eq!(
        run(DoiPreviewInputV1::Start {
            raw_input: "https://doi.org/10.1000/EXAMPLE.".into(),
            normalized_doi: Some(DOI.into()),
        })
        .unwrap(),
        DoiPreviewOutcomeV1::Started {
            normalized_doi: DOI.into(),
            source_kind: "doi".into(),
            finish_states: ImportFinishStatesV1 {
                no_failed: "completed".into(),
                no_imported: "failed".into(),
                mixed: "completed_with_errors".into(),
            },
            resolver_accept: DOI_ACCEPT.into(),
            publisher_accept: "text/html,application/xhtml+xml".into(),
            resolver_limit: DOI_RESPONSE_LIMIT,
            publisher_limit: HTML_RESPONSE_LIMIT,
        }
    );
}

#[test]
fn translation_preserves_all_original_draft_bindings_creators_and_raw_audit() {
    let raw = r#" {"type":"journal-article","title":" A &amp; B ","abstract":"<p>Abstract</p>","issued":{"date-parts":[[2026]]},"container-title":"Journal","event-title":"Conference","event-place":"Place","volume":"7","issue":"2","page":"3–8","URL":"https://example.invalid","language":"zh","author":[{"family":"Family","given":"Given"}],"editor":[{"literal":"Editor"}],"keyword":"a; b, a"} "#;
    let outcome = run(DoiPreviewInputV1::Translate {
        normalized_doi: DOI.into(),
        resolver: Ok(body(raw, true)),
        publisher: None,
    })
    .unwrap();
    let DoiPreviewOutcomeV1::Translated { translation } = outcome else {
        unreachable!()
    };
    let expected: CatalogDraft = serde_json::from_value(json!({
        "id":null,"itemType":"journalArticle","title":"A & B","abstractText":"Abstract",
        "issuedYear":2026,"containerTitle":"Journal","conferenceName":"Conference",
        "proceedingsTitle":"","place":"Place","volume":"7","issue":"2","pages":"3–8",
        "doi":DOI,"url":"https://example.invalid","language":"zh","bibtexKey":"",
        "rawBibtex":null,"creators":[
            {"familyName":"Family","givenName":"Given","literalName":"","role":"author"},
            {"familyName":"","givenName":"","literalName":"Editor","role":"editor"}
        ],"tags":["a","b","a"],"sourceKind":"doi.org:csl-json"
    }))
    .unwrap();
    assert_eq!(translation.draft, expected);
    assert_eq!(translation.source_kind, "doi.org:csl-json");
    assert!(translation.warnings.is_empty());
    let audit: serde_json::Value = serde_json::from_str(&translation.raw_payload).unwrap();
    assert_eq!(audit["doiResponse"], raw);
    assert_eq!(audit["contentType"], "application/json");
    assert_eq!(audit["schemaVersion"], 1);
}

#[test]
fn publisher_is_requested_once_as_an_outcome_then_pure_translation_is_deterministic() {
    let input = DoiPreviewInputV1::Translate {
        normalized_doi: DOI.into(),
        resolver: Ok(body(CHAPTER, true)),
        publisher: None,
    };
    assert_eq!(run(input).unwrap(), DoiPreviewOutcomeV1::NeedsPublisher {});
    let input = DoiPreviewInputV1::Translate {
        normalized_doi: DOI.into(),
        resolver: Ok(body(CHAPTER, true)),
        publisher: Some(Ok(body(
            "<meta name='citation_conference_title' content='Actual Conference'>",
            true,
        ))),
    };
    let outcome = run(input.clone()).unwrap();
    assert_eq!(run(input).unwrap(), outcome);
    let DoiPreviewOutcomeV1::Translated { translation } = outcome else {
        unreachable!()
    };
    assert_eq!(translation.draft.item_type, "conferencePaper");
    assert_eq!(translation.draft.conference_name, "Actual Conference");
    let audit: serde_json::Value = serde_json::from_str(&translation.raw_payload).unwrap();
    assert_eq!(audit["doiResponse"], CHAPTER);
    assert_eq!(
        audit["embeddedMetadata"]["citation_conference_title"],
        "Actual Conference"
    );
}

#[test]
fn resolver_failures_keep_connector_prefix_and_publisher_failures_keep_base_metadata() {
    for (error, message) in [
        (
            DoiHttpErrorV1::InvalidResolver {
                cause: "safe URL".into(),
            },
            "DOI 元数据请求失败：DOI resolver 地址无效：safe URL",
        ),
        (
            DoiHttpErrorV1::Client {
                cause: "safe client".into(),
            },
            "DOI 元数据请求失败：safe client",
        ),
        (
            DoiHttpErrorV1::Send {
                cause: "safe send".into(),
            },
            "DOI 元数据请求失败：无法连接 DOI resolver：safe send",
        ),
        (
            DoiHttpErrorV1::NotFound {},
            "DOI 元数据请求失败：没有找到 DOI 元数据，请检查 DOI 是否正确",
        ),
        (
            DoiHttpErrorV1::Status {
                status: 503,
                cause: "safe status".into(),
            },
            "DOI 元数据请求失败：DOI resolver 返回错误：safe status",
        ),
        (
            DoiHttpErrorV1::TooLarge { status: 200 },
            "DOI 元数据请求失败：DOI resolver 响应超过大小限制",
        ),
        (
            DoiHttpErrorV1::Read {
                status: 200,
                cause: "safe read".into(),
            },
            "DOI 元数据请求失败：无法读取DOI resolver 响应：safe read",
        ),
        (
            DoiHttpErrorV1::Utf8 {
                status: 200,
                cause: "safe UTF-8".into(),
            },
            "DOI 元数据请求失败：DOI resolver 响应不是 UTF-8：safe UTF-8",
        ),
    ] {
        assert_eq!(
            run(DoiPreviewInputV1::Translate {
                normalized_doi: DOI.into(),
                resolver: Err(error),
                publisher: None,
            })
            .unwrap(),
            rejected("connector_error", message)
        );
    }
    for publisher in [
        Ok(body("non-HTTPS metadata is not consumed", false)),
        Err(DoiHttpErrorV1::Send {
            cause: "safe publisher send".into(),
        }),
    ] {
        let outcome = run(DoiPreviewInputV1::Translate {
            normalized_doi: DOI.into(),
            resolver: Ok(body(CHAPTER, true)),
            publisher: Some(publisher),
        })
        .unwrap();
        let DoiPreviewOutcomeV1::Translated { translation } = outcome else {
            unreachable!()
        };
        assert_eq!(translation.draft.title, "Chapter");
        assert_eq!(translation.draft.item_type, "bookSection");
        assert_eq!(translation.warnings.len(), 1);
    }
    for error in [
        DoiHttpErrorV1::InvalidResolver {
            cause: "private URL".into(),
        },
        DoiHttpErrorV1::Client {
            cause: "private client".into(),
        },
    ] {
        let protocol = run(DoiPreviewInputV1::Translate {
            normalized_doi: DOI.into(),
            resolver: Ok(body(CHAPTER, true)),
            publisher: Some(Err(error.clone())),
        })
        .unwrap_err();
        assert_eq!(protocol, CatalogDecodeError::InvalidDoiPreviewPublisher);
        assert!(!protocol.to_string().contains("private"));
        let error = prepare(DOI, "application/json", CHAPTER)
            .unwrap()
            .finish(Some(PublisherOutcome::Failed(error)))
            .unwrap_err();
        assert!(matches!(&error, DoiMetadataError::Parse(_)));
        assert_eq!(error.to_string(), "DOI 出版商补充结果与准备状态不符");
    }
}

#[test]
fn candidate_projects_the_actual_current_rows_then_retains_original_diff_and_id_rules() {
    let without_current = run(candidate(None, None)).unwrap();
    let DoiPreviewOutcomeV1::Candidate {
        preview,
        raw_payload,
    } = without_current
    else {
        unreachable!()
    };
    assert_eq!(preview.id, "candidate\0id");
    assert_eq!(preview.import_job_id, "job");
    assert_eq!(preview.item_id, None);
    assert_eq!(preview.draft.id, None);
    assert_eq!(preview.source_reference, DOI);
    assert_eq!(preview.source_kind, "doi.org:csl-json");
    assert_eq!(raw_payload, translation().raw_payload);
    assert!(
        preview
            .diffs
            .iter()
            .any(|diff| diff.field_name == "doi" && diff.candidate_value == DOI)
    );
    let outcome = run(candidate(Some("paper"), Some(current_rows()))).unwrap();
    let DoiPreviewOutcomeV1::Candidate { preview, .. } = outcome else {
        unreachable!()
    };
    assert_eq!(preview.item_id.as_deref(), Some("paper"));
    assert_eq!(preview.draft.id.as_deref(), Some("paper"));
    assert_eq!(
        preview.draft.source_kind.as_deref(),
        Some("doi.org:csl-json")
    );
    assert_eq!(preview.diffs.len(), 1);
    assert_eq!(
        preview.diffs[0],
        research_workbench_native_sdk::metadata::MetadataFieldDiff {
            field_name: "title".into(),
            current_value: "Old".into(),
            candidate_value: "New".into(),
            user_confirmed: true,
        }
    );
}

#[test]
fn missing_current_is_domain_not_found_and_bad_capture_stays_a_safe_protocol_error() {
    assert_eq!(
        run(candidate(
            Some("missing"),
            Some(CatalogItemRows {
                main: DataRows { rows: vec![] },
                related: None,
            })
        ))
        .unwrap(),
        rejected("not_found", "找不到文献或附件")
    );
    for input in [
        candidate(Some("private-id"), None),
        candidate(None, Some(current_rows())),
    ] {
        let error = run(input).unwrap_err();
        assert_eq!(error, CatalogDecodeError::InvalidDoiPreviewCapture);
        assert!(!error.to_string().contains("private-id"));
    }
    let error = run(candidate(Some("another"), Some(current_rows()))).unwrap_err();
    assert_eq!(error, CatalogDecodeError::ItemIdentityMismatch);
    let mut wrong = current_rows();
    wrong.main.rows[0][2] = DataValue::Null;
    let error = run(candidate(Some("paper"), Some(wrong))).unwrap_err();
    assert!(matches!(
        error,
        CatalogDecodeError::Cell {
            group: "main",
            column: 2,
            ..
        }
    ));
    assert_eq!(error.code(), "literature_catalog_input_invalid");
}

fn current_rows() -> CatalogItemRows {
    let text = |value: &str| DataValue::Text(value.into());
    let empty = || DataRows { rows: vec![] };
    CatalogItemRows {
        main: DataRows {
            rows: vec![vec![
                text("paper"),
                text("journalArticle"),
                text("Old"),
                text(""),
                DataValue::Null,
                text(""),
                text(""),
                text(""),
                text(""),
                text(""),
                text(""),
                text(""),
                text(DOI),
                text(""),
                text(""),
                text(""),
                DataValue::Null,
                text("unread"),
                text("created"),
                text("updated"),
                DataValue::Null,
            ]],
        },
        related: Some(CatalogRelatedRows {
            creators: empty(),
            tags: empty(),
            attachments: empty(),
            project_ids: empty(),
            metadata_sources: DataRows {
                rows: vec![vec![text("title"), text("user"), DataValue::Integer(1)]],
            },
        }),
    }
}
