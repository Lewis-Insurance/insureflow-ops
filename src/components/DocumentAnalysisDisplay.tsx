import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDocumentAnalysisByDocumentId } from '@/hooks/useDocumentAnalysis';
import { Loader2, FileText, Building2, Calendar, DollarSign, Shield, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DocumentAnalysisDisplayProps {
  documentId: string;
}

export const DocumentAnalysisDisplay = ({ documentId }: DocumentAnalysisDisplayProps) => {
  const { data: analysis, isLoading, error } = useDocumentAnalysisByDocumentId(documentId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading analysis...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (analysis?.processing_status === 'pending' || analysis?.processing_status === 'processing') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
            <p className="text-sm font-medium text-blue-600">Processing Document</p>
            <p className="text-xs text-muted-foreground mt-1">
              {analysis.processing_status === 'pending' ? 'Waiting to start...' : 'Extracting and analyzing...'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This may take 30-60 seconds for large documents
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load analysis: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No analysis available for this document.
        </CardContent>
      </Card>
    );
  }

  if (analysis.processing_status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Analysis failed: {analysis.error_message || 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Policy Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Policy Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis.carrier_name && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">Carrier:</span>
              <span>{analysis.carrier_name}</span>
            </div>
          )}
          
          {analysis.policy_number && (
            <div>
              <span className="font-semibold">Policy #:</span> {analysis.policy_number}
            </div>
          )}
          
          {analysis.insured_name && (
            <div>
              <span className="font-semibold">Insured:</span> {analysis.insured_name}
            </div>
          )}
          
          {analysis.policy_type && (
            <div>
              <Badge variant="secondary">{analysis.policy_type}</Badge>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-2">
            {analysis.effective_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Effective</div>
                  <div className="text-sm font-medium">
                    {format(new Date(analysis.effective_date), 'MM/dd/yyyy')}
                  </div>
                </div>
              </div>
            )}
            
            {analysis.expiration_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Expires</div>
                  <div className="text-sm font-medium">
                    {format(new Date(analysis.expiration_date), 'MM/dd/yyyy')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {analysis.total_premium && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">Premium:</span>
              <span className="text-lg">${analysis.total_premium.toLocaleString()}</span>
              {analysis.payment_frequency && (
                <span className="text-sm text-muted-foreground">
                  ({analysis.payment_frequency})
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coverage Details */}
      {analysis.coverages && Array.isArray(analysis.coverages) && analysis.coverages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Coverage Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(analysis.coverages || []).map((coverage: any, index: number) => (
                <div key={index} className="flex justify-between items-start border-b pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{coverage.type}</div>
                    <div className="text-sm text-muted-foreground">
                      Limit: {coverage.limit}
                      {coverage.deductible && ` • Deductible: ${coverage.deductible}`}
                    </div>
                  </div>
                  {coverage.premium && (
                    <div className="text-right">
                      <div className="font-medium">${coverage.premium}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insured Items */}
      {analysis.insured_items && Array.isArray(analysis.insured_items) && analysis.insured_items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Insured Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(analysis.insured_items || []).map((item: any, index: number) => (
                <div key={index} className="p-3 border rounded-lg">
                  {item.type === 'vehicle' && (
                    <div>
                      <div className="font-medium">
                        {item.year} {item.make} {item.model}
                      </div>
                      {item.vin && (
                        <div className="text-sm text-muted-foreground">VIN: {item.vin}</div>
                      )}
                    </div>
                  )}
                  {item.type === 'property' && item.address && (
                    <div>
                      <div className="font-medium">Property</div>
                      <div className="text-sm text-muted-foreground">{item.address}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confidence Score */}
      <div className="text-xs text-muted-foreground text-right">
        Confidence: {analysis.confidence_score}%
      </div>
    </div>
  );
};
