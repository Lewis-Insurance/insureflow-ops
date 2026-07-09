export interface RedactionSummary {
  type: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Context-aware date redaction
//
// Only dates of birth are regulated PII (CLAUDE.md "AI & PII Handling
// Policy"); policy-lifecycle dates are data the extraction models must see.
// A matched date is judged by the nearest label around it: DOB vocabulary
// redacts, policy vocabulary keeps, and a date with no recognizable label
// stays redacted as the safe default. DOB wins distance ties.
// ---------------------------------------------------------------------------

const DOB_DATE_CONTEXT =
  /\b(?:date\s+of\s+birth|birth\s*date|birthdate|birthday|d\.o\.b|d\/o\/b|dob|born|birth)\b/gi;

// [REDACTED_POLICY_NUMBER] counts as policy vocabulary so a date that sits
// right after a policy-number cell on a dec-page row - or a second redaction
// pass over text whose "POLICY ..." label was already replaced - keeps
// behaving like the first pass.
const POLICY_DATE_CONTEXT =
  /\b(?:policy\s+period|policy\s+term|effective|eff|expiration|expires?|expiry|exp|inception|retro(?:active)?(?:\s+date)?|continuity(?:\s+date)?|issued?(?:\s+date)?|renewal|renewed|cancell(?:ation|ed)|term)\b|\[REDACTED_POLICY_NUMBER\]/gi;

// Unambiguous policy-date labels. Driver schedules and employee censuses put
// weak vocabulary ("LIC EXP", "EFF", "RENEWAL", "ISSUED") right next to DOB
// columns, so weak vocabulary alone may only keep a date whose year is too
// recent to be a licensable person's DOB. A label from this strong set,
// immediately adjacent, keeps a date of any age (claims-made retro and
// inception dates legitimately reach back decades).
const STRONG_POLICY_DATE_CONTEXT =
  /\b(?:policy\s+period|policy\s+term|(?:policy|pol)\s+eff(?:ective)?|(?:policy|pol)\s+exp(?:iration)?|effective\s+date|expiration\s+date|inception|retro(?:active)?\s+date|continuity\s+date|cancellation)\b/gi;

const STRONG_LABEL_MAX_DISTANCE = 24;
// The youngest people on commercial P&C schedules are 14-year-old learner's
// permit holders and FLSA youth workers, so a date less than 13 years old
// cannot be a DOB from these documents; anything older takes the strict
// strong-label path below.
const DOB_PLAUSIBLE_YEAR_OFFSET = 13;

// OCR output frequently puts the label on the line above its value (table
// headers), so the windows span newlines and reach further backward than
// forward.
const DATE_CONTEXT_BEFORE = 120;
const DATE_CONTEXT_AFTER = 46;

function nearestContextDistance(pattern: RegExp, before: string, after: string): number | null {
  let nearest: number | null = null;
  pattern.lastIndex = 0;
  for (const match of before.matchAll(pattern)) {
    const distance = before.length - ((match.index ?? 0) + match[0].length);
    if (nearest === null || distance < nearest) nearest = distance;
  }
  for (const match of after.matchAll(pattern)) {
    const distance = match.index ?? 0;
    if (nearest === null || distance < nearest) nearest = distance;
  }
  return nearest;
}

export function shouldRedactDate(source: string, offset: number, match: string): boolean {
  const before = source.slice(Math.max(0, offset - DATE_CONTEXT_BEFORE), offset);
  // A label BEFORE a value may sit on the previous line (table headers), but a
  // label AFTER a value only applies when it is on the same line - otherwise
  // "POLICY PERIOD: ... 07/01/2026\nDOB: ..." would poison the expiration date.
  const afterRaw = source.slice(offset + match.length, offset + match.length + DATE_CONTEXT_AFTER);
  const afterNewline = afterRaw.search(/[\r\n]/);
  const after = afterNewline === -1 ? afterRaw : afterRaw.slice(0, afterNewline);
  const dobDistance = nearestContextDistance(DOB_DATE_CONTEXT, before, after);
  const policyDistance = nearestContextDistance(POLICY_DATE_CONTEXT, before, after);
  if (policyDistance === null) return true;
  if (dobDistance !== null && dobDistance <= policyDistance) return true;

  // Policy vocabulary is the nearest label. Keep modern dates outright; a
  // DOB-plausible year is stricter: it needs a strong policy label PRECEDING
  // the date within a few characters (a trailing label binds to its own date,
  // not leftward: "07/08/1975 EXPIRATION DATE 01/01/2027") and no DOB
  // vocabulary anywhere in the window (a "DOB" column header two cells away
  // must veto even when another header sits linearly nearer). So "JOHN SMITH
  // 04/12/1978 LIC EXP 05/01/2027" redacts while "RETRO DATE: 03/01/1998"
  // survives.
  const year = Number(match.slice(-4));
  if (year >= new Date().getFullYear() - DOB_PLAUSIBLE_YEAR_OFFSET) return false;
  if (dobDistance !== null) return true;
  const strongBeforeDistance = nearestContextDistance(STRONG_POLICY_DATE_CONTEXT, before, '');
  return strongBeforeDistance === null || strongBeforeDistance > STRONG_LABEL_MAX_DISTANCE;
}

const PII_PATTERNS: Array<{
  type: string;
  pattern: RegExp;
  replacement: string;
  guard?: (source: string, offset: number, match: string) => boolean;
}> = [
  {
    // Must run before the label-based patterns below so the date-context
    // guard still sees the original labels ("POLICY PERIOD", "DOB") instead
    // of their replacement tokens.
    type: 'dob_date',
    pattern: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g,
    replacement: '[REDACTED_DOB]',
    guard: shouldRedactDate,
  },
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  {
    type: 'account_number',
    pattern: /\b(?:account|acct)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,}\b/gi,
    replacement: '[REDACTED_ACCOUNT_NUMBER]',
  },
  {
    type: 'policy_number',
    pattern: /\b(?:policy|pol)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,}\b/gi,
    replacement: '[REDACTED_POLICY_NUMBER]',
  },
  {
    type: 'vin',
    pattern: /\b(?:vin|vehicle\s+identification\s+number)\b\s*[:#-]?\s*[A-HJ-NPR-Z0-9]{11,17}\b|\b[A-HJ-NPR-Z0-9]{17}\b/gi,
    replacement: '[REDACTED_VIN]',
  },
  { type: 'email', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED_EMAIL]' },
  { type: 'phone', pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  {
    type: 'dob_or_dln_label',
    pattern: /\b(?:date\s+of\s+birth|dob|driver'?s?\s+license|dln)\b\s*[:#-]?\s*[^\n,;]+/gi,
    replacement: '[REDACTED_REGULATED_FIELD]',
  },
  { type: 'ssn_compact', pattern: /\b\d{9}\b/g, replacement: '[REDACTED_SSN]' },
  {
    type: 'signed_storage_url',
    pattern: /https?:\/\/\S*(?:storage\/v1\/object\/(?:sign|public)|supabase\.co\/storage)\S*/gi,
    replacement: '[REDACTED_STORAGE_URL]',
  },
  {
    type: 'storage_path',
    pattern: /\b(?:documents|private|uploads|storage)\/[A-Za-z0-9._/-]+\b/g,
    replacement: '[REDACTED_STORAGE_PATH]',
  },
  {
    type: 'raw_uuid',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    replacement: '[REDACTED_REF]',
  },
];

// A date the guard decides to keep is parked behind a private-use-area
// placeholder while the remaining patterns run, then restored. Otherwise a
// broader label pattern (e.g. policy_number's "POLICY <text>" matcher) can
// bite into the kept date: "POLICY EFF 07/01/2025" would end up as
// "[REDACTED_POLICY_NUMBER]/01/2025". The frame contains no ASCII, so no PII
// pattern can match into it.
function keptValuePlaceholder(index: number): string {
  const encoded = String(index)
    .split('')
    .map((digit) => String.fromCharCode(0xe100 + Number(digit)))
    .join('');
  return `\uE000${encoded}\uE001`;
}

function restoreKeptValues(text: string, keptValues: string[]): string {
  if (keptValues.length === 0) return text;
  return text.replace(/\uE000([\uE100-\uE109]+)\uE001/g, (frame, encoded: string) => {
    const index = Number(
      encoded
        .split('')
        .map((char) => char.charCodeAt(0) - 0xe100)
        .join(''),
    );
    return keptValues[index] ?? frame;
  });
}

export function redactPII(text: string): { redacted: string; redactions: RedactionSummary[] } {
  // Strip any pre-existing placeholder-frame characters so crafted or OCR-noise
  // input cannot forge a frame that restoreKeptValues would expand.
  let redacted = text.replace(/[\uE000\uE001\uE100-\uE109]/g, '');
  const counts: Record<string, number> = {};
  const keptValues: string[] = [];

  for (const { type, pattern, replacement, guard } of PII_PATTERNS) {
    let count = 0;
    redacted = redacted.replace(pattern, (...args) => {
      const match = args[0] as string;
      const offset = args[args.length - 2] as number;
      const source = args[args.length - 1] as string;
      if (guard && !guard(source, offset, match)) {
        keptValues.push(match);
        return keptValuePlaceholder(keptValues.length - 1);
      }
      count += 1;
      return replacement;
    });
    if (count > 0) counts[type] = (counts[type] ?? 0) + count;
  }

  return {
    redacted: restoreKeptValues(redacted, keptValues),
    redactions: Object.entries(counts).map(([type, count]) => ({ type, count })),
  };
}

export function containsUnsafeBoundaryPayload(value: unknown): boolean {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return redactPII(text).redactions.length > 0;
}

// ---------------------------------------------------------------------------
// Redaction-token cleanup for structured model output
//
// A model shown redacted text will faithfully echo tokens like
// "[REDACTED_DOB]" into its structured output. Those tokens are placeholders,
// not data - extraction results must store null instead. A string is nulled
// only when nothing but redaction tokens and joiner words remains; strings
// mixing tokens with real content are left untouched.
// ---------------------------------------------------------------------------

const REDACTED_TOKEN = /\[REDACTED_[A-Z0-9_]+\]/g;
const REDACTION_JOINER_WORDS = /\b(?:to|thru|through|and)\b/gi;

export function isRedactionPlaceholder(value: string): boolean {
  if (!value.includes('[REDACTED_')) return false;
  const remainder = value.replace(REDACTED_TOKEN, '').replace(REDACTION_JOINER_WORDS, '');
  return !/[a-z0-9]/i.test(remainder);
}

export function nullifyRedactedTokens<T>(value: T): T {
  if (typeof value === 'string') {
    return (isRedactionPlaceholder(value) ? null : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => nullifyRedactedTokens(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, nullifyRedactedTokens(nested)]),
    ) as unknown as T;
  }
  return value;
}
