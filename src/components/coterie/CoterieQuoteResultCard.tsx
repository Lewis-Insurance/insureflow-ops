// ============================================================================
// COTERIE QUOTE RESULT CARD
// ============================================================================
// Renders a normalized Coterie quote result: premium / monthly / fees / carrier
// and a per-line breakdown, plus decline and error states. Includes the carrier
// state-notice disclosure banner and a "view source payload" disclosure.
// Phase 1 is MOCK: a banner makes clear no coverage is bound.
// ============================================================================

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import type { NormalizedQuoteResult } from '@/integrations/coterie/types';

interface CoterieQuoteResultCardProps {
  result: NormalizedQuoteResult;
  rawPayload?: unknown;
  mock?: boolean;
}

function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function StatusBadge({ status }: { status: NormalizedQuoteResult['status'] }) {
  switch (status) {
    case 'quoted':
      return (
        <Badge className="bg-green-600 hover:bg-green-600">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Quoted
        </Badge>
      );
    case 'declined':
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Declined
        </Badge>
      );
    case 'referral':
      return (
        <Badge variant="secondary">
          <Info className="w-3 h-3 mr-1" />
          Referral
        </Badge>
      );
    case 'error':
    default:
      return (
        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
  }
}

export function CoterieQuoteResultCard({
  result,
  rawPayload,
  mock = true,
}: CoterieQuoteResultCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {result.carrier}
              <StatusBadge status={result.status} />
              {result.isEstimate && result.status === 'quoted' && (
                <Badge variant="outline" className="text-xs">
                  Estimate
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {result.externalId ? `Reference ${result.externalId}` : 'Commercial quote result'}
            </CardDescription>
          </div>
          {mock && (
            <Badge variant="outline" className="text-xs shrink-0">
              MOCK
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {mock && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Mock quote — nothing is bound</AlertTitle>
            <AlertDescription>
              This result was generated from local fixtures. No carrier was contacted, no coverage
              is bound, and no client-facing action has been taken.
            </AlertDescription>
          </Alert>
        )}

        {/* Quoted summary */}
        {result.status === 'quoted' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryStat label="Annual premium" value={formatCurrency(result.premium)} emphasis />
            <SummaryStat label="Monthly" value={formatCurrency(result.monthlyPremium)} />
            <SummaryStat label="Yearly fees" value={formatCurrency(result.totalYearlyFees)} />
            <SummaryStat label="Total owed" value={formatCurrency(result.totalYearlyOwed)} />
          </div>
        )}

        {/* Declinations */}
        {result.status === 'declined' && result.declinations && result.declinations.length > 0 && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Coverage declined</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-2">
                {result.declinations.map((d, i) => (
                  <li key={`${d.policyType}-${i}`}>
                    <span className="font-medium">{d.policyType}:</span>
                    <ul className="list-disc ml-5 mt-1">
                      {d.reasons.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Errors */}
        {result.errors && result.errors.length > 0 && result.status !== 'declined' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Quote could not be completed</AlertTitle>
            <AlertDescription>
              <ul className="list-disc ml-5 mt-1">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Warnings */}
        {result.warnings && result.warnings.length > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc ml-5 mt-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Line breakdown */}
        {result.lineQuotes.length > 0 && (
          <div className="space-y-3">
            <Separator />
            <h4 className="text-sm font-medium">Line breakdown</h4>
            <div className="space-y-3">
              {result.lineQuotes.map((line) => (
                <div key={line.quoteId} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{line.policyType}</span>
                      {line.insuranceCarrier && (
                        <span className="text-xs text-muted-foreground">
                          · {line.insuranceCarrier}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(line.premium)}</span>
                  </div>

                  {line.lineItems.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {line.lineItems.map((li, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between text-xs text-muted-foreground"
                        >
                          <span>{li.description}</span>
                          <span>{formatCurrency(li.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {line.fees.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t pt-2">
                      {line.fees.map((f, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between text-xs text-muted-foreground"
                        >
                          <span>{f.description}{f.frequency ? ` (${f.frequency})` : ''}</span>
                          <span>{formatCurrency(f.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {line.expirationDate && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Expires {line.expirationDate}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proposal URL (dashboard link only — not sent to anyone in Phase 1) */}
        {result.proposalUrl && (
          <p className="text-xs text-muted-foreground break-all">
            Proposal (internal dashboard link, not sent): {result.proposalUrl}
          </p>
        )}

        {/* State notice / disclosures */}
        {result.disclosures.length > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Disclosures</AlertTitle>
            <AlertDescription>
              <ul className="space-y-1 mt-1">
                {result.disclosures.map((d, i) => (
                  <li key={i} className="text-xs">
                    {d}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Source payload disclosure */}
        <Accordion type="single" collapsible>
          <AccordionItem value="payload">
            <AccordionTrigger className="text-sm">View source payload</AccordionTrigger>
            <AccordionContent>
              <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-80">
                {JSON.stringify(rawPayload ?? result, null, 2)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={emphasis ? 'text-lg font-semibold' : 'text-sm font-medium'}>{value}</p>
    </div>
  );
}

export default CoterieQuoteResultCard;
