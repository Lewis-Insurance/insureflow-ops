import type { CoverageDiffLine, InboundMessage, ResolveAccountInput } from '../types.ts';

export const goldenRouterAllowlistedCoi: {
  input: InboundMessage;
  expectedAction: string;
} = {
  input: {
    from: 'contractor@aceconstruction.com',
    spf: 'pass',
    dkim: 'pass',
    dmarc: 'pass',
    attachments: [{ contentType: 'application/pdf', filename: 'coi-request.pdf' }],
  },
  expectedAction: 'coi.issue',
};

export const goldenRouterAuthFail: InboundMessage = {
  from: 'contractor@aceconstruction.com',
  spf: 'fail',
  dkim: 'pass',
  dmarc: 'pass',
};

export const goldenResolveEmailExact: ResolveAccountInput = {
  email: 'jane.doe@example.com',
  name: 'Jane Doe',
};

export const goldenCoverageDiffLines: CoverageDiffLine[] = [
  {
    coverage: 'General Liability - Each Occurrence',
    demanded: '$1,000,000',
    actual: '$1,000,000',
    status: 'meets',
  },
  {
    coverage: 'Additional Insured',
    demanded: 'Required',
    actual: 'Not on policy forms',
    status: 'not_backed',
  },
];

export const goldenSendCOIEmailPayload = {
  to: 'holder@gc.com',
  certificateNumber: 'COI-2026-001',
  certificateUrl: 'https://example.com/signed/coi.pdf',
  holderName: 'Ace Construction LLC',
} as const;

export const goldenTier3CoiInboundAllowlist = 'brian@lewisinsurance.ai';

export const goldenTier3CoiInboundAccountId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

export const goldenSendIdCardEmailPayload = {
  to: 'brian@lewisinsurance.ai',
  policyNumber: '867507454',
  idCardUrl: 'https://example.com/signed/id-card.pdf',
  insuredName: 'William Spence',
} as const;

export const goldenTier3IdCardInboundAllowlist = 'brian@lewisinsurance.ai';

export const goldenTier3IdCardInboundAccountId = 'e8a8fa65-6b12-4c63-94b2-974c24255f67';
