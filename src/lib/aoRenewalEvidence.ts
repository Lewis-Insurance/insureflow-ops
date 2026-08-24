import type { AORenewal } from "@/hooks/useAORenewals";
import {
  deriveAoRenewalEffectiveDate,
  type AoRenewalExtractSignal,
} from "@/lib/aoRenewalExtractSignal";
import {
  differenceFromTodayInLocalDays,
  extractLocalDate,
  parseLocalDate,
} from "@/lib/date/localDate";
import { lobMatchesPolicyAndQuote } from "@/lib/quoteIncumbent/lineKey";

export interface AoRenewalEvidenceDocumentRow {
  id: string;
  account_id: string;
  policy_id: string | null;
  document_type: string | null;
  category: string | null;
  kind: string | null;
  filename: string | null;
  uploaded_at: string | null;
  created_at: string | null;
}

export interface AoRenewalEvidenceQuoteRow {
  id: string;
  account_id: string;
  line_of_business: string | null;
  premium: number | null;
  created_at: string | null;
}

export interface AoRenewalFallbackQuoteRow {
  id: string;
  renewal_id: string;
  status: string;
}

export interface AoRenewalEvidenceRollupRow {
  account_id: string;
  ao_renewal_id: string | null;
  has_packet: boolean;
  total_count: number;
  missing_count: number;
  in_review_count: number;
  all_required_complete: boolean;
  last_touch_at: string | null;
}

export type AoRenewalExtractEvidence = AoRenewalExtractSignal;

export interface AoRenewalDecEvidence {
  state: "on_file" | "none";
  newestAt: string | null;
}

export interface AoRenewalItemsEvidence {
  missingCount: number;
  inReviewCount: number;
  totalCount: number;
  allRequiredComplete: boolean;
}

export interface AoRenewalTouchEvidence {
  state: "today" | "recent" | "stale" | "never";
  lastTouchAt: string | null;
  daysAgo: number | null;
}

export type AoRenewalActionHole =
  | "confirm_extract"
  | "get_dec"
  | "open_checklist"
  | "analyze_dec"
  | "start_quote"
  | "log_contact";

export type AoRenewalNextHole =
  | { kind: AoRenewalActionHole; label: string; href: string }
  | { kind: "ready"; label: "Ready"; href: null };

export interface AoRenewalEvidence {
  renewalId: string;
  accountId: string | null;
  dec: AoRenewalDecEvidence;
  extract: AoRenewalExtractSignal | null;
  openQuoteCount: number;
  items: AoRenewalItemsEvidence | null;
  touch: AoRenewalTouchEvidence;
  nextHole: AoRenewalNextHole;
}

export interface BuildAoRenewalEvidenceInput {
  renewal: AORenewal;
  documents: AoRenewalEvidenceDocumentRow[];
  quotes: AoRenewalEvidenceQuoteRow[];
  fallbackQuotes: AoRenewalFallbackQuoteRow[];
  rollup: AoRenewalEvidenceRollupRow | null;
  extract?: AoRenewalExtractEvidence;
  today: string | Date;
}

const DEC_TYPES = new Set(["dec_page", "current_dec"]);

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isDecDocument(row: AoRenewalEvidenceDocumentRow): boolean {
  return (
    DEC_TYPES.has(normalized(row.document_type)) ||
    DEC_TYPES.has(normalized(row.category)) ||
    DEC_TYPES.has(normalized(row.kind))
  );
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function subtractUtcDays(localDate: string, days: number): number {
  const [year, month, day] = localDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day - days);
}

function extractProvesDec(
  extract: AoRenewalExtractEvidence | undefined,
): boolean {
  return DEC_TYPES.has(normalized(extract?.documentType));
}

export function deriveCurrentDecEvidence(
  renewal: AORenewal,
  documents: AoRenewalEvidenceDocumentRow[],
  extract?: AoRenewalExtractEvidence,
): AoRenewalDecEvidence {
  const decDocuments = documents
    .filter(isDecDocument)
    .map((document) => ({
      document,
      timestamp: parseTimestamp(document.uploaded_at ?? document.created_at),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        document: AoRenewalEvidenceDocumentRow;
        timestamp: number;
      } => candidate.timestamp !== null,
    )
    .sort((a, b) => b.timestamp - a.timestamp);

  if (extractProvesDec(extract)) {
    return {
      state: "on_file",
      newestAt:
        decDocuments[0]?.document.uploaded_at ??
        decDocuments[0]?.document.created_at ??
        null,
    };
  }

  const effectiveDate = deriveAoRenewalEffectiveDate(
    renewal.renewal_date,
    renewal.term_months,
  );
  if (!effectiveDate) return { state: "none", newestAt: null };
  const threshold = subtractUtcDays(effectiveDate, 60);
  const current = decDocuments.find(
    (candidate) => candidate.timestamp >= threshold,
  );
  return current
    ? {
        state: "on_file",
        newestAt: current.document.uploaded_at ?? current.document.created_at,
      }
    : { state: "none", newestAt: null };
}

export function deriveLastTouchEvidence(
  renewalLastContactAt: string | null,
  communicationLastTouchAt: string | null,
  today: string | Date,
): AoRenewalTouchEvidence {
  const candidates = [renewalLastContactAt, communicationLastTouchAt]
    .map((value) => ({ value, timestamp: parseTimestamp(value) }))
    .filter(
      (candidate): candidate is { value: string; timestamp: number } =>
        candidate.timestamp !== null,
    )
    .sort((a, b) => b.timestamp - a.timestamp);
  const latest = candidates[0];
  if (!latest) return { state: "never", lastTouchAt: null, daysAgo: null };

  const localToday =
    today instanceof Date ? today : parseLocalDate(extractLocalDate(today));
  const localDayDifference = differenceFromTodayInLocalDays(
    latest.value,
    localToday,
  );
  const daysAgo = Math.max(0, -(localDayDifference ?? 0));
  return {
    state: daysAgo === 0 ? "today" : daysAgo >= 7 ? "stale" : "recent",
    lastTouchAt: latest.value,
    daysAgo,
  };
}

export function pickNextHole(
  evidence: Omit<AoRenewalEvidence, "nextHole">,
): AoRenewalNextHole {
  const editorHref = `/ao-renewals/${evidence.renewalId}/edit`;
  if (evidence.extract?.label === "Confirm extract") {
    return {
      kind: "confirm_extract",
      label: "Confirm extract",
      href: `/analyze-documents/${evidence.extract.analysisId}`,
    };
  }

  if (
    evidence.accountId &&
    evidence.dec.state === "none" &&
    evidence.items === null
  ) {
    return {
      kind: "get_dec",
      label: "Get dec",
      href: `/customers/${evidence.accountId}?tab=documents`,
    };
  }

  if (evidence.accountId && evidence.items && evidence.items.missingCount > 0) {
    return {
      kind: "open_checklist",
      label: "Open checklist",
      href: `/customers/${evidence.accountId}?tab=documents`,
    };
  }

  if (evidence.dec.state === "on_file" && !evidence.extract) {
    return {
      kind: "analyze_dec",
      label: "Analyze dec",
      href: "/analyze-documents",
    };
  }

  if (evidence.accountId && evidence.openQuoteCount === 0) {
    return {
      kind: "start_quote",
      label: "Start quote",
      href: `/customers/${evidence.accountId}?tab=policies&policiesTab=quotes`,
    };
  }

  if (evidence.touch.state === "stale" || evidence.touch.state === "never") {
    return {
      kind: "log_contact",
      label: "Log contact",
      href: `${editorHref}#contact-log`,
    };
  }

  return { kind: "ready", label: "Ready", href: null };
}

export function buildAoRenewalEvidence(
  input: BuildAoRenewalEvidenceInput,
): AoRenewalEvidence {
  const { renewal, documents, quotes, fallbackQuotes, rollup, extract, today } =
    input;
  const dec = deriveCurrentDecEvidence(renewal, documents, extract);
  const matchingAccountQuotes = renewal.account_id
    ? quotes.filter((quote) =>
        lobMatchesPolicyAndQuote(renewal.policy_type, quote.line_of_business),
      )
    : [];
  const matchingAoQuotes = fallbackQuotes.filter(
    (quote) =>
      quote.renewal_id === renewal.id &&
      (quote.status === "quoted" || quote.status === "selected"),
  );
  const openQuoteCount = renewal.account_id
    ? new Set([
        ...matchingAccountQuotes.map((quote) => quote.id),
        ...matchingAoQuotes.map((quote) => quote.id),
      ]).size
    : matchingAoQuotes.length;
  const items = rollup?.has_packet && rollup.total_count > 0
    ? {
        missingCount: rollup.missing_count,
        inReviewCount: rollup.in_review_count,
        totalCount: rollup.total_count,
        allRequiredComplete: rollup.all_required_complete,
      }
    : null;
  const evidenceWithoutHole = {
    renewalId: renewal.id,
    accountId: renewal.account_id,
    dec,
    extract: extract
      ? {
          analysisId: extract.analysisId,
          label: extract.label,
          documentType: extract.documentType,
        }
      : null,
    openQuoteCount,
    items,
    touch: deriveLastTouchEvidence(
      renewal.last_contact_date,
      rollup?.last_touch_at ?? null,
      today,
    ),
  };
  return {
    ...evidenceWithoutHole,
    nextHole: pickNextHole(evidenceWithoutHole),
  };
}
