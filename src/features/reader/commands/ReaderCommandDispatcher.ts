import {
  isReaderCommandEnabled,
  type ReaderCommand,
  type ReaderCommandContext,
} from "@research-assistant/core/reader";

export type ReaderCommandPayload = Readonly<Record<string, unknown>> | undefined;
export type ReaderCommandHandler = (payload: ReaderCommandPayload) => unknown;
export type ReaderCommandHandlers = Partial<Record<ReaderCommand, ReaderCommandHandler>>;

export function dispatchReaderCommand(
  command: ReaderCommand,
  context: ReaderCommandContext,
  handlers: ReaderCommandHandlers,
  payload?: ReaderCommandPayload,
): boolean {
  if (!isReaderCommandEnabled(command, context)) return false;
  const handler = handlers[command];
  if (handler === undefined) return false;
  void handler(payload);
  return true;
}
