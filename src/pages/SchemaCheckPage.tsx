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
    console.log('🔍 Starting schema check...');
    
    const tablesToCheck = [
      'renewals',
      'renewal_risk_history',
      'renewal_campaigns',
      'accounts',
      'policies'
    ];

    const newResults: Record<string, TableResult> = {};

    // Check each table
    for (const tableName of tablesToCheck) {
      console.log(`Checking: ${tableName}`);
      
      const { data, error } = await supabase
        .from(tableName as any)
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

    // Check renewals for risk fields
    if (newResults.renewals?.exists) {
      console.log('\n🔍 Checking renewals for risk fields...');
      
      const { data: renewal } = await supabase
        .from('renewals')
        .select('*')
        .limit(1)
        .maybeSingle();

      const riskFields = [
        'risk_score',
        'risk_level',
        'risk_factors',
        'last_risk_calculation',
        'days_since_last_contact',
        'contact_count',
        'has_recent_claims',
        'competitor_activity_detected',
        'customer_satisfaction_score',
        'engagement_score'
      ];

      const fieldsCheck: Record<string, boolean> = {};
      riskFields.forEach(field => {
        const exists = renewal ? field in renewal : false;
        fieldsCheck[field] = exists;
        console.log(`  ${exists ? '✅' : '❌'} ${field}`);
      });

      setRiskFieldsCheck(fieldsCheck);
    }

    setResults(newResults);
    setLoading(false);
    
    console.log('\n📊 Check complete!');
  };

  useEffect(() => {
    checkSchema();
  }, []);

  const migrationSQL = `-- ============================================================================
-- RENEWAL RISK MIGRATION - Add Risk Fields & Tables
-- ============================================================================

-- PART 1: Add Risk Fields to Renewals Table
ALTER TABLE public.renewals 
ADD COLUMN IF NOT EXISTS risk_score INTEGER,
ADD COLUMN IF NOT EXISTS risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_risk_calculation TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS days_since_last_contact INTEGER,
ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_recent_claims BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS competitor_activity_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_satisfaction_score INTEGER,
ADD COLUMN IF NOT EXISTS engagement_score INTEGER;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_renewals_risk_score ON public.renewals(risk_score);
CREATE INDEX IF NOT EXISTS idx_renewals_risk_level ON public.renewals(risk_level);
CREATE INDEX IF NOT EXISTS idx_renewals_renewal_date_risk ON public.renewals(renewal_date, risk_level);

-- PART 2: Create Renewal Risk History Table
CREATE TABLE IF NOT EXISTS public.renewal_risk_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  risk_score INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  calculated_by UUID REFERENCES auth.users(id),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_history_renewal_id ON public.renewal_risk_history(renewal_id);
CREATE INDEX IF NOT EXISTS idx_risk_history_calculated_at ON public.renewal_risk_history(calculated_at DESC);

-- RLS for history table
ALTER TABLE public.renewal_risk_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view risk history for their account renewals" ON public.renewal_risk_history;
CREATE POLICY "Users can view risk history for their account renewals"
  ON public.renewal_risk_history FOR SELECT
  USING (
    renewal_id IN (
      SELECT r.id FROM public.renewals r
      INNER JOIN public.account_memberships am ON am.account_id = r.account_id
      WHERE am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create risk history for their account renewals" ON public.renewal_risk_history;
CREATE POLICY "Users can create risk history for their account renewals"
  ON public.renewal_risk_history FOR INSERT
  WITH CHECK (
    renewal_id IN (
      SELECT r.id FROM public.renewals r
      INNER JOIN public.account_memberships am ON am.account_id = r.account_id
      WHERE am.user_id = auth.uid()
    )
  );

-- PART 3: Create Renewal Campaigns Table
CREATE TABLE IF NOT EXISTS public.renewal_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('standard', 'high_risk', 'loyalty', 'win_back')),
  days_before_renewal INTEGER NOT NULL DEFAULT 90,
  start_date DATE NOT NULL,
  touchpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_touchpoints INTEGER NOT NULL DEFAULT 0,
  completed_touchpoints INTEGER NOT NULL DEFAULT 0,
  personalization JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_renewal_campaigns_renewal_id ON public.renewal_campaigns(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_campaigns_account_id ON public.renewal_campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_renewal_campaigns_status ON public.renewal_campaigns(status);

-- RLS for campaigns
ALTER TABLE public.renewal_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaigns for their accounts" ON public.renewal_campaigns;
CREATE POLICY "Users can view campaigns for their accounts"
  ON public.renewal_campaigns FOR SELECT
  USING (
    account_id IN (
      SELECT account_id FROM public.account_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create campaigns for their accounts" ON public.renewal_campaigns;
CREATE POLICY "Users can create campaigns for their accounts"
  ON public.renewal_campaigns FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update campaigns for their accounts" ON public.renewal_campaigns;
CREATE POLICY "Users can update campaigns for their accounts"
  ON public.renewal_campaigns FOR UPDATE
  USING (
    account_id IN (
      SELECT account_id FROM public.account_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete campaigns for their accounts" ON public.renewal_campaigns;
CREATE POLICY "Users can delete campaigns for their accounts"
  ON public.renewal_campaigns FOR DELETE
  USING (
    account_id IN (
      SELECT account_id FROM public.account_memberships WHERE user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_renewal_campaigns_updated_at ON public.renewal_campaigns;
CREATE TRIGGER update_renewal_campaigns_updated_at
  BEFORE UPDATE ON public.renewal_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();`;

  const copyMigrationSQL = () => {
    navigator.clipboard.writeText(migrationSQL);
    toast.success('Migration SQL copied to clipboard!');
  };

  const allTablesExist = 
    results.renewals?.exists &&
    results.renewal_risk_history?.exists &&
    results.renewal_campaigns?.exists;

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
                      All tables and fields exist. You can use the renewal risk hooks.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                  <div>
                    <p className="font-semibold text-orange-900 dark:text-orange-100">⚠️ Migration Required</p>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Some tables or fields are missing. Run the migration SQL below.
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

        {/* Migration SQL */}
        {!isReady && (
          <Card className="border-orange-200">
            <CardHeader>
              <CardTitle>Migration Required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Step 1:</strong> Copy the migration SQL
                </p>
                <Button onClick={copyMigrationSQL} variant="outline" className="w-full">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Migration SQL to Clipboard
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Step 2:</strong> Run in Supabase
                </p>
                <ol className="text-sm space-y-1 ml-4 list-decimal">
                  <li>Go to Supabase Dashboard → SQL Editor</li>
                  <li>Click "New Query"</li>
                  <li>Paste the SQL you copied</li>
                  <li>Click "Run" (or press Cmd/Ctrl + Enter)</li>
                </ol>
              </div>

              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Step 3:</strong> Verify
                </p>
                <Button onClick={checkSchema} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recheck Schema After Migration
                </Button>
              </div>
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
                <p>Your database schema is ready. You can now:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Use the <code className="bg-muted px-1 py-0.5 rounded">useRenewalRisk</code> hooks</li>
                  <li>Use the <code className="bg-muted px-1 py-0.5 rounded">useRenewalCampaigns</code> hooks</li>
                  <li>Build your DetailRenewalView component</li>
                  <li>Create renewal risk dashboards</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
