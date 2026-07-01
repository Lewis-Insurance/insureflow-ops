/**
 * CEO Copilot Response Components
 * 
 * Renders the structured JSON response from the AI with:
 * - Executive summary
 * - Key findings with severity badges
 * - Recommendations with priority indicators
 * - Action items with "Create Task" buttons
 * - Risk flags with visual severity indicators
 * - Citations with expandable snippets and deep links
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronDown, 
  ChevronRight, 
  ExternalLink, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle2,
  Plus,
  Lightbulb,
  Target,
  Shield,
  TrendingUp,
  Clock,
  FileText,
  Phone,
  MessageSquare,
  Calendar,
  Quote as QuoteIcon,
  Mail,
  ClipboardList,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  CEOCopilotResponse,
  KeyFinding,
  Recommendation,
  ActionItem,
  RiskFlag,
  Citation,
  CoverageGap,
  CrossSellOpportunity,
} from '@/types/client-intelligence';

// =============================================================================
// MAIN RESPONSE COMPONENT
// =============================================================================

interface CopilotResponseProps {
  response: CEOCopilotResponse;
  onCreateTask?: (actionItem: ActionItem) => void;
  className?: string;
}

export function CopilotResponse({ response, onCreateTask, className = '' }: CopilotResponseProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Executive Summary */}
      <ExecutiveSummary summary={response.executive_summary} confidence={response.confidence_score} />
      
      {/* Risk Flags (shown first if any critical) */}
      {response.risk_flags.length > 0 && (
        <RiskFlagsSection riskFlags={response.risk_flags} />
      )}
      
      {/* Key Findings */}
      {response.key_findings.length > 0 && (
        <KeyFindingsSection findings={response.key_findings} />
      )}

      {/* Coverage Gaps */}
      {response.coverage_gaps && response.coverage_gaps.length > 0 && (
        <CoverageGapsSection gaps={response.coverage_gaps} />
      )}

      {/* Cross-Sell Opportunities */}
      {response.cross_sell_opportunities && response.cross_sell_opportunities.length > 0 && (
        <CrossSellSection opportunities={response.cross_sell_opportunities} />
      )}

      {/* Recommendations */}
      {response.recommendations.length > 0 && (
        <RecommendationsSection recommendations={response.recommendations} />
      )}

      {/* Action Items */}
      {response.action_items.length > 0 && (
        <ActionItemsSection actionItems={response.action_items} onCreateTask={onCreateTask} />
      )}

      {/* All Citations */}
      {response.citations.length > 0 && (
        <CitationsSection citations={response.citations} />
      )}
    </div>
  );
}

// =============================================================================
// EXECUTIVE SUMMARY
// =============================================================================

interface ExecutiveSummaryProps {
  summary: string;
  confidence: number;
}

function ExecutiveSummary({ summary, confidence }: ExecutiveSummaryProps) {
  const confidenceColor = confidence >= 0.8 ? 'text-success' : confidence >= 0.6 ? 'text-warning' : 'text-destructive';

  return (
    <Card className="border-l-4 border-l-info bg-gradient-to-r from-info/5 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-info" />
            Executive Summary
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className={confidenceColor}>
                  {Math.round(confidence * 100)}% confidence
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI confidence score based on data completeness</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground leading-relaxed">{summary}</p>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// RISK FLAGS
// =============================================================================

interface RiskFlagsSectionProps {
  riskFlags: RiskFlag[];
}

function RiskFlagsSection({ riskFlags }: RiskFlagsSectionProps) {
  const sortedFlags = [...riskFlags].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  const hasCritical = sortedFlags.some(f => f.severity === 'critical');

  return (
    <Card className={hasCritical ? 'border-destructive bg-destructive/5' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-destructive" />
          Risk Flags
          {hasCritical && (
            <Badge variant="destructive" className="animate-pulse">Action Required</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedFlags.map((flag) => (
          <RiskFlagCard key={flag.id} flag={flag} />
        ))}
      </CardContent>
    </Card>
  );
}

function RiskFlagCard({ flag }: { flag: RiskFlag }) {
  const [isOpen, setIsOpen] = useState(flag.severity === 'critical');
  
  const severityConfig = {
    critical: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30' },
    high: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
    medium: { icon: Info, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
    low: { icon: Info, color: 'text-info', bg: 'bg-info/10', border: 'border-info/30' },
  };

  const config = severityConfig[flag.severity];
  const Icon = config.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`rounded-lg border ${config.border} ${config.bg} p-3`}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-start gap-3">
            <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium">{flag.title}</span>
                <Badge variant="outline" className="text-xs capitalize">{flag.risk_type.replace('_', ' ')}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
            </div>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-2">
            {flag.mitigation_suggestion && (
              <div className="text-sm">
                <span className="font-medium">Suggested Action: </span>
                <span className="text-muted-foreground">{flag.mitigation_suggestion}</span>
              </div>
            )}
            {flag.evidence.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {flag.evidence.map((cite, idx) => (
                  <CitationBadge key={idx} citation={cite} />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// =============================================================================
// KEY FINDINGS
// =============================================================================

interface KeyFindingsSectionProps {
  findings: KeyFinding[];
}

function KeyFindingsSection({ findings }: KeyFindingsSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-warning" />
          Key Findings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </CardContent>
    </Card>
  );
}

function FindingCard({ finding }: { finding: KeyFinding }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const severityBadge = {
    critical: 'bg-destructive/10 text-destructive',
    high: 'bg-warning/10 text-warning',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-info/10 text-info',
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-start gap-3">
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{finding.finding}</span>
                <Badge className={severityBadge[finding.severity]}>{finding.severity}</Badge>
                {finding.category && (
                  <Badge variant="outline" className="text-xs">{finding.category}</Badge>
                )}
              </div>
            </div>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {finding.evidence.length > 0 && (
            <div className="mt-3 pt-3 border-t flex flex-wrap gap-1">
              {finding.evidence.map((cite, idx) => (
                <CitationBadge key={idx} citation={cite} />
              ))}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

interface RecommendationsSectionProps {
  recommendations: Recommendation[];
}

function RecommendationsSection({ recommendations }: RecommendationsSectionProps) {
  const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-success" />
          Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((rec, idx) => (
          <RecommendationCard key={rec.id} recommendation={rec} index={idx} />
        ))}
      </CardContent>
    </Card>
  );
}

function RecommendationCard({ recommendation, index }: { recommendation: Recommendation; index: number }) {
  const [isOpen, setIsOpen] = useState(index < 2);

  const priorityLabel = { 1: 'High Priority', 2: 'Medium Priority', 3: 'Lower Priority' };
  const priorityColor = { 1: 'text-destructive', 2: 'text-warning', 3: 'text-info' };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border p-3">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-start gap-3">
            <div className={`font-bold text-lg ${priorityColor[recommendation.priority]}`}>
              {recommendation.priority}
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium">{recommendation.recommendation}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {priorityLabel[recommendation.priority]}
              </div>
            </div>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="text-sm">
              <span className="font-medium">Rationale: </span>
              <span className="text-muted-foreground">{recommendation.rationale}</span>
            </div>
            {recommendation.expected_impact && (
              <div className="text-sm">
                <span className="font-medium">Expected Impact: </span>
                <span className="text-muted-foreground">{recommendation.expected_impact}</span>
              </div>
            )}
            {recommendation.evidence.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {recommendation.evidence.map((cite, idx) => (
                  <CitationBadge key={idx} citation={cite} />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// =============================================================================
// ACTION ITEMS
// =============================================================================

interface ActionItemsSectionProps {
  actionItems: ActionItem[];
  onCreateTask?: (item: ActionItem) => void;
}

function ActionItemsSection({ actionItems, onCreateTask }: ActionItemsSectionProps) {
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...actionItems].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return (
    <Card className="border-l-4 border-l-info">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-info" />
          Action Items
        </CardTitle>
        <CardDescription>
          Recommended tasks based on the analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((item) => (
          <ActionItemCard key={item.id} item={item} onCreateTask={onCreateTask} />
        ))}
      </CardContent>
    </Card>
  );
}

function ActionItemCard({ item, onCreateTask }: { item: ActionItem; onCreateTask?: (item: ActionItem) => void }) {
  const priorityConfig = {
    urgent: { label: 'Urgent', color: 'bg-destructive/10 text-destructive' },
    high: { label: 'High', color: 'bg-warning/10 text-warning' },
    medium: { label: 'Medium', color: 'bg-warning/10 text-warning' },
    low: { label: 'Low', color: 'bg-info/10 text-info' },
  };

  const config = priorityConfig[item.priority];

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
      <CheckCircle2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium">{item.action}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Badge className={config.color}>{config.label}</Badge>
          {item.owner_suggestion && <span>→ {item.owner_suggestion}</span>}
          {item.due_suggestion && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {item.due_suggestion}
            </span>
          )}
        </div>
      </div>
      {item.can_create_task && onCreateTask && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCreateTask(item)}
          className="flex-shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Create Task
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// COVERAGE GAPS
// =============================================================================

interface CoverageGapsSectionProps {
  gaps: CoverageGap[];
}

function CoverageGapsSection({ gaps }: CoverageGapsSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-warning" />
          Coverage Gaps Identified
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {gaps.map((gap) => (
          <div key={gap.id} className="p-3 rounded-lg border bg-warning/5">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{gap.gap_type}</div>
              <Badge variant="outline" className="capitalize">{gap.priority} priority</Badge>
            </div>
            <div className="mt-2 space-y-1 text-sm">
              <div><span className="text-muted-foreground">Current: </span>{gap.current_state}</div>
              <div><span className="text-muted-foreground">Recommended: </span>{gap.recommended_coverage}</div>
              {gap.estimated_premium && (
                <div><span className="text-muted-foreground">Est. Premium: </span>{gap.estimated_premium}</div>
              )}
              <div className="text-warning">
                <span className="font-medium">Risk: </span>{gap.risk_if_unaddressed}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// CROSS-SELL OPPORTUNITIES
// =============================================================================

interface CrossSellSectionProps {
  opportunities: CrossSellOpportunity[];
}

function CrossSellSection({ opportunities }: CrossSellSectionProps) {
  return (
    <Card className="border-l-4 border-l-success">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-success" />
          Cross-Sell Opportunities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {opportunities.map((opp) => (
          <CrossSellCard key={opp.id} opportunity={opp} />
        ))}
      </CardContent>
    </Card>
  );
}

function CrossSellCard({ opportunity }: { opportunity: CrossSellOpportunity }) {
  const [isOpen, setIsOpen] = useState(opportunity.likelihood === 'high');

  const likelihoodColor = {
    high: 'bg-success/10 text-success',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-info/10 text-info',
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">{opportunity.product}</span>
              <Badge className={likelihoodColor[opportunity.likelihood]}>
                {opportunity.likelihood} likelihood
              </Badge>
            </div>
            {opportunity.estimated_premium && (
              <span className="text-sm text-muted-foreground">{opportunity.estimated_premium}</span>
            )}
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="text-sm">
              <span className="font-medium">Rationale: </span>
              <span className="text-muted-foreground">{opportunity.rationale}</span>
            </div>
            {opportunity.talking_points.length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Talking Points:</span>
                <ul className="list-disc list-inside mt-1 text-muted-foreground">
                  {opportunity.talking_points.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// =============================================================================
// CITATIONS
// =============================================================================

interface CitationsSectionProps {
  citations: Citation[];
}

function CitationsSection({ citations }: CitationsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const grouped = citations.reduce((acc, cite) => {
    if (!acc[cite.source_type]) acc[cite.source_type] = [];
    acc[cite.source_type].push(cite);
    return acc;
  }, {} as Record<string, Citation[]>);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-info" />
                Sources & Citations ({citations.length})
              </CardTitle>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {Object.entries(grouped).map(([sourceType, cites]) => (
              <div key={sourceType}>
                <h4 className="font-medium capitalize mb-2">{sourceType}s</h4>
                <div className="space-y-2">
                  {cites.map((cite) => (
                    <CitationCard key={cite.id} citation={cite} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="p-2 rounded border hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <SourceIcon type={citation.source_type} />
            <span className="font-medium text-sm">{citation.source_label}</span>
            {citation.timestamp && (
              <span className="text-xs text-muted-foreground">{formatDate(citation.timestamp)}</span>
            )}
          </div>
          {citation.snippet && (
            <div className="mt-1">
              <p className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-2'}`}>
                "{citation.snippet}"
              </p>
              {citation.snippet.length > 100 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs text-cc-link hover:text-cc-link-hover hover:underline mt-1"
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(citation.deep_link)}
          className="flex-shrink-0"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// CITATION BADGE (inline)
// =============================================================================

interface CitationBadgeProps {
  citation: Citation;
}

function CitationBadge({ citation }: CitationBadgeProps) {
  const navigate = useNavigate();
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <TooltipProvider>
      <Tooltip open={showTooltip} onOpenChange={setShowTooltip}>
        <TooltipTrigger asChild>
          <button
            onClick={() => navigate(citation.deep_link)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-info/10 text-info hover:bg-info/20 transition-colors"
          >
            <SourceIcon type={citation.source_type} className="h-3 w-3" />
            {citation.source_label}
            <ExternalLink className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {citation.snippet ? (
            <p className="text-xs">"{citation.snippet}"</p>
          ) : (
            <p className="text-xs">Click to view source</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function SourceIcon({ type, className = 'h-4 w-4' }: { type: string; className?: string }) {
  switch (type) {
    case 'policy':
      return <FileText className={className} />;
    case 'claim':
      return <AlertCircle className={className} />;
    case 'note':
      return <FileText className={className} />;
    case 'document':
      return <FileText className={className} />;
    case 'task':
      return <ClipboardList className={className} />;
    case 'call':
      return <Phone className={className} />;
    case 'sms':
      return <MessageSquare className={className} />;
    case 'event':
      return <Calendar className={className} />;
    case 'quote':
      return <QuoteIcon className={className} />;
    case 'email':
      return <Mail className={className} />;
    default:
      return <FileText className={className} />;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export default CopilotResponse;


