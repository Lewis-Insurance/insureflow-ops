import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, FileText, MessageSquare } from 'lucide-react';
import { DocumentAnalysisButton } from '@/components/ai/DocumentAnalysisButton';
import { useAIAssistant } from '@/hooks/useAIAssistant';

interface AICustomerActionsProps {
  accountId: string;
  accountName: string;
}

export function AICustomerActions({ accountId, accountName }: AICustomerActionsProps) {
  const { openModal } = useAIAssistant();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>AI Assistant</CardTitle>
        </div>
        <CardDescription>Get AI-powered help with this customer</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DocumentAnalysisButton
          accountId={accountId}
          variant="outline"
          size="default"
        />
        
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={openModal}
        >
          <MessageSquare className="h-4 w-4" />
          Ask AI About This Customer
        </Button>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => {
            // Navigate to create quote with AI
            window.location.href = `/quotes/new?accountId=${accountId}`;
          }}
        >
          <FileText className="h-4 w-4" />
          AI-Assisted Quote
        </Button>
      </CardContent>
    </Card>
  );
}
