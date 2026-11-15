use super::*;
use research_workbench_native_sdk::{
    analysis_workflow::wire::*,
    candidate_contracts::PaperTemplateRef,
    paper_context_wire::{decode_payload, encode_payload},
};
use serde_json::json;

fn reference() -> PaperTemplateRef {
    PaperTemplateRef::Resource {
        template_resource_id: "template".into(),
        template_resource_revision: 3,
    }
}
fn fields() -> serde_json::Value {
    json!([{"id":"question","title":"问题","question":"研究什么？","claimIds":["old"]}])
}
fn resource(raw: String) -> TemplateInputV1 {
    TemplateInputV1::ResourceContent {
        paper_id: "paper".into(),
        reference: reference(),
        selection_revision: 7,
        raw,
    }
}
fn error(input: TemplateInputV1) -> String {
    resolve(&input).unwrap_err().to_string()
}

#[test]
fn resource_fields_keep_original_claim_reset_and_profile_revision() {
    let profile = resolve(&resource(json!({"fields":fields()}).to_string()))
        .unwrap()
        .unwrap();
    assert_eq!(profile.paper_id, "paper");
    assert_eq!(profile.selection_revision, 7);
    assert_eq!(profile.field_kinds, ["question"]);
    assert!(profile.profile_refs.is_empty());
    let snapshot = profile.paper_template.unwrap();
    assert_eq!(snapshot.reference, reference());
    assert!(snapshot.fields[0].claim_ids.is_empty());
    assert_eq!(
        error(resource("{".into())),
        "analysis temporarily unavailable"
    );
    assert_eq!(error(resource("{}".into())), "阅读模板字段无效");
    assert_eq!(
        error(resource(json!({"fields":[]}).to_string())),
        "阅读模板快照无效"
    );
}

#[test]
fn binding_and_legacy_qualification_keep_the_original_errors() {
    assert_eq!(
        error(TemplateInputV1::LegacyAvailability {
            managed_resources: true
        }),
        "旧画像模板标识仅用于历史读取；请先确认或采用已发布的资源模板，再开始新提取"
    );
    assert!(
        resolve(&TemplateInputV1::LegacyAvailability {
            managed_resources: false
        })
        .unwrap()
        .is_none()
    );
    assert_eq!(
        error(TemplateInputV1::ResourceBinding {
            reference: reference(),
            selection_revision: 1,
            binding: None
        }),
        "请先采用阅读模板"
    );
    assert_eq!(
        error(TemplateInputV1::ResourceBinding {
            reference: reference(),
            selection_revision: 1,
            binding: Some(("other".into(), 3))
        }),
        "本文采用的模板版本已变化，请重新载入"
    );
    assert!(
        resolve(&TemplateInputV1::LegacyIdentity {
            reference: reference(),
            latest: Some(("template".into(), 3))
        })
        .unwrap()
        .is_none()
    );
    assert_eq!(
        error(TemplateInputV1::LegacyIdentity {
            reference: reference(),
            latest: None
        }),
        "本文画像模板不可用或已有新版本，请重新载入"
    );
}

#[test]
fn legacy_source_rejection_precedes_payload_decode_and_preserves_first_revision() {
    let reference = PaperTemplateRef::Legacy {
        portrait_candidate_id: "portrait".into(),
        portrait_revision: 3,
    };
    let mut input = TemplateInputV1::LegacyContent {
        paper_id: "paper".into(),
        reference,
        current_revision: 3,
        evidence: vec![TemplateEvidenceV1 {
            paper_id: "paper".into(),
            current_anchor_status: "current".into(),
        }],
        revisions: vec![TemplateRevisionV1 {
            revision: 3,
            payload: json!({"kind":"paper_portrait_v1","schemaVersion":1,"coverage":"all","claims":[],"template":fields()}),
        }],
    };
    let profile = resolve(&input).unwrap().unwrap();
    assert_eq!(profile.selection_revision, 3);
    assert_eq!(profile.paper_template.unwrap().fields[0].claim_ids, ["old"]);
    if let TemplateInputV1::LegacyContent {
        evidence,
        revisions,
        ..
    } = &mut input
    {
        evidence[0].current_anchor_status = "stale".into();
        revisions[0].payload = json!(null);
    }
    assert_eq!(
        error(input.clone()),
        "画像来源已失效或不属于当前文献，请重新核对"
    );
    if let TemplateInputV1::LegacyContent { evidence, .. } = &mut input {
        evidence[0].current_anchor_status = "available".into();
    }
    assert_eq!(error(input), "analysis temporarily unavailable");
}

#[test]
fn template_wire_binds_stage_paper_reference_and_selection_revision() {
    let input = resource(json!({"fields":fields()}).to_string());
    let decision = decide(&input);
    assert!(input.matches_decision(&decision));
    let wire = WorkflowInputV1::Template {
        input: Box::new(input.clone()),
    };
    let output = WorkflowDecisionV1::Template {
        decision: decision.clone(),
    };
    let decoded: WorkflowDecisionV1 = decode_payload(&encode_payload(&output).unwrap()).unwrap();
    assert_eq!(output, decoded);
    assert!(wire.matches_decision(&output));
    for mode in 0..3 {
        let mut altered = decision.clone();
        if let TemplateDecisionV1::Resolved { profile } = &mut altered {
            match mode {
                0 => profile.paper_id = "other".into(),
                1 => profile.selection_revision += 1,
                _ => profile.paper_template = None,
            }
        }
        assert!(!input.matches_decision(&altered));
    }
    assert!(!input.matches_decision(&TemplateDecisionV1::Verified {}));
}
