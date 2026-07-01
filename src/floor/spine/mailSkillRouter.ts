import type { InboundMessage, RouteDecision } from './types.ts';

export interface MailSkillRouterDeps {
  allowedSender: (email: string) => Promise<boolean> | boolean;
  classifyDocument: (
    attachments: InboundMessage['attachments'],
  ) => Promise<string> | string;
}

export function authPassed(
  spf: InboundMessage['spf'],
  dkim: InboundMessage['dkim'],
  dmarc: InboundMessage['dmarc'],
): boolean {
  return spf === 'pass' && dkim === 'pass' && dmarc === 'pass';
}

/** Forwarded-envelope aware: prefer forwardedFrom when present. */
export function normalizeSender(msg: InboundMessage): string {
  const raw = (msg.forwardedFrom ?? msg.from ?? '').trim().toLowerCase();
  const angleMatch = raw.match(/<([^>]+)>/);
  const email = angleMatch ? angleMatch[1] : raw;
  return email.trim();
}

/**
 * Deterministic intake router. Keys off metadata only — never the email body.
 */
export async function mailSkillRouter(
  msg: InboundMessage,
  deps: MailSkillRouterDeps,
): Promise<RouteDecision> {
  if (!authPassed(msg.spf, msg.dkim, msg.dmarc)) {
    return { route: 'fall_through', reason: 'auth_failed' };
  }

  const sender = normalizeSender(msg);
  if (!sender.includes('@')) {
    return { route: 'fall_through', reason: 'invalid_sender' };
  }

  const allowed = await deps.allowedSender(sender);
  if (!allowed) {
    return { route: 'fall_through', reason: 'not_allowlisted' };
  }

  const docClass = await deps.classifyDocument(msg.attachments ?? []);
  if (docClass !== 'coi') {
    return { route: 'fall_through', reason: 'out_of_scope' };
  }

  return {
    route: 'work_request',
    action: 'coi.issue',
    sender_identity: sender,
  };
}
