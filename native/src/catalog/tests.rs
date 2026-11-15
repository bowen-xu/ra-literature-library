use super::*;
use research_workbench_native_sdk::catalog::CatalogOperation;
use serde_json::json;

mod fixture;
use fixture::*;

#[test]
fn plans_none_and_all_original_blank_queries_without_new_validation() {
    for query in [None, Some(""), Some(" \n\t"), Some("\u{2003}\u{a0}")] {
        assert_eq!(
            plan(&CatalogRequest::List {
                query: query.map(str::to_owned)
            }),
            CatalogQueryPlan::All
        );
    }
    let id = " raw\0 id ";
    assert_eq!(
        plan(&CatalogRequest::Get { id: id.into() }),
        CatalogQueryPlan::Get { id: id.into() }
    );
}

#[test]
fn search_plan_preserves_unicode_quote_and_nul_preparation() {
    for (query, expected) in [
        (" JaxLife ", "jaxlife"),
        (" A\"B ", "a\"\"b"),
        ("\u{2003}STRAẞE\u{2003}", "straße"),
        ("İTITLE", "i\u{307}title"),
        (" A\0B ", "a\0b"),
        ("two words", "two words"),
    ] {
        assert_eq!(
            plan(&CatalogRequest::List {
                query: Some(query.into())
            }),
            CatalogQueryPlan::Search {
                fts_query: format!("{{title creators}} : \"{expected}\"*"),
                year: None,
            }
        );
    }
}

#[test]
fn search_year_uses_the_original_i32_parse_including_bounds_and_signs() {
    for (query, year) in [
        ("2026", Some(2026)),
        (" +002026 ", Some(2026)),
        ("-0", Some(0)),
        ("2147483647", Some(i32::MAX)),
        ("-2147483648", Some(i32::MIN)),
        ("2147483648", None),
        ("-2147483649", None),
        ("2026.0", None),
        ("2_026", None),
        ("２０２６", None),
        ("2026\0", None),
    ] {
        let CatalogQueryPlan::Search { year: actual, .. } = plan(&CatalogRequest::List {
            query: Some(query.into()),
        }) else {
            panic!("nonblank query must retain the FTS branch");
        };
        assert_eq!(actual, year, "{query:?}");
    }
}

#[test]
fn selection_retains_primary_duplicates_and_only_deduplicates_year_appends() {
    assert_eq!(
        select_ids(&CatalogSelectionRows {
            primary: ids(&["rank-first", "rank-second", "rank-first", ""]),
            year: Some(ids(&[
                "rank-second",
                "year-first",
                "year-first",
                "year-second"
            ])),
        })
        .unwrap(),
        vec![
            "rank-first",
            "rank-second",
            "rank-first",
            "",
            "year-first",
            "year-second"
        ]
    );
    assert!(
        select_ids(&CatalogSelectionRows {
            primary: ids(&[]),
            year: None
        })
        .unwrap()
        .is_empty()
    );
    assert_eq!(
        select_ids(&CatalogSelectionRows {
            primary: ids(&[]),
            year: Some(ids(&["year"]))
        })
        .unwrap(),
        vec!["year"]
    );
}

#[test]
fn selection_rejects_wrong_columns_or_types_without_exposing_private_input() {
    for primary in [
        rows(vec![vec![]]),
        rows(vec![vec![text("private text"), text("extra")]]),
        rows(vec![vec![DataValue::Null]]),
        rows(vec![vec![DataValue::Integer(1)]]),
    ] {
        let error = select_ids(&CatalogSelectionRows {
            primary,
            year: Some(rows(vec![vec![]])),
        })
        .unwrap_err();
        assert!(!error.to_string().contains("private text"));
        assert_eq!(error.code(), "literature_catalog_input_invalid");
        assert!(error.to_string().contains("primary"));
    }
    assert!(
        select_ids(&CatalogSelectionRows {
            primary: ids(&["valid"]),
            year: Some(rows(vec![vec![DataValue::Real(1.0)]]))
        })
        .is_err()
    );
}

#[test]
fn projection_emits_the_complete_original_json_in_its_original_field_order() {
    let item = projected(&get_input(item_rows("item")));
    let expected = concat!(
        "{\"id\":\"item\",\"itemType\":\"legacy-custom-kind\",\"title\":\"Title\",\"abstractText\":\"Abstract\",\"issuedYear\":2026,",
        "\"containerTitle\":\"Journal\",\"conferenceName\":\"Conference\",\"proceedingsTitle\":\"Proceedings\",\"place\":\"Place\",\"volume\":\"7\",\"issue\":\"2\",\"pages\":\"3–8\",",
        "\"doi\":\"10.example/id\",\"url\":\"https://example.invalid\",\"language\":\" zh \",\"bibtexKey\":\"key\",\"rawBibtex\":null,\"readingStatus\":\"legacy-status\",",
        "\"creators\":[{\"familyName\":\"Family\",\"givenName\":\"Given\",\"literalName\":\"\",\"role\":\"translator\"},{\"familyName\":\"\",\"givenName\":\"\",\"literalName\":\"Literal Name\",\"role\":\"author\"}],",
        "\"tags\":[\"b\",\"A\"],\"attachments\":[{\"id\":\"attachment\",\"displayName\":\"PDF\",\"mimeType\":\"application/pdf\",\"byteSize\":7,\"contentSha256\":\"hash\"}],",
        "\"projectIds\":[\"project-z\",\"project-a\"],\"metadataSources\":[{\"fieldName\":\"abstractText\",\"sourceKind\":\"import\",\"confirmedByUser\":true},{\"fieldName\":\"title\",\"sourceKind\":\"user\",\"confirmedByUser\":false}],",
        "\"createdAt\":\"created\",\"updatedAt\":\"updated\"}"
    );
    assert_eq!(serde_json::to_string(&item).unwrap(), expected);
    let decoded: CatalogItem = serde_json::from_str(expected).unwrap();
    assert_eq!(decoded, item);
}

#[test]
fn nullable_fields_and_trashed_skip_rules_preserve_original_values() {
    let mut rows = item_rows("item");
    rows.main.rows[0][4] = DataValue::Null;
    rows.main.rows[0][16] = text(" raw\0 BibTeX ");
    rows.main.rows[0][20] = text("trashed");
    let item = projected(&get_input(rows));
    assert_eq!(item.issued_year, None);
    assert_eq!(item.raw_bibtex.as_deref(), Some(" raw\0 BibTeX "));
    let wire = serde_json::to_value(&item).unwrap();
    assert_eq!(wire["issuedYear"], serde_json::Value::Null);
    assert_eq!(wire["trashedAt"], "trashed");
    assert_eq!(serde_json::from_value::<CatalogItem>(wire).unwrap(), item);
}

#[test]
fn list_projection_preserves_order_duplicates_empty_results_and_missing_item_priority() {
    let input = projection(
        CatalogRequest::List {
            query: Some("search".into()),
        },
        vec![item_rows("second"), item_rows("first"), item_rows("second")],
    );
    let CatalogProjectionOutcome::Success { items } = project(&input).unwrap() else {
        panic!("expected items")
    };
    assert_eq!(
        items
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        ["second", "first", "second"]
    );
    assert_eq!(
        project(&projection(CatalogRequest::List { query: None }, vec![])).unwrap(),
        CatalogProjectionOutcome::Success { items: vec![] }
    );
    let absent = CatalogItemRows {
        main: rows(vec![]),
        related: None,
    };
    let later_invalid = CatalogItemRows {
        main: rows(vec![vec![]]),
        related: None,
    };
    assert_eq!(
        project(&projection(
            CatalogRequest::List { query: None },
            vec![absent.clone(), later_invalid]
        ))
        .unwrap(),
        CatalogProjectionOutcome::NotFound
    );
    assert_eq!(
        project(&get_input(absent)).unwrap(),
        CatalogProjectionOutcome::NotFound
    );
}

#[test]
fn defensive_projection_shape_and_identity_checks_do_not_invent_domain_rules() {
    assert!(matches!(
        project(&projection(
            CatalogRequest::Get { id: "item".into() },
            vec![]
        )),
        Err(CatalogDecodeError::InvalidGetCount)
    ));
    assert!(matches!(
        project(&get_input(item_rows("other"))),
        Err(CatalogDecodeError::ItemIdentityMismatch)
    ));
    let mut captured = item_rows("item");
    captured.related = None;
    assert!(matches!(
        project(&get_input(captured)),
        Err(CatalogDecodeError::MissingRelated)
    ));
    let mut captured = item_rows("item");
    captured.main.rows.push(captured.main.rows[0].clone());
    assert!(matches!(
        project(&get_input(captured)),
        Err(CatalogDecodeError::MultipleMainRows)
    ));
    let captured = item_rows("not-a-uuid\0 ");
    let item = projected(&projection(
        CatalogRequest::Get {
            id: "not-a-uuid\0 ".into(),
        },
        vec![captured],
    ));
    assert_eq!(item.item_type, "legacy-custom-kind");
    assert_eq!(item.reading_status, "legacy-status");
}

#[test]
fn projection_retains_original_integer_string_and_bool_conversion_semantics() {
    for year in [i32::MIN, i32::MAX] {
        let mut captured = item_rows("item");
        captured.main.rows[0][4] = DataValue::Integer(i64::from(year));
        assert_eq!(projected(&get_input(captured)).issued_year, Some(year));
    }
    for invalid in [
        DataValue::Integer(i64::MIN),
        DataValue::Integer(i64::MAX),
        DataValue::Real(2026.0),
        text("2026"),
    ] {
        let mut captured = item_rows("item");
        captured.main.rows[0][4] = invalid;
        assert!(matches!(
            project(&get_input(captured)),
            Err(CatalogDecodeError::Cell { column: 4, .. })
        ));
    }
    for invalid in [
        DataValue::Null,
        DataValue::Integer(1),
        DataValue::Blob(vec![1]),
    ] {
        let mut captured = item_rows("item");
        captured.main.rows[0][2] = invalid;
        assert!(matches!(
            project(&get_input(captured)),
            Err(CatalogDecodeError::Cell { column: 2, .. })
        ));
    }
    for value in [-1, 0, 2] {
        let mut captured = item_rows("item");
        captured.related.as_mut().unwrap().metadata_sources.rows[0][2] = DataValue::Integer(value);
        assert_eq!(
            projected(&get_input(captured)).metadata_sources[0].confirmed_by_user,
            value != 0
        );
    }
    let mut captured = item_rows("item");
    captured.related.as_mut().unwrap().attachments.rows[0][3] = DataValue::Integer(-1);
    assert!(matches!(
        project(&get_input(captured)),
        Err(CatalogDecodeError::Cell {
            group: "attachments",
            column: 3,
            ..
        })
    ));
    let mut captured = item_rows("item");
    captured.related.as_mut().unwrap().attachments.rows[0][3] = DataValue::Integer(i64::MAX);
    assert_eq!(
        projected(&get_input(captured)).attachments[0].byte_size,
        i64::MAX as u64
    );
}

#[test]
fn all_dispatch_paths_return_the_matching_closed_operation() {
    let cases = [
        CatalogInput::Plan {
            request: CatalogRequest::List { query: None },
        },
        CatalogInput::Select {
            selection: CatalogSelectionRows {
                primary: ids(&[]),
                year: None,
            },
        },
        CatalogInput::Project {
            input: get_input(item_rows("item")),
        },
    ];
    for input in cases {
        let operation = input.operation();
        let output = dispatch(input).unwrap();
        assert_eq!(output.operation(), operation);
    }
    assert_eq!(
        CatalogOperation::Select,
        CatalogOutput::Selection { ids: vec![] }.operation()
    );
    assert!(
        serde_json::from_value::<CatalogQueryPlan>(json!({"kind":"all","sql":"private"})).is_err()
    );
}

#[test]
fn v1_sql_resources_keep_the_accepted_original_literal_bytes() {
    use sha2::{Digest, Sha256};
    let resources: &[(&[u8], &str)] = &[
        (
            include_bytes!("../../data/catalog-list-active-ids.v1.sql"),
            "3ec08183330a92b659a197c379895122e25e3f9b738e0d530000376e4d836dfd",
        ),
        (
            include_bytes!("../../data/catalog-search-fts-ids.v1.sql"),
            "81b5a90c24034e389c758e9e32e4843d9d2d92f423f628bfadb0e91f6722b4f0",
        ),
        (
            include_bytes!("../../data/catalog-search-year-ids.v1.sql"),
            "83b5ce091f263310a5833e0fc9fe38c326b02641eaf0f814184cc78583db7f9e",
        ),
        (
            include_bytes!("../../data/catalog-item-main.v1.sql"),
            "073a1199d14bcde6a13b66959ae709c47a0670fd8d4e685b764f631033179e3b",
        ),
        (
            include_bytes!("../../data/catalog-item-creators.v1.sql"),
            "ae99a3aad759b4a7e7bcfde85ac6d635a5c2fb5682b0b990e442a5c5e58dc4cc",
        ),
        (
            include_bytes!("../../data/catalog-item-tags.v1.sql"),
            "15f1c68e620d9d92d5480b6215bd3971a19c75dfb24b272fc01e81ae999faae8",
        ),
        (
            include_bytes!("../../data/catalog-item-attachments.v1.sql"),
            "4261557a932b7009b3afb2e2ac8f9f4fe42ba46c5647ef0e445cb08ebc8204a0",
        ),
        (
            include_bytes!("../../data/catalog-item-project-ids.v1.sql"),
            "97526c71337135fec5f15de3b8fe8e7ad9c7dea69185fb1d7dcab072731093ae",
        ),
        (
            include_bytes!("../../data/catalog-item-metadata-sources.v1.sql"),
            "04904bb234e0264de630549145007bb9a06b72e2ef43ff473aec3b5c0fabaf21",
        ),
    ];
    for (bytes, expected) in resources {
        assert_eq!(format!("{:x}", Sha256::digest(bytes)), *expected);
        assert_ne!(bytes.last(), Some(&b'\n'));
    }
}
