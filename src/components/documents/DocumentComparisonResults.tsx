import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign,
  Shield,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

interface DocumentComparisonResultsProps {
  comparisonData: any;
}

export const DocumentComparisonResults: React.FC<DocumentComparisonResultsProps> = ({
  comparisonData
}) => {
  if (!comparisonData?.documents || comparisonData.documents.length < 2) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No comparison data available
        </CardContent>
      </Card>
    );
  }

  const documents = comparisonData.documents;

  const parsedDocs = documents.map((doc: any) => ({
    label: doc.label,
    data: doc.analysis?.data || doc.analysis?.analysis?.parsed_data || {}
  }));

  const allCoverageTypes = new Set<string>();
  parsedDocs.forEach(doc => {
    doc.data.coverages?.forEach((cov: any) => {
      allCoverageTypes.add(cov.type);
    });
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-medium">Field</th>
                  {parsedDocs.map((doc: any, idx: number) => (
                    <th key={idx} className="text-left py-2 px-4 font-medium">
                      {doc.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Carrier</td>
                  {parsedDocs.map((doc: any, idx: number) => (
                    <td key={idx} className="py-3 px-4 text-sm">
                      {doc.data.carrier_name || 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Policy Number</td>
                  {parsedDocs.map((doc: any, idx: number) => (
                    <td key={idx} className="py-3 px-4 text-sm font-mono">
                      {doc.data.policy_number || 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Effective Date</td>
                  {parsedDocs.map((doc: any, idx: number) => (
                    <td key={idx} className="py-3 px-4 text-sm">
                      {doc.data.effective_date || 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Expiration Date</td>
                  {parsedDocs.map((doc: any, idx: number) => (
                    <td key={idx} className="py-3 px-4 text-sm">
                      {doc.data.expiration_date || 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr className="border-b bg-green-50 dark:bg-green-950/20">
                  <td className="py-3 px-4 text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      Total Premium
                    </div>
                  </td>
                  {parsedDocs.map((doc: any, idx: number) => (
                    <td key={idx} className="py-3 px-4">
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        ${doc.data.total_premium?.toLocaleString() || 'N/A'}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Coverage Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from(allCoverageTypes).map((coverageType) => (
              <div key={coverageType} className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">{coverageType}</h4>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${parsedDocs.length}, 1fr)` }}>
                  {parsedDocs.map((doc: any, idx: number) => {
                    const coverage = doc.data.coverages?.find((c: any) => c.type === coverageType);
                    return (
                      <div key={idx} className="p-3 border rounded bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-1">{doc.label}</p>
                        {coverage ? (
                          <div className="space-y-1">
                            {coverage.limit && (
                              <p className="text-sm">
                                <span className="font-medium">Limit:</span> {coverage.limit}
                              </p>
                            )}
                            {coverage.deductible && (
                              <p className="text-sm">
                                <span className="font-medium">Deductible:</span> {coverage.deductible}
                              </p>
                            )}
                            {coverage.premium && (
                              <p className="text-sm font-semibold text-green-600">
                                ${coverage.premium}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm">Not Covered</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Coverage Gaps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {parsedDocs.map((doc: any, idx: number) => {
              const missingCoverages = Array.from(allCoverageTypes).filter(
                (type) => !doc.data.coverages?.some((c: any) => c.type === type)
              );

              if (missingCoverages.length === 0) {
                return (
                  <div key={idx} className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-medium">{doc.label}</span>
                    <span className="text-sm text-muted-foreground">- No coverage gaps</span>
                  </div>
                );
              }

              return (
                <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <span className="font-medium">{doc.label}</span>
                  </div>
                  <div className="ml-7 space-y-1">
                    <p className="text-sm text-muted-foreground">Missing coverages:</p>
                    <ul className="text-sm space-y-1">
                      {missingCoverages.map((coverage, covIdx) => (
                        <li key={covIdx} className="text-amber-700 dark:text-amber-400">
                          • {coverage}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {parsedDocs.some((doc: any) => doc.data.total_premium) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Price Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {parsedDocs.map((doc: any, idx: number) => {
                if (!doc.data.total_premium) return null;

                const premiums = parsedDocs
                  .map((d: any) => d.data.total_premium)
                  .filter((p: any) => p != null);
                
                const minPremium = Math.min(...premiums);
                const isLowest = doc.data.total_premium === minPremium;

                return (
                  <div key={idx} className={`p-4 rounded-lg border-2 ${isLowest ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{doc.label}</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          ${doc.data.total_premium.toLocaleString()}
                        </p>
                      </div>
                      {isLowest && (
                        <Badge variant="default" className="bg-green-600">
                          Lowest Price
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
