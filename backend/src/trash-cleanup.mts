/** Canonical permanent-cleanup graph migrated from the native plugin. */

export interface CleanupRelation {readonly child: string; readonly parent: string; readonly columns: readonly (readonly [string, string])[]}

const EDGES: readonly CleanupRelation[] = [
  {child: 'agent_paper_analysis_bindings', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'agent_paper_analysis_submissions', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'agent_paper_reading_history_migrations', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'agent_paper_reading_legacy_sessions', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'agent_paper_submission_scopes', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'ai_overview_confirmation_batches', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'ai_overview_template_runs', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'ai_paper_review_confirmation_batches', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'ai_resource_template_runs', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'attachments', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'collection_memberships', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'concept_evolution_results', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'concept_retrieval_trace_sources', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'concept_retrieval_traces', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'docling_parse_runs', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'duplicate_candidates', parent: 'bibliographic_items', columns: [['right_item_id', 'id']] as const},
  {child: 'duplicate_candidates', parent: 'bibliographic_items', columns: [['left_item_id', 'id']] as const},
  {child: 'evidence_matrix_cells', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'identifiers', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'item_creators', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'item_relation_assignments', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'item_tags', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'merge_operations', parent: 'bibliographic_items', columns: [['merged_item_id', 'id']] as const},
  {child: 'merge_operations', parent: 'bibliographic_items', columns: [['survivor_item_id', 'id']] as const},
  {child: 'metadata_candidates', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'metadata_provenance', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'paper_ai_reading_sessions', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'paper_analysis_workflows', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'paper_concept_assertions', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'paper_context_snapshots', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'paper_foundation_similarity_results', parent: 'bibliographic_items', columns: [['right_paper_id', 'id']] as const},
  {child: 'paper_foundation_similarity_results', parent: 'bibliographic_items', columns: [['left_paper_id', 'id']] as const},
  {child: 'paper_generation_conversations', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'paper_reading_profile_selections', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'project_items', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'reading_states', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'reference_records', parent: 'bibliographic_items', columns: [['citing_paper_id', 'id']] as const},
  {child: 'source_anchors', parent: 'bibliographic_items', columns: [['item_id', 'id']] as const},
  {child: 'structured_paper_template_owners', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'structured_resources', parent: 'bibliographic_items', columns: [['paper_id', 'id']] as const},
  {child: 'agent_paper_analysis_bindings', parent: 'paper_context_snapshots', columns: [['context_snapshot_id', 'id']] as const},
  {child: 'agent_paper_analysis_bindings', parent: 'paper_analysis_workflows', columns: [['workflow_id', 'id']] as const},
  {child: 'agent_paper_analysis_submissions', parent: 'paper_analysis_turn_attempts', columns: [['attempt_id', 'id']] as const},
  {child: 'agent_paper_submission_scopes', parent: 'paper_context_snapshots', columns: [['paper_context_snapshot_id', 'id']] as const},
  {child: 'ai_candidate_recovery_audits', parent: 'paper_analysis_workflows', columns: [['workflow_id', 'id']] as const},
  {child: 'ai_citation_assessments', parent: 'ai_evidence_items', columns: [['evidence_item_id', 'id']] as const},
  {child: 'ai_docling_evidence_context_items', parent: 'docling_parse_runs', columns: [['parse_run_id', 'id']] as const},
  {child: 'ai_docling_evidence_context_items', parent: 'ai_evidence_items', columns: [['evidence_item_id', 'id']] as const},
  {child: 'ai_evidence_inspections', parent: 'ai_evidence_items', columns: [['evidence_item_id', 'id']] as const},
  {child: 'ai_evidence_items', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'ai_matrix_synthesis_input_cells', parent: 'evidence_matrix_cell_revisions', columns: [['cell_id', 'cell_id'], ['cell_revision', 'revision']] as const},
  {child: 'ai_overview_confirmation_undos', parent: 'ai_overview_confirmation_batches', columns: [['batch_id', 'id']] as const},
  {child: 'ai_overview_field_confirmations', parent: 'ai_overview_confirmation_batches', columns: [['batch_id', 'id']] as const},
  {child: 'ai_overview_field_review_resets', parent: 'ai_overview_field_confirmations', columns: [['field_confirmation_id', 'id']] as const},
  {child: 'ai_paper_review_confirmation_undos', parent: 'ai_paper_review_confirmation_batches', columns: [['batch_id', 'id']] as const},
  {child: 'ai_paper_review_metadata_confirmation_undos', parent: 'ai_paper_review_metadata_confirmations', columns: [['confirmation_id', 'id']] as const},
  {child: 'ai_paper_review_metadata_confirmations', parent: 'ai_paper_review_confirmation_batches', columns: [['batch_id', 'id']] as const},
  {child: 'ai_paper_review_overview_batch_links', parent: 'ai_overview_confirmation_batches', columns: [['overview_batch_id', 'id']] as const},
  {child: 'ai_paper_review_overview_batch_links', parent: 'ai_paper_review_confirmation_batches', columns: [['batch_id', 'id']] as const},
  {child: 'ai_resource_template_runs', parent: 'structured_resource_revisions', columns: [['template_id', 'resource_id'], ['template_revision', 'revision']] as const},
  {child: 'ai_resource_template_runs', parent: 'structured_resources', columns: [['template_id', 'id']] as const},
  {child: 'annotations', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'attachment_page_texts', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
  {child: 'concept_evolution_results', parent: 'paper_concept_assertions', columns: [['assertion_id', 'id']] as const},
  {child: 'concept_retrieval_trace_edges', parent: 'concept_retrieval_traces', columns: [['trace_id', 'id']] as const},
  {child: 'concept_retrieval_trace_seeds', parent: 'concept_retrieval_traces', columns: [['trace_id', 'id']] as const},
  {child: 'concept_retrieval_trace_sources', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'concept_retrieval_trace_sources', parent: 'concept_retrieval_traces', columns: [['trace_id', 'id']] as const},
  {child: 'definition_claim_evidence_links', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'docling_parse_runs', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
  {child: 'evidence_links', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'evidence_matrix_cell_revisions', parent: 'evidence_matrix_cells', columns: [['cell_id', 'id']] as const},
  {child: 'full_text_index_jobs', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
  {child: 'paper_ai_reading_sessions', parent: 'paper_analysis_workflows', columns: [['source_workflow_id', 'id']] as const},
  {child: 'paper_ai_reading_sessions', parent: 'paper_context_snapshots', columns: [['context_snapshot_id', 'id']] as const},
  {child: 'paper_ai_reading_turn_context_items', parent: 'docling_parse_runs', columns: [['parse_run_id', 'id']] as const},
  {child: 'paper_ai_reading_turn_context_items', parent: 'paper_ai_reading_turns', columns: [['turn_id', 'id']] as const},
  {child: 'paper_ai_reading_turns', parent: 'concept_retrieval_traces', columns: [['concept_retrieval_trace_id', 'id']] as const},
  {child: 'paper_ai_reading_turns', parent: 'paper_ai_reading_sessions', columns: [['session_id', 'id']] as const},
  {child: 'paper_analysis_turn_attempts', parent: 'paper_analysis_turns', columns: [['turn_id', 'id']] as const},
  {child: 'paper_analysis_turns', parent: 'paper_analysis_workflows', columns: [['workflow_id', 'id']] as const},
  {child: 'paper_analysis_workflows', parent: 'paper_context_snapshots', columns: [['context_snapshot_id', 'id']] as const},
  {child: 'paper_concept_assertion_revisions', parent: 'paper_concept_assertions', columns: [['assertion_id', 'id']] as const},
  {child: 'paper_concept_assertions', parent: 'term_usages', columns: [['term_usage_id', 'id']] as const},
  {child: 'paper_context_attachments', parent: 'docling_parse_runs', columns: [['parse_run_id', 'id']] as const},
  {child: 'paper_context_attachments', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
  {child: 'paper_context_attachments', parent: 'paper_context_snapshots', columns: [['snapshot_id', 'id']] as const},
  {child: 'paper_context_items', parent: 'docling_parse_runs', columns: [['parse_run_id', 'id']] as const},
  {child: 'paper_context_items', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
  {child: 'paper_context_items', parent: 'paper_context_snapshots', columns: [['snapshot_id', 'id']] as const},
  {child: 'reading_states', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
  {child: 'reading_unit_evidence_links', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'reference_record_revisions', parent: 'reference_records', columns: [['reference_record_id', 'id']] as const},
  {child: 'reference_records', parent: 'source_anchors', columns: [['source_anchor_id', 'id']] as const},
  {child: 'relation_assertion_evidence_links', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'source_anchors', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
  {child: 'structured_paper_template_owners', parent: 'structured_resources', columns: [['template_id', 'id']] as const},
  {child: 'structured_resource_creations', parent: 'structured_resources', columns: [['resource_id', 'id']] as const},
  {child: 'structured_resource_drafts', parent: 'structured_resources', columns: [['resource_id', 'id']] as const},
  {child: 'structured_resource_field_sources', parent: 'structured_resource_revisions', columns: [['resource_id', 'resource_id'], ['revision', 'revision']] as const},
  {child: 'structured_resource_legacy_versions', parent: 'structured_resources', columns: [['resource_id', 'id']] as const},
  {child: 'structured_resource_operations', parent: 'structured_resources', columns: [['resource_id', 'id']] as const},
  {child: 'structured_resource_receipts', parent: 'structured_resource_revisions', columns: [['resource_id', 'resource_id'], ['revision', 'revision']] as const},
  {child: 'structured_resource_receipts', parent: 'structured_resources', columns: [['resource_id', 'id']] as const},
  {child: 'structured_resource_revisions', parent: 'structured_resources', columns: [['resource_id', 'id']] as const},
  {child: 'structured_resource_write_intents', parent: 'structured_resources', columns: [['resource_id', 'id']] as const},
  {child: 'structured_template_draft_adoptions', parent: 'structured_resources', columns: [['reading_resource_id', 'id']] as const},
  {child: 'structured_template_draft_adoptions', parent: 'structured_resource_drafts', columns: [['draft_id', 'id']] as const},
  {child: 'term_usages', parent: 'source_anchors', columns: [['anchor_id', 'id']] as const},
  {child: 'word_explanations', parent: 'attachments', columns: [['attachment_id', 'id']] as const},
] as const;

export const SOFT_PAPER_OWNERS = [
  'paper_reading_profile_selection_revisions',
  'ai_overview_profile_runs',
  'ai_evidence_items',
  'paper_ai_reading_turn_context_items',
] as const;

export function relations(): readonly CleanupRelation[] {return EDGES;}

export type CleanupPlanError = 'cycle';

export function deletionOrder(): readonly string[] | CleanupPlanError {
  const active = new Set<string>(), done = new Set<string>(), order: string[] = [];
  const visit = (table: string): CleanupPlanError | null => {
    if (done.has(table)) return null;
    if (active.has(table)) return 'cycle';
    active.add(table);
    for (const edge of EDGES) if (edge.parent === table) {const error = visit(edge.child); if (error !== null) return error;}
    active.delete(table); done.add(table); order.push(table); return null;
  };
  const rootError = visit('bibliographic_items'); if (rootError !== null) return rootError;
  for (const table of SOFT_PAPER_OWNERS) {const error = visit(table); if (error !== null) return error;}
  return order;
}

export type TrashCleanupPreparation =
  | {readonly status: 'ready'; readonly plan: {readonly softOwners: readonly string[]; readonly relations: readonly {readonly id: string; readonly child: string; readonly parent: string}[]; readonly deleteTables: readonly string[]}}
  | {readonly status: 'rejected'; readonly code: 'plan_cycle'};

export function prepareTrashCleanup(): TrashCleanupPreparation {
  const order = deletionOrder();
  if (order === 'cycle') return {status: 'rejected', code: 'plan_cycle'};
  const relations = EDGES.map(edge => ({id: `literature.trash-cleanup.collect-${edge.child}-${edge.columns.map(column => column[0]).join('-')}--${edge.parent}`, child: edge.child, parent: edge.parent}));
  return {status: 'ready', plan: {softOwners: [...SOFT_PAPER_OWNERS], relations, deleteTables: order.filter(table => table !== 'bibliographic_items')}};
}

export function cleanupPlanRejectionCodeAsString(code: 'plan_cycle'): string {if (code !== 'plan_cycle') throw new Error('invalid cleanup code'); return 'LITERATURE_CLEANUP_PLAN_CYCLE';}
