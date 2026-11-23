export type PaperAgentComposerAction = "none" | "interrupt" | "steer" | "send";

export function paperAgentComposerAction(input: {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly isComposing?: boolean;
  readonly activeTurn: boolean;
  readonly hasText: boolean;
  readonly speechIdle: boolean;
}): PaperAgentComposerAction {
  if (input.isComposing) return "none";
  if (input.key === "Escape" && input.activeTurn) return "interrupt";
  if (input.key === "Enter" && !input.shiftKey && input.speechIdle && input.hasText) {
    return input.activeTurn ? "steer" : "send";
  }
  return "none";
}
