/**
 * Comparison Results View
 *
 * Displays comparison results with:
 * - Executive summary
 * - Category tabs (limits, deductibles, dates, forms, premium)
 * - Side-by-side field differences
 * - Severity indicators
 * - Evidence highlighting
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  FileText,
  Minus,
  Plus,
  Download,
  Loader2,
  HelpCircle,
} from "lucide-react";
import {
  useComparisonResult,
  usePolicySnapshots,
  useGenerateReport,
  useTopDifferences,
} from "@/hooks/useComparison";
import type {
  ComparisonResult,
  ComparisonDifference,
  ComparisonCategory,
  Severity,
  ChangeType,
} from "@/types/coverage-comparison";

interface ComparisonResultsViewProps {
  workspaceId: string;
}

const CATEGORY_LABELS: Record<ComparisonCategory, string> = {
  identifiers: "Identifiers",
  limits: "Limits",
  deductibles: "Deductibles",
  dates: "Dates",
  premium: "Premium",
  forms: "Forms",
  vehicles: "Vehicles",
  locations: "Locations",
  other: "Other",
};

const SEVERITY_CONFIG: Record<Severity, { color: string; bgColor: string; icon: typeof AlertTriangle }> = {
  critical: { color: "text-red-700", bgColor: "bg-red-100", icon: AlertTriangle },
  high: { color: "text-orange-700", bgColor: "bg-orange-100", icon: AlertTriangle },
  medium: { color: "text-yellow-700", bgColor: "bg-yellow-100", icon: HelpCircle },
  low: { color: "text-green-700", bgColor: "bg-green-100", icon: CheckCircle },
};

const CHANGE_TYPE_CONFIG: Record<ChangeType, { icon: typeof ArrowUp; label: string; color: string }> = {
  unchanged: { icon: Minus, label: "Unchanged", color: "text-gray-500" },
  increased: { icon: ArrowUp, label: "Increased", color: "text-green-600" },
  decreased: { icon: ArrowDown, label: "Decreased", color: "text-red-600" },
  added: { icon: Plus, label: "Added", color: "text-blue-600" },
  removed: { icon: Minus, label: "Removed", color: "text-red-600" },
  modified: { icon: HelpCircle, label: "Modified", color: "text-yellow-600" },
};

export function ComparisonResultsView({ workspaceId }: ComparisonResultsViewProps) {
  const { data: result, isLoading: resultLoading } = useComparisonResult(workspaceId);
  const { data: snapshots } = usePolicySnapshots(workspaceId);
  const generateReport = useGenerateReport();
  const topDifferences = useTopDifferences(result, 10);

  const [activeCategory, setActiveCategory] = useState<string>("all");

  if (resultLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No comparison results available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const categories = Object.keys(result.differencesByCategory || {}).filter(
    (cat) => (result.differencesByCategory as any)[cat]?.length > 0
  );

  const handleGenerateReport = () => {
    generateReport.mutate({ workspaceId, reportType: "standard" });
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Comparison Results</CardTitle>
              <CardDescription>
                {result.summary?.totalFieldsCompared || 0} fields compared
              </CardDescription>
            </div>
            <Button onClick={handleGenerateReport} disabled={generateReport.isPending}>
              {generateReport.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generate Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Severity Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <SummaryCard
              label="Critical"
              count={result.summary?.criticalCount || 0}
              severity="critical"
            />
            <SummaryCard
              label="High"
              count={result.summary?.highCount || 0}
              severity="high"
            />
            <SummaryCard
              label="Medium"
              count={result.summary?.mediumCount || 0}
              severity="medium"
            />
            <SummaryCard
              label="Low"
              count={result.summary?.lowCount || 0}
              severity="low"
            />
          </div>

          {/* Executive Summary */}
          {result.executive_summary && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
              <h4 className="font-medium text-blue-900 mb-2">Executive Summary</h4>
              <p className="text-sm text-blue-800">{result.executive_summary}</p>
            </div>
          )}

          {/* Document Mismatches Warning */}
          {result.docMismatches && result.docMismatches.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
              <h4 className="font-medium text-amber-900 flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" />
                Document Mismatches
              </h4>
              <ul className="text-sm text-amber-800 space-y-1">
                {result.docMismatches.map((m: any, i: number) => (
                  <li key={i}>
                    <strong>{m.type}:</strong> {m.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="all" className="text-xs">
                All ({result.differences?.length || 0})
              </TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="text-xs">
                  {CATEGORY_LABELS[cat as ComparisonCategory] || cat} (
                  {(result.differencesByCategory as any)[cat]?.length || 0})
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <DifferencesList
                differences={result.differences || []}
                snapshotA={snapshots?.snapshotA}
                snapshotB={snapshots?.snapshotB}
              />
            </TabsContent>

            {categories.map((cat) => (
              <TabsContent key={cat} value={cat} className="mt-4">
                <DifferencesList
                  differences={(result.differencesByCategory as any)[cat] || []}
                  snapshotA={snapshots?.snapshotA}
                  snapshotB={snapshots?.snapshotB}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {result.recommendations && result.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.recommendations.map((rec: string, i: number) => (
                <li
                  key={i}
                  className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm"
                >
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-green-800">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Coverage Gaps */}
      {result.coverageGaps && result.coverageGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Coverage Gaps</CardTitle>
            <CardDescription>
              Coverages present in one document but missing in the other
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.coverageGaps.map((gap: any, i: number) => (
                <li
                  key={i}
                  className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm"
                >
                  <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-orange-800">
                      {gap.coverageType}
                    </span>
                    <span className="text-orange-700"> missing in Document {gap.missingIn}</span>
                    {gap.description && (
                      <p className="text-xs text-orange-600 mt-1">{gap.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SummaryCard({
  label,
  count,
  severity,
}: {
  label: string;
  count: number;
  severity: Severity;
}) {
  const config = SEVERITY_CONFIG[severity];

  return (
    <div className={`rounded-lg p-4 ${config.bgColor}`}>
      <div className={`text-2xl font-bold ${config.color}`}>{count}</div>
      <div className={`text-xs ${config.color}`}>{label}</div>
    </div>
  );
}

function DifferencesList({
  differences,
  snapshotA,
  snapshotB,
}: {
  differences: ComparisonDifference[];
  snapshotA: any;
  snapshotB: any;
}) {
  if (differences.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No differences in this category
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {differences.map((diff, i) => (
          <DifferenceRow key={i} difference={diff} />
        ))}
      </div>
    </ScrollArea>
  );
}

function DifferenceRow({ difference }: { difference: ComparisonDifference }) {
  const severityConfig = SEVERITY_CONFIG[difference.severity];
  const changeConfig = CHANGE_TYPE_CONFIG[difference.changeType];
  const ChangeIcon = changeConfig.icon;
  const SeverityIcon = severityConfig.icon;

  return (
    <div className="flex items-stretch gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
      {/* Severity indicator */}
      <div className={`flex items-center justify-center w-8 rounded ${severityConfig.bgColor}`}>
        <SeverityIcon className={`w-4 h-4 ${severityConfig.color}`} />
      </div>

      {/* Field info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{difference.label}</span>
          <Badge variant="outline" className="text-xs">
            {CATEGORY_LABELS[difference.category]}
          </Badge>
        </div>

        {/* Values comparison */}
        <div className="flex items-center gap-4 mt-2 text-sm">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block">Document A</span>
            <span
              className={`font-mono text-xs ${
                difference.changeType === "removed" ? "line-through text-red-600" : ""
              }`}
            >
              {difference.leftValueRaw || <span className="text-muted-foreground italic">Not found</span>}
            </span>
          </div>

          <ChangeIcon className={`w-4 h-4 flex-shrink-0 ${changeConfig.color}`} />

          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block">Document B</span>
            <span
              className={`font-mono text-xs ${
                difference.changeType === "added" ? "text-blue-600 font-medium" : ""
              }`}
            >
              {difference.rightValueRaw || <span className="text-muted-foreground italic">Not found</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Change type badge */}
      <div className="flex items-center">
        <Badge variant="secondary" className={`text-xs ${changeConfig.color}`}>
          {changeConfig.label}
        </Badge>
      </div>
    </div>
  );
}
