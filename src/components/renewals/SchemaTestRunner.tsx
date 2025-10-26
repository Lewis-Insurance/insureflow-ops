import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TestResult {
  step: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

export const SchemaTestRunner = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [overallStatus, setOverallStatus] = useState<'idle' | 'pass' | 'fail' | 'warning'>('idle');

  const runVerification = async () => {
    setIsRunning(true);
    setResults([]);
    const testResults: TestResult[] = [];

    try {
      // Test 1: Check renewals table exists
      testResults.push({
        step: 'Checking renewals table',
        status: 'success',
        message: 'Testing...'
      });
      setResults([...testResults]);

      const { data: renewal, error: renewalError } = await supabase
        .from('renewals' as any)
        .select('*')
        .limit(1)
        .maybeSingle();

      if (renewalError) {
        testResults[testResults.length - 1] = {
          step: 'Checking renewals table',
          status: 'error',
          message: 'renewals table not accessible',
          details: renewalError.message
        };
        setResults([...testResults]);
        setOverallStatus('fail');
        setIsRunning(false);
        return;
      }

      testResults[testResults.length - 1] = {
        step: 'Checking renewals table',
        status: 'success',
        message: 'renewals table exists and is accessible',
        details: renewal ? `Columns found: ${Object.keys(renewal).join(', ')}` : 'Table is empty (no sample data)'
      };
      setResults([...testResults]);

      // Test 2: Check for risk columns
      const riskColumns = ['risk_score', 'risk_level', 'risk_factors', 'last_risk_calculation'];
      const hasRiskColumns = renewal && riskColumns.every(col => col in renewal);

      if (!hasRiskColumns) {
        testResults.push({
          step: 'Checking risk columns',
          status: 'warning',
          message: 'renewals table missing some risk columns',
          details: renewal 
            ? `Missing: ${riskColumns.filter(col => !(col in renewal)).join(', ')}`
            : 'Cannot verify - table is empty'
        });
      } else {
        testResults.push({
          step: 'Checking risk columns',
          status: 'success',
          message: 'All required risk columns are present',
          details: `Verified columns: ${riskColumns.join(', ')}`
        });
      }
      setResults([...testResults]);

      // Test 3: Check risk indicators
      const indicatorColumns = [
        'days_since_last_contact',
        'contact_count',
        'has_recent_claims',
        'has_payment_issues',
        'competitor_activity_detected',
        'customer_satisfaction_score',
        'engagement_score',
        'sentiment_score'
      ];
      
      const hasIndicators = renewal && indicatorColumns.every(col => col in renewal);

      if (!hasIndicators) {
        testResults.push({
          step: 'Checking risk indicator columns',
          status: 'warning',
          message: 'Some risk indicator columns are missing',
          details: renewal
            ? `Missing: ${indicatorColumns.filter(col => !(col in renewal)).join(', ')}`
            : 'Cannot verify - table is empty'
        });
      } else {
        testResults.push({
          step: 'Checking risk indicator columns',
          status: 'success',
          message: 'All risk indicator columns are present'
        });
      }
      setResults([...testResults]);

      // Test 4: Check renewal_risk_history table
      const { error: historyError } = await supabase
        .from('renewal_risk_history' as any)
        .select('id')
        .limit(0);

      if (historyError) {
        testResults.push({
          step: 'Checking renewal_risk_history table',
          status: 'warning',
          message: 'renewal_risk_history table does not exist',
          details: 'Run the database migration to create this table'
        });
      } else {
        testResults.push({
          step: 'Checking renewal_risk_history table',
          status: 'success',
          message: 'renewal_risk_history table exists'
        });
      }
      setResults([...testResults]);

      // Test 5: Check renewal_campaigns table
      const { error: campaignsError } = await supabase
        .from('renewal_campaigns' as any)
        .select('id')
        .limit(0);

      if (campaignsError) {
        testResults.push({
          step: 'Checking renewal_campaigns table',
          status: 'warning',
          message: 'renewal_campaigns table does not exist',
          details: 'Run the database migration to create this table'
        });
      } else {
        testResults.push({
          step: 'Checking renewal_campaigns table',
          status: 'success',
          message: 'renewal_campaigns table exists'
        });
      }
      setResults([...testResults]);

      // Test 6: Check account relationship
      const { error: accountsError } = await supabase
        .from('accounts' as any)
        .select('id, name, email, phone')
        .limit(0);

      if (accountsError) {
        testResults.push({
          step: 'Checking accounts table (dependency)',
          status: 'error',
          message: 'accounts table not accessible',
          details: accountsError.message
        });
      } else {
        testResults.push({
          step: 'Checking accounts table (dependency)',
          status: 'success',
          message: 'accounts table is accessible'
        });
      }
      setResults([...testResults]);

      // Test 7: Check profiles relationship
      const { error: profilesError } = await supabase
        .from('profiles' as any)
        .select('id, full_name, email')
        .limit(0);

      if (profilesError) {
        testResults.push({
          step: 'Checking profiles table (dependency)',
          status: 'error',
          message: 'profiles table not accessible',
          details: profilesError.message
        });
      } else {
        testResults.push({
          step: 'Checking profiles table (dependency)',
          status: 'success',
          message: 'profiles table is accessible'
        });
      }
      setResults([...testResults]);

      // Determine overall status
      const hasErrors = testResults.some(r => r.status === 'error');
      const hasWarnings = testResults.some(r => r.status === 'warning');

      if (hasErrors) {
        setOverallStatus('fail');
      } else if (hasWarnings) {
        setOverallStatus('warning');
      } else {
        setOverallStatus('pass');
      }

    } catch (error) {
      testResults.push({
        step: 'Verification failed',
        status: 'error',
        message: 'Unexpected error during verification',
        details: error instanceof Error ? error.message : String(error)
      });
      setResults([...testResults]);
      setOverallStatus('fail');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Schema Verification Test
          <Button 
            onClick={runVerification} 
            disabled={isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Verification
              </>
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          Comprehensive check of database schema for renewal risk management system
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Status */}
        {overallStatus !== 'idle' && (
          <Alert variant={overallStatus === 'fail' ? 'destructive' : 'default'}>
            <AlertDescription className="flex items-center gap-2">
              {overallStatus === 'pass' && (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium">All checks passed!</span> Your schema is ready for the renewal risk system.
                </>
              )}
              {overallStatus === 'warning' && (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium">Warnings detected.</span> Some optional features may not work until the migration is complete.
                </>
              )}
              {overallStatus === 'fail' && (
                <>
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Critical errors found.</span> You need to run the database migration before using the renewal risk system.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Test Results */}
        {results.length > 0 && (
          <ScrollArea className="h-[400px] border rounded-lg p-4">
            <div className="space-y-3">
              {results.map((result, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <div className="mt-0.5">
                    {result.status === 'success' && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                    {result.status === 'warning' && (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    )}
                    {result.status === 'error' && (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{result.step}</span>
                      <Badge variant={
                        result.status === 'success' ? 'secondary' :
                        result.status === 'warning' ? 'outline' :
                        'destructive'
                      }>
                        {result.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{result.message}</p>
                    {result.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Show details
                        </summary>
                        <pre className="mt-2 text-xs bg-background p-2 rounded overflow-x-auto">
                          {result.details}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Initial State */}
        {results.length === 0 && !isRunning && (
          <div className="text-center py-8 text-muted-foreground">
            Click "Run Verification" to test your database schema
          </div>
        )}
      </CardContent>
    </Card>
  );
};
