/**
 * Explore Chat Panel
 * 
 * Evidence-backed Q&A interface for the Explore Insurance Document module.
 * Features:
 * - Chat-style interface with user/assistant messages
 * - Clickable citations that highlight in document viewer
 * - Suggested questions based on document type
 * - Confidence indicators
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, AlertCircle, FileText, CheckCircle, Info, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useExploreMessages,
  useExploreAsk,
  ExploreMessage,
  Citation,
} from '@/hooks/useExploreSessions';
import { cn } from '@/lib/utils';

interface ExploreChatPanelProps {
  sessionId: string;
  isReady: boolean;
  onCitationClick?: (citation: Citation) => void;
  suggestedQuestions?: string[];
}

// Default suggested questions
const DEFAULT_QUESTIONS = [
  "What is the policy number and effective date?",
  "What coverages and limits are included?",
  "Who is the named insured?",
  "What is the total premium?",
  "Are there any exclusions or endorsements?",
  "What deductibles apply?",
];

export const ExploreChatPanel: React.FC<ExploreChatPanelProps> = ({
  sessionId,
  isReady,
  onCitationClick,
  suggestedQuestions = DEFAULT_QUESTIONS,
}) => {
  const [question, setQuestion] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading: loadingMessages } = useExploreMessages(sessionId);
  const askMutation = useExploreAsk();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !isReady || askMutation.isPending) return;

    const q = question.trim();
    setQuestion('');

    await askMutation.mutateAsync({
      session_id: sessionId,
      question: q,
    });
  };

  const handleSuggestedQuestion = (q: string) => {
    setQuestion(q);
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-orange-100 text-orange-800',
      not_found: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={cn('text-xs', colors[confidence as keyof typeof colors] || colors.medium)}>
        {confidence.toUpperCase()}
      </Badge>
    );
  };

  const renderMessageContent = (content: string, citations: Citation[] | null) => {
    if (!citations || citations.length === 0) {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    // Parse and render citations as clickable links
    const citationRegex = /\[ev_[a-z0-9]+\]/gi;
    const parts = content.split(citationRegex);
    const matches = content.match(citationRegex) || [];

    return (
      <p className="whitespace-pre-wrap">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {matches[i] && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="inline-flex items-center px-1 py-0.5 mx-0.5 rounded bg-blue-100 text-blue-700 text-xs font-mono hover:bg-blue-200 transition-colors"
                      onClick={() => {
                        const evId = matches[i].slice(1, -1);
                        const citation = citations.find(c => c.evidence_id === evId);
                        if (citation && onCitationClick) {
                          onCitationClick(citation);
                        }
                      }}
                    >
                      <FileText className="w-3 h-3 mr-0.5" />
                      {matches[i]}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {(() => {
                      const evId = matches[i].slice(1, -1);
                      const citation = citations.find(c => c.evidence_id === evId);
                      return citation ? (
                        <div className="text-xs">
                          <p className="font-medium">Page {citation.page}</p>
                          <p className="text-muted-foreground">{citation.snippet.slice(0, 100)}...</p>
                        </div>
                      ) : (
                        <p>Evidence not found</p>
                      );
                    })()}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </React.Fragment>
        ))}
      </p>
    );
  };

  const renderMessage = (message: ExploreMessage) => {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';

    return (
      <div
        key={message.id}
        className={cn(
          'flex gap-3 mb-4',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {/* Avatar */}
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            isUser ? 'bg-blue-500' : 'bg-purple-500'
          )}
        >
          {isUser ? (
            <span className="text-white text-xs font-medium">You</span>
          ) : (
            <span className="text-white text-xs font-medium">AI</span>
          )}
        </div>

        {/* Content */}
        <div
          className={cn(
            'flex-1 rounded-lg p-3',
            isUser
              ? 'bg-blue-50 text-blue-900 ml-8'
              : 'bg-gray-50 text-gray-900 mr-8'
          )}
        >
          {isAssistant ? (
            renderMessageContent(message.content, message.citations)
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}

          {/* Citations summary for assistant messages */}
          {isAssistant && message.citations && message.citations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-muted-foreground mb-2">
                {message.citations.length} source{message.citations.length !== 1 ? 's' : ''} cited
              </p>
              <div className="flex flex-wrap gap-1">
                {message.citations.slice(0, 5).map((citation, i) => (
                  <button
                    key={i}
                    className="inline-flex items-center px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs transition-colors"
                    onClick={() => onCitationClick?.(citation)}
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    Page {citation.page}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </button>
                ))}
                {message.citations.length > 5 && (
                  <span className="text-xs text-muted-foreground px-2 py-1">
                    +{message.citations.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          {isAssistant && message.latency_ms && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{message.latency_ms}ms</span>
              {message.tokens_used && <span>• {message.tokens_used} tokens</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="py-3 px-4 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Ask Questions
            {isReady ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 text-xs">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Processing
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages area */}
        <ScrollArea className="flex-1 p-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages && messages.length > 0 ? (
            <div>
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="py-8 text-center">
              <Info className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Ask questions about your uploaded documents. The AI will cite specific evidence from the documents.
              </p>

              {/* Suggested questions */}
              <div className="mt-6">
                <p className="text-xs text-muted-foreground mb-3">Suggested questions:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestedQuestions.slice(0, 4).map((q, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleSuggestedQuestion(q)}
                      disabled={!isReady}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="p-4 border-t bg-muted/30">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              placeholder={isReady ? "Ask about your documents..." : "Waiting for documents to process..."}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!isReady || askMutation.isPending}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!question.trim() || !isReady || askMutation.isPending}
            >
              {askMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>

          {/* Error display */}
          {askMutation.isError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="w-4 h-4" />
              {askMutation.error?.message || 'Failed to get answer'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

