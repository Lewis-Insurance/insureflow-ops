import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  FileText, 
  Calendar, 
  DollarSign, 
  Shield, 
  ChevronDown,
  Car,
  Home,
  List
} from 'lucide-react';
import { DocumentChatInterface } from './DocumentChatInterface';

interface AnalysisResult {
  document_type?: string;
  carrier?: string;
  policy_number?: string;
  insured_name?: string;
  effective_date?: string;
  expiration_date?: string;
  premium?: {
    total?: number;
    frequency?: string;
  };
  coverages?: Array<{
    type: string;
    limit?: string;
    deductible?: string;
  }>;
  vehicles?: Array<{
    year?: string;
    make?: string;
    model?: string;
    vin?: string;
  }>;
  property?: {
    address?: string;
    type?: string;
  };
  key_details?: string[];
}

interface DocumentAnalysisDisplayProps {
  analysisResult: AnalysisResult;
  ocrText: string;
  fileName: string;
}

export const DocumentAnalysisDisplay: React.FC<DocumentAnalysisDisplayProps> = ({
  analysisResult,
  ocrText,
  fileName
}) => {
  const [isOcrExpanded, setIsOcrExpanded] = useState(false);

  return (
    <div className="space-y-6">
      {/* Main Analysis Results */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Document Overview */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {analysisResult.document_type && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">Document Type</span>
                </div>
                <Badge variant="secondary" className="text-base">
                  {analysisResult.document_type.replace(/_/g, ' ').toUpperCase()}
                </Badge>
              </div>
            )}

            {analysisResult.carrier && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">Carrier</span>
                </div>
                <p className="text-lg font-medium">{analysisResult.carrier}</p>
              </div>
            )}

            {analysisResult.policy_number && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">Policy Number</span>
                </div>
                <p className="text-lg font-mono">{analysisResult.policy_number}</p>
              </div>
            )}

            {analysisResult.insured_name && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">Insured Name</span>
                </div>
                <p className="text-lg">{analysisResult.insured_name}</p>
              </div>
            )}

            {analysisResult.effective_date && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Effective Date</span>
                </div>
                <p className="text-lg">{analysisResult.effective_date}</p>
              </div>
            )}

            {analysisResult.expiration_date && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Expiration Date</span>
                </div>
                <p className="text-lg">{analysisResult.expiration_date}</p>
              </div>
            )}
          </div>

          {/* Premium Information */}
          {analysisResult.premium && (analysisResult.premium.total || analysisResult.premium.frequency) && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Premium Information
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {analysisResult.premium.total && (
                  <div>
                    <p className="text-sm text-muted-foreground">Total Premium</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${analysisResult.premium.total.toLocaleString()}
                    </p>
                  </div>
                )}
                {analysisResult.premium.frequency && (
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Frequency</p>
                    <p className="text-lg capitalize">{analysisResult.premium.frequency}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coverages */}
          {analysisResult.coverages && analysisResult.coverages.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Coverage Details
              </h3>
              <div className="space-y-2">
                {analysisResult.coverages.map((coverage, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-muted/50">
                    <p className="font-medium">{coverage.type}</p>
                    <div className="text-sm text-muted-foreground mt-1 space-x-4">
                      {coverage.limit && <span>Limit: {coverage.limit}</span>}
                      {coverage.deductible && <span>Deductible: {coverage.deductible}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicles */}
          {analysisResult.vehicles && analysisResult.vehicles.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Car className="h-5 w-5" />
                Vehicles
              </h3>
              <div className="space-y-2">
                {analysisResult.vehicles.map((vehicle, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-muted/50">
                    <p className="font-medium">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </p>
                    {vehicle.vin && (
                      <p className="text-sm text-muted-foreground font-mono mt-1">VIN: {vehicle.vin}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Property */}
          {analysisResult.property && (analysisResult.property.address || analysisResult.property.type) && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Home className="h-5 w-5" />
                Property Information
              </h3>
              <div className="p-3 border rounded-lg bg-muted/50">
                {analysisResult.property.address && (
                  <p className="font-medium">{analysisResult.property.address}</p>
                )}
                {analysisResult.property.type && (
                  <p className="text-sm text-muted-foreground mt-1">Type: {analysisResult.property.type}</p>
                )}
              </div>
            </div>
          )}

          {/* Key Details */}
          {analysisResult.key_details && analysisResult.key_details.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <List className="h-5 w-5" />
                Key Details
              </h3>
              <ul className="space-y-2">
                {analysisResult.key_details.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OCR Text (Collapsible) */}
      {ocrText && (
        <Card>
          <Collapsible open={isOcrExpanded} onOpenChange={setIsOcrExpanded}>
            <CardHeader>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                  <CardTitle>Extracted Text (OCR)</CardTitle>
                  <ChevronDown className={`h-5 w-5 transition-transform ${isOcrExpanded ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <div className="max-h-96 overflow-y-auto p-4 bg-muted rounded-lg">
                  <pre className="text-xs whitespace-pre-wrap font-mono">{ocrText}</pre>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Chat Interface */}
      {ocrText && (
        <DocumentChatInterface
          documentContext={ocrText}
          documentName={fileName}
        />
      )}
    </div>
  );
};
