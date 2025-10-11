import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, FileText, MessageSquare } from 'lucide-react';
import { DocumentAnalysisButton } from '@/components/ai/DocumentAnalysisButton';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { useNavigate } from 'react-router-dom';

interface AICustomerActionsProps {
  accountId: string;
  accountName: string;
}

export function AICustomerActions({ accountId, accountName }: AICustomerActionsProps) {
  const { openModal } = useAIAssistant();
  const navigate = useNavigate();

  const goToAIQuote = () => {
    navigate(`/quotes/new?accountId=${encodeURIComponent(accountId)}`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle>AI Assistant</CardTitle>
        </div>
        <CardDescription>
          Get AI-powered help with <span className="font-medium">{accountName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DocumentAnalysisButton
          accountId={accountId}
          documentName={`Customer: ${accountName}`}
          variant="outline"
          size="default"
          data-testid="btn-doc-analyze"
        />
        
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={openModal}
          aria-label={`Ask AI about ${accountName}`}
          data-testid="btn-open-chat"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Ask AI About This Customer
        </Button>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={goToAIQuote}
          aria-label={`Start AI-assisted quote for ${accountName}`}
          data-testid="btn-ai-quote"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          AI-Assisted Quote
        </Button>
      </CardContent>
    </Card>
  );
}
