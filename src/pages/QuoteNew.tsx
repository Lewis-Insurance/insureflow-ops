import { useSearchParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react';
import { AddQuoteModal } from '@/components/customers/AddQuoteModal';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { useAIAssistant } from '@/hooks/useAIAssistant';

export default function QuoteNew() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const accountId = searchParams.get('accountId');
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const { isModalOpen, openModal, closeModal } = useAIAssistant();

  if (!accountId) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-destructive">No account ID provided</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/customers')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Customers
            </Button>
            <h1 className="text-2xl font-semibold">Create Quote</h1>
          </div>
        </div>

        {/* Content */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Manual Quote Entry
              </CardTitle>
              <CardDescription>
                Enter quote details manually for this customer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowQuoteModal(true)} className="w-full">
                Create Quote Form
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI-Assisted Quote
              </CardTitle>
              <CardDescription>
                Use AI to analyze documents and generate quote details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={openModal} variant="outline" className="w-full">
                Open AI Assistant
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quote Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-medium">1. Gather Information</p>
                  <p className="text-sm text-muted-foreground">Upload documents or use AI assistant to extract details</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-medium">2. Create Quote</p>
                  <p className="text-sm text-muted-foreground">Fill in quote details with AI suggestions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-medium">3. Auto-Generated Tasks</p>
                  <p className="text-sm text-muted-foreground">System creates follow-up tasks automatically</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AddQuoteModal 
        open={showQuoteModal} 
        onOpenChange={setShowQuoteModal}
        accountId={accountId}
        onSuccess={() => navigate('/customers')}
      />
      
      <AIAssistantModal open={isModalOpen} onOpenChange={(open) => open ? openModal() : closeModal()} />
    </AppLayout>
  );
}