import {
  CAPABILITY_ID, CAPABILITY_VERSION, type Request, type Response, type ResponseBody,
  type SnapshotRef, type TraceDecision,
} from '../../backend/src/literature-trace-protocol.mts';

export interface LiteratureTraceHostHandlers {
  decideNoteTrace(snapshot: SnapshotRef): Promise<TraceDecision>;
  catalog(operation: string, snapshot: SnapshotRef): Promise<SnapshotRef>;
}

interface Identity {packageKey: string; instanceId: string}

/** Lifecycle and identity port of the archived stdio host. Transport framing is
 * deliberately separate so Electron/Core can own the process and streams. */
export class LiteratureTraceHost {
  #identity: Identity | undefined;
  #closed = false;

  async handle(request: Request, handlers: LiteratureTraceHostHandlers): Promise<Response> {
    if (this.#closed) throw new Error('literature_host_lifecycle_invalid');
    if (this.#identity === undefined) {
      if (request.body.kind !== 'initialize') throw new Error('literature_host_lifecycle_invalid');
      this.#identity = {packageKey: request.packageKey, instanceId: request.instanceId};
      return this.response(request, {kind: 'initialized', capability: CAPABILITY_ID, version: CAPABILITY_VERSION});
    }
    if (this.#identity.packageKey !== request.packageKey || this.#identity.instanceId !== request.instanceId) {
      throw new Error('literature_host_identity_mismatch');
    }
    let body: ResponseBody;
    switch (request.body.kind) {
      case 'decideNoteTrace': body = {kind: 'noteTraceDecision', decision: await handlers.decideNoteTrace(request.body.snapshot)}; break;
      case 'catalog': body = {kind: 'catalogResult', payload: await handlers.catalog(request.body.operation, request.body.snapshot)}; break;
      case 'shutdown': body = {kind: 'shutdownComplete'}; this.#closed = true; break;
      case 'initialize': throw new Error('literature_host_lifecycle_invalid');
    }
    return this.response(request, body);
  }

  private response(request: Request, body: ResponseBody): Response {
    return {protocolVersion: request.protocolVersion, pluginId: request.pluginId, packageKey: request.packageKey,
      instanceId: request.instanceId, requestId: request.requestId, body};
  }
}
