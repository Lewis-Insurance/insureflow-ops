/**
 * Executive Summary Component
 * 
 * Displays a professional executive summary of the comparison
 * with key findings, recommendations, and action items.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ClipboardList,
  ArrowRight,
  Download,
  Printer
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExecutiveSummaryData {
  // Document metadata
  documentA: {
    name: string;
    type: string;
    carrier?: string;
    effectiveDate?: string;
    expirationDate?: string;
  };
  documentB: {
    name: string;
    type: string;
    carrier?: string;
    effectiveDate?: string;
    expirationDate?: string;
  };
  
  // Summary counts
  summary: {
    totalFieldsCompared: number;
    unchangedCount: number;
    increasedCount: number;
    decreasedCount: number;
    addedCount: number;
    removedCount: number;
    criticalCount: number;
    highCount: number;
  };
  
  // Generated content (from LLM based on deterministic diffs)
  executiveSummary: string;
  keyFindings: string[];
  recommendations: string[];
  itemsToVerify?: string[];
  
  // Top changes (sorted by severity)
  topChanges: Array<{
    field: string;
    change: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }>;
  
  // Coverage gaps
  coverageGaps: Array<{
    type: string;
    missingIn: 'A' | 'B';
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
  }>;
}

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData;
  onExportPDF?: () => void;
  onPrint?: () => void;
}

const SEVERITY_BADGES = {
  critical: { color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: AlertTriangle },
  high: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', icon: AlertTriangle },
  medium: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', icon: TrendingDown },
  low: { color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: CheckCircle2 },
};

export function ExecutiveSummary({ data, onExportPDF, onPrint }: ExecutiveSummaryProps) {
  const hasIssues = data.summary.criticalCount > 0 || data.summary.highCount > 0;
  const netChange = data.summary.increasedCount - data.summary.decreasedCount;
  
  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className={cn(
        'border-l-4',
        hasIssues ? 'border-l-amber-500' : 'border-l-green-500'
      )}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5" />
                Policy Comparison Report
              </CardTitle>
              <CardDescription className="mt-1">
                Comparing {data.documentA.name} vs {data.documentB.name}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {onExportPDF && (
                <Button variant="outline" size="sm" onClick={onExportPDF}>
                  <Download className="h-4 w-4 mr-1" />
                  Export PDF
                </Button>
              )}
              {onPrint && (
                <Button variant="outline" size="sm" onClick={onPrint}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Document A */}
            <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">A</Badge>
                <span className="font-semibold">Current Policy</span>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Document:</span> {data.documentA.name}</p>
                {data.documentA.carrier && (
                  <p><span className="text-muted-foreground">Carrier:</span> {data.documentA.carrier}</p>
                )}
                {data.documentA.effectiveDate && data.documentA.expirationDate && (
                  <p><span className="text-muted-foreground">Term:</span> {data.documentA.effectiveDate} - {data.documentA.expirationDate}</p>
                )}
              </div>
            </div>
            
            {/* Document B */}
            <div className="p-4 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">B</Badge>
                <span className="font-semibold">Quote / Proposal</span>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Document:</span> {data.documentB.name}</p>
                {data.documentB.carrier && (
                  <p><span className="text-muted-foreground">Carrier:</span> {data.documentB.carrier}</p>
                )}
                {data.documentB.effectiveDate && data.documentB.expirationDate && (
                  <p><span className="text-muted-foreground">Term:</span> {data.documentB.effectiveDate} - {data.documentB.expirationDate}</p>
                )}
              </div>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{data.summary.totalFieldsCompared}</p>
              <p className="text-xs text-muted-foreground">Fields Compared</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
              <p className="text-2xl font-bold text-green-600">{data.summary.unchangedCount}</p>
              <p className="text-xs text-muted-foreground">Unchanged</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
              <p className="text-2xl font-bold text-amber-600">{data.summary.highCount}</p>
              <p className="text-xs text-muted-foreground">High Priority</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
              <p className="text-2xl font-bold text-red-600">{data.summary.criticalCount}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Executive Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{data.executiveSummary}</p>
          
          {/* Net Coverage Trend */}
          <div className={cn(
            'mt-4 p-3 rounded-lg flex items-center gap-3',
            netChange > 0 ? 'bg-green-50 dark:bg-green-950/30' : 
            netChange < 0 ? 'bg-red-50 dark:bg-red-950/30' : 
            'bg-gray-50 dark:bg-gray-950/30'
          )}>
            {netChange > 0 ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : netChange < 0 ? (
              <TrendingDown className="h-5 w-5 text-red-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-gray-600" />
            )}
            <span className="text-sm">
              {netChange > 0 ? (
                <span>Net improvement: <strong>{netChange}</strong> coverage items increased</span>
              ) : netChange < 0 ? (
                <span>Attention needed: <strong>{Math.abs(netChange)}</strong> coverage items decreased</span>
              ) : (
                <span>Coverage levels are comparable between documents</span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Key Findings & Top Changes */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Key Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.keyFindings.map((finding, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <ArrowRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                  <span className="text-sm">{finding}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Top Changes by Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.topChanges.slice(0, 5).map((change, idx) => {
                const config = SEVERITY_BADGES[change.severity];
                return (
                  <li key={idx} className="flex items-start gap-2">
                    <Badge className={cn('mt-0.5 flex-shrink-0', config.color)}>
                      {change.severity}
                    </Badge>
                    <div className="text-sm">
                      <span className="font-medium">{change.field}:</span>{' '}
                      <span className="text-muted-foreground">{change.change}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {data.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="text-sm">{rec}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Coverage Gaps */}
      {data.coverageGaps.length > 0 && (
        <Card className="border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Coverage Gaps Identified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.coverageGaps.map((gap, idx) => {
                const config = SEVERITY_BADGES[gap.severity];
                return (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20">
                    <Badge className={config.color}>{gap.severity}</Badge>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{gap.type}</p>
                      <p className="text-sm text-muted-foreground">{gap.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Missing in Document {gap.missingIn}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items to Verify */}
      {data.itemsToVerify && data.itemsToVerify.length > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Items Requiring Verification
            </CardTitle>
            <CardDescription>
              These items have low confidence or conflicts and should be verified manually
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.itemsToVerify.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ExecutiveSummary;

