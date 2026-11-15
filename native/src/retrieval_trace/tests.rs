use super::*;

const RAW_QUERY: &str = " \t研究问题\n";
const CONTEXT: &str = "[CN-S1] 证据 \n";

fn legacy_row() -> RetrievalTraceRow {
    RetrievalTraceRow {
        paper_id: None,
        query_sha256: "382a56c133ff0d4645ed1436a7c4d45fdc381fdd149000f5fa3ab6d02cba708c".into(),
        status: "previewed".into(),
        context_text: CONTEXT.into(),
        context_sha256: "e36fa2fdc16ba7ee496197209184e849f73e12b29cd2a75ea6764588a3d74cb1".into(),
        expired: false,
    }
}

#[test]
fn fixed_legacy_sha256_vectors_preserve_unicode_and_outer_whitespace_bytes() {
    // Independent, hard-coded SHA-256 vectors from the original UTF-8 inputs;
    // persist and validation must not silently agree on a changed hash policy.
    assert_eq!(
        hash(RAW_QUERY),
        "f97775a30ce4cda59452c35e7cf1412e3c3ef1012cdf8d1d6bdc40c639f95f14"
    );
    assert_eq!(
        hash("研究问题"),
        "382a56c133ff0d4645ed1436a7c4d45fdc381fdd149000f5fa3ab6d02cba708c"
    );
    assert_eq!(
        hash(CONTEXT),
        "e36fa2fdc16ba7ee496197209184e849f73e12b29cd2a75ea6764588a3d74cb1"
    );
    let stored = legacy_row();
    assert_eq!(
        validate_context(None, RAW_QUERY, Some(stored.clone())).unwrap(),
        stored
    );
}

#[test]
fn global_and_paper_scopes_match_exact_original_bytes_without_identifier_restrictions() {
    for paper_id in [None, Some(String::new()), Some(" raw-not-a-uuid ".into())] {
        let row = RetrievalTraceRow {
            paper_id: paper_id.clone(),
            ..legacy_row()
        };
        assert_eq!(
            validate_context(paper_id.as_deref(), RAW_QUERY, Some(row.clone())).unwrap(),
            row
        );
    }
    for (paper_id, requested) in [
        (None, Some("")),
        (Some(String::new()), None),
        (Some(" paper ".into()), Some("paper")),
        (Some("paper".into()), Some(" paper ")),
    ] {
        assert_eq!(
            validate_context(
                requested,
                RAW_QUERY,
                Some(RetrievalTraceRow {
                    paper_id,
                    ..legacy_row()
                })
            ),
            Err(RetrievalTraceError::QueryMismatch)
        );
    }
}

#[test]
fn missing_row_precedes_scope_query_status_expiry_and_context_checks() {
    assert_eq!(
        validate_context(Some("anything"), "changed", None),
        Err(RetrievalTraceError::NotFound)
    );
}

#[test]
fn scope_or_query_mismatch_precedes_consumption_expiry_and_context_tampering() {
    let invalid = RetrievalTraceRow {
        status: "sent".into(),
        expired: true,
        context_text: "tampered".into(),
        ..legacy_row()
    };
    assert_eq!(
        validate_context(Some("paper"), RAW_QUERY, Some(invalid.clone())),
        Err(RetrievalTraceError::QueryMismatch)
    );
    assert_eq!(
        validate_context(None, "different question", Some(invalid)),
        Err(RetrievalTraceError::QueryMismatch)
    );
    let uppercase = RetrievalTraceRow {
        query_sha256: legacy_row().query_sha256.to_uppercase(),
        ..legacy_row()
    };
    assert_eq!(
        validate_context(None, RAW_QUERY, Some(uppercase)),
        Err(RetrievalTraceError::QueryMismatch)
    );
}

#[test]
fn query_trimming_does_not_normalize_unicode_or_add_empty_query_policy() {
    let row = RetrievalTraceRow {
        query_sha256: hash("é"),
        ..legacy_row()
    };
    assert!(validate_context(None, "\u{3000}é\u{3000}", Some(row.clone())).is_ok());
    assert_eq!(
        validate_context(None, "e\u{301}", Some(row)),
        Err(RetrievalTraceError::QueryMismatch)
    );
    assert_ne!(hash("é"), hash("e\u{301}"));
    let empty_query = RetrievalTraceRow {
        query_sha256: hash(""),
        ..legacy_row()
    };
    assert!(validate_context(None, " \t\n", Some(empty_query)).is_ok());
}

#[test]
fn exact_previewed_status_is_required_before_expiry_and_context_validation() {
    for status in ["sent", "expired", "", "Previewed", " previewed "] {
        let row = RetrievalTraceRow {
            status: status.into(),
            expired: true,
            context_text: "tampered".into(),
            ..legacy_row()
        };
        assert_eq!(
            validate_context(None, RAW_QUERY, Some(row)),
            Err(RetrievalTraceError::AlreadyConsumed)
        );
    }
}

#[test]
fn sql_observed_expiry_precedes_context_hash_without_consulting_a_host_clock() {
    let row = RetrievalTraceRow {
        expired: true,
        context_text: "tampered".into(),
        ..legacy_row()
    };
    assert_eq!(
        validate_context(None, RAW_QUERY, Some(row)),
        Err(RetrievalTraceError::Expired)
    );
    assert!(validate_context(None, RAW_QUERY, Some(legacy_row())).is_ok());
}

#[test]
fn context_hash_uses_every_raw_byte_without_importing_core_context_text_validation() {
    let tampered = RetrievalTraceRow {
        context_text: CONTEXT.trim().into(),
        ..legacy_row()
    };
    assert_eq!(
        validate_context(None, RAW_QUERY, Some(tampered)),
        Err(RetrievalTraceError::ContextHashMismatch)
    );
    let uppercase = RetrievalTraceRow {
        context_sha256: legacy_row().context_sha256.to_uppercase(),
        ..legacy_row()
    };
    assert_eq!(
        validate_context(None, RAW_QUERY, Some(uppercase)),
        Err(RetrievalTraceError::ContextHashMismatch)
    );
    for text in ["", " \t\n", " Original context \n"] {
        let row = RetrievalTraceRow {
            context_text: text.into(),
            context_sha256: hash(text),
            ..legacy_row()
        };
        assert_eq!(
            validate_context(None, RAW_QUERY, Some(row.clone())).unwrap(),
            row
        );
    }
}

#[test]
fn mark_sent_requires_exactly_one_original_affected_row_without_idempotent_success() {
    assert_eq!(validate_mark_sent(1), Ok(()));
    for changed in [0, 2, usize::MAX] {
        assert_eq!(
            validate_mark_sent(changed),
            Err(RetrievalTraceError::AlreadyConsumed)
        );
    }
}
