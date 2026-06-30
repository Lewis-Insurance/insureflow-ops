import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export const AzureDiagnostics = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('azure-diagnostics');
      
      if (error) {
        setResults({ error: error.message });
      } else {
        setResults(data);
      }
    } catch (err: any) {
      setResults({ error: err.message || 'Unknown error occurred' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Azure Configuration Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runDiagnostics} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Diagnostics...
            </>
          ) : (
            'Run Azure Diagnostics'
          )}
        </Button>

        {results && (
          <div className="space-y-4">
            {results.error ? (
              <div className="p-4 bg-destructive/10 rounded-lg">
                <p className="text-destructive font-semibold">Error:</p>
                <p className="text-sm mt-1">{results.error}</p>
              </div>
            ) : (
              <>
                {/* Environment Variables Check */}
                <div className="space-y-2">
                  <h3 className="font-semibold">Environment Variables</h3>
                  {Object.entries(results.env_check || {}).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className={value.configured ? "text-success" : "text-destructive"}>
                        {value.configured ? "✓" : "✗"}
                      </span>
                      <span className="text-sm">{key}</span>
                      {!value.configured && (
                        <span className="text-xs text-destructive">(Missing)</span>
                      )}
                      {value.configured && value.value && (
                        <span className="text-xs text-muted-foreground">{value.value}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Connection Tests */}
                <div className="space-y-2">
                  <h3 className="font-semibold">Connection Tests</h3>
                  {Object.entries(results.tests || {}).map(([key, test]: [string, any]) => (
                    <div key={key} className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={test.success ? "text-success" : "text-destructive"}>
                          {test.success ? "✓" : "✗"}
                        </span>
                        <span className="font-medium">{key.replace(/_/g, ' ')}</span>
                      </div>
                      {test.status && (
                        <p className="text-xs text-muted-foreground ml-6">Status: {test.status}</p>
                      )}
                      {test.error && (
                        <p className="text-xs text-destructive ml-6 mt-1">{test.error}</p>
                      )}
                      {test.details && (
                        <p className="text-xs text-muted-foreground ml-6 mt-1">
                          {JSON.stringify(test.details)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Summary */}
                {results.summary && (
                  <div className={`p-4 rounded-lg ${
                    results.summary.all_tests_passed
                      ? 'bg-success/10'
                      : 'bg-destructive/10'
                  }`}>
                    <p className="font-semibold">
                      {results.summary.all_tests_passed ? (
                        <span className="text-success">
                          ✓ All Tests Passed
                        </span>
                      ) : (
                        <span className="text-destructive">
                          ✗ {results.summary.failed_tests?.length || 0} Test(s) Failed
                        </span>
                      )}
                    </p>
                    {results.summary.failed_tests?.length > 0 && (
                      <p className="text-sm mt-1">
                        Failed: {results.summary.failed_tests.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">View Raw Results</summary>
                  <pre className="mt-2 p-2 bg-cc-surface-raised rounded overflow-auto">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
