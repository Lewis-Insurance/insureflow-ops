/**
 * The one set of stages, used by new business, cross sells, renewals and rewrites
 * alike. That is the point: the process is the same, so the stages are the same.
 *
 * Quoted means carrier quotes are in hand. Proposed means they were presented to the
 * client and the office is waiting on an answer.
 *
 * Stage is rendered as text, never as a colour. Calm Command rule 3.
 */

export const PIPELINE_STAGES = ['new', 'working', 'quoted', 'proposed', 'bound', 'lost'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** The columns the board shows. Bound and Lost live in the collapsed closed pair. */
export const OPEN_STAGES: PipelineStage[] = ['new', 'working', 'quoted', 'proposed'];
export const CLOSED_STAGES: PipelineStage[] = ['bound', 'lost'];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  new: 'New',
  working: 'Working',
  quoted: 'Quoted',
  proposed: 'Proposed',
  bound: 'Bound',
  lost: 'Lost',
};

export const PIPELINE_KINDS = ['new_business', 'cross_sell', 'renewal', 'rewrite'] as const;
export type PipelineKind = (typeof PIPELINE_KINDS)[number];

export const KIND_LABELS: Record<PipelineKind, string> = {
  new_business: 'New business',
  cross_sell: 'Cross-sell',
  renewal: 'Renewal',
  rewrite: 'Rewrite',
};

export const QUOTE_STATUSES = ['quoted', 'proposed', 'accepted', 'declined'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  quoted: 'Quoted',
  proposed: 'Proposed',
  accepted: 'Accepted',
  declined: 'Declined',
};

export const LOST_REASONS = ['price', 'no_answer', 'went_elsewhere', 'not_eligible', 'other'] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: 'Price',
  no_answer: 'No answer',
  went_elsewhere: 'Went elsewhere',
  not_eligible: 'Not eligible',
  other: 'Other',
};

/**
 * The lead status the database constraint accepts for each stage. The new screens never
 * write leads.status directly; the pipeline functions mirror it. This map exists so the
 * front end can say what it expects and a test can hold the two in step.
 */
export const STAGE_TO_LEAD_STATUS: Record<PipelineStage, string> = {
  new: 'new',
  working: 'contacted',
  quoted: 'quoted',
  proposed: 'quoted',
  bound: 'won',
  lost: 'lost',
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as PipelineStage] ?? stage;
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as PipelineKind] ?? kind;
}

export function isOpenStage(stage: string): boolean {
  return OPEN_STAGES.includes(stage as PipelineStage);
}
