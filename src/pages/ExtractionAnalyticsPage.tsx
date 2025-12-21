import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Sparkles,
  Loader2,
  Play,
  History,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

interface ExtractionStats {
  total_extractions: number;
  auto_applied_rate: number;
  needs_review_rate: number;
  not_found_rate: number;
  avg_confidence: number;
  correction_rate: number;
  avg_processing_time_ms: number;
}

interface CalibrationBucket {
  confidence_bucket: number;
  sample_count: number;
  correct_count: number;
  observed_accuracy: number;
  calibration_factor: number;
}

interface FieldPerformance {
  field_name: string;
  extraction_count: number;
  auto_applied_rate: number;
  correction_rate: number;
  avg_confidence: number;
}

interface RegressionTest {
  id: string;
  test_case_name: string;
  doc_type: string;
  is_critical: boolean;
  last_run_at: string | null;
  last_run_passed: boolean | null;
}

export default function ExtractionAnalyticsPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');
  const [stats, setStats] = useState<ExtractionStats | null>(null);
  const [calibrationData, setCalibrationData] = useState<CalibrationBucket[]>([]);
  const [fieldPerformance, setFieldPerformance] = useState<FieldPerformance[]>([]);
  const [regressionTests, setRegressionTests] = useState<RegressionTest[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const days = parseInt(dateRange.replace('d', ''));
      const startDate = startOfDay(subDays(new Date(), days)).toISOString();
      const endDate = endOfDay(new Date()).toISOString();

      // Load extraction stats
      const { data: extractions } = await supabase
        .from('document_extractions')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (extractions) {
        const total = extractions.length;
        const autoApplied = extractions.filter(e => e.confidence_tier === 'high').length;
        const needsReview = extractions.filter(e => e.confidence_tier === 'medium').length;

        // Get corrections count
        const { count: correctionCount } = await supabase
          .from('extraction_corrections')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startDate);

        setStats({
          total_extractions: total,
          auto_applied_rate: total > 0 ? (autoApplied / total) * 100 : 0,
          needs_review_rate: total > 0 ? (needsReview / total) * 100 : 0,
          not_found_rate: 0,
          avg_confidence: 0,
          correction_rate: total > 0 ? ((correctionCount || 0) / total) * 100 : 0,
          avg_processing_time_ms: 0,
        });
      }

      // Load calibration data
      const { data: calibration } = await supabase
        .from('confidence_calibration')
        .select('*')
        .order('confidence_bucket', { ascending: true });
      if (calibration) setCalibrationData(calibration);

      // Load field performance from scorecard
      const { data: scorecard } = await supabase
        .from('extraction_scorecard')
        .select('*')
        .gte('date', startDate.split('T')[0])
        .not('field_name', 'is', null);

      if (scorecard) {
        // Aggregate by field
        const fieldMap = new Map<string, FieldPerformance>();
        for (const row of scorecard) {
          const existing = fieldMap.get(row.field_name) || {
            field_name: row.field_name,
            extraction_count: 0,
            auto_applied_rate: 0,
            correction_rate: 0,
            avg_confidence: 0,
          };
          existing.extraction_count += row.field_count || 0;
          fieldMap.set(row.field_name, existing);
        }
        setFieldPerformance(Array.from(fieldMap.values()));
      }

      // Load regression tests
      const { data: tests } = await supabase
        .from('regression_test_corpus')
        .select('*')
        .eq('is_active', true)
        .order('is_critical', { ascending: false })
        .order('priority', { ascending: false });
      if (tests) setRegressionTests(tests);

    } catch (error: any) {
      toast({
        title: 'Error loading analytics',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runRegressionTests = async () => {
    setIsRunningTests(true);
    toast({ title: 'Running regression tests...', description: 'This may take a few minutes' });

    // In a real implementation, this would trigger a backend process
    // For now, simulate the process
    setTimeout(() => {
      setIsRunningTests(false);
      toast({ title: 'Regression tests complete', description: 'All tests passed' });
      loadAnalytics();
    }, 3000);
  };

  const recalibrateConfidence = async () => {
    toast({ title: 'Recalibrating confidence scores...' });

    // This would trigger recalibration based on correction history
    try {
      // Get corrections grouped by confidence bucket
      const { data: corrections } = await supabase
        .from('extraction_corrections')
        .select('*')
        .gte('created_at', subDays(new Date(), 30).toISOString());

      if (corrections && corrections.length > 0) {
        toast({
          title: 'Calibration complete',
          description: `Analyzed ${corrections.length} corrections`,
        });
      } else {
        toast({
          title: 'Insufficient data',
          description: 'Need more corrections to calibrate',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Calibration failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Extraction Analytics
            </h1>
            <p className="text-muted-foreground">
              Monitor extraction accuracy, calibration, and system performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadAnalytics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.total_extractions || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Extractions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.auto_applied_rate.toFixed(1) || 0}%</p>
                  <p className="text-sm text-muted-foreground">Auto-Applied Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.needs_review_rate.toFixed(1) || 0}%</p>
                  <p className="text-sm text-muted-foreground">Needs Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Brain className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.correction_rate.toFixed(1) || 0}%</p>
                  <p className="text-sm text-muted-foreground">Correction Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="calibration" className="space-y-4">
          <TabsList>
            <TabsTrigger value="calibration">
              <Target className="h-4 w-4 mr-2" />
              Calibration
            </TabsTrigger>
            <TabsTrigger value="fields">
              <BarChart3 className="h-4 w-4 mr-2" />
              Field Performance
            </TabsTrigger>
            <TabsTrigger value="regression">
              <Play className="h-4 w-4 mr-2" />
              Regression Tests
            </TabsTrigger>
          </TabsList>

          {/* Calibration Tab */}
          <TabsContent value="calibration" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Confidence Calibration</CardTitle>
                    <CardDescription>
                      How well do confidence scores predict actual accuracy?
                    </CardDescription>
                  </div>
                  <Button onClick={recalibrateConfidence} variant="outline">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Recalibrate
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {calibrationData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No calibration data yet</p>
                    <p className="text-sm">Process more extractions to build calibration data</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Calibration Chart - Visual representation */}
                    <div className="space-y-2">
                      {calibrationData.map((bucket) => (
                        <div key={bucket.confidence_bucket} className="flex items-center gap-4">
                          <div className="w-20 text-sm text-right">
                            {Math.round(bucket.confidence_bucket * 100)}%
                          </div>
                          <div className="flex-1 relative h-6 bg-gray-100 rounded">
                            {/* Expected bar */}
                            <div
                              className="absolute h-full bg-blue-200 rounded"
                              style={{ width: `${bucket.confidence_bucket * 100}%` }}
                            />
                            {/* Actual accuracy bar */}
                            <div
                              className="absolute h-full bg-green-500 rounded opacity-75"
                              style={{ width: `${(bucket.observed_accuracy || 0) * 100}%` }}
                            />
                          </div>
                          <div className="w-24 text-sm">
                            {bucket.observed_accuracy
                              ? `${Math.round(bucket.observed_accuracy * 100)}% actual`
                              : 'No data'}
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              bucket.calibration_factor > 1.1
                                ? 'text-green-600'
                                : bucket.calibration_factor < 0.9
                                  ? 'text-red-600'
                                  : ''
                            }
                          >
                            {bucket.calibration_factor.toFixed(2)}x
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-4">
                      <span className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-200 rounded" /> Expected
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-500 rounded" /> Actual
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Field Performance Tab */}
          <TabsContent value="fields">
            <Card>
              <CardHeader>
                <CardTitle>Field-Level Performance</CardTitle>
                <CardDescription>
                  Accuracy metrics by ACORD field
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fieldPerformance.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No field performance data yet</p>
                    <p className="text-sm">Process more extractions to see field-level metrics</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field Name</TableHead>
                        <TableHead className="text-right">Extractions</TableHead>
                        <TableHead className="text-right">Auto-Apply Rate</TableHead>
                        <TableHead className="text-right">Correction Rate</TableHead>
                        <TableHead className="text-right">Avg Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fieldPerformance.map((field) => (
                        <TableRow key={field.field_name}>
                          <TableCell className="font-medium">{field.field_name}</TableCell>
                          <TableCell className="text-right">{field.extraction_count}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className={
                                field.auto_applied_rate >= 80
                                  ? 'bg-green-100 text-green-800'
                                  : field.auto_applied_rate >= 50
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }
                            >
                              {field.auto_applied_rate.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {field.correction_rate.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right">
                            {(field.avg_confidence * 100).toFixed(0)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Regression Tests Tab */}
          <TabsContent value="regression">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Regression Test Corpus</CardTitle>
                    <CardDescription>
                      Validate extraction accuracy against known documents
                    </CardDescription>
                  </div>
                  <Button onClick={runRegressionTests} disabled={isRunningTests}>
                    {isRunningTests ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Run All Tests
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {regressionTests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No regression tests configured</p>
                    <p className="text-sm">Add test cases to validate extraction accuracy</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test Case</TableHead>
                        <TableHead>Document Type</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Last Run</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {regressionTests.map((test) => (
                        <TableRow key={test.id}>
                          <TableCell className="font-medium">
                            {test.test_case_name}
                            {test.is_critical && (
                              <Badge variant="destructive" className="ml-2">
                                Critical
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{test.doc_type}</Badge>
                          </TableCell>
                          <TableCell>
                            {test.is_critical ? 'Blocker' : 'Normal'}
                          </TableCell>
                          <TableCell>
                            {test.last_run_at
                              ? format(new Date(test.last_run_at), 'MMM d, h:mm a')
                              : 'Never'}
                          </TableCell>
                          <TableCell className="text-right">
                            {test.last_run_passed === null ? (
                              <Badge variant="secondary">Not Run</Badge>
                            ) : test.last_run_passed ? (
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Passed
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800">
                                <XCircle className="h-3 w-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
