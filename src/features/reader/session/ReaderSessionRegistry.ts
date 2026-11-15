import type { LiteratureItem } from "@research-assistant/core/literature";
import type { ReadingNoteSource } from "@research-assistant/core/notes";
import type { ReaderLifecycleState } from "@research-assistant/core/reader";

export const LIBRARY_TAB_ID = "library";

export interface ReaderSessionInput {
  readonly item: LiteratureItem;
  readonly attachment: LiteratureItem["attachments"][number];
  readonly source?: ReadingNoteSource;
}

export interface ReaderSession extends ReaderSessionInput {
  readonly id: string;
  readonly navigationRequestId: number;
  readonly lifecycle: Extract<ReaderLifecycleState, "active" | "hidden">;
}

interface ReaderSessionRegistryState {
  readonly sessions: readonly ReaderSession[];
  readonly activeTabId: string;
  readonly nextNavigationRequestId: number;
}

export function readerSessionId(attachmentId: string): string {
  return `reader:${attachmentId}`;
}

export class ReaderSessionRegistry {
  readonly #sessions: readonly ReaderSession[];
  readonly #activeTabId: string;
  readonly #nextNavigationRequestId: number;

  constructor(state?: ReaderSessionRegistryState) {
    this.#sessions = state?.sessions ?? [];
    this.#activeTabId = state?.activeTabId ?? LIBRARY_TAB_ID;
    this.#nextNavigationRequestId = state?.nextNavigationRequestId ?? 1;
  }

  private static from(
    registry: ReaderSessionRegistry,
    sessions: readonly ReaderSession[],
    activeTabId: string,
    nextNavigationRequestId = registry.#nextNavigationRequestId,
  ): ReaderSessionRegistry {
    return new ReaderSessionRegistry({ sessions, activeTabId, nextNavigationRequestId });
  }

  get sessions(): readonly ReaderSession[] {
    return this.#sessions;
  }

  get activeTabId(): string {
    return this.#activeTabId;
  }

  get activeSession(): ReaderSession | undefined {
    return this.#sessions.find((session) => session.id === this.#activeTabId);
  }

  refreshItem(item: LiteratureItem): ReaderSessionRegistry {
    const sessions = this.#sessions.map(session => {
      if (session.item.id !== item.id) return session;
      const attachment = item.attachments.find(value => value.id === session.attachment.id);
      return attachment ? {...session, item, attachment} : session;
    });
    return ReaderSessionRegistry.from(this, sessions, this.#activeTabId);
  }

  open(input: ReaderSessionInput): ReaderSessionRegistry {
    const id = readerSessionId(input.attachment.id);
    const existing = this.#sessions.find((session) => session.id === id);
    const session: ReaderSession = {
      id,
      ...input,
      navigationRequestId: this.#nextNavigationRequestId,
      lifecycle: "active",
    };
    const sessions = existing === undefined
      ? [...this.#sessions.map(hideSession), session]
      : this.#sessions.map((candidate) => candidate.id === id ? session : hideSession(candidate));
    return ReaderSessionRegistry.from(
      this,
      sessions,
      id,
      this.#nextNavigationRequestId + 1,
    );
  }

  activate(tabId: string): ReaderSessionRegistry {
    if (tabId === LIBRARY_TAB_ID) {
      return ReaderSessionRegistry.from(this, this.#sessions.map(hideSession), LIBRARY_TAB_ID);
    }
    if (!this.#sessions.some((session) => session.id === tabId)) return this;
    return ReaderSessionRegistry.from(
      this,
      this.#sessions.map((session) => session.id === tabId
        ? { ...session, lifecycle: "active" }
        : hideSession(session)),
      tabId,
    );
  }

  close(tabId: string): ReaderSessionRegistry {
    const index = this.#sessions.findIndex((session) => session.id === tabId);
    if (index < 0) return this;
    const sessions = this.#sessions.filter((session) => session.id !== tabId);
    if (this.#activeTabId !== tabId) {
      return ReaderSessionRegistry.from(this, sessions, this.#activeTabId);
    }
    const previous = this.#sessions[index - 1];
    const activeTabId = previous?.id ?? LIBRARY_TAB_ID;
    return ReaderSessionRegistry.from(
      this,
      sessions.map((session) => session.id === activeTabId
        ? { ...session, lifecycle: "active" }
        : hideSession(session)),
      activeTabId,
    );
  }

  closeForItem(itemId: string): ReaderSessionRegistry {
    const closingIds = new Set(
      this.#sessions.filter((session) => session.item.id === itemId).map((session) => session.id),
    );
    if (closingIds.size === 0) return this;
    const sessions = this.#sessions.filter((session) => !closingIds.has(session.id));
    const activeTabId = closingIds.has(this.#activeTabId) ? LIBRARY_TAB_ID : this.#activeTabId;
    return ReaderSessionRegistry.from(
      this,
      activeTabId === LIBRARY_TAB_ID ? sessions.map(hideSession) : sessions,
      activeTabId,
    );
  }
}

function hideSession(session: ReaderSession): ReaderSession {
  return session.lifecycle === "hidden" ? session : { ...session, lifecycle: "hidden" };
}
