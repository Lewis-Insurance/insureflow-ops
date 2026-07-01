// ============================================================================
// COTERIE QUOTES PAGE (/coterie-quotes) — internal staff only, MOCK
// ============================================================================
// Three tabs: create a mock quote for an account, browse persisted quotes
// (with drill-in), and review pending approval gates. No client-facing action.
// ============================================================================

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, Loader2, FileText, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  useCoterieApprovalGates,
  useCoterieQuotes,
} from '@/hooks/useCoterieQuote';
import { CoterieQuoteForm } from '@/components/coterie/CoterieQuoteForm';
import { CoterieQuoteResultCard } from '@/components/coterie/CoterieQuoteResultCard';
import { CoterieApprovalPanel } from '@/components/coterie/CoterieApprovalPanel';
import type {
  CarrierApprovalGateRow,
  CoterieQuoteRow,
  NormalizedQuoteResult,
} from '@/integrations/coterie/types';

interface AccountOption {
  id: string;
  name: string;
}

function useAccountOptions() {
  return useQuery<AccountOption[]>({
    queryKey: ['coterie', 'account-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AccountOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function rowToNormalizedResult(row: CoterieQuoteRow): NormalizedQuoteResult {
  const raw = (row.raw_response ?? {}) as Record<string, any>;
  const disclosures: string[] = [];
  if (raw?.quote?.stateNoticeText) disclosures.push(raw.quote.stateNoticeText);

  const declinations = (raw?.underwritingInformation?.declinations ?? [])
    .filter((d: any) => Array.isArray(d?.declination) && d.declination.length > 0)
    .map((d: any) => ({ policyType: d.policyType, reasons: d.declination }));
  const errors = Array.isArray(raw?.errors) ? raw.errors : [];

  return {
    status: row.decision,
    carrier: row.carrier,
    externalId: row.external_id ?? undefined,
    premium: row.premium ?? undefined,
    monthlyPremium: row.monthly_premium ?? undefined,
    totalYearlyFees: raw?.quote?.totalYearlyFees,
    totalYearlyOwed: raw?.quote?.totalYearlyOwed,
    isEstimate: raw?.quote?.isEstimate,
    lineQuotes: row.line_quotes ?? [],
    proposalUrl: row.proposal_url ?? undefined,
    disclosures,
    declinations: declinations.length ? declinations : undefined,
    errors: errors.length ? errors : undefined,
    warnings: Array.isArray(raw?.warnings) ? raw.warnings : undefined,
    underwritingId: raw?.underwritingInformation?.underwritingId,
  };
}

function DecisionBadge({ decision }: { decision: CoterieQuoteRow['decision'] }) {
  const variant =
    decision === 'quoted'
      ? 'default'
      : decision === 'declined'
        ? 'destructive'
        : 'outline';
  return (
    <Badge variant={variant} className="capitalize">
      {decision}
    </Badge>
  );
}

export default function CoterieQuotesPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  const accounts = useAccountOptions();
  const quotes = useCoterieQuotes();
  const allGates = useCoterieApprovalGates();
  const pendingGates = useCoterieApprovalGates({ status: 'pending' });

  const selectedAccountName = useMemo(
    () => accounts.data?.find((a) => a.id === selectedAccountId)?.name,
    [accounts.data, selectedAccountId],
  );

  const selectedQuote = useMemo(
    () => quotes.data?.find((q) => q.id === selectedQuoteId) ?? null,
    [quotes.data, selectedQuoteId],
  );

  const selectedQuoteGate = useMemo<CarrierApprovalGateRow | null>(() => {
    if (!selectedQuoteId) return null;
    return allGates.data?.find((g) => g.entity_id === selectedQuoteId) ?? null;
  }, [allGates.data, selectedQuoteId]);

  return (
    <AppLayout>
      <div className="container max-w-5xl py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Coterie Commercial Quotes</h1>
          <p className="text-muted-foreground">
            Internal mock quoting for commercial lines (BOP, GL, PL).
          </p>
        </div>

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Phase 1 — mock mode</AlertTitle>
          <AlertDescription>
            Quotes are generated from local fixtures. No live carrier calls, binding, client
            messaging, or payments happen here. Every quote opens a human approval gate.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="new">
          <TabsList>
            <TabsTrigger value="new">New quote</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
            <TabsTrigger value="approvals">
              Approvals
              {pendingGates.data && pendingGates.data.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingGates.data.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* New quote */}
          <TabsContent value="new" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Choose an account</CardTitle>
                <CardDescription>Quotes are created against an existing account.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-sm space-y-1.5">
                  <Label>Account</Label>
                  <Select
                    value={selectedAccountId}
                    onValueChange={(v) => setSelectedAccountId(v)}
                    disabled={accounts.isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={accounts.isLoading ? 'Loading accounts…' : 'Select an account'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(accounts.data ?? []).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {selectedAccountId ? (
              <CoterieQuoteForm
                accountId={selectedAccountId}
                defaultBusinessName={selectedAccountName ?? ''}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select an account above to start a quote.
              </p>
            )}
          </TabsContent>

          {/* Quotes list / drill-in */}
          <TabsContent value="quotes" className="pt-4">
            {selectedQuote ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedQuoteId(null)}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to all quotes
                </Button>
                <CoterieQuoteResultCard
                  result={rowToNormalizedResult(selectedQuote)}
                  rawPayload={selectedQuote.raw_response}
                />
                {selectedQuoteGate ? (
                  <CoterieApprovalPanel gate={selectedQuoteGate} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No approval gate found for this quote.
                  </p>
                )}
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent quotes</CardTitle>
                  <CardDescription>Select a row to view details and approval.</CardDescription>
                </CardHeader>
                <CardContent>
                  {quotes.isLoading ? (
                    <div className="py-8 flex justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (quotes.data ?? []).length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No quotes yet.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference</TableHead>
                          <TableHead>Decision</TableHead>
                          <TableHead className="text-right">Premium</TableHead>
                          <TableHead className="text-right">Monthly</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(quotes.data ?? []).map((q) => (
                          <TableRow
                            key={q.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedQuoteId(q.id)}
                          >
                            <TableCell className="font-mono text-xs">
                              {q.external_id ?? q.id.slice(0, 8)}
                            </TableCell>
                            <TableCell>
                              <DecisionBadge decision={q.decision} />
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(q.premium)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(q.monthly_premium)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Approvals */}
          <TabsContent value="approvals" className="space-y-4 pt-4">
            {pendingGates.isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (pendingGates.data ?? []).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pending approvals.</p>
                </CardContent>
              </Card>
            ) : (
              (pendingGates.data ?? []).map((gate) => (
                <CoterieApprovalPanel key={gate.id} gate={gate} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
