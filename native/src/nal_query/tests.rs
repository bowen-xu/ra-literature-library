use super::*;
use research_workbench_native_sdk::nal_query::{Content, Definition};
use serde_json::{Value, json};

fn statement() -> Value {
    json!({"copula":"inheritance","subject":{"kind":"variable","name":"x"},
        "predicate":{"kind":"concept","id":"domain"}})
}

fn content(conditions: Vec<Value>) -> Content {
    serde_json::from_value(json!({"definitions":[{
        "id":"q","name":"查询","conditions":conditions,"outputVariables":["x"]
    }],"cache":null,"legacyImported":true}))
    .unwrap()
}

fn prepared(value: &Content) -> SavePlan {
    match prepare_save(value) {
        PrepareOutcome::Planned { plan } => plan,
        rejected => panic!("expected original valid content: {rejected:?}"),
    }
}

#[test]
fn original_nested_block_groups_and_invalid_shapes_use_one_validator() {
    let statement = statement();
    let group = json!({"kind":"group","connector":"disjunction","children":[
        statement,{"kind":"group","connector":"conjunction","children":[statement,statement]}
    ]});
    let value = content(vec![group]);
    let plan = prepared(&value);
    assert_eq!(
        serde_json::from_str::<Vec<Definition>>(&plan.definitions_json).unwrap(),
        value.definitions
    );
    assert_eq!(
        plan.cache_json,
        Some("null".into()).filter(|_| value.cache.is_some())
    );
    let mut invalid = serde_json::to_value(&value).unwrap();
    invalid["definitions"][0]["conditions"][0]["children"] = json!([]);
    assert_eq!(
        validate(&serde_json::from_value(invalid).unwrap()),
        Err(Rejection::InvalidDefinition)
    );
    let mut deep = statement;
    for _ in 0..14 {
        deep = json!({"kind":"group","connector":"conjunction","children":[deep]});
    }
    assert_eq!(
        validate(&content(vec![deep])),
        Err(Rejection::InvalidDefinition)
    );
}

#[test]
fn original_recursive_statement_connectors_and_output_projection_are_preserved() {
    let atom = json!({"kind":"concept","id":"domain"});
    let variable = json!({"kind":"variable","name":"x"});
    let nested =
        json!({"kind":"statement","copula":"inheritance","subject":variable,"predicate":atom});
    let condition = json!({"copula":"implication","subject":{"kind":"conjunction","terms":[
        nested,{"kind":"disjunction","terms":[atom,variable]}
    ]},"predicate":nested});
    let mut value = content(vec![condition]);
    prepared(&value);
    value.definitions[0].output_variables = Some(vec!["missing".into()]);
    assert_eq!(validate(&value), Err(Rejection::InvalidOutputVariables));
    value.definitions[0].output_variables = Some(vec!["x".into(), "x".into()]);
    assert_eq!(validate(&value), Err(Rejection::InvalidOutputVariables));
}

#[test]
fn original_parent_inheritance_cycle_missing_parent_and_first_error_order_are_preserved() {
    let mut value = content(vec![statement()]);
    let mut child = value.definitions[0].clone();
    child.id = "child".into();
    child.parent_id = Some("q".into());
    child.conditions = serde_json::from_value(json!([{
        "subject":{"kind":"paper","id":"p"},"predicate":{"kind":"concept","id":"c"}
    }]))
    .unwrap();
    value.definitions.push(child);
    value.cache = Some(json!({"version":1}));
    prepared(&value); // Child's x output comes from its parent.
    value.definitions[0].parent_id = Some("child".into());
    assert_eq!(validate(&value), Err(Rejection::InvalidHierarchy));
    value.definitions[0].parent_id = Some("absent".into());
    assert_eq!(validate(&value), Err(Rejection::MissingParent));
    value.definitions[1].name.clear();
    assert_eq!(validate(&value), Err(Rejection::InvalidDefinition));
}

#[test]
fn original_byte_character_limits_and_untrimmed_bindings_are_preserved() {
    let mut value = content(vec![statement()]);
    value.definitions[0].id = format!(" {} ", "a".repeat(798));
    value.definitions[0].name = "汉".repeat(200);
    let plan = prepared(&value);
    assert_eq!(
        plan.definitions_json,
        serde_json::to_string(&value.definitions).unwrap()
    );
    assert!(
        plan.definitions_json
            .contains(&format!(" {} ", "a".repeat(798)))
    );
    value.definitions[0].id.push('a');
    assert_eq!(validate(&value), Err(Rejection::InvalidDefinition));
    value.definitions[0].id = "q".into();
    value.definitions[0].name.push('汉');
    assert_eq!(validate(&value), Err(Rejection::InvalidDefinition));
}

#[test]
fn original_condition_depth_ancestry_and_global_budget_are_preserved() {
    let mut condition = statement();
    for _ in 0..12 {
        condition = json!({"kind":"group","connector":"conjunction","children":[condition]});
    }
    assert!(validate(&content(vec![condition.clone()])).is_ok());
    condition = json!({"kind":"group","connector":"conjunction","children":[condition]});
    assert_eq!(
        validate(&content(vec![condition])),
        Err(Rejection::InvalidDefinition)
    );
    let mut value = content(vec![statement()]);
    for index in 1..16 {
        let mut child = value.definitions[0].clone();
        child.id = format!("q{index}");
        child.parent_id = Some(if index == 1 {
            "q".into()
        } else {
            format!("q{}", index - 1)
        });
        value.definitions.push(child);
    }
    assert!(validate(&value).is_ok());
    let mut child = value.definitions[0].clone();
    child.id = "q16".into();
    child.parent_id = Some("q15".into());
    value.definitions.push(child);
    assert_eq!(validate(&value), Err(Rejection::InvalidHierarchy));

    let wide = json!({"subject":{"kind":"product","terms":vec![
        json!({"kind":"variable","name":"x"});16]},"predicate":{"kind":"concept","id":"c"}});
    let base = content(vec![wide; 16]).definitions.remove(0);
    let mut value = Content {
        definitions: (0..52)
            .map(|index| {
                let mut definition = base.clone();
                definition.id = format!("q{index}");
                definition
            })
            .collect(),
        cache: None,
        legacy_imported: false,
    };
    assert!(validate(&value).is_ok()); // 52 × 16 × 19 = 15,808 original budget nodes.
    let mut next = base;
    next.id = "q52".into();
    value.definitions.push(next);
    assert_eq!(validate(&value), Err(Rejection::InvalidDefinition));
}

#[test]
fn original_serialized_size_and_definition_count_reject_before_domain_errors() {
    let mut value = content(vec![statement()]);
    value.definitions[0].name.clear();
    value.cache = Some(Value::String("x".repeat(32 * 1024 * 1024)));
    assert_eq!(validate(&value), Err(Rejection::TooLarge));
    value.cache = None;
    value.definitions = vec![value.definitions[0].clone(); 101];
    assert_eq!(validate(&value), Err(Rejection::TooLarge));
}

#[test]
fn read_projection_only_checks_structure_and_preserves_raw_rows_and_parse_boundaries() {
    let mut condition = statement();
    for _ in 0..14 {
        condition = json!({"kind":"group","connector":"conjunction","children":[condition]});
    }
    let invalid_for_save = content(vec![condition]);
    assert_eq!(
        validate(&invalid_for_save),
        Err(Rejection::InvalidDefinition)
    );
    let row = StoredRow {
        revision: i64::MAX,
        definitions_json: format!(
            " \n{}\t",
            serde_json::to_string(&invalid_for_save.definitions).unwrap()
        ),
        cache_json: Some(" {\"unrecognizedVersion\":0} \n".into()),
        legacy_imported: false,
    };
    assert_eq!(
        project(row.clone()),
        ProjectionOutcome::Success { row: row.clone() }
    );
    assert_eq!(row.clone().decode().unwrap().revision, i64::MAX);
    let mut bad = row.clone();
    bad.definitions_json = "not-json".into();
    assert_eq!(
        project(bad),
        ProjectionOutcome::Rejected {
            reason: Rejection::InvalidStructure
        }
    );
    let mut bad = row;
    bad.cache_json = Some("[".into());
    assert_eq!(
        project(bad),
        ProjectionOutcome::Rejected {
            reason: Rejection::InvalidStructure
        }
    );
}

#[test]
fn exact_rejection_messages_and_opaque_cache_serialization_are_preserved() {
    for (reason, message) in [
        (Rejection::TooLarge, "查询缓存过大"),
        (Rejection::InvalidDefinition, "查询集合格式无效"),
        (
            Rejection::InvalidHierarchy,
            "查询目录存在循环或超过 16 个条件",
        ),
        (Rejection::MissingParent, "上级查询已不存在"),
        (
            Rejection::InvalidOutputVariables,
            "输出变量无效，请从语句中选择",
        ),
        (Rejection::InvalidStructure, "关系数据结构无效"),
    ] {
        assert_eq!(rejection_message(&reason), message);
    }
    let mut value = content(vec![statement()]);
    for cache in [json!(false), json!({"version":-17,"arbitrary":[null,3]})] {
        value.cache = Some(cache.clone());
        assert_eq!(
            prepared(&value).cache_json,
            Some(serde_json::to_string(&cache).unwrap())
        );
    }
}
