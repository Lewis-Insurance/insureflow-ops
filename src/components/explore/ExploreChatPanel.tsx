/**
 * Chat Panel for Document Q&A
 * 
 * Features:
 * - Evidence-backed answers with [ev_xxx] citations
 * - Click citation to highlight in viewer
 * - Suggested questions based on document type
 * - Confidence indicators
 */

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { ChatMessage, Citation, useSendExploreQuestion } from '@/hooks/useExploreSessions';

interface Props {
  conversationId: string;
  messages: ChatMessage[];
  documentExtractionIds?: string[];
  onCitationClick?: (evidenceId: string, pageIndex?: number) => void;
  isLoading?: boolean;
}

// Suggested questions by document type
const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  policy: [
    'What are the policy effective dates?',
    'What are the coverage limits?',
    'Who is the named insured?',
    'What endorsements are included?',
    'What is the total premium?',
  ],
  quote: [
    'What is the quoted premium?',
    'What coverages are included?',
    'What is the proposed effective date?',
    'Are there any exclusions noted?',
  ],
  dec_page: [
    'What vehicles are listed?',
    'Who are the drivers?',
    'What are the liability limits?',
    'What are the deductibles?',
  ],
  loss_run: [
    'How many claims are shown?',
    'What is the total incurred?',
    'What was the largest claim?',
    'Are there any open claims?',
  ],
  default: [
    'What type of document is this?',
    'Who is this document for?',
    'What are the key dates?',
    'Summarize the main points.',
  ],
};

// Parse citations from message content like [ev_abc123]
function parseCitations(content: string): Array<{ text: string; evidenceId?: string }> {
  const parts: Array<{ text: string; evidenceId?: string }> = [];
  const regex = /\[ev_([a-zA-Z0-9_]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Text before the citation
    if (match.index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, match.index) });
    }
    // The citation
    parts.push({ text: `[${match[1]}]`, evidenceId: `ev_${match[1]}` });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ text: content }];
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null;

  if (confidence >= 0.8) {
    return (
      <Badge variant="default" className="bg-green-600 gap-1">
        <CheckCircle className="h-3 w-3" />
        High confidence
      </Badge>
    );
  } else if (confidence >= 0.5) {
    return (
      <Badge variant="secondary" className="gap-1">
        <HelpCircle className="h-3 w-3" />
        Medium confidence
      </Badge>
    );
  } else {
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-600 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Low confidence
      </Badge>
    );
  }
}

function MessageBubble({
  message,
  onCitationClick,
}: {
  message: ChatMessage;
  onCitationClick?: (evidenceId: string) => void;
}) {
  const isUser = message.role === 'user';
  const parts = parseCitations(message.content);

  // Try to extract confidence from structured response
  let confidence: number | undefined;
  try {
    const parsed = JSON.parse(message.content);
    if (typeof parsed.confidence === 'number') {
      confidence = parsed.confidence;
    }
  } catch {
    // Not JSON, that's fine
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-lg p-3 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted border'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground">AI Assistant</span>
            {confidence !== undefined && <ConfidenceBadge confidence={confidence} />}
          </div>
        )}

        <div className="text-sm whitespace-pre-wrap">
          {parts.map((part, idx) =>
            part.evidenceId ? (
              <button
                key={idx}
                onClick={() => onCitationClick?.(part.evidenceId!)}
                className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono hover:bg-blue-200 transition-colors"
                title="Click to highlight in document"
              >
                <FileText className="h-3 w-3" />
                {part.text}
              </button>
            ) : (
              <span key={idx}>{part.text}</span>
            )
          )}
        </div>

        {/* Explicit citations list if present */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Sources:</p>
            <div className="flex flex-wrap gap-1">
              {message.citations.map((citation, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => onCitationClick?.(citation.evidence_id)}
                >
                  {citation.evidence_id.slice(0, 10)}
                  {citation.page !== undefined && ` (p.${citation.page + 1})`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2 opacity-70">
          {new Date(message.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

export function ExploreChatPanel({
  conversationId,
  messages,
  documentExtractionIds,
  onCitationClick,
  isLoading: externalLoading,
}: Props) {
  const [question, setQuestion] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendQuestion = useSendExploreQuestion();
  const isLoading = externalLoading || sendQuestion.isPending;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setQuestion('');
    await sendQuestion.mutateAsync({
      conversationId,
      question: trimmed,
      documentExtractionIds,
    });

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedQuestion = (q: string) => {
    setQuestion(q);
    inputRef.current?.focus();
  };

  // Determine document type for suggested questions
  const docType = 'default'; // Would come from document metadata

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 py-3 border-b">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Ask Questions
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Ask questions about your documents. I'll cite evidence for every answer.
              </p>

              <Separator className="my-4" />

              <p className="text-xs text-muted-foreground mb-3">Suggested questions:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_QUESTIONS[docType].map((q, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleSuggestedQuestion(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onCitationClick={onCitationClick}
                />
              ))}

              {isLoading && (
                <div className="flex justify-start mb-4">
                  <div className="bg-muted border rounded-lg p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Searching documents...</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="flex-shrink-0 border-t p-3">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the document..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!question.trim() || isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            All answers cite evidence. Click citations to highlight in document.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
