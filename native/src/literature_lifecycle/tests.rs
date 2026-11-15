use super::*;

fn ready(request: LifecycleRequestV1, ids: Vec<String>) {
    assert_eq!(
        prepare(request.clone()),
        LifecyclePreparationV1::Ready {
            request,
            trash_item_ids: ids
        }
    );
}

#[test]
fn single_lifecycle_inputs_have_no_new_identity_normalization_or_validation() {
    for id in [
        "".into(),
        " \t ".into(),
        "a\0b".into(),
        "文献".repeat(10_000),
    ] {
        for request in [
            LifecycleRequestV1::Archive {
                item_id: id.clone(),
            },
            LifecycleRequestV1::Restore {
                item_id: id.clone(),
            },
            LifecycleRequestV1::Trash {
                item_id: id.clone(),
            },
            LifecycleRequestV1::RestoreTrash {
                item_id: id.clone(),
            },
        ] {
            ready(request, vec![]);
        }
    }
}

#[test]
fn projects_keep_empty_input_duplicates_and_original_failure_order() {
    for projects in [
        vec![],
        vec!["b".into(), "a".into(), "b".into()],
        vec!["".into(), "\0".into(), " raw ".into()],
    ] {
        ready(
            LifecycleRequestV1::SetProjects {
                item_id: "".into(),
                project_ids: projects,
            },
            vec![],
        );
    }
}

#[test]
fn batch_trash_keeps_raw_input_and_uses_original_utf8_btree_order() {
    let ids = [
        "中", "a\0", "β", "", "é", "e\u{301}", "a", "\0", "💡", "~", "中", "a",
    ]
    .map(str::to_owned)
    .to_vec();
    ready(
        LifecycleRequestV1::TrashMany { item_ids: ids },
        ["", "\0", "a", "a\0", "e\u{301}", "~", "é", "β", "中", "💡"]
            .map(str::to_owned)
            .to_vec(),
    );
    ready(
        LifecycleRequestV1::TrashMany {
            item_ids: vec![" ".into(), " ".into()],
        },
        vec![" ".into()],
    );
}

#[test]
fn only_empty_batch_is_rejected_with_its_original_command_diagnostic() {
    assert_eq!(
        prepare(LifecycleRequestV1::TrashMany { item_ids: vec![] }),
        LifecyclePreparationV1::Rejected {
            error: LifecycleRejectionV1 {
                code: LifecycleRejectionCodeV1::NotFound,
                message: "部分文献已归档、删除或不存在，请刷新后重试".into()
            },
        }
    );
    ready(
        LifecycleRequestV1::TrashMany {
            item_ids: vec!["".into()],
        },
        vec!["".into()],
    );
    let request = LifecycleRequestV1::SetProjects {
        item_id: " raw ".into(),
        project_ids: vec!["p".into(), "p".into()],
    };
    let actual =
        crate::catalog::dispatch(crate::catalog::CatalogInput::PrepareLiteratureLifecycle {
            request: request.clone(),
        })
        .unwrap();
    assert_eq!(
        actual,
        crate::catalog::CatalogOutput::LiteratureLifecyclePreparation {
            outcome: LifecyclePreparationV1::Ready {
                request,
                trash_item_ids: vec![]
            },
        }
    );
}
