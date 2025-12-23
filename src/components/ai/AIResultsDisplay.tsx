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
    const sections = outputConfig.sections || Object.keys(result);
    
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

  // HTML format - render raw HTML
  const renderHtmlFormat = () => {
    const html = result.proposal_html as string || result.html as string || '';
    
    return (
      <Card>
        <CardContent className="p-6">
          <div 
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
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
    const response = result.response as string || result.answer as string || '';
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

// Section Card Component
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
      return <ComparisonTableDisplay data={data as Array<Record<string, unknown>>} />;
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

    // Basic info object
    if (section === 'basic_info') {
      return <BasicInfoDisplay data={data as Record<string, unknown>} />;
    }

    // Coverages list
    if (section === 'coverages') {
      return <CoveragesListDisplay data={data as Array<Record<string, unknown>>} />;
    }

    // Recommendations/highlights (string array)
    if (Array.isArray(data) && data.every(item => typeof item === 'string')) {
      return (
        <ul className="space-y-2">
          {(data as string[]).map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Summary string
    if (typeof data === 'string') {
      return <p className="text-muted-foreground">{data}</p>;
    }

    // Default: render as formatted JSON
    return (
      <pre className="text-sm bg-muted p-3 rounded-lg overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
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

// Helper: Format section title
function formatSectionTitle(section: string): string {
  return section
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// Risk Rating Display
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

// Comparison Table Display
function ComparisonTableDisplay({ data }: { data: Array<Record<string, unknown>> }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const headers = Object.keys(data[0]);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{formatSectionTitle(header)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              {headers.map((header) => (
                <TableCell key={header}>
                  {header === 'winner' ? (
                    <Badge variant="outline">{String(row[header])}</Badge>
                  ) : (
                    String(row[header] ?? '-')
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Compliance Matrix Display
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

// Issues List Display
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

// Checklist Display
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

// Premium Comparison Display
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
              ${typeof value === 'number' ? value.toLocaleString() : String(value)}
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
              ${typeof savings.amount === 'number' ? savings.amount.toLocaleString() : String(savings.amount || 0)}
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

// Basic Info Display
function BasicInfoDisplay({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <p className="text-sm text-muted-foreground">{formatSectionTitle(key)}</p>
          <p className="font-medium">{String(value ?? '-')}</p>
        </div>
      ))}
    </div>
  );
}

// Coverages List Display
function CoveragesListDisplay({ data }: { data: Array<Record<string, unknown>> }) {
  if (!Array.isArray(data)) return null;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Coverage</TableHead>
            <TableHead>Limit</TableHead>
            <TableHead>Deductible</TableHead>
            <TableHead>Premium</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((coverage, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{String(coverage.name || coverage.coverage || '-')}</TableCell>
              <TableCell>{String(coverage.limit || '-')}</TableCell>
              <TableCell>{String(coverage.deductible || '-')}</TableCell>
              <TableCell>{coverage.premium ? `$${coverage.premium}` : '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default AIResultsDisplay;

