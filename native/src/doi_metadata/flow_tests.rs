use super::{DoiMetadataError, PublisherOutcome, prepare, resolver_error};
use research_workbench_native_sdk::doi_metadata::DoiHttpErrorV1;

const DOI: &str = "10.1000/example";
const CHAPTER: &str =
    r#"{"type":"book-chapter","title":"Chapter","container-title":"Collected Work"}"#;

#[test]
fn journal_finishes_without_a_page_and_preserves_the_raw_envelope_order() {
    let body = r#" { "type":"journal-article", "title":"A &amp; B" } "#;
    let prepared = prepare(DOI, "application/json", body).expect("prepare journal");
    assert!(!prepared.needs_publisher());
    let result = prepared.finish(None).expect("finish without a page");
    assert_eq!(result.draft.title, "A & B");
    assert_eq!(result.draft.item_type, "journalArticle");
    assert_eq!(result.source_kind, "doi.org:csl-json");
    assert!(result.warnings.is_empty());
    assert_eq!(
        result.raw_payload,
        format!(
            "{{\"schemaVersion\":1,\"adapter\":\"csl-json\",\"contentType\":\"application/json\",\"doiResponse\":{},\"embeddedMetadata\":{{}},\"typeEvidence\":[],\"warnings\":[]}}",
            serde_json::to_string(body).expect("quote original response")
        )
    );
}

#[test]
fn finish_rejects_missing_or_unsolicited_publisher_outcomes() {
    let chapter = prepare(DOI, "application/json", CHAPTER).expect("prepare chapter");
    assert!(chapter.needs_publisher());
    let missing = chapter
        .finish(None)
        .expect_err("required page was not read");
    assert!(matches!(&missing, DoiMetadataError::Parse(_)));
    assert_eq!(missing.to_string(), "DOI 出版商补充结果与准备状态不符");

    let journal =
        prepare(DOI, "application/json", r#"{"type":"journal-article"}"#).expect("prepare journal");
    assert!(!journal.needs_publisher());
    let unsolicited = journal
        .finish(Some(PublisherOutcome::Html {
            body: String::new(),
            final_https: true,
        }))
        .expect_err("no page was requested");
    assert!(matches!(&unsolicited, DoiMetadataError::Parse(_)));
    assert_eq!(unsolicited.to_string(), "DOI 出版商补充结果与准备状态不符");
}

#[test]
fn fallback_title_and_non_https_warnings_remain_in_the_original_order() {
    let body = r#"{"type":"unrecognized","title":""}"#;
    let prepared = prepare(DOI, "not-a-dispatch-rule", body).expect("prepare document");
    assert!(prepared.needs_publisher());
    let result = prepared
        .finish(Some(PublisherOutcome::Html {
            body: "<meta name='citation_conference_title' content='Do not consume'>".into(),
            final_https: false,
        }))
        .expect("keep base document");
    assert_eq!(result.draft.title, DOI);
    assert_eq!(result.draft.item_type, "document");
    assert!(result.draft.conference_name.is_empty());
    assert_eq!(
        result.warnings,
        [
            "出版商页面不是 HTTPS，已保留 DOI 基础元数据",
            "文献类型缺少明确会议证据，请人工确认"
        ]
    );
    let raw: serde_json::Value = serde_json::from_str(&result.raw_payload).expect("raw envelope");
    assert_eq!(raw["adapter"], "csl-json");
    assert_eq!(raw["contentType"], "not-a-dispatch-rule");
    assert_eq!(raw["doiResponse"], body);
    assert_eq!(raw["embeddedMetadata"], serde_json::json!({}));
    assert_eq!(raw["typeEvidence"], serde_json::json!([]));
}

#[test]
fn publisher_enrichment_retains_base_response_and_appends_original_evidence() {
    let prepared = prepare(DOI, "application/json", CHAPTER).expect("prepare chapter");
    assert!(prepared.needs_publisher());
    let result = prepared
        .finish(Some(PublisherOutcome::Html {
            body: "<meta name='citation_conference_title' content='Conference &amp; Workshop'><meta name='citation_inbook_title' content='Proceedings'><meta name='citation_conference_location' content='Paris'>".into(),
            final_https: true,
        }))
        .expect("enrich chapter");
    assert_eq!(result.draft.item_type, "conferencePaper");
    assert_eq!(result.draft.conference_name, "Conference & Workshop");
    assert_eq!(result.draft.proceedings_title, "Proceedings");
    assert_eq!(result.draft.place, "Paris");
    assert!(result.draft.container_title.is_empty());
    assert!(result.warnings.is_empty());
    let raw: serde_json::Value = serde_json::from_str(&result.raw_payload).expect("raw envelope");
    assert_eq!(raw["doiResponse"], CHAPTER);
    assert_eq!(
        raw["typeEvidence"],
        serde_json::json!([{
            "kind": "embedded-citation-conference",
            "value": "Conference & Workshop"
        }])
    );
    assert!(!result.raw_payload.contains("<meta"));
}

#[test]
fn assertion_evidence_requires_a_page_even_after_base_conference_promotion() {
    let body = r#"{"type":"book-chapter","title":"Paper","assertion":[{"name":"conference_name","value":"Conference"}]}"#;
    let prepared = prepare(DOI, "application/json", body).expect("prepare assertion");
    assert!(prepared.needs_publisher());
    let result = prepared
        .finish(Some(PublisherOutcome::Html {
            body: String::new(),
            final_https: true,
        }))
        .expect("finish assertion");
    assert_eq!(result.draft.item_type, "conferencePaper");
    let raw: serde_json::Value = serde_json::from_str(&result.raw_payload).expect("raw envelope");
    assert_eq!(
        raw["typeEvidence"],
        serde_json::json!([{
            "kind": "crossref-event-or-assertion",
            "value": "Conference"
        }])
    );
}

#[test]
fn publisher_failures_keep_the_base_candidate_and_exact_warning_text() {
    let cases = [
        (
            DoiHttpErrorV1::Send {
                cause: "send failed".into(),
            },
            "send failed",
        ),
        (
            DoiHttpErrorV1::NotFound {},
            "没有找到 DOI 元数据，请检查 DOI 是否正确",
        ),
        (
            DoiHttpErrorV1::Status {
                status: 503,
                cause: "status failed".into(),
            },
            "出版商页面返回错误：status failed",
        ),
        (
            DoiHttpErrorV1::TooLarge { status: 200 },
            "出版商页面响应超过大小限制",
        ),
        (
            DoiHttpErrorV1::Read {
                status: 200,
                cause: "body failed".into(),
            },
            "无法读取出版商页面响应：body failed",
        ),
        (
            DoiHttpErrorV1::Utf8 {
                status: 200,
                cause: "invalid utf8".into(),
            },
            "出版商页面响应不是 UTF-8：invalid utf8",
        ),
    ];
    for (error, cause) in cases {
        let result = prepare(DOI, "application/json", CHAPTER)
            .expect("prepare chapter")
            .finish(Some(PublisherOutcome::Failed(error)))
            .expect("supplement failure is nonfatal");
        assert_eq!(result.draft.item_type, "bookSection");
        assert_eq!(result.draft.title, "Chapter");
        assert_eq!(
            result.warnings,
            [format!(
                "出版商页面补充失败：{cause}；已保留 DOI 基础元数据"
            )]
        );
    }
}

#[test]
fn resolver_failures_preserve_labels_and_request_versus_parse_variants() {
    let cases = [
        (
            DoiHttpErrorV1::Send {
                cause: "send failed".into(),
            },
            "无法连接 DOI resolver：send failed",
        ),
        (
            DoiHttpErrorV1::NotFound {},
            "没有找到 DOI 元数据，请检查 DOI 是否正确",
        ),
        (
            DoiHttpErrorV1::Status {
                status: 503,
                cause: "status failed".into(),
            },
            "DOI resolver 返回错误：status failed",
        ),
        (
            DoiHttpErrorV1::TooLarge { status: 200 },
            "DOI resolver 响应超过大小限制",
        ),
        (
            DoiHttpErrorV1::Read {
                status: 200,
                cause: "body failed".into(),
            },
            "无法读取DOI resolver 响应：body failed",
        ),
    ];
    for (error, expected) in cases {
        let error = resolver_error(error);
        assert!(matches!(&error, DoiMetadataError::Request(_)));
        assert_eq!(error.to_string(), expected);
    }
    let error = resolver_error(DoiHttpErrorV1::Utf8 {
        status: 200,
        cause: "invalid utf8".into(),
    });
    assert!(matches!(&error, DoiMetadataError::Parse(_)));
    assert_eq!(
        error.to_string(),
        "DOI resolver 响应不是 UTF-8：invalid utf8"
    );
}
