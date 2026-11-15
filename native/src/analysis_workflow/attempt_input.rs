//! Original legacy attempt text, without template, storage or Agent owners.
use research_agent_api::user_input::UserInput;
use research_workbench_native_sdk::{
    analysis_history::contracts::{PaperAnalysisMessage, PaperAnalysisMessageKind},
    analysis_workflow::prompt::PaperTaskPrompt,
};

pub fn legacy_prompt(messages: &[PaperAnalysisMessage]) -> PaperTaskPrompt {
    let text = messages
        .iter()
        .filter(|message| matches!(message.kind, PaperAnalysisMessageKind::TaskPrompt))
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    PaperTaskPrompt {
        text: text.clone(),
        user_input: vec![UserInput::Text {
            text,
            text_elements: vec![],
        }],
    }
}
