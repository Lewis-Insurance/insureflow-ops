import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, ArrowUp, Minus, Plus } from 'lucide-react';
import type { ComparisonDifference, ChangeType } from '@/types/coverage-comparison';
import type { QuoteIncumbentDiffResult } from '@/lib/quoteIncumbent/diffQuoteIncumbent';

interface QuoteIncumbentComparisonTableProps {
  diffResult: QuoteIncumbentDiffResult;
}

const CHANGE_LABELS: Record<ChangeType, string> = {
  unchanged: 'Unchanged',
  increased: 'Increased',
  decreased: 'Decreased',
  added: 'Added',
  removed: 'Removed',
  modified: 'Changed',
};

function ChangeBadge({ changeType }: { changeType: ChangeType }) {
  const icon =
    changeType === 'increased' ? (
      <ArrowUp className="h-3 w-3" />
    ) : changeType === 'decreased' ? (
      <ArrowDown className="h-3 w-3" />
    ) : changeType === 'added' ? (
      <Plus className="h-3 w-3" />
    ) : (
      <Minus className="h-3 w-3" />
    );

  return (
    <Badge variant="secondary" className="gap-1">
      {icon}
      {CHANGE_LABELS[changeType]}
    </Badge>
  );
}

/**
 * Side-by-side incumbent vs quote delta table (structured snapshots, no OCR).
 */
export function QuoteIncumbentComparisonTable({ diffResult }: QuoteIncumbentComparisonTableProps) {
  const { materialDifferences, incumbentSnapshot, quoteSnapshot } = diffResult;

  if (materialDifferences.length === 0) {
    return (
      <p className="text-sm text-cc-text-muted py-4 text-center">
        No material differences between the incumbent policy and this quote.
      </p>
    );
  }

  return (
    <Card className="border-cc-border bg-cc-surface">
      <CardHeader className="pb-3">
        <CardTitle className="text-cc-text-primary">Quote vs incumbent</CardTitle>
        <CardDescription>
          {incumbentSnapshot.carrier ?? 'Incumbent policy'} compared to{' '}
          {quoteSnapshot.carrier ?? 'new quote'} on structured coverage rows. Facts only; no recommendation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Field</TableHead>
                <TableHead className="min-w-[140px]">Incumbent</TableHead>
                <TableHead className="min-w-[140px]">Quote</TableHead>
                <TableHead className="min-w-[120px]">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materialDifferences.map((diff) => (
                <DifferenceRow key={diff.fieldPath} diff={diff} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DifferenceRow({ diff }: { diff: ComparisonDifference }) {
  return (
    <TableRow>
      <TableCell className="font-medium text-cc-text-primary">{diff.label}</TableCell>
      <TableCell className="cc-num text-cc-text-secondary">{diff.leftValueDisplay}</TableCell>
      <TableCell className="cc-num text-cc-text-secondary">{diff.rightValueDisplay}</TableCell>
      <TableCell>
        <ChangeBadge changeType={diff.changeType} />
      </TableCell>
    </TableRow>
  );
}
