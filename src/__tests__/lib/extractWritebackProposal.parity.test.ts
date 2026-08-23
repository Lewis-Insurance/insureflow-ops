import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import { readExtractSnapshot } from '@/lib/extractSnapshot';
import {
  hashExtractSnapshot as clientHash,
  buildProposedQuotesFromSnapshot as clientBuild,
} from '@/lib/extractWritebackProposal';
import { classifyLineCategory as clientClassify } from '@/lib/extractAccountMatch';
import {
  hashExtractSnapshot as serverHash,
  buildProposedQuotesFromSnapshot as serverBuild,
  classifyLineCategory as serverClassify,
  isSnapshotEmpty,
  ensureExtractWritebackProposals,
} from '../../../supabase/functions/_shared/extractWritebackProposal.ts';

/**
 * extractWritebackProposal client<->server parity.
 * The Deno mirror must hash byte-identically to the browser, or the client's
 * supersede step rejects the server rows and the dashboard card flickers.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLIENT = join(ROOT, 'src', 'lib', 'extractWritebackProposal.ts');
const CLIENT_MATCH = join(ROOT, 'src', 'lib', 'extractAccountMatch.ts');
const SERVER = join(ROOT, 'supabase', 'functions', '_shared', 'extractWritebackProposal.ts');

const normalize = (source: string): string => source.replace(/\r\n?/g, '\n');

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1) return '';
  return source.slice(start, end).trim();
}

const COMMERCIAL: ExtractSnapshotV1 = {
  schema_version: 1,
  insured_name: 'Acme Manufacturing LLC',
  carriers: ['Hartford', 'Travelers'],
  effective_date: '2026-03-01',
  expiration_date: '2027-03-01',
  claims_made: null,
  defense_inside_limits: null,
  premium: { total: 48250, frequency: 'annual' },
  fees: [{ type: 'broker', amount: 500 }],
  commission: { percent: 12.5, amount: 5781.25 },
  coverages: [
    {
      name: 'General Liability',
      limit: '$2,000,000',
      deductible: '$1,000',
      premium: 22000,
      parent_coverage: null,
    },
  ],
  locations: [],
  vehicles: [],
  drivers: [],
  document_type: 'commercial_quote',
  policy_number: 'COM-2026-0042',
  key_details: [],
};

/** Same data as COMMERCIAL with keys in a different insertion order. */
const OUT_OF_ORDER = {
  key_details: [],
  policy_number: 'COM-2026-0042',
  document_type: 'commercial_quote',
  drivers: [],
  vehicles: [],
  locations: [],
  coverages: [
    {
      parent_coverage: null,
      premium: 22000,
      deductible: '$1,000',
      limit: '$2,000,000',
      name: 'General Liability',
    },
  ],
  commission: { amount: 5781.25, percent: 12.5 },
  fees: [{ amount: 500, type: 'broker' }],
  premium: { frequency: 'annual', total: 48250 },
  defense_inside_limits: null,
  claims_made: null,
  expiration_date: '2027-03-01',
  effective_date: '2026-03-01',
  carriers: ['Hartford', 'Travelers'],
  insured_name: 'Acme Manufacturing LLC',
  schema_version: 1,
};

describe('extractWritebackProposal client/server source parity', () => {
  it('proposal builder body is identical between client and server', () => {
    const client = normalize(readFileSync(CLIENT, 'utf8'));
    const server = normalize(readFileSync(SERVER, 'utf8'));

    const clientBody = client.slice(client.indexOf('export interface ProposedQuoteFee')).trim();
    const serverBody = sliceBetween(
      server,
      'export interface ProposedQuoteFee',
      '/** commercial_* document types',
    );

    expect(clientBody.length).toBeGreaterThan(0);
    expect(serverBody).toBe(clientBody);
  });

  it('classifyLineCategory is identical between client and server', () => {
    const clientMatch = normalize(readFileSync(CLIENT_MATCH, 'utf8'));
    const server = normalize(readFileSync(SERVER, 'utf8'));

    const clientBlock = sliceBetween(
      clientMatch,
      '/** commercial_* document types',
      '/** Maps line category',
    );
    const serverBlock = sliceBetween(
      server,
      '/** commercial_* document types',
      '// ---------------------------------------------------------------------------\n// Server-only',
    );

    expect(clientBlock).toMatch(/export function classifyLineCategory/);
    expect(serverBlock).toBe(clientBlock);
  });

  it('server module imports readExtractSnapshot from the shared Deno normalizer', () => {
    const server = readFileSync(SERVER, 'utf8');
    expect(server).toMatch(
      /import \{ readExtractSnapshot, type ExtractSnapshotV1 \} from '\.\/extractSnapshot\.ts'/,
    );
    expect(server).not.toMatch(/apply_extract_writeback_proposal/);
    expect(server).not.toMatch(/status: 'rejected'/);
  });
});

describe('extractWritebackProposal client/server behavioral parity', () => {
  it('hashes the commercial fixture identically', async () => {
    const [client, server] = await Promise.all([
      clientHash(COMMERCIAL),
      serverHash(COMMERCIAL),
    ]);
    expect(server).toBe(client);
    expect(server).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes out-of-order keys to the same value on both sides', async () => {
    const normalized = readExtractSnapshot(OUT_OF_ORDER);
    const [ordered, unordered, server] = await Promise.all([
      clientHash(COMMERCIAL),
      clientHash(normalized),
      serverHash(normalized),
    ]);
    expect(unordered).toBe(ordered);
    expect(server).toBe(ordered);
  });

  it('builds identical proposed quote payloads', () => {
    const client = clientBuild(COMMERCIAL, 'acct-1', clientClassify(COMMERCIAL));
    const server = serverBuild(COMMERCIAL, 'acct-1', serverClassify(COMMERCIAL));
    expect(server).toEqual(client);
    expect(server).toHaveLength(2);
    expect(serverClassify(COMMERCIAL)).toBe('commercial');
  });
});

describe('ensureExtractWritebackProposals (server)', () => {
  function mockSupabase() {
    const calls: { table: string; rows: unknown[]; opts: unknown }[] = [];
    const supabase = {
      from: (table: string) => ({
        upsert: async (rows: unknown[], opts: unknown) => {
          calls.push({ table, rows, opts });
          return { data: null, error: null };
        },
      }),
    };
    return { supabase, calls };
  }

  it('treats a snapshot with no carriers, policy number, premium, or coverages as empty', () => {
    const empty = readExtractSnapshot({});
    expect(isSnapshotEmpty(empty)).toBe(true);
    expect(isSnapshotEmpty(COMMERCIAL)).toBe(false);
    expect(isSnapshotEmpty(readExtractSnapshot({ policy_number: 'P-1' }))).toBe(false);
  });

  it('writes zero rows for an empty snapshot', async () => {
    const { supabase, calls } = mockSupabase();
    const result = await ensureExtractWritebackProposals(supabase, {
      analysisId: 'analysis-1',
      accountId: 'acct-1',
      snapshot: {},
      createdBy: null,
    });
    expect(result).toEqual({ rowCount: 0, snapshotHash: null, skipped: 'empty' });
    expect(calls).toHaveLength(0);
  });

  it('upsert-ignores one pending row per carrier with the client hash', async () => {
    const { supabase, calls } = mockSupabase();
    const result = await ensureExtractWritebackProposals(supabase, {
      analysisId: 'analysis-1',
      accountId: 'acct-1',
      snapshot: OUT_OF_ORDER,
      createdBy: null,
    });

    const expectedHash = await clientHash(COMMERCIAL);
    expect(result.rowCount).toBe(2);
    expect(result.snapshotHash).toBe(expectedHash);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('extract_writeback_proposals');
    expect(calls[0].opts).toEqual({
      onConflict: 'document_analysis_id,account_id,snapshot_hash,carrier_name',
      ignoreDuplicates: true,
    });

    const rows = calls[0].rows as Record<string, unknown>[];
    expect(rows.map((r) => r.carrier_name)).toEqual(['Hartford', 'Travelers']);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
    expect(rows.every((r) => r.snapshot_hash === expectedHash)).toBe(true);
    expect(rows.every((r) => r.line_class === 'commercial')).toBe(true);
    expect(rows.every((r) => r.created_by === null)).toBe(true);
    expect(rows.every((r) => r.document_analysis_id === 'analysis-1')).toBe(true);
  });

  it('throws on upsert error so the caller can isolate the failure', async () => {
    const supabase = {
      from: () => ({
        upsert: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    };
    await expect(
      ensureExtractWritebackProposals(supabase, {
        analysisId: 'analysis-1',
        accountId: 'acct-1',
        snapshot: COMMERCIAL,
        createdBy: null,
      }),
    ).rejects.toThrow('boom');
  });
});
