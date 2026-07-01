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
