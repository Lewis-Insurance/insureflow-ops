import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  GitMerge,
  Loader2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CustomerMergeSelector } from '@/components/customers/CustomerMergeSelector';
import { MergePreview } from '@/components/customers/MergePreview';
import {
  CustomerMergePreview,
  CustomerMergeResult,
  ScalarConflict,
  TransferPreviewRow,
  useCustomerMergePreview,
  useExecuteCustomerMerge,
} from '@/hooks/useCustomerMerge';
import { AppLayout } from '@/components/layout/AppLayout';

function formatCountLabel(count: number, singular = 'row') {
  return `${count.toLocaleString()} ${singular}${count === 1 ? '' : 's'}`;
}

function formatStrategy(strategy: string) {
  const labels: Record<string, string> = {
    reassign_fk: 'Transfer to survivor',
    dedupe_then_reassign: 'Dedupe, then transfer',
    append_history_only: 'Audit/history update only',
    manual_review: 'Manual review required',
    preserve_via_customer_account_reassignment: 'Preserved through account reassignment',
  };

  return labels[strategy] ?? strategy.replaceAll('_', ' ');
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Blank';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function totalFromCounts(counts: Record<string, number> | undefined) {
  return Object.values(counts ?? {}).reduce((sum, count) => sum + count, 0);
}

function groupTransferRows(rows: TransferPreviewRow[]) {
  return rows.reduce<Record<string, TransferPreviewRow[]>>((groups, row) => {
    const key = row.table;
    groups[key] = groups[key] ?? [];
    groups[key].push(row);
    return groups;
  }, {});
}

function SelectedRoleSummary({ preview }: { preview: CustomerMergePreview }) {
  if (!preview.master || !preview.duplicate) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Survives
          </CardTitle>
          <CardDescription>This account remains active and receives transferred rows.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p className="font-medium">{preview.master.name}</p>
          {preview.master.email && <p className="text-muted-foreground">{preview.master.email}</p>}
          {preview.master.phone && <p className="text-muted-foreground">{preview.master.phone}</p>}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/70 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-amber-600" />
            Will be merged and archived
          </CardTitle>
          <CardDescription>This duplicate is soft-deleted after the transaction succeeds.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p className="font-medium">{preview.duplicate.name}</p>
          {preview.duplicate.email && <p className="text-muted-foreground">{preview.duplicate.email}</p>}
          {preview.duplicate.phone && <p className="text-muted-foreground">{preview.duplicate.phone}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function BlockerWarningPanel({ preview }: { preview: CustomerMergePreview }) {
  return (
    <div className="space-y-3">
      {preview.blockers.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Merge blocked</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1">
              {preview.blockers.map((blocker, index) => (
                <li key={`${blocker}-${index}`}>{blocker}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {preview.warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1">
              {preview.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function TransferInventory({ rows }: { rows: TransferPreviewRow[] }) {
  const groupedRows = groupTransferRows(rows);
  const totalRows = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Transfer inventory</h3>
        <Badge variant="secondary">{formatCountLabel(totalRows)}</Badge>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Area</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Blockers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(groupedRows).flatMap(([table, tableRows]) =>
              tableRows.map((row, index) => (
                <TableRow key={`${row.table}-${row.foreignKeyColumn}`}>
                  <TableCell className="font-medium">{index === 0 ? table : ''}</TableCell>
                  <TableCell className="font-mono text-xs">{row.foreignKeyColumn}</TableCell>
                  <TableCell className="text-right">{row.count.toLocaleString()}</TableCell>
                  <TableCell>{formatStrategy(row.strategy)}</TableCell>
                  <TableCell>
                    {row.blockers.length > 0 ? (
                      <div className="space-y-1">
                        {row.blockers.map((blocker, blockerIndex) => (
                          <Badge key={`${blocker}-${blockerIndex}`} variant="destructive" className="mr-1 whitespace-normal">
                            {blocker}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ScalarConflicts({ conflicts }: { conflicts: ScalarConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>No scalar field conflicts were found in the preview.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Field conflicts and Phase 1 resolution</h3>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Survivor value</TableHead>
              <TableHead>Duplicate value</TableHead>
              <TableHead>Resolution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conflicts.map((conflict) => (
              <TableRow key={conflict.field}>
                <TableCell className="font-medium">{conflict.field}</TableCell>
                <TableCell>{formatValue(conflict.masterValue)}</TableCell>
                <TableCell>{formatValue(conflict.duplicateValue)}</TableCell>
                <TableCell>
                  {conflict.phase1Resolution === 'fill_master_if_blank'
                    ? 'Blank survivor field will be filled'
                    : 'Survivor value will be kept'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function MergeSuccessReport({ result }: { result: CustomerMergeResult }) {
  const transferredTotal = totalFromCounts(result.transferredCounts);
  const dedupedTotal = totalFromCounts(result.dedupedCounts);
  const mergedAt = result.completedAt ? new Date(result.completedAt).toLocaleString() : 'Unknown';

  return (
    <Card className="mb-6 border-green-200 bg-green-50/50 dark:bg-green-950/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          Merge complete
        </CardTitle>
        <CardDescription>
          Transactional merge finished at {mergedAt}. The duplicate account was archived.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg bg-background/80 border p-3">
            <p className="text-xs text-muted-foreground">Merge ID</p>
            <p className="font-mono text-sm break-all">{result.mergeId}</p>
          </div>
          <div className="rounded-lg bg-background/80 border p-3">
            <p className="text-xs text-muted-foreground">Transferred</p>
            <p className="text-2xl font-semibold">{transferredTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-background/80 border p-3">
            <p className="text-xs text-muted-foreground">Deduped/skipped duplicates</p>
            <p className="text-2xl font-semibold">{dedupedTotal.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.open(`/customers/${result.masterCustomerId}`, '_self')}>
            Open survivor account
          </Button>
          <Button variant="outline" onClick={() => window.open(`/customers/${result.duplicateCustomerId}`, '_self')}>
            Open archived duplicate
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">Transferred counts</h4>
            <ul className="text-sm space-y-1">
              {Object.entries(result.transferredCounts).map(([key, count]) => (
                <li key={key} className="flex justify-between border-b pb-1">
                  <span className="font-mono text-xs">{key}</span>
                  <span>{count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Deduped counts</h4>
            {Object.keys(result.dedupedCounts).length > 0 ? (
              <ul className="text-sm space-y-1">
                {Object.entries(result.dedupedCounts).map(([key, count]) => (
                  <li key={key} className="flex justify-between border-b pb-1">
                    <span className="font-mono text-xs">{key}</span>
                    <span>{count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No duplicate child rows were deduped.</p>
            )}
          </div>
        </div>

        {result.scalarFieldChanges && result.scalarFieldChanges.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Scalar field changes</h4>
            <ul className="text-sm list-disc pl-5 space-y-1">
              {result.scalarFieldChanges.map((change, index) => (
                <li key={`${change.field}-${index}`}>
                  {change.field}: {change.resolution}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.warnings.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warnings returned with merge report</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 space-y-1">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default function MergeCustomersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMasterId = searchParams.get('masterId') ?? searchParams.get('masterCustomerId');
  const initialDuplicateId = searchParams.get('duplicateId') ?? searchParams.get('duplicateCustomerId');

  const [selectedId1, setSelectedId1] = useState<string | null>(initialMasterId);
  const [selectedId2, setSelectedId2] = useState<string | null>(initialDuplicateId);
  const [masterId, setMasterId] = useState<string | null>(initialMasterId);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [successResult, setSuccessResult] = useState<CustomerMergeResult | null>(null);

  const bothSelected = Boolean(selectedId1 && selectedId2 && selectedId1 !== selectedId2);
  const duplicateId = useMemo(() => {
    if (!masterId || !bothSelected) return null;
    if (masterId === selectedId1) return selectedId2;
    if (masterId === selectedId2) return selectedId1;
    return null;
  }, [bothSelected, masterId, selectedId1, selectedId2]);

  const previewQuery = useCustomerMergePreview(masterId, duplicateId, !successResult);
  const executeMerge = useExecuteCustomerMerge();
  const preview = previewQuery.data;
  const hasBlockers = Boolean(
    preview?.blockers.length || preview?.transferableTables.some((row) => row.blockers.length > 0)
  );
  const confirmationMatches = Boolean(preview?.confirmationPhrase && confirmationInput === preview.confirmationPhrase);
  const canExecute = Boolean(preview && !hasBlockers && acknowledged && confirmationMatches && !successResult);

  useEffect(() => {
    if (!initialMasterId && !initialDuplicateId) return;

    setSelectedId1(initialMasterId);
    setSelectedId2(initialDuplicateId);
    setMasterId(initialMasterId);
    setSuccessResult(null);
  }, [initialMasterId, initialDuplicateId]);

  useEffect(() => {
    if (masterId && masterId !== selectedId1 && masterId !== selectedId2) {
      setMasterId(null);
    }
  }, [masterId, selectedId1, selectedId2]);

  useEffect(() => {
    setConfirmationInput('');
    setAcknowledged(false);
    setSuccessResult(null);
  }, [masterId, duplicateId]);

  const handleReset = () => {
    setSelectedId1(null);
    setSelectedId2(null);
    setMasterId(null);
    setConfirmationInput('');
    setAcknowledged(false);
    setSuccessResult(null);
  };

  const handleExecute = async () => {
    if (!masterId || !duplicateId || !preview || !canExecute) return;

    try {
      const result = await executeMerge.mutateAsync({
        masterCustomerId: masterId,
        duplicateCustomerId: duplicateId,
        confirmationPhrase: confirmationInput,
        options: {
          fillBlankMasterFields: true,
          appendDuplicateNotes: true,
          source: 'merge_page',
        },
      });

      setSuccessResult(result);
    } catch {
      // The mutation onError handler shows the destructive toast.
    }
  };

  return (
    <AppLayout>
      <div className="container max-w-6xl py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitMerge className="h-6 w-6" />
              Merge Customers
            </h1>
            <p className="text-muted-foreground">
              Preview a transactional merge, confirm with the exact phrase, then archive the duplicate.
            </p>
          </div>
        </div>

        {successResult && <MergeSuccessReport result={successResult} />}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Step 1: Select customers</CardTitle>
            <CardDescription>
              Search and select two customer records. Query parameters can preselect this page for duplicate-review handoff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerMergeSelector
              selectedId1={selectedId1}
              selectedId2={selectedId2}
              onSelect1={setSelectedId1}
              onSelect2={setSelectedId2}
            />
          </CardContent>
        </Card>

        {bothSelected && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Step 2: Choose survivor</CardTitle>
              <CardDescription>
                Click the account card that should survive. The other account will be merged and archived.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MergePreview
                accountId1={selectedId1}
                accountId2={selectedId2}
                masterId={masterId}
                onSelectMaster={setMasterId}
              />
            </CardContent>
          </Card>
        )}

        {masterId && duplicateId && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Step 3: Server preview</CardTitle>
              <CardDescription>
                This read-only RPC preview is the source of truth for blockers, warnings, conflicts, transfer counts, and the confirmation phrase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {previewQuery.isLoading && <PreviewSkeleton />}

              {previewQuery.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Unable to preview merge</AlertTitle>
                  <AlertDescription>{previewQuery.error.message}</AlertDescription>
                </Alert>
              )}

              {preview && (
                <>
                  <SelectedRoleSummary preview={preview} />
                  <BlockerWarningPanel preview={preview} />
                  <TransferInventory rows={preview.transferableTables} />
                  <ScalarConflicts conflicts={preview.scalarConflicts} />

                  <Alert>
                    <Trash2 className="h-4 w-4" />
                    <AlertTitle>Soft-delete notice</AlertTitle>
                    <AlertDescription>
                      If executed, the duplicate account is archived with merge metadata. No browser-side row updates are performed.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {preview && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Step 4: Typed confirmation and execute</CardTitle>
              <CardDescription>
                Type the exact phrase returned by the preview RPC. Execution is disabled while blockers exist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground mb-1">Required confirmation phrase</p>
                <code className="font-mono text-sm break-all">{preview.confirmationPhrase}</code>
              </div>

              <div className="space-y-2">
                <Label htmlFor="merge-confirmation">Type confirmation phrase</Label>
                <Input
                  id="merge-confirmation"
                  value={confirmationInput}
                  onChange={(event) => setConfirmationInput(event.target.value)}
                  placeholder={preview.confirmationPhrase}
                  disabled={hasBlockers || executeMerge.isPending || Boolean(successResult)}
                />
                {!confirmationMatches && confirmationInput.length > 0 && (
                  <p className="text-sm text-destructive">Confirmation phrase does not match exactly.</p>
                )}
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <Checkbox
                  id="merge-acknowledge"
                  checked={acknowledged}
                  disabled={hasBlockers || executeMerge.isPending || Boolean(successResult)}
                  onCheckedChange={(checked) => setAcknowledged(checked === true)}
                />
                <Label htmlFor="merge-acknowledge" className="text-sm leading-relaxed">
                  I understand this will archive the duplicate record and transfer linked records to the survivor in one database transaction.
                </Label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={handleReset} disabled={executeMerge.isPending}>
                  Reset
                </Button>
                <Button
                  onClick={handleExecute}
                  disabled={!canExecute || executeMerge.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {executeMerge.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Merging...
                    </>
                  ) : (
                    <>
                      <GitMerge className="mr-2 h-4 w-4" />
                      Execute transactional merge
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
