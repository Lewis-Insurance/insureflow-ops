import React, { useState } from 'react';
import { Search, Sparkles, BookOpen, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface KBAnswer {
  faq_short_answer?: string;
  answer_canonical_markdown?: string;
  question_canonical?: string;
  carrier?: string;
  jurisdiction?: string;
  confidence?: number;
  tags?: string;
}

const SmartQA = () => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<KBAnswer | null>(null);
  const [showFullAnswer, setShowFullAnswer] = useState(false);
  const [carrier, setCarrier] = useState<string>('');
  const [jurisdiction, setJurisdiction] = useState<string>('FL');
  const { toast } = useToast();

  const handleAskQuestion = async () => {
    if (!question.trim()) {
      toast({
        title: "Question Required",
        description: "Please enter a question",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setAnswer(null);
    setShowFullAnswer(false);

    try {
      // Normalize carrier input
      const normalizedCarrier = carrier.trim() || null;
      
      // Try to call the RPC function
      const { data, error } = await supabase.rpc('kb_resolve_answer' as any, {
        q: question.trim(),
        in_carrier: normalizedCarrier,
        in_jurisdiction: jurisdiction || 'FL',
      });

      if (error) {
        console.error('RPC error, falling back to view query:', error);
        // Fallback: Query the knowledge_base table directly
        const { data: viewData, error: viewError } = await supabase
          .from('knowledge_base')
          .select('*')
          .or(`title.ilike.%${question}%,content.ilike.%${question}%`)
          .limit(1);

        if (viewError) throw viewError;

        if (viewData && viewData.length > 0) {
          // Map the view data to our answer format
          const entry = viewData[0];
          setAnswer({
            question_canonical: entry.title,
            faq_short_answer: entry.content?.substring(0, 200) + '...',
            answer_canonical_markdown: entry.content,
            carrier: carrier || 'ALL',
            jurisdiction: jurisdiction || 'ALL',
            tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : entry.tags,
            confidence: 3,
          });
        } else {
          setAnswer(null);
          toast({
            title: "No Answer Found",
            description: "Try rephrasing your question or check the knowledge base",
            variant: "destructive",
          });
        }
        return;
      }

      if (data && Array.isArray(data) && data.length > 0) {
        setAnswer(data[0]);
        // Log for debugging
        console.log('Answer found:', {
          carrier: data[0].carrier,
          priority: data[0].priority,
          question: data[0].question_canonical
        });
      } else {
        // No answer found
        console.log('No answer found for:', { question, carrier: normalizedCarrier, jurisdiction });
        setAnswer(null);
        toast({
          title: "No Answer Found",
          description: "Try rephrasing your question or check the knowledge base",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error fetching answer:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch answer",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <CardTitle>Smart Q&A</CardTitle>
          </div>
          <CardDescription>
            Ask questions and get instant answers from your knowledge base
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Search Interface */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Question Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Your Question</label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., What is comprehensive coverage?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                />
                <Button 
                  onClick={handleAskQuestion} 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Search className="w-4 h-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Ask
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Carrier (Optional)</label>
                <Input
                  placeholder="e.g., Progressive, ALL"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">State/Jurisdiction</label>
                <Select value={jurisdiction} onValueChange={setJurisdiction}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FL">Florida (FL)</SelectItem>
                    <SelectItem value="TX">Texas (TX)</SelectItem>
                    <SelectItem value="CA">California (CA)</SelectItem>
                    <SelectItem value="NY">New York (NY)</SelectItem>
                    <SelectItem value="ALL">All States</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Answer Display */}
      {answer && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">
                  {answer.question_canonical || question}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {answer.confidence && (
                    <Badge variant="secondary">
                      Confidence: {answer.confidence}/5
                    </Badge>
                  )}
                  {answer.carrier && (
                    <Badge variant="outline">
                      {answer.carrier}
                    </Badge>
                  )}
                  {answer.jurisdiction && (
                    <Badge variant="outline">
                      {answer.jurisdiction}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Short Answer */}
              {answer.faq_short_answer && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="font-medium">
                    {answer.faq_short_answer}
                  </AlertDescription>
                </Alert>
              )}

              {/* Full Answer (Collapsible) */}
              {answer.answer_canonical_markdown && (
                <Collapsible open={showFullAnswer} onOpenChange={setShowFullAnswer}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <BookOpen className="w-4 h-4 mr-2" />
                      {showFullAnswer ? 'Hide' : 'Read'} Full Answer
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <div className="prose prose-sm max-w-none p-4 rounded-lg bg-background border">
                      <div className="whitespace-pre-wrap">
                        {answer.answer_canonical_markdown}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Tags */}
              {answer.tags && (
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Tags:</span>
                  {answer.tags.split(',').map((tag, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Examples */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Try These Questions:</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              "What is comprehensive coverage?",
              "How do I file a claim?",
              "What are the state minimum requirements?",
              "What discounts are available?",
              "How does bundling work?",
              "What is the deductible for homeowners insurance?"
            ].map((q, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="justify-start text-left h-auto py-2 px-3"
                onClick={() => {
                  setQuestion(q);
                  setAnswer(null);
                }}
              >
                <Search className="w-3 h-3 mr-2 flex-shrink-0" />
                <span className="text-xs">{q}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SmartQA;
