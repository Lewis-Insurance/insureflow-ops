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
              <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <p className="text-red-600 dark:text-red-400 font-semibold">Error:</p>
                <p className="text-sm mt-1">{results.error}</p>
              </div>
            ) : (
              <>
                {/* Environment Variables Check */}
                <div className="space-y-2">
                  <h3 className="font-semibold">Environment Variables</h3>
                  {Object.entries(results.tests?.env_vars || {}).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className={value ? "text-green-600" : "text-red-600"}>
                        {value ? "✓" : "✗"}
                      </span>
                      <span className="text-sm">{key}</span>
                      {!value && (
                        <span className="text-xs text-red-600">(Missing)</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Connection Tests */}
                <div className="space-y-2">
                  <h3 className="font-semibold">Connection Tests</h3>
                  {Object.entries(results.tests || {}).map(([key, test]: [string, any]) => {
                    if (key === 'env_vars') return null;
                    return (
                      <div key={key} className="p-3 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={test.success ? "text-green-600" : "text-red-600"}>
                            {test.success ? "✓" : "✗"}
                          </span>
                          <span className="font-medium">{key.replace(/_/g, ' ')}</span>
                        </div>
                        {test.error && (
                          <p className="text-xs text-red-600 ml-6">{test.error}</p>
                        )}
                        {test.endpoint && (
                          <p className="text-xs text-muted-foreground ml-6">Endpoint: {test.endpoint}</p>
                        )}
                        {test.deployment && (
                          <p className="text-xs text-muted-foreground ml-6">Deployment: {test.deployment}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                {results.summary && (
                  <div className={`p-4 rounded-lg ${
                    results.summary.all_tests_passed 
                      ? 'bg-green-50 dark:bg-green-950/20' 
                      : 'bg-red-50 dark:bg-red-950/20'
                  }`}>
                    <p className="font-semibold">
                      {results.summary.all_tests_passed ? (
                        <span className="text-green-600 dark:text-green-400">
                          ✓ All Tests Passed
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">
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
                  <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto">
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
