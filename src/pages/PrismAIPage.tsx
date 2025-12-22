/**
 * Prism AI Page
 * 
 * Interface for agents and employees to use the Prism multi-agent reasoning API
 */

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  usePrismRun,
  usePrismRunStatus,
  usePrismUsage,
  usePrismRunHistory,
} from '@/hooks/usePrismAPI';
import type { PrismMode, PrismDepth } from '@/types/prism-api';
import {
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Brain,
  TrendingUp,
  DollarSign,
  FileText,
  History,
  Settings,
  Search,
  Download,
  Star,
  StarOff,
  Copy,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useSavePrismRun } from '@/hooks/usePrismAPI';

export default function PrismAIPage() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<PrismMode>('sequential');
  const [depth, setDepth] = useState<PrismDepth>('synthesis');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('new-run');
  const [historySearch, setHistorySearch] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'checking' | 'valid' | 'invalid' | 'none'>('checking');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);

  const { user, profile } = useAuth();
  const runMutation = usePrismRun();
  const { data: runStatus, isLoading: isLoadingStatus, error: runStatusError } = usePrismRunStatus(activeRunId);
  const { data: usage, refetch: refetchUsage, error: usageError } = usePrismUsage();
  const { data: runHistory, refetch: refetchHistory, error: historyError } = usePrismRunHistory(100);
  const saveFavoriteMutation = useSavePrismRun();
  const { toast } = useToast();

  // Load API key on mount
  useEffect(() => {
    if (profile?.prism_api_key) {
      setApiKey(profile.prism_api_key);
      setApiKeyStatus('valid');
    } else {
      setApiKeyStatus('none');
    }
  }, [profile]);

  // Test API key
  const testAPIKey = async (key: string) => {
    if (!key || !key.startsWith('sk_prism_')) {
      setApiKeyStatus('invalid');
      return false;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://lrqajzwcmdwahnjyidgv.supabase.co'}/functions/v1/prism-api/usage`, {
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });

      if (response.ok) {
        setApiKeyStatus('valid');
        return true;
      } else {
        setApiKeyStatus('invalid');
        return false;
      }
    } catch {
      setApiKeyStatus('invalid');
      return false;
    }
  };

  // Save API key
  const handleSaveAPIKey = async () => {
    if (!user) return;

    const isValid = await testAPIKey(apiKey);
    if (!isValid) {
      toast({
        title: 'Invalid API Key',
        description: 'Please check your API key format (should start with sk_prism_)',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingApiKey(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ prism_api_key: apiKey })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'API Key Saved',
        description: 'Your Prism API key has been saved successfully',
      });

      // Refresh profile
      window.location.reload();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save API key',
        variant: 'destructive',
      });
    } finally {
      setIsSavingApiKey(false);
    }
  };

  // Export history to CSV
  const exportHistoryToCSV = () => {
    if (!runHistory || runHistory.length === 0) {
      toast({
        title: 'No Data',
        description: 'No history to export',
        variant: 'destructive',
      });
      return;
    }

    const headers = ['Prompt', 'Mode', 'Depth', 'Status', 'Cycles', 'Tokens', 'Cost', 'Created', 'Completed'];
    const rows = runHistory.map(run => [
      `"${run.prompt.replace(/"/g, '""')}"`,
      run.mode,
      run.depth,
      run.status,
      run.cycles_completed,
      run.tokens_used || 0,
      run.cost || 0,
      new Date(run.created_at).toISOString(),
      run.completed_at ? new Date(run.completed_at).toISOString() : '',
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prism-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Exported',
      description: 'History exported to CSV',
    });
  };

  // Filtered history
  const filteredHistory = runHistory?.filter(run => {
    if (!historySearch) return true;
    const search = historySearch.toLowerCase();
    return run.prompt.toLowerCase().includes(search) ||
           run.mode.toLowerCase().includes(search) ||
           run.depth.toLowerCase().includes(search) ||
           run.status.toLowerCase().includes(search);
  }) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Please enter a prompt to analyze',
        variant: 'destructive',
      });
      return;
    }

    if (prompt.length > 50000) {
      toast({
        title: 'Prompt too long',
        description: 'Maximum 50,000 characters allowed',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await runMutation.mutateAsync({
        prompt: prompt.trim(),
        mode,
        depth,
      });

      setActiveRunId(result.run_id);
      setActiveTab('results');

      // If already complete, show result immediately
      if (result.status === 'complete') {
        toast({
          title: 'Analysis complete',
          description: `Completed ${result.cycles_completed || 0} reasoning cycles`,
        });
      }
    } catch (error) {
      // Error handled by mutation
    }
  };

  const formatCost = (cost: number | undefined | null) => {
    if (cost == null) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(cost);
  };

  const formatTokens = (tokens: number | undefined | null) => {
    if (tokens == null) return '0';
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Complete</Badge>;
      case 'running':
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-8 w-8" />
              Prism AI
            </h1>
            <p className="text-muted-foreground mt-1">
              Multi-agent reasoning for complex analysis and strategic planning
            </p>
          </div>
          {usage ? (
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Requests</div>
                <div className="text-2xl font-bold">{usage.total_requests}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Tokens</div>
                <div className="text-2xl font-bold">{formatTokens(usage.total_tokens)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Cost</div>
                <div className="text-2xl font-bold">{formatCost(usage.total_cost)}</div>
              </div>
            </div>
          ) : usageError ? (
            <div className="text-right">
              <Badge variant="destructive">Error loading usage</Badge>
            </div>
          ) : (
            <div className="text-right">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="new-run">
              <Sparkles className="h-4 w-4 mr-2" />
              New Analysis
            </TabsTrigger>
            <TabsTrigger value="results">
              <FileText className="h-4 w-4 mr-2" />
              Results
              {activeRunId && runStatus?.status === 'running' && (
                <Loader2 className="h-3 w-3 ml-2 animate-spin" />
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* NEW RUN TAB */}
          <TabsContent value="new-run" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Start New Analysis</CardTitle>
                <CardDescription>
                  Enter your question or task. Prism will analyze it through multiple AI perspectives.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="prompt">Prompt</Label>
                    <Textarea
                      id="prompt"
                      placeholder="e.g., Analyze the pros and cons of implementing a microservices architecture for our e-commerce platform..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={8}
                      className="font-mono text-sm"
                      maxLength={50000}
                    />
                    <div className="text-xs text-muted-foreground text-right">
                      {prompt.length.toLocaleString()} / 50,000 characters
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="mode">Mode</Label>
                      <Select value={mode} onValueChange={(v) => setMode(v as PrismMode)}>
                        <SelectTrigger id="mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sequential">
                            Sequential (Recommended)
                          </SelectItem>
                          <SelectItem value="parallel" disabled>
                            Parallel (Coming Soon)
                          </SelectItem>
                          <SelectItem value="debate" disabled>
                            Debate (Coming Soon)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Each agent builds on the previous output
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="depth">Depth</Label>
                      <Select value={depth} onValueChange={(v) => setDepth(v as PrismDepth)}>
                        <SelectTrigger id="depth">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="insight">Insight (1 cycle)</SelectItem>
                          <SelectItem value="synthesis">Synthesis (2 cycles, default)</SelectItem>
                          <SelectItem value="mastery">Mastery (3 cycles)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        More cycles = deeper analysis
                      </p>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={runMutation.isPending || !prompt.trim()}
                    className="w-full"
                    size="lg"
                  >
                    {runMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting Analysis...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Start Analysis
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Mode & Depth Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About Sequential Mode</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>
                    Each agent (Architect, Lateral Thinker, Logic Engine, Auditor) processes
                    the prompt in sequence, building on previous insights. Best for complex
                    analysis and strategic planning.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Depth Levels</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <div>
                    <strong>Insight:</strong> Quick answers, simple questions (1 cycle)
                  </div>
                  <div>
                    <strong>Synthesis:</strong> Balanced analysis (2 cycles, recommended)
                  </div>
                  <div>
                    <strong>Mastery:</strong> Deep research, complex problems (3 cycles)
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* RESULTS TAB */}
          <TabsContent value="results" className="space-y-4">
            {!activeRunId ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    No active run. Start a new analysis to see results here.
                  </p>
                </CardContent>
              </Card>
            ) : isLoadingStatus ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin" />
                  <p className="text-muted-foreground">Loading run status...</p>
                </CardContent>
              </Card>
            ) : runStatus ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Run Status</CardTitle>
                        <CardDescription>Run ID: {runStatus.run_id}</CardDescription>
                      </div>
                      {getStatusBadge(runStatus.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Mode</div>
                        <div className="font-medium capitalize">{runStatus.mode}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Depth</div>
                        <div className="font-medium capitalize">{runStatus.depth}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Cycles Completed</div>
                        <div className="font-medium">{runStatus.cycles_completed}</div>
                      </div>
                    </div>

                    {runStatus.status === 'running' && (
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 text-blue-700">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="font-medium">Analysis in progress...</span>
                        </div>
                        <p className="text-sm text-blue-600 mt-2">
                          Prism is processing your request through {runStatus.cycles_completed + 1} reasoning cycles.
                        </p>
                      </div>
                    )}

                    {runStatus.error && (
                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex items-center gap-2 text-red-700">
                          <XCircle className="h-4 w-4" />
                          <span className="font-medium">Error</span>
                        </div>
                        <p className="text-sm text-red-600 mt-2">{runStatus.error}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {runStatus.final_output && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Final Output</CardTitle>
                          <CardDescription>
                            Synthesized analysis from all reasoning cycles
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(runStatus.final_output || '');
                              toast({
                                title: 'Copied',
                                description: 'Output copied to clipboard',
                              });
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const blob = new Blob([runStatus.final_output || ''], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `prism-output-${runStatus.run_id}.txt`;
                              a.click();
                              URL.revokeObjectURL(url);
                              toast({
                                title: 'Downloaded',
                                description: 'Output saved to file',
                              });
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <div className="whitespace-pre-wrap text-sm bg-muted p-6 rounded-lg border max-h-[600px] overflow-y-auto">
                          {runStatus.final_output}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                        <div>
                          {runStatus.usage && (
                            <>
                              {formatTokens(runStatus.usage.total_tokens)} tokens • {formatCost(runStatus.usage.estimated_cost)}
                            </>
                          )}
                        </div>
                        <div>
                          Completed {runStatus.completed_at && new Date(runStatus.completed_at).toLocaleString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : runStatusError ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                  <p className="font-medium mb-2">Failed to load run status</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {runStatusError instanceof Error ? runStatusError.message : 'Unknown error'}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (activeRunId) {
                        window.location.reload();
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Failed to load run status</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Run History</CardTitle>
                    <CardDescription>
                      View and manage your previous Prism analyses
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchHistory()}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                    {runHistory && runHistory.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportHistoryToCSV}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {runHistory && runHistory.length > 0 && (
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search history by prompt, mode, depth, or status..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    {historySearch && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Showing {filteredHistory.length} of {runHistory.length} runs
                      </p>
                    )}
                  </div>
                )}

                {historyError ? (
                  <div className="py-12 text-center">
                    <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                    <p className="font-medium mb-2 text-destructive">Error loading history</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      {historyError instanceof Error ? historyError.message : 'Unknown error'}
                    </p>
                    <Button variant="outline" onClick={() => refetchHistory()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                ) : !runHistory || runHistory.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium mb-2">No run history yet</p>
                    <p className="text-sm">
                      Start your first analysis to see it here.
                    </p>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium mb-2">No matches found</p>
                    <p className="text-sm">
                      Try adjusting your search terms.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[300px]">Prompt</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead>Depth</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Cycles</TableHead>
                          <TableHead>Tokens</TableHead>
                          <TableHead>Cost</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredHistory.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="max-w-[300px]">
                              <div className="truncate font-medium" title={run.prompt}>
                                {run.prompt.substring(0, 80)}
                                {run.prompt.length > 80 && '...'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {run.mode}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {run.depth}
                              </Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(run.status)}</TableCell>
                            <TableCell className="text-center">{run.cycles_completed}</TableCell>
                            <TableCell className="text-right">{formatTokens(run.tokens_used)}</TableCell>
                            <TableCell className="text-right">{formatCost(run.cost)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(run.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setActiveRunId(run.run_id);
                                    setActiveTab('results');
                                  }}
                                  title="View details"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                                {run.final_output && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      navigator.clipboard.writeText(run.final_output || '');
                                      toast({
                                        title: 'Copied',
                                        description: 'Output copied to clipboard',
                                      });
                                    }}
                                    title="Copy output"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    saveFavoriteMutation.mutate(run.id);
                                  }}
                                  title={run.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                                >
                                  {run.is_favorite ? (
                                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                  ) : (
                                    <StarOff className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>
                  Configure your Prism API key for personalized access
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">Prism API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="api-key"
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="sk_prism_..."
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setApiKeyStatus('checking');
                        }}
                        onBlur={() => {
                          if (apiKey) {
                            testAPIKey(apiKey);
                          }
                        }}
                        className="font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      onClick={handleSaveAPIKey}
                      disabled={isSavingApiKey || !apiKey || apiKeyStatus === 'invalid'}
                    >
                      {isSavingApiKey ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Key'
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {apiKeyStatus === 'checking' && apiKey && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground">Checking...</span>
                      </>
                    )}
                    {apiKeyStatus === 'valid' && (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">API key is valid</span>
                      </>
                    )}
                    {apiKeyStatus === 'invalid' && apiKey && (
                      <>
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-red-600">Invalid API key format</span>
                      </>
                    )}
                    {apiKeyStatus === 'none' && !apiKey && (
                      <span className="text-muted-foreground">
                        Enter your API key (starts with sk_prism_)
                      </span>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Current Status</Label>
                  <div className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">API Key Status</span>
                      {apiKeyStatus === 'valid' ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Configured
                        </Badge>
                      ) : apiKeyStatus === 'invalid' ? (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Invalid
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Not Configured
                        </Badge>
                      )}
                    </div>
                    {apiKeyStatus === 'none' && (
                      <p className="text-xs text-muted-foreground">
                        You can use a system-wide API key if configured by your administrator,
                        or set your own personal API key above.
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900 dark:text-blue-100">
                      <p className="font-medium mb-1">About API Keys</p>
                      <p>
                        Your API key is stored securely and only used to authenticate with the Prism API.
                        If you don't have a personal key, contact your administrator to get one or use
                        the system-wide key if available.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Usage Limits Info */}
            <Card>
              <CardHeader>
                <CardTitle>Usage Limits</CardTitle>
                <CardDescription>
                  Your current usage and limits
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usage ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Requests Today</div>
                        <div className="text-2xl font-bold">{usage.total_requests}</div>
                        <div className="text-xs text-muted-foreground mt-1">Limit: 100/hour</div>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Tokens Today</div>
                        <div className="text-2xl font-bold">{formatTokens(usage.total_tokens)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Limit: 1M/day</div>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Cost Today</div>
                        <div className="text-2xl font-bold">{formatCost(usage.total_cost)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Limit: $10/day</div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => refetchUsage()}
                      className="w-full"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Usage Stats
                    </Button>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading usage statistics...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

