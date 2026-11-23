import {createInterface} from 'node:readline';
import {stdin, stdout} from 'node:process';
import {FileBackedCatalogRuntime, createFileBackedCatalogHandler} from './catalog-runtime.mts';
import {LiteratureTraceHost} from './literature-trace-host.mts';
import {decodeRequest, encodeResponse, type SnapshotRef} from '../../backend/src/literature-trace-protocol.mts';
import {ORIGINAL_MARK_SENT, RetrievalTraceError, validateContext, type RetrievalTraceRow} from '../../backend/src/retrieval-trace.mts';

interface NoteTraceSnapshot {readonly query: string; readonly row: RetrievalTraceRow | null}

/** Standalone Node replacement for the archived native host main.rs. The Core
 * process owns this child and its working directory; every frame remains a
 * single JSON line, and snapshot bytes stay in the Core-owned directory. */
export async function run(root = process.env.RESEARCH_ASSISTANT_PLUGIN_HOST_ROOT ?? process.cwd()): Promise<void> {
  const runtime = new FileBackedCatalogRuntime(root);
  const host = new LiteratureTraceHost();
  const catalog = createFileBackedCatalogHandler(runtime);
  const handlers = {
    async decideNoteTrace(snapshot: SnapshotRef) {
      const input = await runtime.readJson<NoteTraceSnapshot>(snapshot);
      try {validateContext(null, input.query, input.row); return {status: 'ready' as const, markSent: ORIGINAL_MARK_SENT};}
      catch (cause) {if (!(cause instanceof RetrievalTraceError)) throw cause; return {status: 'rejected' as const, reason: cause.rejection};}
    },
    catalog,
  };
  const lines = createInterface({input: stdin, crlfDelay: Infinity});
  for await (const line of lines) {
    if (line.length === 0) throw new Error('literature_host_protocol_invalid');
    const request = decodeRequest(new TextEncoder().encode(line));
    const response = await host.handle(request, handlers);
    stdout.write(`${new TextDecoder().decode(encodeResponse(response))}\n`);
    if (response.body.kind === 'shutdownComplete') {lines.close(); break;}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(cause => {console.error(cause instanceof Error ? cause.message : String(cause)); process.exitCode = 2;});
}
