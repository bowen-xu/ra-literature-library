use super::*;
use serde_json::{Value, json};

// Frozen pre-migration pure portion of literature/agent_metadata.rs. SQL and
// row decoding remain characterized by the original desktop adapter tests.
fn original(input: &ContextMetadataInputV1) -> String {
    let mut value = input.base.clone();
    let creators = input
        .creators
        .iter()
        .map(|pair| (&pair[0], &pair[1]))
        .collect::<Vec<_>>();
    let identifiers = input
        .identifiers
        .iter()
        .map(|pair| (&pair[0], &pair[1]))
        .collect::<Vec<_>>();
    value["creators"] = json!(creators);
    value["identifiers"] = json!(identifiers);
    value.to_string()
}

#[test]
fn matches_original_compact_json_bytes_for_null_empty_unicode_numbers_and_duplicates() {
    for base in [
        json!({"title":"题录 Ω","itemType":"article","abstract":null,"year":2026,
            "container":null,"volume":"","issue":null,"pages":null,"url":null,
            "language":"zh","bibtexKey":"key"}),
        json!({"title":" \n\0α🧪 ","year":null,"creators":["overwrite"],"identifiers":null}),
        json!({"nested":{"z":[null,false,true],"a":{"text":"原文"}},
            "numbers":[i64::MIN,i64::MAX,u64::MAX,-0.0,0.09090909090909091]}),
        json!({}),
        Value::Null,
    ] {
        for (creators, identifiers) in [
            (vec![], vec![]),
            (
                vec![
                    ["  机构".into(), "author".into()],
                    ["B Given ".into(), "editor".into()],
                ],
                vec![
                    ["doi".into(), "first".into()],
                    ["doi".into(), "second".into()],
                    ["url".into(), "url".into()],
                ],
            ),
            (
                vec![["same".into(), "".into()], ["same".into(), "".into()]],
                vec![
                    ["".into(), "\0".into()],
                    ["doi".into(), "same".into()],
                    ["doi".into(), "same".into()],
                ],
            ),
        ] {
            let input = ContextMetadataInputV1 {
                paper_id: " unchanged paper ".into(),
                base: base.clone(),
                creators,
                identifiers,
            };
            let before = input.clone();
            assert_eq!(project(&input).unwrap(), original(&input));
            assert_eq!(input, before);
        }
    }
}

#[test]
fn malformed_non_object_base_returns_a_closed_rejection_without_panicking() {
    for base in [
        json!(true),
        json!(false),
        json!(7),
        json!("PRIVATE_BODY_901"),
        json!([]),
    ] {
        let input = ContextMetadataInputV1 {
            paper_id: "paper".into(),
            base,
            creators: vec![],
            identifiers: vec![],
        };
        let error = project(&input).unwrap_err();
        assert_eq!(error, ContextMetadataRejectionV1::InvalidBase);
        assert_eq!(error.to_string(), "context_metadata_base_invalid");
    }
}
