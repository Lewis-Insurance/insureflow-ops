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

export interface FloorDecisionPackagePreview {
  packageRef: string;
  revision: number;
  title: string;
  summary: string;
  actions: Array<'approve' | 'edit' | 'kill'>;
}

export type FloorStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'tool'; label: string; state: 'started' | 'done' | 'failed' }
  | ({ type: 'package' } & FloorDecisionPackagePreview)
  | { type: 'done'; messageRef?: string; hermesResponseId?: string }
  | { type: 'error'; code: string; message: string; retryable?: boolean };

export type FloorStreamEmitter = (event: FloorStreamEvent) => void;
export type FloorChatSender = (request: FloorChatRequest, emit: FloorStreamEmitter) => Promise<void>;
