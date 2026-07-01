import { RESOLVE_ACCOUNT_AUTO_THRESHOLD } from './constants.ts';
import type {
  AccountRecord,
  ResolveAccountInput,
  ResolveCandidate,
  ResolveResult,
} from './types.ts';

export interface ResolveAccountStore {
  findByEmail: (email: string) => Promise<AccountRecord | null>;
  findByInsuredEmail: (email: string) => Promise<AccountRecord | null>;
  findByAlias: (token: string) => Promise<AccountRecord | null>;
  findByEmailDomain: (domain: string) => Promise<AccountRecord[]>;
  searchByName: (query: string, limit?: number) => Promise<Array<AccountRecord & { score: number }>>;
  findByPhone: (phone: string) => Promise<AccountRecord | null>;
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function dedupeCandidates(candidates: ResolveCandidate[]): ResolveCandidate[] {
  const byAccount = new Map<string, ResolveCandidate>();
  for (const candidate of candidates) {
    const existing = byAccount.get(candidate.account_id);
    if (!existing || candidate.confidence > existing.confidence) {
      byAccount.set(candidate.account_id, candidate);
    }
  }
  return [...byAccount.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Identity ladder: email-exact → alias → reverse-domain → trgm name → phone.
 * Below RESOLVE_ACCOUNT_AUTO_THRESHOLD the caller must force a human pick.
 */
export async function resolveAccount(
  input: ResolveAccountInput,
  store: ResolveAccountStore,
): Promise<ResolveResult> {
  const candidates: ResolveCandidate[] = [];
  const email = input.email?.trim().toLowerCase() ?? null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const name = input.name?.trim() ?? null;

  if (email) {
    const direct = await store.findByEmail(email);
    if (direct) {
      candidates.push({ account_id: direct.id, match_basis: 'email_exact', confidence: 1 });
    }

    const insured = await store.findByInsuredEmail(email);
    if (insured && insured.id !== direct?.id) {
      candidates.push({ account_id: insured.id, match_basis: 'email_exact', confidence: 0.98 });
    }

    const localPart = email.split('@')[0] ?? email;
    const alias = await store.findByAlias(localPart);
    if (alias) {
      candidates.push({ account_id: alias.id, match_basis: 'alias', confidence: 0.92 });
    }

    const domain = extractEmailDomain(email);
    if (domain) {
      const domainMatches = await store.findByEmailDomain(domain);
      for (const match of domainMatches.slice(0, 3)) {
        candidates.push({ account_id: match.id, match_basis: 'reverse_domain', confidence: 0.75 });
      }
    }
  }

  if (name) {
    const nameMatches = await store.searchByName(name, 5);
    for (const match of nameMatches) {
      const confidence = Math.min(0.89, Math.max(0.4, match.score));
      candidates.push({ account_id: match.id, match_basis: 'trgm_name', confidence });
    }
  }

  if (phone && phone.length >= 10) {
    const phoneMatch = await store.findByPhone(phone);
    if (phoneMatch) {
      candidates.push({ account_id: phoneMatch.id, match_basis: 'phone', confidence: 0.88 });
    }
  }

  const ranked = dedupeCandidates(candidates);
  const top = ranked[0] ?? null;
  const autoTop =
    top && top.confidence >= RESOLVE_ACCOUNT_AUTO_THRESHOLD
      ? { account_id: top.account_id, confidence: top.confidence }
      : null;

  return {
    candidates: ranked,
    top: autoTop,
  };
}

export function shouldForceIdentityPick(result: ResolveResult): boolean {
  return !result.top;
}
