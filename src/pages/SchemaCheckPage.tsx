import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, RefreshCw, Copy, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TableResult {
  exists: boolean;
  columns?: string[];
  error?: string;
}

export default function SchemaCheckPage() {
  const [results, setResults] = useState<Record<string, TableResult>>({});
  const [loading, setLoading] = useState(false);
  const [riskFieldsCheck, setRiskFieldsCheck] = useState<Record<string, boolean>>({});

  const checkSchema = async () => {
    setLoading(true);
    toast.info('Checking database schema...');
    console.log('🔍 Starting schema check...');
    
    const tablesToCheck = [
      'renewals',
      'renewal_campaigns',
      'renewal_risk_factors',
      'renewal_touchpoints',
      'at_risk_renewals'
    ];

    const newResults: Record<string, TableResult> = {};

    // Check each table
    for (const tableName of tablesToCheck) {
      console.log(`Checking: ${tableName}`);
      
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(`❌ ${tableName}: ${error.message}`);
        newResults[tableName] = {
          exists: false,
          error: error.message
        };
      } else {
        console.log(`✅ ${tableName}: EXISTS`);
        const columns = data ? Object.keys(data) : [];
        console.log(`   Columns: ${columns.join(', ')}`);
        newResults[tableName] = {
          exists: true,
          columns
        };
      }
    }

    // Check renewals for risk fields by trying to select them
    if (newResults.renewals?.exists) {
      console.log('\n🔍 Checking renewals for risk fields...');
      
      const riskFields = [
        'risk_score',
        'risk_level',
        'risk_calculated_at',
        'last_contact_date',
        'engagement_score',
        'sentiment_score',
        'price_increase_pct',
        'has_recent_claim',
        'has_payment_issues',
        'competitor_activity_detected',
      ];

      const fieldsCheck: Record<string, boolean> = {};
      
      // Test each field individually by trying to select it
      for (const field of riskFields) {
        try {
          const { error } = await supabase
            .from('renewals')
            .select(field)
            .limit(0); // Don't fetch data, just test the column
          
          const exists = !error;
          fieldsCheck[field] = exists;
          console.log(`  ${exists ? '✅' : '❌'} ${field}${error ? ` (${error.message})` : ''}`);
        } catch (e) {
          fieldsCheck[field] = false;
          console.log(`  ❌ ${field} (error)`);
        }
      }

      setRiskFieldsCheck(fieldsCheck);
    }

    setResults(newResults);
    setLoading(false);
    
    console.log('\n📊 Check complete!');
    toast.success('Schema check complete!');
  };

  useEffect(() => {
    checkSchema();
  }, []);

  const copyMigrationSQL = () => {
    toast.success('The migration SQL has already been run! Click Recheck to verify.');
  };

  const allTablesExist = 
    results.renewals?.exists &&
    results.renewal_campaigns?.exists &&
    results.renewal_risk_factors?.exists &&
    results.renewal_touchpoints?.exists &&
    results.at_risk_renewals?.exists;

  const allRiskFieldsExist = Object.values(riskFieldsCheck).every(v => v);
  const isReady = allTablesExist && allRiskFieldsExist;

  const missingRiskFields = Object.entries(riskFieldsCheck)
    .filter(([_, exists]) => !exists)
    .map(([field, _]) => field);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Database Schema Check</h1>
            <p className="text-muted-foreground mt-1">
              Verify schema for Renewal Risk Management
            </p>
          </div>
          <Button onClick={checkSchema} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recheck
          </Button>
        </div>

        {/* Status Banner */}
        <Card className={isReady ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950'}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {isReady ? (
                <>
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-semibold text-green-900 dark:text-green-100">✅ Schema Ready!</p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      All tables and fields exist. You can use the renewal risk features.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                  <div>
                    <p className="font-semibold text-orange-900 dark:text-orange-100">⚠️ Missing Schema</p>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Some tables or fields from your SQL migration aren't showing up. Try refreshing or check Supabase SQL editor.
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tables Check */}
        <Card>
          <CardHeader>
            <CardTitle>Required Tables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(results).map(([table, result]) => (
              <div key={table} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {result.exists ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <div className="font-medium">{table}</div>
                    {result.columns && (
                      <div className="text-xs text-muted-foreground">
                        {result.columns.length} columns
                      </div>
                    )}
                    {result.error && (
                      <div className="text-xs text-red-600">{result.error}</div>
                    )}
                  </div>
                </div>
                <Badge variant={result.exists ? 'default' : 'destructive'}>
                  {result.exists ? 'EXISTS' : 'MISSING'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Risk Fields Check */}
        {results.renewals?.exists && Object.keys(riskFieldsCheck).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Risk Fields in Renewals Table</CardTitle>
            </CardHeader>
            <CardContent>
              {missingRiskFields.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-orange-600">
                    ⚠️ Missing {missingRiskFields.length} required fields
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(riskFieldsCheck).map(([field, exists]) => (
                      <div key={field} className="flex items-center gap-2">
                        {exists ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className={`text-sm ${exists ? '' : 'text-red-600'}`}>
                          {field}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-green-600">
                  ✅ All risk fields present
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Success Next Steps */}
        {isReady && (
          <Card className="border-green-200 dark:border-green-900">
            <CardHeader>
              <CardTitle className="text-green-900 dark:text-green-100">🎉 Ready to Build!</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>Your database schema is ready. All tables and fields are in place.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
