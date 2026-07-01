import type {
  CoverageDiff,
  DecisionField,
  DecisionPackage,
  DocumentRef,
  RiskLevel,
  SendSpec,
} from './spine/types';

export type {
  CoverageDiff,
  DecisionField,
  DecisionPackage,
  DocumentRef,
  RiskLevel,
  SendSpec,
};

export interface FloorContextChip {
  label: string;
  value: string;
}

export interface FloorInitialContext {
  sessionRef: string;
  clientRef?: string;
  policyRef?: string;
  documentRefs?: string[];
  workItemRef?: string;
  label?: string;
  chips: FloorContextChip[];
}

export interface FloorChatRequest {
  sessionRef: string;
  message: string;
  contextRefs: {
    clientRef?: string;
    policyRef?: string;
    documentRefs?: string[];
    workItemRef?: string;
  };
}

/** Slack/Telegram card preview — view of DecisionPackage, not a second source of truth. */
export interface FloorDecisionPackagePreview {
  packageRef: string;
  revision: number;
  workRequestRef?: string;
  workRequestId?: string;
  playId?: string;
  playVersion?: string;
  title: string;
  summary: string;
  risk?: RiskLevel;
  clientRef?: string;
  documentRef?: DocumentRef | null;
  fields?: DecisionField[];
  diff?: CoverageDiff | null;
  sendSpec?: SendSpec | null;
  authorizedRepOfRecord?: string;
  actions: Array<'approve' | 'edit' | 'kill'>;
}

export function decisionPackageToPreview(pkg: DecisionPackage): FloorDecisionPackagePreview {
  return {
    packageRef: pkg.id,
    revision: 1,
    workRequestId: pkg.work_request_id,
    playId: pkg.play_id,
    playVersion: pkg.play_version,
    title: pkg.headline,
    summary: pkg.summary,
    risk: pkg.risk,
    clientRef: pkg.client_ref,
    documentRef: pkg.document_ref,
    fields: pkg.fields,
    diff: pkg.diff,
    sendSpec: pkg.send_spec,
    authorizedRepOfRecord: pkg.send_spec.authorized_rep_of_record,
    actions: ['approve', 'edit', 'kill'],
  };
}

export type FloorStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'tool'; label: string; state: 'started' | 'done' | 'failed' }
  | ({ type: 'package' } & FloorDecisionPackagePreview)
  | { type: 'done'; messageRef?: string; hermesResponseId?: string }
  | { type: 'error'; code: string; message: string; retryable?: boolean };

export type FloorStreamEmitter = (event: FloorStreamEvent) => void;
export type FloorChatSender = (request: FloorChatRequest, emit: FloorStreamEmitter) => Promise<void>;
