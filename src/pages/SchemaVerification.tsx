import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useTableExists, useTableColumns } from '@/hooks/useSchemaValidator';
import { AppLayout } from '@/components/layout/AppLayout';
import { SCHEMA_REQUIREMENTS } from '@/config/schemaRequirements';
import { SchemaTestRunner } from '@/components/renewals/SchemaTestRunner';

const SchemaVerification = () => {
  const requiredTables = Object.entries(SCHEMA_REQUIREMENTS)
    .filter(([_, config]) => config.required)
    .map(([name, config]) => ({
      name,
      description: config.description
    }));

  const requiredRenewalFields = SCHEMA_REQUIREMENTS.renewals.columns.filter(col => 
    col.includes('risk_') || 
    col.includes('_contact') || 
    col.includes('engagement') || 
    col.includes('sentiment') ||
    col.includes('has_') ||
    col.includes('competitor_') ||
    col.includes('satisfaction')
  );

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Database Schema Verification</h1>
          <p className="text-muted-foreground mt-2">
            Verify that all required tables and columns exist for the renewal risk system
          </p>
        </div>

        {/* Automated Test Runner */}
        <SchemaTestRunner />

        {/* Tables Verification */}
        <Card>
          <CardHeader>
            <CardTitle>Required Tables</CardTitle>
            <CardDescription>
              Checking for existence of all required database tables
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requiredTables.map((table) => (
                <TableVerificationRow 
                  key={table.name} 
                  tableName={table.name}
                  description={table.description}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Renewals Table Fields */}
        <Card>
          <CardHeader>
            <CardTitle>Renewals Table Risk Fields</CardTitle>
            <CardDescription>
              Verifying that the renewals table has all required risk scoring fields
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RenewalsFieldsVerification requiredFields={requiredRenewalFields} />
          </CardContent>
        </Card>

        {/* Instructions */}
        <Alert>
          <AlertDescription>
            <strong>Note:</strong> If any tables or fields are missing, you need to run the database migration. 
            The migration has already been created and should be applied automatically.
          </AlertDescription>
        </Alert>
      </div>
    </AppLayout>
  );
};

const TableVerificationRow = ({ 
  tableName, 
  description 
}: { 
  tableName: string; 
  description: string;
}) => {
  const { data: exists, isLoading } = useTableExists(tableName);

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
            {tableName}
          </code>
          <span className="text-sm text-muted-foreground">{description}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : exists ? (
          <>
            <CheckCircle className="h-5 w-5 text-green-600" />
            <Badge variant="secondary">Exists</Badge>
          </>
        ) : (
          <>
            <XCircle className="h-5 w-5 text-destructive" />
            <Badge variant="destructive">Missing</Badge>
          </>
        )}
      </div>
    </div>
  );
};

const RenewalsFieldsVerification = ({ 
  requiredFields 
}: { 
  requiredFields: string[];
}) => {
  const { data: columns, isLoading } = useTableColumns('renewals');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!columns || columns.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not fetch renewals table columns. The table may not exist or you may not have access.
        </AlertDescription>
      </Alert>
    );
  }

  const missingFields = requiredFields.filter(field => !columns.includes(field));
  const presentFields = requiredFields.filter(field => columns.includes(field));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{presentFields.length}</div>
          <div className="text-sm text-muted-foreground">Present</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-destructive">{missingFields.length}</div>
          <div className="text-sm text-muted-foreground">Missing</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{columns.length}</div>
          <div className="text-sm text-muted-foreground">Total Columns</div>
        </div>
      </div>

      {/* Fields List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {requiredFields.map((field) => {
          const exists = columns.includes(field);
          return (
            <div 
              key={field}
              className={`flex items-center justify-between p-3 border rounded ${
                exists ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <code className="text-sm font-mono">{field}</code>
              {exists ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
          );
        })}
      </div>

      {/* All Available Columns */}
      <details className="mt-4">
        <summary className="cursor-pointer font-medium">
          Show all {columns.length} columns in renewals table
        </summary>
        <div className="mt-2 p-4 bg-muted rounded-lg">
          <div className="flex flex-wrap gap-2">
            {columns.map((col) => (
              <Badge key={col} variant="outline">
                {col}
              </Badge>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
};

export default SchemaVerification;
