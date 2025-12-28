/**
 * CEO Digest History Page
 *
 * View history of CEO digest runs and their details.
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Mail,
  AlertTriangle,
  CheckCircle,
  XCircle,
  SkipForward,
  Loader2,
  RefreshCw,
  Settings,
  Eye,
  FileJson,
  FileText,
  Cpu,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useCEODigestRuns,
  useCEODigestRunDetail,
  getStatusColor,
  getSeverityColor,
  type CEODigestRun,
} from '@/hooks/useCEODigest';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { Navigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';

export default function CEODigestHistory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRunId = searchParams.get('run');

  const { profile, isAdmin, loading: authLoading } = useAuth();
  const { agency, isLoading: workspaceLoading } = useActiveAgency();

  const agencyId = agency?.id || null;

  const { runs, isLoading, refetch, isTriggering } = useCEODigestRuns(agencyId, 50);
  const { data: selectedRun, isLoading: runLoading } = useCEODigestRunDetail(selectedRunId);

  // Loading state
  if (authLoading || workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect non-admin users
  if (!isAdmin && profile?.role !== 'admin' && profile?.role !== 'owner') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleViewRun = (runId: string) => {
    setSearchParams({ run: runId });
  };

  const handleCloseDetail = () => {
    setSearchParams({});
  };

  const getStatusIcon = (status: CEODigestRun['status']) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-yellow-600" />;
      default:
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Digest History</h1>
              <p className="text-muted-foreground">
                View past CEO weekly digest runs
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => navigate('/admin/digest-settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Runs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Digest Runs
            </CardTitle>
            <CardDescription>
              {runs.length} digest runs found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No digest runs yet</p>
                <p className="text-sm">
                  Configure settings and run a test to get started
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Alerts</TableHead>
                    <TableHead>AI Provider</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map(run => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="font-medium">
                          {run.week_label || 'Unknown Period'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(run.period_start), 'MMM d')} -{' '}
                          {format(new Date(run.period_end), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(run.status)}
                          <Badge className={getStatusColor(run.status)}>
                            {run.status}
                          </Badge>
                        </div>
                        {run.error && (
                          <div className="text-xs text-red-600 mt-1 max-w-48 truncate">
                            {run.error}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {run.emails_sent}/{run.recipients?.length || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        {run.facts?.alerts?.length > 0 ? (
                          <Badge variant="destructive">
                            {run.facts.alerts.length} alerts
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {run.ai_provider && run.ai_model ? (
                          <div className="text-sm">
                            <div>{run.ai_provider}</div>
                            <div className="text-muted-foreground text-xs">
                              {run.ai_model}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(run.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {run.triggered_by}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewRun(run.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Run Detail Sheet */}
        <Sheet open={!!selectedRunId} onOpenChange={() => handleCloseDetail()}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            {runLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : selectedRun ? (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    {getStatusIcon(selectedRun.status)}
                    {selectedRun.week_label || 'Digest Run'}
                  </SheetTitle>
                  <SheetDescription>
                    Run ID: {selectedRun.id}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* Status and Metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge className={getStatusColor(selectedRun.status)}>
                        {selectedRun.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Triggered By</p>
                      <p className="font-medium">{selectedRun.triggered_by}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {format(new Date(selectedRun.created_at), 'PPp')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="font-medium">
                        {selectedRun.completed_at
                          ? format(new Date(selectedRun.completed_at), 'PPp')
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Emails Sent</p>
                      <p className="font-medium">
                        {selectedRun.emails_sent}/{selectedRun.recipients?.length || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">AI Tokens</p>
                      <p className="font-medium">
                        {selectedRun.ai_tokens_used?.toLocaleString() || '-'}
                      </p>
                    </div>
                  </div>

                  {/* Error Display */}
                  {selectedRun.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-red-800 mb-2">
                        <XCircle className="h-5 w-5" />
                        <span className="font-medium">Error</span>
                        {selectedRun.error_code && (
                          <Badge variant="outline">{selectedRun.error_code}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-red-700">{selectedRun.error}</p>
                    </div>
                  )}

                  {/* Tabs for Facts, AI Output, Email Result */}
                  <Tabs defaultValue="summary">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="summary" className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        Summary
                      </TabsTrigger>
                      <TabsTrigger value="facts" className="flex items-center gap-1">
                        <FileJson className="h-4 w-4" />
                        Facts
                      </TabsTrigger>
                      <TabsTrigger value="ai" className="flex items-center gap-1">
                        <Cpu className="h-4 w-4" />
                        AI Output
                      </TabsTrigger>
                      <TabsTrigger value="email" className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        Email
                      </TabsTrigger>
                    </TabsList>

                    {/* Summary Tab */}
                    <TabsContent value="summary" className="mt-4 space-y-4">
                      {selectedRun.ai_output ? (
                        <>
                          <div>
                            <h4 className="font-medium mb-2">Subject</h4>
                            <p className="text-sm bg-muted p-2 rounded">
                              {selectedRun.ai_output.subject}
                            </p>
                          </div>

                          <div>
                            <h4 className="font-medium mb-2">Preview</h4>
                            <p className="text-sm bg-muted p-2 rounded">
                              {selectedRun.ai_output.preview}
                            </p>
                          </div>

                          {selectedRun.ai_output.critical_alerts?.length > 0 && (
                            <div>
                              <h4 className="font-medium mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                Critical Alerts
                              </h4>
                              <div className="space-y-2">
                                {selectedRun.ai_output.critical_alerts.map((alert, i) => (
                                  <div
                                    key={i}
                                    className="bg-red-50 border border-red-100 rounded p-3"
                                  >
                                    <p className="font-medium text-red-800">{alert.title}</p>
                                    <p className="text-sm text-red-700">{alert.description}</p>
                                    <p className="text-sm text-green-700 mt-1">
                                      Action: {alert.action}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedRun.ai_output.ceo_actions?.length > 0 && (
                            <div>
                              <h4 className="font-medium mb-2">CEO Actions</h4>
                              <div className="space-y-2">
                                {selectedRun.ai_output.ceo_actions
                                  .sort((a, b) => a.priority - b.priority)
                                  .map((action, i) => (
                                    <div
                                      key={i}
                                      className="bg-muted rounded p-3 flex gap-3"
                                    >
                                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                                        {action.priority}
                                      </div>
                                      <div>
                                        <p className="font-medium">{action.action}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {action.rationale}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-muted-foreground">No AI output available</p>
                      )}
                    </TabsContent>

                    {/* Facts Tab */}
                    <TabsContent value="facts" className="mt-4">
                      {selectedRun.facts ? (
                        <ScrollArea className="h-[400px]">
                          <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                            {JSON.stringify(selectedRun.facts, null, 2)}
                          </pre>
                        </ScrollArea>
                      ) : (
                        <p className="text-muted-foreground">No facts available</p>
                      )}
                    </TabsContent>

                    {/* AI Output Tab */}
                    <TabsContent value="ai" className="mt-4">
                      {selectedRun.ai_output ? (
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Cpu className="h-4 w-4" />
                              {selectedRun.ai_provider} / {selectedRun.ai_model}
                              {selectedRun.ai_tokens_used && (
                                <span>
                                  ({selectedRun.ai_tokens_used.toLocaleString()} tokens)
                                </span>
                              )}
                            </div>
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: selectedRun.ai_output.markdown
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                                    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                                    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                                    .replace(/^\s*-\s+(.*)$/gim, '<li>$1</li>')
                                    .replace(/\n/g, '<br>'),
                                }}
                              />
                            </div>
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-muted-foreground">No AI output available</p>
                      )}
                    </TabsContent>

                    {/* Email Tab */}
                    <TabsContent value="email" className="mt-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">Recipients</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedRun.recipients?.map((email) => (
                              <Badge key={email} variant="secondary">
                                {email}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {selectedRun.email_result && (
                          <div>
                            <h4 className="font-medium mb-2">Email Provider Response</h4>
                            <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                              {JSON.stringify(selectedRun.email_result, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Run not found
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}
