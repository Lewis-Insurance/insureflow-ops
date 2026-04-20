/**
 * Client Intelligence Panel
 * 
 * Chat-style interface for asking AI questions about a client
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Brain,
  Sparkles,
  Loader2,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  FileText,
  Shield,
  TrendingUp,
  AlertTriangle,
  Activity,
  Users,
  Heart,
  Calendar,
  Copy,
  RefreshCw,
  Database,
  Plus,
} from 'lucide-react';
import { useClientIntelligence } from '@/hooks/useClientIntelligence';
import { useToast } from '@/hooks/use-toast';
import type { QuestionTemplate, ClientIntelligenceResponse, ActionItem } from '@/types/client-intelligence';
import { cn } from '@/lib/utils';
import { CopilotResponse } from './CopilotResponse';
import { supabase } from '@/integrations/supabase/client';

// =============================================================================
// ICON MAPPING
// =============================================================================

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Coverage Analysis': Shield,
  'Renewal Prep': Calendar,
  'Cross-Sell': TrendingUp,
  'Risk Assessment': AlertTriangle,
  'Activity Summary': Activity,
  'Claims Analysis': FileText,
  'Account Health': Heart,
  'Meeting Prep': Users,
};

// =============================================================================
// PROPS
// =============================================================================

interface ClientIntelligencePanelProps {
  accountId: string;
  accountName?: string;
  className?: string;
  compact?: boolean;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ClientIntelligencePanel({
  accountId,
  accountName,
  className,
  compact = false,
}: ClientIntelligencePanelProps) {
  const [question, setQuestion] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    context,
    isLoadingContext,
    contextError,
    refetchContext,
    responses,
    isAsking,
    askQuestion,
    askSuggestedQuestion,
    cancelRequest,
    clearResponses,
    suggestedQuestions,
  } = useClientIntelligence({ accountId });

  // Handle creating a task from an action item
  const handleCreateTask = async (actionItem: ActionItem) => {
    try {
      // Parse due suggestion into a date
      let dueDate: string | null = null;
      if (actionItem.due_suggestion) {
        const now = new Date();
        const lowerSuggestion = actionItem.due_suggestion.toLowerCase();
        
        if (lowerSuggestion.includes('7 day') || lowerSuggestion.includes('week')) {
          now.setDate(now.getDate() + 7);
          dueDate = now.toISOString().split('T')[0];
        } else if (lowerSuggestion.includes('30 day') || lowerSuggestion.includes('month')) {
          now.setDate(now.getDate() + 30);
          dueDate = now.toISOString().split('T')[0];
        } else if (lowerSuggestion.includes('14 day') || lowerSuggestion.includes('two week')) {
          now.setDate(now.getDate() + 14);
          dueDate = now.toISOString().split('T')[0];
        } else if (lowerSuggestion.includes('tomorrow')) {
          now.setDate(now.getDate() + 1);
          dueDate = now.toISOString().split('T')[0];
        } else if (lowerSuggestion.includes('today') || lowerSuggestion.includes('immediately')) {
          dueDate = now.toISOString().split('T')[0];
        }
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create the task
      const { data: task, error } = await supabase.from('tasks').insert({
        title: actionItem.action,
        description: `Created from AI recommendation.\n\nPriority: ${actionItem.priority}\nSuggested Owner: ${actionItem.owner_suggestion || 'Not specified'}`,
        entity_type: 'account',
        entity_id: accountId,
        status: 'pending',
        priority: actionItem.priority === 'urgent' ? 'high' : actionItem.priority,
        due_date: dueDate,
        created_by: user?.id,
      }).select().single();

      if (error) throw error;

      toast({
        title: 'Task Created',
        description: `"${actionItem.action}" has been added to your tasks.`,
      });

      // Optionally navigate to the task
      // navigate(`/tasks/${task.id}`);
    } catch (error) {
      console.error('Failed to create task:', error);
      toast({
        title: 'Failed to create task',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Auto-scroll to bottom when new responses arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isAsking) return;

    await askQuestion(question);
    setQuestion('');
    setShowSuggestions(false);
  };

  const handleSuggestedQuestion = async (template: QuestionTemplate) => {
    await askSuggestedQuestion(template);
    setShowSuggestions(false);
  };

  const copyResponse = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Response copied to clipboard',
    });
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  const formatCost = (cost: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(cost);
  };

  // Loading context state
  if (isLoadingContext) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="py-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Database className="h-12 w-12 text-muted-foreground animate-pulse" />
              <Loader2 className="h-6 w-6 absolute -bottom-1 -right-1 animate-spin text-primary" />
            </div>
            <div>
              <p className="font-medium">Loading Client Data</p>
              <p className="text-sm text-muted-foreground">
                Aggregating policies, claims, documents, and more...
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (contextError) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <p className="font-medium text-destructive">Failed to load client data</p>
          <p className="text-sm text-muted-foreground mb-4">
            {contextError.message}
          </p>
          <Button onClick={() => refetchContext()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col", compact ? "h-[600px]" : "h-full min-h-[700px]", className)}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Client Intelligence</CardTitle>
              <CardDescription>
                {accountName || 'AI-powered insights for this client'}
              </CardDescription>
            </div>
          </div>
          {responses.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearResponses}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Context Summary */}
        {context && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              {context.dataSummary.activePoliciesCount} Policies
            </Badge>
            <Badge variant="outline" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {context.dataSummary.openClaimsCount} Open Claims
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              {context.dataSummary.communicationsCount} Interactions
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              ~{formatTokens(context.tokenEstimate)} tokens
            </Badge>
          </div>
        )}
      </CardHeader>

      <Separator />

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        {/* Suggested Questions (when no responses yet) */}
        {responses.length === 0 && showSuggestions && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-violet-500" />
              <p className="font-medium">What would you like to know?</p>
              <p className="text-sm text-muted-foreground">
                Choose a suggested question or ask your own
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {suggestedQuestions.map((template) => {
                const Icon = CATEGORY_ICONS[template.category] || Sparkles;
                return (
                  <Button
                    key={template.id}
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start text-left"
                    onClick={() => handleSuggestedQuestion(template)}
                    disabled={isAsking}
                  >
                    <Icon className="h-4 w-4 mr-3 flex-shrink-0 text-violet-500" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{template.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {template.category}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Responses */}
        <div className="space-y-4">
          {responses.map((response, index) => (
            <ResponseCard
              key={response.runId || index}
              response={response}
              onCopy={() => copyResponse(response.answer)}
              onCreateTask={handleCreateTask}
            />
          ))}
        </div>

        {/* Loading indicator */}
        {isAsking && (
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg mt-4">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            <div className="flex-1">
              <p className="font-medium">Analyzing client data...</p>
              <p className="text-sm text-muted-foreground">
                Prism AI is reviewing policies, claims, and activity
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={cancelRequest}>
              Cancel
            </Button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </ScrollArea>

      <Separator />

      {/* Input Area */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            placeholder="Ask a question about this client..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[60px] max-h-[120px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isAsking}
          />
          <Button
            type="submit"
            size="lg"
            disabled={isAsking || !question.trim()}
            className="self-end"
          >
            {isAsking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        
        {responses.length > 0 && (
          <Button
            variant="link"
            size="sm"
            className="mt-2 p-0 h-auto text-muted-foreground"
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            {showSuggestions ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Hide suggestions
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show suggested questions
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

// =============================================================================
// RESPONSE CARD SUB-COMPONENT
// =============================================================================

interface ResponseCardProps {
  response: ClientIntelligenceResponse;
  onCopy: () => void;
  onCreateTask?: (item: ActionItem) => void;
}

function ResponseCard({ response, onCopy, onCreateTask }: ResponseCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const hasStructuredResponse = response.structuredResponse && 
    response.structuredResponse.executive_summary;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg overflow-hidden">
        {/* Question header */}
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-violet-500 flex-shrink-0" />
              <span className="font-medium text-sm truncate">{response.question}</span>
              {hasStructuredResponse && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  Structured
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatTime(response.timestamp)}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Answer content */}
        <CollapsibleContent>
          <div className="p-4 space-y-3">
            {/* Structured response if available */}
            {hasStructuredResponse && !showRaw ? (
              <CopilotResponse 
                response={response.structuredResponse!}
                onCreateTask={onCreateTask}
              />
            ) : (
              /* Rendered markdown-ish content */
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ResponseContent content={response.answer} />
              </div>
            )}

            {/* Toggle between structured and raw */}
            {hasStructuredResponse && (
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs"
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? 'Show structured view' : 'Show raw response'}
              </Button>
            )}

            {/* Footer with stats */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {response.tokensUsed.toLocaleString()} tokens
                </span>
                {response.cost > 0 && (
                  <span>
                    ${response.cost.toFixed(4)}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={onCopy}>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// =============================================================================
// RESPONSE CONTENT RENDERER
// =============================================================================

function ResponseContent({ content }: { content: string }) {
  // Simple markdown-like rendering
  const lines = content.split('\n');
  
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        // Headers
        if (line.startsWith('### ')) {
          return <h4 key={i} className="font-semibold text-base mt-4">{line.slice(4)}</h4>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={i} className="font-semibold text-lg mt-4">{line.slice(3)}</h3>;
        }
        if (line.startsWith('# ')) {
          return <h2 key={i} className="font-bold text-xl mt-4">{line.slice(2)}</h2>;
        }
        
        // Bold text markers
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
        }
        
        // List items
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-violet-500">•</span>
              <span>{renderInlineFormatting(line.slice(2))}</span>
            </div>
          );
        }
        
        // Numbered list
        const numberedMatch = line.match(/^(\d+)\. /);
        if (numberedMatch) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-violet-500 font-medium">{numberedMatch[1]}.</span>
              <span>{renderInlineFormatting(line.slice(numberedMatch[0].length))}</span>
            </div>
          );
        }
        
        // Empty lines
        if (!line.trim()) {
          return <div key={i} className="h-2" />;
        }
        
        // Regular paragraph
        return <p key={i}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Handle **bold** text
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

