import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/cc/Chip';
import {
  readExtractSnapshot,
  maskSnapshotForDisplay,
  type ExtractSnapshotV1,
} from '@/lib/extractSnapshot';

export interface DocumentAnalysisDisplayResult {
  analysis_id: string;
  ocr_text: string;
  snapshot: ExtractSnapshotV1;
  total_pages: number;
  pages_analyzed: string;
  focus_region: string;
}

const FEE_TYPE_LABELS: Record<string, string> = {
  tax: 'Tax',
  broker: 'Broker fee',
  surplus_lines: 'Surplus lines',
  nima: 'NIMA',
  other: 'Other fee',
};

function formatCurrency(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatBooleanLabel(value: boolean | null, yesLabel: string, noLabel: string): string | null {
  if (value === null) return null;
  return value ? yesLabel : noLabel;
}

function parseTotalPagesFromAnalyzed(pagesAnalyzed: string | null | undefined): number {
  if (!pagesAnalyzed) return 0;
  const rangeMatch = pagesAnalyzed.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return parseInt(rangeMatch[2], 10);
  const singleMatch = pagesAnalyzed.match(/^\d+$/);
  if (singleMatch) return parseInt(pagesAnalyzed, 10);
  return 0;
}

type DocumentAnalysisRecord = {
  id: string;
  analysis_result?: unknown;
  extracted_data?: unknown;
  ai_analysis?: unknown;
  ocr_text?: string | null;
  raw_ocr_text?: string | null;
  pages_analyzed?: string | null;
  total_pages?: number | null;
};

export function documentAnalysisRecordToDisplayResult(
  data: DocumentAnalysisRecord,
  focusRegion = 'all',
): DocumentAnalysisDisplayResult {
  const rawSnapshot = data.analysis_result ?? data.extracted_data ?? data.ai_analysis;
  const snapshot = maskSnapshotForDisplay(readExtractSnapshot(rawSnapshot));
  const ocrText = data.ocr_text ?? data.raw_ocr_text ?? '';
  const pagesAnalyzed = data.pages_analyzed ?? '1';
  const totalPages =
    data.total_pages ?? parseTotalPagesFromAnalyzed(pagesAnalyzed) ?? 0;

  return {
    analysis_id: data.id,
    ocr_text: ocrText,
    snapshot,
    total_pages: totalPages,
    pages_analyzed: pagesAnalyzed,
    focus_region: focusRegion,
  };
}

interface DocumentAnalysisResultsProps {
  result: DocumentAnalysisDisplayResult;
  onAnalyzeAnother?: () => void;
}

export function DocumentAnalysisResults({ result, onAnalyzeAnother }: DocumentAnalysisResultsProps) {
  const [showOcrText, setShowOcrText] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const snapshot = result.snapshot;

  return (
    <div className="space-y-4">
      <Card className="border-cc-border bg-cc-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-cc-text">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Analysis Complete
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-cc-text-muted">Total Pages</p>
              <p className="font-semibold text-lg cc-num text-cc-text">{result.total_pages}</p>
            </div>
            <div>
              <p className="text-cc-text-muted">Pages Analyzed</p>
              <p className="font-semibold text-lg cc-num text-cc-text">{result.pages_analyzed}</p>
            </div>
            <div>
              <p className="text-cc-text-muted">Focus Region</p>
              <p className="font-semibold text-lg capitalize text-cc-text">{result.focus_region}</p>
            </div>
            <div>
              <p className="text-cc-text-muted">Characters Extracted</p>
              <p className="font-semibold text-lg cc-num text-cc-text">
                {result.ocr_text.length.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-cc-border bg-cc-surface">
        <CardHeader>
          <CardTitle className="text-cc-text">Extracted Insurance Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(snapshot.policy_number || snapshot.insured_name || snapshot.carriers.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-cc-lg bg-cc-surface-overlay">
              {snapshot.policy_number && (
                <div>
                  <p className="text-sm text-cc-text-muted">Policy Number</p>
                  <p className="font-semibold text-cc-text">{snapshot.policy_number}</p>
                </div>
              )}
              {snapshot.insured_name && (
                <div>
                  <p className="text-sm text-cc-text-muted">Insured</p>
                  <p className="font-semibold text-cc-text">{snapshot.insured_name}</p>
                </div>
              )}
              {snapshot.document_type && (
                <div>
                  <p className="text-sm text-cc-text-muted">Document Type</p>
                  <p className="font-semibold capitalize text-cc-text">
                    {snapshot.document_type.replace(/_/g, ' ')}
                  </p>
                </div>
              )}
              {snapshot.carriers.length > 0 && (
                <div className="md:col-span-2">
                  <p className="text-sm text-cc-text-muted mb-2">Carriers</p>
                  <div className="flex flex-wrap gap-2">
                    {snapshot.carriers.map((carrier) => (
                      <Chip key={carrier}>{carrier}</Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(snapshot.effective_date || snapshot.expiration_date) && (
            <div className="grid grid-cols-2 gap-4 p-4 rounded-cc-lg border border-cc-border">
              {snapshot.effective_date && (
                <div>
                  <p className="text-sm text-cc-text-muted">Effective Date</p>
                  <p className="font-semibold text-cc-text">{snapshot.effective_date}</p>
                </div>
              )}
              {snapshot.expiration_date && (
                <div>
                  <p className="text-sm text-cc-text-muted">Expiration Date</p>
                  <p className="font-semibold text-cc-text">{snapshot.expiration_date}</p>
                </div>
              )}
            </div>
          )}

          {(snapshot.claims_made !== null || snapshot.defense_inside_limits !== null) && (
            <div className="flex flex-wrap gap-2">
              {formatBooleanLabel(snapshot.claims_made, 'Claims-made', 'Occurrence') && (
                <Chip>{formatBooleanLabel(snapshot.claims_made, 'Claims-made', 'Occurrence')}</Chip>
              )}
              {formatBooleanLabel(
                snapshot.defense_inside_limits,
                'Defense inside limits',
                'Defense outside limits',
              ) && (
                <Chip>
                  {formatBooleanLabel(
                    snapshot.defense_inside_limits,
                    'Defense inside limits',
                    'Defense outside limits',
                  )}
                </Chip>
              )}
            </div>
          )}

          {snapshot.premium.total !== null && (
            <div className="p-4 rounded-cc-lg bg-cc-surface-overlay">
              <p className="text-sm text-cc-text-muted">Total Premium</p>
              <p className="text-2xl font-bold cc-num text-cc-text">
                {formatCurrency(snapshot.premium.total)}
                {snapshot.premium.frequency && (
                  <span className="text-sm font-normal text-cc-text-muted ml-2">
                    / {snapshot.premium.frequency}
                  </span>
                )}
              </p>
            </div>
          )}

          {snapshot.fees.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-cc-text">Fees</h4>
              <div className="space-y-2">
                {snapshot.fees.map((fee, index) => (
                  <div
                    key={`${fee.type}-${index}`}
                    className="flex justify-between items-center p-3 rounded-cc-lg border border-cc-border"
                  >
                    <span className="text-cc-text-secondary">
                      {fee.label ?? FEE_TYPE_LABELS[fee.type] ?? fee.type}
                    </span>
                    <span className="font-semibold cc-num text-cc-text">
                      {formatCurrency(fee.amount) ?? '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {snapshot.commission && (snapshot.commission.percent !== null || snapshot.commission.amount !== null) && (
            <div className="p-4 rounded-cc-lg border border-cc-border">
              <p className="text-sm text-cc-text-muted mb-1">Commission</p>
              <div className="flex gap-6 text-cc-text">
                {snapshot.commission.percent !== null && (
                  <span className="cc-num font-semibold">{snapshot.commission.percent}%</span>
                )}
                {snapshot.commission.amount !== null && (
                  <span className="cc-num font-semibold">{formatCurrency(snapshot.commission.amount)}</span>
                )}
              </div>
            </div>
          )}

          {snapshot.coverages.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-cc-text">Coverages</h4>
              <div className="space-y-2">
                {snapshot.coverages.map((coverage, index) => (
                  <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <p className="font-medium text-cc-text">{coverage.name}</p>
                        {coverage.parent_coverage && (
                          <p className="text-xs text-cc-text-muted mt-0.5">
                            Included in {coverage.parent_coverage}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-1 text-sm text-cc-text-muted">
                          {coverage.limit && <span>Limit: {coverage.limit}</span>}
                          {coverage.deductible && <span>Deductible: {coverage.deductible}</span>}
                        </div>
                      </div>
                      {coverage.premium !== null && coverage.premium !== undefined && (
                        <p className="font-semibold cc-num text-cc-text shrink-0">
                          {typeof coverage.premium === 'number'
                            ? formatCurrency(coverage.premium)
                            : coverage.premium}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {snapshot.locations.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-cc-text">Locations</h4>
              <div className="space-y-2">
                {snapshot.locations.map((location, index) => (
                  <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                    {location.address && (
                      <p className="font-medium text-cc-text">{location.address}</p>
                    )}
                    {location.occupancy && (
                      <p className="text-sm text-cc-text-muted capitalize">{location.occupancy}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {snapshot.vehicles.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-cc-text">Vehicles</h4>
              <div className="space-y-2">
                {snapshot.vehicles.map((vehicle, index) => (
                  <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                    <p className="font-medium text-cc-text">
                      {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                    </p>
                    {vehicle.vin && (
                      <p className="text-sm text-cc-text-muted">VIN: {vehicle.vin}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {snapshot.drivers.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-cc-text">Drivers</h4>
              <div className="space-y-2">
                {snapshot.drivers.map((driver, index) => (
                  <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                    {driver.name && <p className="font-medium text-cc-text">{driver.name}</p>}
                    <div className="flex flex-wrap gap-4 mt-1 text-sm text-cc-text-muted">
                      {driver.date_of_birth && <span>DOB: {driver.date_of_birth}</span>}
                      {driver.license_number && (
                        <span>
                          License: {driver.license_number}
                          {driver.license_state ? ` (${driver.license_state})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {snapshot.key_details.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-cc-text">Key Details</h4>
              <ul className="space-y-1 text-sm">
                {snapshot.key_details.map((detail, index) => (
                  <li key={index} className="flex items-start gap-2 text-cc-text-secondary">
                    <span className="text-cc-text-muted">-</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-cc-border bg-cc-surface">
        <CardHeader
          className="cursor-pointer hover:bg-cc-surface-overlay transition-colors"
          onClick={() => setShowOcrText(!showOcrText)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-cc-text">
              <FileText className="h-5 w-5" />
              Extracted Text (OCR)
              <span className="text-sm font-normal text-cc-text-muted">
                - {result.ocr_text.length.toLocaleString()} characters
              </span>
            </CardTitle>
            {showOcrText ? <ChevronUp /> : <ChevronDown />}
          </div>
        </CardHeader>
        {showOcrText && (
          <CardContent>
            <pre className="text-xs p-4 rounded-cc-lg bg-cc-surface-overlay overflow-auto max-h-96 whitespace-pre-wrap text-cc-text-secondary">
              {result.ocr_text}
            </pre>
          </CardContent>
        )}
      </Card>

      <Card className="border-cc-border bg-cc-surface">
        <CardHeader
          className="cursor-pointer hover:bg-cc-surface-overlay transition-colors"
          onClick={() => setShowRawJson(!showRawJson)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-cc-text">Debug: Raw Analysis Data</CardTitle>
            {showRawJson ? <ChevronUp /> : <ChevronDown />}
          </div>
        </CardHeader>
        {showRawJson && (
          <CardContent>
            <pre className="text-xs p-4 rounded-cc-lg bg-cc-surface-overlay overflow-auto max-h-96 text-cc-text-secondary">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        )}
      </Card>

      {onAnalyzeAnother ? (
        <Button onClick={onAnalyzeAnother} variant="outline" className="w-full">
          Analyze Another Document
        </Button>
      ) : (
        <Button asChild variant="outline" className="w-full">
          <Link to="/analyze-documents">Analyze Another Document</Link>
        </Button>
      )}
    </div>
  );
}
