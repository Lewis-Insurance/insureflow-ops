import type { SuspenseTaskRow } from '../types.ts';

export interface OpenQuoteRow {
  id: string;
  account_id: string | null;
  status: string;
  line_of_business: string | null;
  premium: number | null;
  updated_at: string | null;
}

export interface OpenItemNudgeItem {
  kind: 'quote' | 'task';
  item_id: string;
  account_id: string;
  title: string;
  severity_score: number;
  reason: string;
}

export interface OpenItemNudgePlayResult {
  play_id: 'open.item.nudge';
  play_version: '1.0.0';
  tier: 1;
  item_count: number;
}

const OPEN_QUOTE_STATUSES = new Set(['open']);

/** Play 5 scaffold: nudge open quotes and non-suspense tasks (distinct from suspense.sweep). */
export function runOpenItemNudgePlay(
  quotes: OpenQuoteRow[],
  tasks: SuspenseTaskRow[],
  now: Date = new Date(),
  limit = 10,
): OpenItemNudgeItem[] {
  const openQuotes = quotes.filter((quote) => OPEN_QUOTE_STATUSES.has(quote.status.toLowerCase()));
  const staleTasks = tasks.filter(
    (task) => !task.title.toLowerCase().includes('suspense') && task.status.toLowerCase() === 'pending',
  );

  const quoteItems: OpenItemNudgeItem[] = openQuotes.map((quote) => {
    const ageDays = quote.updated_at
      ? Math.max(0, (now.getTime() - new Date(quote.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const premiumWeight = Math.min(40, (quote.premium ?? 0) / 200);
    return {
      kind: 'quote' as const,
      item_id: quote.id,
      account_id: quote.account_id!,
      title: `${quote.line_of_business ?? 'Quote'} — ${quote.status}`,
      severity_score: ageDays * 2 + premiumWeight,
      reason: ageDays >= 3 ? `Open ${Math.floor(ageDays)}d` : 'Open quote awaiting follow-up',
    };
  }).filter((item) => item.account_id);

  const taskItems: OpenItemNudgeItem[] = staleTasks.map((task) => ({
    kind: 'task' as const,
    item_id: task.id,
    account_id: task.account_id!,
    title: task.title,
    severity_score: 25,
    reason: 'Open task — distinct from suspense sweep',
  })).filter((item) => item.account_id);

  return [...quoteItems, ...taskItems]
    .sort((a, b) => b.severity_score - a.severity_score)
    .slice(0, limit);
}

export function summarizeOpenItemNudgePlay(items: OpenItemNudgeItem[]): OpenItemNudgePlayResult {
  return {
    play_id: 'open.item.nudge',
    play_version: '1.0.0',
    tier: 1,
    item_count: items.length,
  };
}
