use super::*;
use research_workbench_native_sdk::nal_query::{Content, PrepareOutcome, SavePlan};

#[test]
fn typed_some_null_cache_survives_the_actual_prepare_dispatch() {
    for cache in [None, Some(serde_json::Value::Null)] {
        let expected = cache.as_ref().map(|_| "null");
        let content = Content {
            definitions: vec![],
            cache,
            legacy_imported: true,
        };
        let input = CatalogInput::PrepareNalQuerySave {
            content: SavePlan::encode(&content).unwrap(),
        };
        let input = serde_json::from_slice(&serde_json::to_vec(&input).unwrap()).unwrap();
        let CatalogOutput::NalQuerySavePlan {
            outcome: PrepareOutcome::Planned { plan },
        } = dispatch(input).unwrap()
        else {
            panic!("valid typed cache must produce a save plan");
        };
        assert_eq!(plan.cache_json.as_deref(), expected);
    }
}
