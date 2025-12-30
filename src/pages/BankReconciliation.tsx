import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload,
  FileSpreadsheet,
  Link2,
  Link2Off,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  ArrowRight,
  Ban,
} from 'lucide-react';
import { useBankStatements, useStatementLines, useMatchDeposit, useUnmatchDeposit, useExcludeLine } from '@/hooks/useBankStatements';
import { useEscrowDeposits } from '@/hooks/useEscrowDeposits';
import { useBankAccounts } from '@/hooks/useBankAccounts';
import { BankStatementUploader } from '@/components/payments/BankStatementUploader';
import type { BankStatement, BankStatementLine, EscrowDeposit } from '@/types/payments';

const statusColors = {
  pending: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
};

const lineStatusColors = {
  unmatched: 'bg-amber-100 text-amber-800',
  matched: 'bg-green-100 text-green-800',
  excluded: 'bg-gray-100 text-gray-800',
};

export default function BankReconciliation() {
  const navigate = useNavigate();
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedLine, setSelectedLine] = useState<BankStatementLine | null>(null);
  const [showMatchDialog, setShowMatchDialog] = useState(false);

  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: statements = [], isLoading: isLoadingStatements } = useBankStatements({
    bankAccountId: selectedBankAccount || undefined,
  });
  const { data: statementLines = [] } = useStatementLines(selectedStatement?.id);
  const { data: deposits = [] } = useEscrowDeposits({
    status: 'pending',
  });

  const matchDeposit = useMatchDeposit();
  const unmatchDeposit = useUnmatchDeposit();
  const excludeLine = useExcludeLine();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleMatch = async (lineId: string, depositId: string) => {
    try {
      await matchDeposit.mutateAsync({ lineId, depositId });
      setShowMatchDialog(false);
      setSelectedLine(null);
    } catch (error) {
      console.error('Failed to match:', error);
    }
  };

  const handleUnmatch = async (lineId: string) => {
    try {
      await unmatchDeposit.mutateAsync({ lineId });
    } catch (error) {
      console.error('Failed to unmatch:', error);
    }
  };

  const handleExclude = async (lineId: string, reason: string) => {
    try {
      await excludeLine.mutateAsync({ lineId, reason });
    } catch (error) {
      console.error('Failed to exclude:', error);
    }
  };

  // Calculate reconciliation stats
  const unmatchedLines = statementLines.filter((l) => l.status === 'unmatched');
  const matchedLines = statementLines.filter((l) => l.status === 'matched');
  const excludedLines = statementLines.filter((l) => l.status === 'excluded');

  // Find potential matches for a line
  const findPotentialMatches = (line: BankStatementLine) => {
    if (line.amount <= 0) return []; // Only match deposits
    return deposits.filter((d) => {
      const amountMatch = Math.abs(d.total_amount - line.amount) < 0.01;
      const dateClose =
        Math.abs(new Date(d.deposit_date).getTime() - new Date(line.line_date).getTime()) <
        7 * 24 * 60 * 60 * 1000; // Within 7 days
      return amountMatch || dateClose;
    });
  };

  return (
    <AppLayout>
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Bank Reconciliation</h1>
          <p className="text-muted-foreground">
            Match deposits to bank statement lines
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Import Statement
        </Button>
      </div>

      {/* Bank Account Selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Select Bank Account</CardTitle>
            <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="All bank accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Accounts</SelectItem>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name} - {account.bank_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Statements List */}
      {!selectedStatement ? (
        <Card>
          <CardHeader>
            <CardTitle>Bank Statements</CardTitle>
            <CardDescription>Select a statement to begin reconciliation</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStatements ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : statements.length === 0 ? (
              <div className="text-center py-12">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No statements imported</p>
                <p className="text-muted-foreground mb-4">
                  Import a bank statement CSV to begin reconciliation.
                </p>
                <Button onClick={() => setShowUploadDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Statement
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statement Date</TableHead>
                    <TableHead>Bank Account</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Beginning</TableHead>
                    <TableHead className="text-right">Ending</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.map((statement) => (
                    <TableRow
                      key={statement.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedStatement(statement)}
                    >
                      <TableCell className="font-medium">
                        {format(new Date(statement.statement_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>{statement.bank_account?.account_name}</TableCell>
                      <TableCell>
                        {format(new Date(statement.period_start), 'MMM d')} -{' '}
                        {format(new Date(statement.period_end), 'MMM d')}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(statement.beginning_balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(statement.ending_balance)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[statement.reconciliation_status]}>
                          {statement.reconciliation_status === 'pending' && (
                            <Clock className="h-3 w-3 mr-1" />
                          )}
                          {statement.reconciliation_status === 'completed' && (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          {statement.reconciliation_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Reconciliation Workspace */
        <>
          {/* Statement Header */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" onClick={() => setSelectedStatement(null)}>
                    ← Back
                  </Button>
                  <div>
                    <h2 className="text-xl font-bold">
                      {format(new Date(selectedStatement.statement_date), 'MMMM d, yyyy')}
                    </h2>
                    <p className="text-muted-foreground">
                      {selectedStatement.bank_account?.account_name} -{' '}
                      {selectedStatement.bank_account?.bank_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Beginning</p>
                    <p className="font-medium">
                      {formatCurrency(selectedStatement.beginning_balance)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Ending</p>
                    <p className="font-medium">
                      {formatCurrency(selectedStatement.ending_balance)}
                    </p>
                  </div>
                  <Badge className={statusColors[selectedStatement.reconciliation_status]}>
                    {selectedStatement.reconciliation_status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Unmatched</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{unmatchedLines.length}</div>
                <p className="text-xs text-muted-foreground">lines need matching</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Matched</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{matchedLines.length}</div>
                <p className="text-xs text-muted-foreground">lines matched</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Excluded</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-600">{excludedLines.length}</div>
                <p className="text-xs text-muted-foreground">lines excluded</p>
              </CardContent>
            </Card>
          </div>

          {/* Statement Lines */}
          <Card>
            <CardHeader>
              <CardTitle>Statement Lines</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="unmatched">
                <TabsList>
                  <TabsTrigger value="unmatched">
                    Unmatched ({unmatchedLines.length})
                  </TabsTrigger>
                  <TabsTrigger value="matched">Matched ({matchedLines.length})</TabsTrigger>
                  <TabsTrigger value="excluded">Excluded ({excludedLines.length})</TabsTrigger>
                  <TabsTrigger value="all">All ({statementLines.length})</TabsTrigger>
                </TabsList>

                {['unmatched', 'matched', 'excluded', 'all'].map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(tab === 'all'
                          ? statementLines
                          : statementLines.filter((l) => l.status === tab)
                        ).map((line) => {
                          const potentialMatches = findPotentialMatches(line);
                          return (
                            <TableRow key={line.id}>
                              <TableCell>
                                {format(new Date(line.line_date), 'MMM d')}
                              </TableCell>
                              <TableCell className="max-w-[300px] truncate">
                                {line.description}
                              </TableCell>
                              <TableCell className="capitalize">{line.line_type}</TableCell>
                              <TableCell
                                className={`text-right font-medium ${
                                  line.amount >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {formatCurrency(line.amount)}
                              </TableCell>
                              <TableCell>
                                <Badge className={lineStatusColors[line.status]}>
                                  {line.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  {line.status === 'unmatched' && line.amount > 0 && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedLine(line);
                                          setShowMatchDialog(true);
                                        }}
                                      >
                                        <Link2 className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleExclude(line.id, 'Non-premium deposit')}
                                      >
                                        <Ban className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  {line.status === 'matched' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleUnmatch(line.id)}
                                    >
                                      <Link2Off className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Bank Statement</DialogTitle>
            <DialogDescription>
              Upload a CSV file from your bank to begin reconciliation.
            </DialogDescription>
          </DialogHeader>
          <BankStatementUploader
            onSuccess={() => setShowUploadDialog(false)}
            onCancel={() => setShowUploadDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Match Dialog */}
      <Dialog open={showMatchDialog} onOpenChange={setShowMatchDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Match to Deposit</DialogTitle>
            <DialogDescription>
              Select a deposit to match with this statement line.
            </DialogDescription>
          </DialogHeader>
          {selectedLine && (
            <div className="space-y-4">
              <Card className="bg-muted">
                <CardContent className="py-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Statement Line</p>
                      <p className="font-medium">{selectedLine.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(selectedLine.line_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(selectedLine.amount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <p className="font-medium">Available Deposits</p>
                {deposits.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center">
                    No unmatched deposits available
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {deposits.map((deposit) => {
                      const isExactMatch =
                        Math.abs(deposit.total_amount - selectedLine.amount) < 0.01;
                      return (
                        <Card
                          key={deposit.id}
                          className={`cursor-pointer hover:border-primary transition-colors ${
                            isExactMatch ? 'border-green-300 bg-green-50' : ''
                          }`}
                          onClick={() => handleMatch(selectedLine.id, deposit.id)}
                        >
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {format(new Date(deposit.deposit_date), 'MMM d, yyyy')}
                                  </p>
                                  {isExactMatch && (
                                    <Badge className="bg-green-100 text-green-800">
                                      Exact Match
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Cash: {formatCurrency(deposit.cash_amount || 0)} | Checks:{' '}
                                  {formatCurrency(deposit.check_amount || 0)}
                                </p>
                              </div>
                              <p className="text-xl font-bold">
                                {formatCurrency(deposit.total_amount)}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}
