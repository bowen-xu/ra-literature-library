use super::unit::prepare;
use research_workbench_native_sdk::{
    paper_confirmation::unit::*, reading_units::accepted::AcceptedReadingUnitV1,
};
use serde_json::json;

#[test]
fn confirmation_validation_proves_the_existing_acceptance_checks() {
    for unit_kind in crate::reading_units::UNIT_KINDS {
        for epistemic_role in crate::reading_units::EPISTEMIC_ROLES {
            for provenance_kind in ["ai_accepted_unchanged", "ai_accepted_after_edit"] {
                let draft = AcceptedReadingUnitV1 {
                    project_id: None,
                    paper_id: "paper".into(),
                    unit_kind: (*unit_kind).into(),
                    title: format!("  {}  ", "Ω".repeat(240)),
                    body: "  Original content  ".into(),
                    provenance_kind: provenance_kind.into(),
                    epistemic_role: (*epistemic_role).into(),
                    anchor_ids: vec!["anchor".into()],
                    candidate_id: "candidate".into(),
                    candidate_revision: 1,
                };
                assert_eq!(
                    prepare(UnitInputV1::Validate {
                        title: draft.title.clone(),
                        body: draft.body.clone(),
                        unit_kind: draft.unit_kind.clone(),
                        provenance_kind: draft.provenance_kind.clone(),
                        epistemic_role: draft.epistemic_role.clone(),
                        anchor_count: 1,
                    }),
                    UnitDecisionV1::Validated { rejection: None }
                );
                crate::reading_units::accepted::validate(&draft).unwrap();
            }
        }
    }
    let rejected = prepare(UnitInputV1::Validate {
        title: "".into(),
        body: "".into(),
        unit_kind: "invalid".into(),
        provenance_kind: "invalid".into(),
        epistemic_role: "invalid".into(),
        anchor_count: 0,
    });
    assert_eq!(
        rejected,
        UnitDecisionV1::Validated {
            rejection: Some(UnitProblemV1::InvalidInput {
                message: "AI 确认生成的阅读单元内容无效".into()
            })
        }
    );
}

#[test]
fn undo_revision_keeps_not_found_conflict_and_increment_distinct() {
    for (current_revision, expected_revision, result) in [
        (None, 1, Err(UnitProblemV1::NotFound {})),
        (
            Some(4),
            2,
            Err(UnitProblemV1::RevisionConflict {
                current_revision: 4,
            }),
        ),
        (Some(4), 4, Ok(5)),
    ] {
        assert_eq!(
            prepare(UnitInputV1::Revision {
                previous_snapshot: None,
                current_revision,
                expected_revision
            }),
            UnitDecisionV1::Revision { result }
        );
    }
}

#[test]
fn restore_separates_header_errors_from_later_evidence_and_each_link() {
    let snapshot = json!({"projectId":null,"paperId":"paper","unitKind":"approach","title":"Old title",
        "body":"Old body","provenanceKind":"human_original","epistemicRole":"working_note",
        "evidenceLinks":[{"anchorId":"first","stance":"context","rationale":"Old reason"},{"anchorId":"second","stance":"context","rationale":4},{"anchorId":"never-consumed"}]});
    let UnitDecisionV1::Restore { header, links } = prepare(UnitInputV1::Restore {
        snapshot: snapshot.clone(),
    }) else {
        panic!("restore")
    };
    assert_eq!(header.unwrap().body, "Old body");
    let links = links.unwrap();
    assert_eq!(links.len(), 2);
    assert_eq!(links[0].as_ref().unwrap().anchor_id, "first");
    assert_eq!(
        links[1],
        Err(UnitProblemV1::InvalidInput {
            message: "阅读单元历史快照无效".into()
        })
    );
    let mut invalid = snapshot;
    invalid["title"] = json!(false);
    invalid["evidenceLinks"] = json!(null);
    let UnitDecisionV1::Restore { header, links } =
        prepare(UnitInputV1::Restore { snapshot: invalid })
    else {
        panic!("restore")
    };
    assert_eq!(
        header,
        Err(UnitProblemV1::InvalidInput {
            message: "阅读单元历史快照无效".into()
        })
    );
    assert_eq!(
        links,
        Err(UnitProblemV1::InvalidInput {
            message: "阅读单元证据历史快照无效".into()
        })
    );
}
