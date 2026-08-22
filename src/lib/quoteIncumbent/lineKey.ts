import type { LineOfBusiness } from '@/types/coverage-comparison';

export type CoverageLineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property';

const LOB_TO_LINE: Record<string, CoverageLineKey> = {
  gl: 'gl',
  bop: 'gl',
  auto: 'auto',
  commercial_auto: 'auto',
  workers_comp: 'wc',
  property: 'property',
  umbrella: 'umbrella',
  home: 'property',
};

export function lineKeyFromLineOfBusiness(lineOfBusiness: string | null | undefined): CoverageLineKey {
  const key = (lineOfBusiness ?? '').toLowerCase();
  return LOB_TO_LINE[key] ?? 'gl';
}

export function lobMatchesPolicyAndQuote(
  policyLineOfBusiness: string | null | undefined,
  quoteLineOfBusiness: string | null | undefined,
): boolean {
  const policyKey = lineKeyFromLineOfBusiness(policyLineOfBusiness);
  const quoteKey = lineKeyFromLineOfBusiness(quoteLineOfBusiness);
  return policyKey === quoteKey;
}

export function mapLineKeyToComparisonLob(lineKey: CoverageLineKey): LineOfBusiness {
  switch (lineKey) {
    case 'gl':
      return 'GL';
    case 'auto':
      return 'AUTO';
    case 'wc':
      return 'WC';
    case 'property':
      return 'PROP';
    case 'umbrella':
      return 'UMBRELLA';
    default:
      return 'UNKNOWN';
  }
}
