use super::*;

fn captured(id: &str) -> ImportJobRowsV1 {
    ImportJobRowsV1 {
        header: DataRows {
            rows: vec![vec![
                DataValue::Text(id.into()),
                DataValue::Text("legacy-state".into()),
                DataValue::Text("pdf".into()),
                DataValue::Integer(2),
                DataValue::Integer(1),
                DataValue::Integer(1),
                DataValue::Text("raw-created".into()),
                DataValue::Text("raw-updated".into()),
            ]],
        },
        results: Some(DataRows {
            rows: vec![
                vec![
                    DataValue::Text(" second label ".into()),
                    DataValue::Text("original JSON\0".into()),
                    DataValue::Text("failed".into()),
                    DataValue::Null,
                    DataValue::Text("Original persisted business message".into()),
                ],
                vec![
                    DataValue::Text(" first label ".into()),
                    DataValue::Text(String::new()),
                    DataValue::Text("pending".into()),
                    DataValue::Text(String::new()),
                    DataValue::Null,
                ],
            ],
        }),
    }
}

fn missing() -> ImportJobRowsV1 {
    ImportJobRowsV1 {
        header: DataRows { rows: Vec::new() },
        results: None,
    }
}

#[test]
fn full_job_projection_keeps_order_counts_nullable_values_and_original_strings() {
    let output = project(&ImportJobsProjectionInputV1::Job {
        expected_id: " raw\0id ".into(),
        rows: captured(" raw\0id "),
    })
    .unwrap();
    let ImportJobsProjectionOutcomeV1::Success {
        result: ImportJobsResultV1::Job { job },
    } = output
    else {
        unreachable!()
    };
    assert_eq!(job.id, " raw\0id ");
    assert_eq!(job.state, "legacy-state");
    assert_eq!(job.source_kind, "pdf");
    assert_eq!(job.total_count, 2);
    assert_eq!(job.completed_count, 1);
    assert!(job.cancellation_requested);
    assert_eq!(job.created_at, "raw-created");
    assert_eq!(job.updated_at, "raw-updated");
    assert_eq!(job.results[0].input_label, " second label ");
    assert_eq!(job.results[0].raw_input, "original JSON\0");
    assert_eq!(job.results[0].item_id, None);
    assert_eq!(
        job.results[0].error_message.as_deref(),
        Some("Original persisted business message")
    );
    assert_eq!(job.results[1].item_id, Some(String::new()));
    assert_eq!(job.results[1].error_message, None);
    assert_eq!(job.results[1].raw_input, "");
}

#[test]
fn list_retains_order_and_duplicate_ids_and_stops_at_first_absent_header() {
    let ids = vec!["b".to_owned(), "a".to_owned(), "b".to_owned()];
    let output = project(&ImportJobsProjectionInputV1::Jobs {
        expected_ids: ids.clone(),
        rows: ids.iter().map(|id| captured(id)).collect(),
    })
    .unwrap();
    let ImportJobsProjectionOutcomeV1::Success {
        result: ImportJobsResultV1::Jobs { jobs },
    } = output
    else {
        unreachable!()
    };
    assert_eq!(jobs.iter().map(|j| j.id.clone()).collect::<Vec<_>>(), ids);
    assert!(matches!(
        project(&ImportJobsProjectionInputV1::Jobs {
            expected_ids: vec!["a".into(), "missing".into(), "not-read".into()],
            rows: vec![captured("a"), missing()],
        })
        .unwrap(),
        ImportJobsProjectionOutcomeV1::NotFound { .. }
    ));
    assert_eq!(
        project(&ImportJobsProjectionInputV1::Jobs {
            expected_ids: Vec::new(),
            rows: Vec::new(),
        })
        .unwrap(),
        ImportJobsProjectionOutcomeV1::Success {
            result: ImportJobsResultV1::Jobs { jobs: Vec::new() }
        }
    );
    assert_eq!(
        project(&ImportJobsProjectionInputV1::Jobs {
            expected_ids: vec!["a".into(), "not-captured".into()],
            rows: vec![captured("a")],
        })
        .unwrap_err(),
        CatalogDecodeError::InvalidImportJobsProjection
    );
}

#[test]
fn original_absence_and_cancel_zero_reject_but_any_nonzero_cancel_is_success() {
    let mut absent = missing();
    // No original results query is reachable when query_row/optional is empty.
    absent.results = Some(DataRows {
        rows: vec![vec![DataValue::Null]],
    });
    assert_eq!(
        project(&ImportJobsProjectionInputV1::Job {
            expected_id: "missing".into(),
            rows: absent,
        })
        .unwrap(),
        ImportJobsProjectionOutcomeV1::NotFound {
            message: "找不到文献或附件".into()
        }
    );
    assert!(matches!(
        project(&ImportJobsProjectionInputV1::Cancel { affected_rows: 0 }).unwrap(),
        ImportJobsProjectionOutcomeV1::NotFound { .. }
    ));
    for affected_rows in [1, 2, u64::MAX] {
        assert_eq!(
            project(&ImportJobsProjectionInputV1::Cancel { affected_rows }).unwrap(),
            ImportJobsProjectionOutcomeV1::Success {
                result: ImportJobsResultV1::Done {}
            }
        );
    }
}

#[test]
fn defensive_shape_and_identity_errors_are_safe_and_preserve_header_first_order() {
    let mut row = captured("private-job-id");
    row.header.rows[0][3] = DataValue::Integer(-1);
    row.results = None;
    let error = project(&ImportJobsProjectionInputV1::Job {
        expected_id: "private-job-id".into(),
        rows: row,
    })
    .unwrap_err();
    assert_eq!(
        error,
        CatalogDecodeError::Cell {
            group: "importJob",
            row: 0,
            column: 3,
            expected: "usize"
        }
    );
    assert!(!error.to_string().contains("private-job-id"));
    assert_eq!(
        project(&ImportJobsProjectionInputV1::Job {
            expected_id: "expected-private-id".into(),
            rows: captured("another-private-id"),
        })
        .unwrap_err(),
        CatalogDecodeError::ImportJobIdentityMismatch
    );
    let mut row = captured("id");
    row.results.as_mut().unwrap().rows[0][1] = DataValue::Null;
    assert_eq!(
        project(&ImportJobsProjectionInputV1::Job {
            expected_id: "id".into(),
            rows: row,
        })
        .unwrap_err(),
        CatalogDecodeError::Cell {
            group: "importResults",
            row: 0,
            column: 1,
            expected: "String"
        }
    );
}
