/**
 * AI Results Display Component
 * 
 * Renders AI module execution results based on the output_config format.
 * Supports:
 * - structured: JSON sections as cards/tables
 * - markdown: Rendered markdown with syntax highlighting
 * - chat: Conversational format with citations
 * - html: Raw HTML output (for proposals)
 */

import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Copy,
  Download,
  Mail,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Edit,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { AIModuleOutputConfig } from '@/integrations/supabase/hooks/useAIModules';

interface AIResultsDisplayProps {
  result: Record<string, unknown>;
  outputConfig: AIModuleOutputConfig;
  emailDraft?: {
    subject: string;
    body: string;
  } | null;
  reportHtml?: string | null;
  className?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format a snake_case or camelCase section title to Title Case
 */
function formatSectionTitle(section: string): string {
  return section
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Format a primitive value for display
 * - Booleans become Yes/No
 * - Large numbers get $ prefix and commas
 * - Money strings get formatted
 * - Dates are preserved
 */
function formatPrimitiveValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (typeof value === 'number') {
    // Negative numbers (likely adjustments)
    if (value < 0) return `-$${Math.abs(value).toLocaleString()}`;
    // Large numbers likely money
    if (Math.abs(value) >= 100 && Number.isInteger(value)) {
      return `$${value.toLocaleString()}`;
    }
    // Decimals that look like rates
    if (value < 1 && value > 0) {
      return `${(value * 100).toFixed(2)}%`;
    }
    return value.toLocaleString();
  }

  if (typeof value === 'string') {
    // Date patterns
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value) || /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value;
    }
    // Money string patterns like "$7,338.00" or "7338"
    if (/^\$?[\d,]+\.?\d*$/.test(value) && value.length < 20) {
      const cleaned = value.replace(/[$,]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num >= 100) {
        return `$${num.toLocaleString()}`;
      }
    }
    return value;
  }

  return String(value);
}

/**
 * Check if a value is a plain object (not array, not null)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if all items in an array are objects
 */
function isArrayOfObjects(arr: unknown[]): arr is Array<Record<string, unknown>> {
  return arr.length > 0 && arr.every(item => isPlainObject(item));
}

/**
 * Check if all items in an array are primitives (string, number, boolean)
 */
function isArrayOfPrimitives(arr: unknown[]): boolean {
  return arr.every(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean');
}

/**
 * Extract JSON from markdown code blocks like ```json {...} ```
 */
function extractJsonFromMarkdown(text: string): Record<string, unknown> | null {
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch (e) {
      // Not valid JSON
    }
  }
  return null;
}

// ============================================================================
// UNIVERSAL VALUE RENDERER - The key to proper display
// ============================================================================

interface UniversalValueRendererProps {
  value: unknown;
  depth?: number;
}

/**
 * Recursively renders any value with appropriate formatting:
 * - Primitives: formatted text
 * - Arrays of primitives: bullet list
 * - Arrays of objects: table
 * - Objects: key-value grid or nested card
 */
function UniversalValueRenderer({ value, depth = 0 }: UniversalValueRendererProps) {
  // Null/undefined
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  // Boolean
  if (typeof value === 'boolean') {
    return (
      <Badge variant={value ? 'default' : 'outline'} className={value ? 'bg-green-500/20 text-green-600' : ''}>
        {value ? 'Yes' : 'No'}
      </Badge>
    );
  }

  // Number
  if (typeof value === 'number') {
    return <span className="font-medium">{formatPrimitiveValue(value)}</span>;
  }

  // String
  if (typeof value === 'string') {
    // Long strings get different treatment
    if (value.length > 200) {
      return <p className="text-muted-foreground whitespace-pre-wrap">{value}</p>;
    }
    return <span className="font-medium">{formatPrimitiveValue(value)}</span>;
  }

  // Array handling
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic">None</span>;
    }

    // Array of primitives → bullet list
    if (isArrayOfPrimitives(value)) {
      return (
        <ul className="space-y-1">
          {value.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>{formatPrimitiveValue(item)}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Array of objects → table
    if (isArrayOfObjects(value)) {
      return <SmartTableDisplay data={value} />;
    }

    // Mixed array → render each item
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="pl-2 border-l-2 border-muted">
            <UniversalValueRenderer value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  // Object handling
  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return <span className="text-muted-foreground italic">Empty</span>;
    }

    // Check if this object has mostly primitive values (good for a grid)
    const primitiveCount = entries.filter(([, v]) =>
      typeof v !== 'object' || v === null
    ).length;
    const isPrimitiveMostly = primitiveCount >= entries.length * 0.7;

    // At depth 0 or 1 with mostly primitives → grid display
    if (depth < 2 && isPrimitiveMostly) {
      return <SmartObjectGrid data={value} depth={depth} />;
    }

    // Deeper nesting or complex objects → compact card
    return <CompactObjectCard data={value} depth={depth} />;
  }

  // Fallback for unknown types
  return <span className="text-muted-foreground">{String(value)}</span>;
}

// ============================================================================
// SMART DISPLAY COMPONENTS
// ============================================================================

/**
 * Renders an object as a responsive grid of key-value pairs
 */
function SmartObjectGrid({ data, depth = 0 }: { data: Record<string, unknown>; depth?: number }) {
  const entries = Object.entries(data);

  // Separate simple values from complex ones
  const simpleEntries: [string, unknown][] = [];
  const complexEntries: [string, unknown][] = [];

  entries.forEach(([key, value]) => {
    if (isPlainObject(value) || Array.isArray(value)) {
      complexEntries.push([key, value]);
    } else {
      simpleEntries.push([key, value]);
    }
  });

  return (
    <div className="space-y-4">
      {/* Simple key-value pairs in grid */}
      {simpleEntries.length > 0 && (
        <div className={cn(
          "grid gap-3",
          depth === 0 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-2"
        )}>
          {simpleEntries.map(([key, value]) => (
            <div key={key} className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                {formatSectionTitle(key)}
              </p>
              <UniversalValueRenderer value={value} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}

      {/* Complex values (objects/arrays) below */}
      {complexEntries.map(([key, value]) => (
        <div key={key} className="space-y-2">
          <h5 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            {formatSectionTitle(key)}
          </h5>
          <div className="pl-2 border-l-2 border-primary/30">
            <UniversalValueRenderer value={value} depth={depth + 1} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Renders an object as a compact card (for nested/deeper objects)
 */
function CompactObjectCard({ data, depth = 0 }: { data: Record<string, unknown>; depth?: number }) {
  const entries = Object.entries(data);

  return (
    <div className={cn(
      "rounded-lg border bg-card p-3 space-y-2",
      depth > 0 && "bg-muted/30"
    )}>
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase shrink-0">
            {formatSectionTitle(key)}:
          </span>
          <div className="flex-1 min-w-0">
            <UniversalValueRenderer value={value} depth={depth + 1} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Renders an array of objects as a properly formatted table
 */
function SmartTableDisplay({ data }: { data: Array<Record<string, unknown>> }) {
  if (!data || data.length === 0) return null;

  // Get all unique keys from all objects
  const allKeys = new Set<string>();
  data.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });
  const headers = Array.from(allKeys);

  // Render cell value - handle nested objects/arrays within table cells
  const renderCellValue = (value: unknown) => {
    if (value === null || value === undefined) return '-';

    // Primitives
    if (typeof value !== 'object') {
      return formatPrimitiveValue(value);
    }

    // Small array of primitives inline
    if (Array.isArray(value) && value.length <= 3 && isArrayOfPrimitives(value)) {
      return value.map(v => formatPrimitiveValue(v)).join(', ');
    }

    // Small object (3 or fewer keys with primitive values) inline
    if (isPlainObject(value)) {
      const entries = Object.entries(value);
      const allPrimitive = entries.every(([, v]) => typeof v !== 'object' || v === null);
      if (entries.length <= 3 && allPrimitive) {
        return entries.map(([k, v]) =>
          `${formatSectionTitle(k)}: ${formatPrimitiveValue(v)}`
        ).join(', ');
      }
    }

    // Larger/complex objects - expandable
    return (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2">
            <ChevronRight className="h-3 w-3 mr-1" />
            View Details
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <UniversalValueRenderer value={value} depth={2} />
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {headers.map(header => (
              <TableHead key={header} className="font-medium whitespace-nowrap">
                {formatSectionTitle(header)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
              {headers.map(header => (
                <TableCell key={header} className="align-top">
                  {renderCellValue(row[header])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================================
// SECTION CARD COMPONENT
// ============================================================================

interface SectionCardProps {
  title: string;
  data: unknown;
  section: string;
  onCopy: (text: string, field: string) => void;
  copiedField: string | null;
}

function SectionCard({ title, data, section, onCopy, copiedField }: SectionCardProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Special rendering for known section types
  const renderSectionContent = () => {
    // Risk rating section
    if (section === 'risk_rating' || section === 'risk_score') {
      return <RiskRatingDisplay data={data} />;
    }

    // Comparison table
    if (section === 'coverage_table' || section === 'comparison_table') {
      if (Array.isArray(data)) {
        return <SmartTableDisplay data={data as Array<Record<string, unknown>>} />;
      }
    }

    // Compliance matrix
    if (section === 'compliance_matrix') {
      return <ComplianceMatrixDisplay data={data as Array<Record<string, unknown>>} />;
    }

    // Issues list
    if (section === 'issues' || section === 'gaps') {
      return <IssuesListDisplay data={data as Array<Record<string, unknown>>} />;
    }

    // Checklist
    if (section === 'checklist') {
      return <ChecklistDisplay data={data as Array<Record<string, unknown>>} />;
    }

    // Premium comparison
    if (section === 'premium_comparison') {
      return <PremiumComparisonDisplay data={data as Record<string, unknown>} />;
    }

    // Use the universal renderer for everything else
    return <UniversalValueRenderer value={data} depth={0} />;
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-lg flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {title}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{renderSectionContent()}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ============================================================================
// SPECIALIZED DISPLAY COMPONENTS
// ============================================================================

function RiskRatingDisplay({ data }: { data: unknown }) {
  const rating = typeof data === 'string' ? data : (data as Record<string, unknown>)?.rating || 'Unknown';
  const score = typeof data === 'object' ? (data as Record<string, unknown>)?.score : null;

  const ratingColors: Record<string, string> = {
    low: 'bg-green-500/10 text-green-600 border-green-500',
    medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500',
    high: 'bg-orange-500/10 text-orange-600 border-orange-500',
    critical: 'bg-red-500/10 text-red-600 border-red-500',
  };

  const colorClass = ratingColors[String(rating).toLowerCase()] || 'bg-muted text-muted-foreground';

  return (
    <div className="flex items-center gap-4">
      <Badge className={cn('text-lg px-4 py-2 border-2', colorClass)}>
        {String(rating).toUpperCase()}
      </Badge>
      {score !== null && (
        <span className="text-2xl font-bold">{score}/100</span>
      )}
    </div>
  );
}

function ComplianceMatrixDisplay({ data }: { data: Array<Record<string, unknown>> }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const statusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'compliant':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'gap':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'partial':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requirement</TableHead>
            <TableHead>Policy Coverage</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{String(row.requirement || '-')}</TableCell>
              <TableCell>{String(row.policy_coverage || '-')}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {statusIcon(String(row.status))}
                  <span className="capitalize">{String(row.status || '-')}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{String(row.notes || '-')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function IssuesListDisplay({ data }: { data: Array<Record<string, unknown>> }) {
  if (!Array.isArray(data)) return null;

  const severityColors: Record<string, string> = {
    low: 'bg-yellow-500/10 text-yellow-600',
    medium: 'bg-orange-500/10 text-orange-600',
    high: 'bg-red-500/10 text-red-600',
    critical: 'bg-red-600/20 text-red-700',
  };

  return (
    <div className="space-y-3">
      {data.map((issue, i) => (
        <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {issue.category && (
                  <Badge variant="outline">{String(issue.category)}</Badge>
                )}
                {issue.severity && (
                  <Badge className={severityColors[String(issue.severity).toLowerCase()] || ''}>
                    {String(issue.severity)}
                  </Badge>
                )}
              </div>
              <p className="font-medium">{String(issue.description || issue.issue || issue)}</p>
              {issue.recommendation && (
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>Recommendation:</strong> {String(issue.recommendation)}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChecklistDisplay({ data }: { data: Array<Record<string, unknown>> }) {
  if (!Array.isArray(data)) return null;

  const statusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pass':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-start gap-3 p-2 rounded hover:bg-muted/50">
          {statusIcon(String(item.status))}
          <div className="flex-1">
            <span className="font-medium">{String(item.item)}</span>
            {item.notes && (
              <p className="text-sm text-muted-foreground">{String(item.notes)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PremiumComparisonDisplay({ data }: { data: Record<string, unknown> }) {
  const savings = data.savings as Record<string, unknown> | undefined;
  const options = Object.entries(data).filter(([key]) => key !== 'savings');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {options.map(([key, value]) => (
          <div key={key} className="p-4 rounded-lg bg-muted/50 text-center">
            <p className="text-sm text-muted-foreground mb-1">{formatSectionTitle(key)}</p>
            <p className="text-2xl font-bold">
              {formatPrimitiveValue(value)}
            </p>
          </div>
        ))}
      </div>

      {savings && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-green-600" />
            <span className="font-medium text-green-600">Potential Savings</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600">
              {formatPrimitiveValue(savings.amount)}
            </p>
            {savings.percentage && (
              <p className="text-sm text-green-600">{savings.percentage}% savings</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AIResultsDisplay({
  result,
  outputConfig,
  emailDraft,
  reportHtml,
  className,
}: AIResultsDisplayProps) {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState(emailDraft?.subject || '');
  const [emailBody, setEmailBody] = useState(emailDraft?.body || '');

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard.',
    });
  };

  const handleDownloadReport = () => {
    if (!reportHtml) return;

    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-analysis-report.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Downloaded!',
      description: 'Report downloaded successfully.',
    });
  };

  // Render based on format
  const renderContent = () => {
    // First, check if any text field contains a JSON code block
    const textContent =
      (result.response as string) ||
      (result.answer as string) ||
      (result.content as string) ||
      (result.text as string) ||
      (result.summary as string) ||
      '';

    // Try to extract JSON from markdown code blocks in text response
    if (typeof textContent === 'string' && textContent.includes('```')) {
      const extractedJson = extractJsonFromMarkdown(textContent);
      if (extractedJson) {
        // Render the extracted JSON as structured data
        return (
          <div className="space-y-6">
            {Object.entries(extractedJson).map(([key, value]) => (
              <SectionCard
                key={key}
                title={formatSectionTitle(key)}
                data={value}
                section={key}
                onCopy={handleCopy}
                copiedField={copiedField}
              />
            ))}
          </div>
        );
      }
    }

    // Smart detection: If result looks like structured data (nested objects, no text-like keys),
    // use structured format even if config says 'chat'
    const hasTextResponse = typeof textContent === 'string' && textContent.length > 0;

    const looksStructured = !hasTextResponse &&
      typeof result === 'object' &&
      Object.keys(result).length > 0 &&
      Object.values(result).some(v => typeof v === 'object' && v !== null);

    // If it's structured data, always use structured renderer
    if (looksStructured && outputConfig.format !== 'html') {
      return renderStructuredFormat();
    }

    switch (outputConfig.format) {
      case 'html':
        return renderHtmlFormat();
      case 'markdown':
        return renderMarkdownFormat();
      case 'chat':
        return renderChatFormat();
      case 'structured':
      default:
        return renderStructuredFormat();
    }
  };

  // Structured JSON format - render sections as cards
  const renderStructuredFormat = () => {
    // Get all actual keys in the result
    const resultKeys = Object.keys(result);

    // If result has a 'content' or 'format: markdown' fallback, show that
    if (result.format === 'markdown' && result.content) {
      return (
        <Card>
          <CardContent className="p-6">
            <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
              {result.content as string}
            </div>
          </CardContent>
        </Card>
      );
    }

    // Use configured sections if they exist AND match result keys, otherwise use all result keys
    let sections = outputConfig.sections || [];
    const matchingSections = sections.filter(s => result[s] !== undefined);

    // If no configured sections match, show all result keys
    if (matchingSections.length === 0) {
      sections = resultKeys.filter(k => !['format'].includes(k));
    } else {
      sections = matchingSections;
    }

    // Also add any result keys not in configured sections (for completeness)
    const extraKeys = resultKeys.filter(k =>
      !sections.includes(k) &&
      result[k] &&
      !['format', 'email_draft'].includes(k)
    );
    sections = [...sections, ...extraKeys];

    return (
      <div className="space-y-6">
        {sections.map((section) => {
          const sectionData = result[section];
          if (!sectionData) return null;

          return (
            <SectionCard
              key={section}
              title={formatSectionTitle(section)}
              data={sectionData}
              section={section}
              onCopy={handleCopy}
              copiedField={copiedField}
            />
          );
        })}
      </div>
    );
  };

  // HTML format - render raw HTML (sanitized for XSS protection)
  const renderHtmlFormat = () => {
    const html = result.proposal_html as string || result.html as string || '';

    return (
      <Card>
        <CardContent className="p-6">
          <div
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
          />
        </CardContent>
      </Card>
    );
  };

  // Markdown format - simple text rendering
  const renderMarkdownFormat = () => {
    const content = typeof result === 'string'
      ? result
      : result.content as string || result.response as string || JSON.stringify(result, null, 2);

    return (
      <Card>
        <CardContent className="p-6">
          <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
            {content}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Chat format - conversational with citations
  const renderChatFormat = () => {
    // Try multiple possible keys for the response text
    const response = result.response as string
      || result.answer as string
      || result.content as string
      || result.text as string
      || result.summary as string
      || (typeof result === 'string' ? result : '')
      || (result.format === 'markdown' ? result.content as string : '')
      || JSON.stringify(result, null, 2);
    const sources = result.sources as Array<{ page?: number; text?: string }> || [];

    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
              {response}
            </div>
          </CardContent>
        </Card>

        {outputConfig.show_sources && sources.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <FileText className="h-4 w-4 mr-2" />
                View Sources ({sources.length})
                <ChevronDown className="h-4 w-4 ml-auto" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card>
                <CardContent className="p-4 space-y-2">
                  {sources.map((source, i) => (
                    <div key={i} className="text-sm text-muted-foreground">
                      {source.page && <Badge variant="outline" className="mr-2">Page {source.page}</Badge>}
                      {source.text}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Main Results */}
      {renderContent()}

      {/* Email Draft Section */}
      {outputConfig.show_email_draft && emailDraft && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Draft
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingEmail(!editingEmail)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  {editingEmail ? 'Preview' : 'Edit'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(`Subject: ${emailSubject}\n\n${emailBody}`, 'email')}
                >
                  {copiedField === 'email' ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  Copy
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editingEmail ? (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Body</label>
                  <Textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Subject:</span>
                  <p className="font-medium">{emailSubject}</p>
                </div>
                <Separator />
                <div className="whitespace-pre-wrap text-sm">{emailBody}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Download Report Button */}
      {outputConfig.show_download_report && reportHtml && (
        <div className="flex justify-end">
          <Button onClick={handleDownloadReport}>
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </Button>
        </div>
      )}
    </div>
  );
}

export default AIResultsDisplay;
