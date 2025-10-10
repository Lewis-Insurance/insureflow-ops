import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  documents?: DocumentInfo[];
}

interface DocumentInfo {
  name: string;
  size: number;
  type: string;
  content?: string;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function AIAssistantChat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I\'m your AI assistant. I can help you compare quotes, analyze policies, and answer insurance questions. Upload documents or ask me anything!',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedDocs, setAttachedDocs] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const extractTextFromFile = async (file: File): Promise<string> => {
    // For now, return file metadata. In production, use pdf.js, mammoth, etc.
    return `[File: ${file.name}, Type: ${file.type}, Size: ${(file.size / 1024).toFixed(2)}KB]`;
  };

  const handleSend = async () => {
    if (!input.trim() && attachedDocs.length === 0) return;
    if (isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input || 'Please analyze these documents',
      timestamp: new Date(),
      documents: attachedDocs.map(doc => ({
        name: doc.name,
        size: doc.size,
        type: doc.type
      }))
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Abort any existing request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      // Extract document content
      const documentsWithContent = await Promise.all(
        attachedDocs.map(async (file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          content: await extractTextFromFile(file)
        }))
      );

      // Determine action based on context
      let action = 'chat';
      if (documentsWithContent.length > 1) {
        action = 'compare_quotes';
      } else if (documentsWithContent.length === 1) {
        action = 'analyze_policy';
      }

      // Build conversation history including the latest user message
      const recentMessages = [...messages, userMessage].slice(-10);

      // Call AI edge function
      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          action,
          documents: documentsWithContent,
          message: userMessage.content,
          conversationHistory: recentMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        }
      });

      // Check if aborted
      if (signal.aborted) return;

      if (error) throw error;

      // Guard against malformed response
      const responseText = typeof data?.response === 'string' 
        ? data.response 
        : 'I analyzed your request, but the response format was unexpected.';

      const assistantMessage: Message = {
        role: 'assistant',
        content: responseText,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setAttachedDocs([]);

    } catch (error) {
      // Ignore abort errors
      if ((error as any).name === 'AbortError') return;

      console.error('AI Assistant Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to get AI response. Please try again.',
        variant: 'destructive',
      });
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 10MB limit`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    });

    // Deduplicate by name + size
    setAttachedDocs(prev => {
      const map = new Map(prev.map(f => [f.name + f.size, f]));
      for (const f of validFiles) {
        map.set(f.name + f.size, f);
      }
      return Array.from(map.values());
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachedDocs(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-4 overflow-y-auto" ref={scrollerRef}>
        <div className="space-y-4">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card className={`max-w-[80%] p-3 ${
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              }`}>
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                {message.documents && message.documents.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.documents.map((doc, docIdx) => (
                      <div key={docIdx} className="flex items-center gap-2 text-xs opacity-80">
                        <FileText className="h-3 w-3" />
                        <span>{doc.name}</span>
                        <span className="opacity-70">({(doc.size / 1024 / 1024).toFixed(1)} MB)</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs opacity-60 mt-2">
                  {timeFmt.format(message.timestamp)}
                </div>
              </Card>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <Card className="bg-muted p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Attached Documents */}
      {attachedDocs.length > 0 && (
        <div className="border-t p-2">
          <div className="flex flex-wrap gap-2">
            {attachedDocs.map((file, idx) => (
              <Badge key={idx} variant="secondary" className="gap-2">
                <FileText className="h-3 w-3" />
                <span className="text-xs">{file.name}</span>
                <span className="text-xs opacity-70">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="ml-1 hover:text-destructive"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileAttach}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            aria-label="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything about insurance, quotes, or policies..."
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              // Allow Ctrl/Cmd+Enter as alternative
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && attachedDocs.length === 0)}
            size="icon"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Tip: Upload multiple documents to compare quotes • Shift+Enter or Ctrl+Enter for new line
        </div>
      </div>
    </div>
  );
}
