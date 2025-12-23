/**
 * Comparison Q&A Panel
 * 
 * Allows users to ask questions about the comparison
 * with grounded, evidence-backed answers.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  MessageCircle,
  Send,
  Loader2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Citation {
  evidenceId: string;
  docRole: 'A' | 'B';
  snippet: string;
  page?: number;
  relevance: string;
}

interface QAResponse {
  answer: string;
  citations: Citation[];
  confidence: number;
  ifUnknown?: {
    missingInfo: string;
    recommendedNextStep: string;
  };
  followUpQuestions?: string[];
}

interface QAMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  response?: QAResponse;
  timestamp: Date;
}

interface ComparisonQAPanelProps {
  comparisonId: string;
  onAskQuestion: (question: string) => Promise<QAResponse>;
  onEvidenceClick?: (evidenceId: string, docRole: 'A' | 'B') => void;
  suggestedQuestions?: string[];
}

const DEFAULT_SUGGESTED_QUESTIONS = [
  "What are the main coverage differences?",
  "Does the quote include hired/non-owned auto?",
  "What changed with the general liability limits?",
  "Which endorsements were added or removed?",
  "Is there a difference in the deductibles?",
  "What is the premium difference?",
];

export function ComparisonQAPanel({
  comparisonId,
  onAskQuestion,
  onEvidenceClick,
  suggestedQuestions = DEFAULT_SUGGESTED_QUESTIONS
}: ComparisonQAPanelProps) {
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAsk = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMessage: QAMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: question,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await onAskQuestion(question);
      
      const assistantMessage: QAMessage = {
        id: `assistant-${Date.now()}`,
        type: 'assistant',
        content: response.answer,
        response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: QAMessage = {
        id: `error-${Date.now()}`,
        type: 'assistant',
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk(input);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-amber-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.6) return 'Medium confidence';
    return 'Low confidence';
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-5 w-5" />
          Ask About This Comparison
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* Messages Area */}
        <ScrollArea className="flex-1 pr-4 -mr-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ask any question about the comparison. Answers are grounded in the extracted data with citations.
              </p>
              
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Suggested Questions
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQuestions.map((q, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-1.5 px-3"
                      onClick={() => handleAsk(q)}
                      disabled={isLoading}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'rounded-lg p-3',
                    message.type === 'user' 
                      ? 'bg-primary text-primary-foreground ml-8' 
                      : 'bg-muted mr-8'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {/* Response metadata */}
                  {message.response && (
                    <div className="mt-3 space-y-3">
                      {/* Confidence indicator */}
                      <div className="flex items-center gap-2 text-xs">
                        {message.response.confidence >= 0.8 ? (
                          <CheckCircle2 className={cn('h-3 w-3', getConfidenceColor(message.response.confidence))} />
                        ) : message.response.confidence >= 0.6 ? (
                          <AlertCircle className={cn('h-3 w-3', getConfidenceColor(message.response.confidence))} />
                        ) : (
                          <HelpCircle className={cn('h-3 w-3', getConfidenceColor(message.response.confidence))} />
                        )}
                        <span className={getConfidenceColor(message.response.confidence)}>
                          {getConfidenceLabel(message.response.confidence)} ({Math.round(message.response.confidence * 100)}%)
                        </span>
                      </div>
                      
                      {/* Citations */}
                      {message.response.citations.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium">Sources:</p>
                          {message.response.citations.map((citation, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 p-2 rounded bg-background/50 text-xs"
                            >
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  'flex-shrink-0',
                                  citation.docRole === 'A' 
                                    ? 'border-blue-300 text-blue-600' 
                                    : 'border-amber-300 text-amber-600'
                                )}
                              >
                                Doc {citation.docRole}
                              </Badge>
                              <div className="flex-1 min-w-0">
                                <p className="text-muted-foreground italic truncate">
                                  "{citation.snippet}"
                                </p>
                                {citation.page && (
                                  <p className="text-muted-foreground mt-0.5">Page {citation.page}</p>
                                )}
                              </div>
                              {onEvidenceClick && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 flex-shrink-0"
                                  onClick={() => onEvidenceClick(citation.evidenceId, citation.docRole)}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Unknown/uncertain info */}
                      {message.response.ifUnknown && (
                        <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 text-xs">
                          <p className="font-medium text-amber-700 dark:text-amber-300">
                            ⚠️ {message.response.ifUnknown.missingInfo}
                          </p>
                          <p className="text-muted-foreground mt-1">
                            Recommended: {message.response.ifUnknown.recommendedNextStep}
                          </p>
                        </div>
                      )}
                      
                      {/* Follow-up questions */}
                      {message.response.followUpQuestions && message.response.followUpQuestions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">You might also ask:</p>
                          <div className="flex flex-wrap gap-1">
                            {message.response.followUpQuestions.map((q, idx) => (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                className="text-xs h-auto py-1 px-2"
                                onClick={() => handleAsk(q)}
                                disabled={isLoading}
                              >
                                {q}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing comparison data...
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        
        <Separator className="my-3" />
        
        {/* Input Area */}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this comparison..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={() => handleAsk(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ComparisonQAPanel;


