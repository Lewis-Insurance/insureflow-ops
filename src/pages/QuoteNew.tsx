import { useSearchParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react';
import { AddQuoteModal } from '@/components/customers/AddQuoteModal';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { SectionLabel } from '@/components/cc';

const WORKFLOW = [
  { title: 'Gather information', detail: 'Upload documents or use the AI assistant to extract details.' },
  { title: 'Create the quote', detail: 'Fill in quote details with AI suggestions.' },
  { title: 'Auto-generated tasks', detail: 'The system creates follow-up tasks automatically.' },
];

export default function QuoteNew() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const accountId = searchParams.get('accountId');
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const { isModalOpen, openModal, closeModal, context } = useAIAssistant();

  if (!accountId) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-cc-danger">No account ID provided</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate('/customers')}
            className="gap-2 text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-cc-text-primary">Create quote</h1>
        </div>

        {/* Two paths: manual entry is the primary (one lime), AI is the alternate. */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
            <div className="flex items-center gap-2 text-cc-text-primary">
              <FileText className="h-5 w-5 text-cc-text-secondary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Manual quote entry</h2>
            </div>
            <p className="mt-1 flex-1 text-sm text-cc-text-muted">Enter quote details by hand for this customer.</p>
            <Button
              data-primary
              onClick={() => setShowQuoteModal(true)}
              className="mt-4 w-full rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              Create quote form
            </Button>
          </div>

          <div className="flex flex-col rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
            <div className="flex items-center gap-2 text-cc-text-primary">
              <Sparkles className="h-5 w-5 text-cc-text-secondary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">AI-assisted quote</h2>
            </div>
            <p className="mt-1 flex-1 text-sm text-cc-text-muted">
              Use AI to analyze documents and generate quote details.
            </p>
            <Button
              onClick={() => openModal()}
              variant="outline"
              className="mt-4 w-full rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              Open AI assistant
            </Button>
          </div>
        </div>

        {/* Workflow: quiet numbered steps, no decorative accent */}
        <section className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className="border-b border-cc-border-subtle px-5 py-3">
            <SectionLabel>Quote workflow</SectionLabel>
          </div>
          <ol className="divide-y divide-cc-border-subtle">
            {WORKFLOW.map((step, idx) => (
              <li key={step.title} className="flex items-start gap-3 px-5 py-3">
                <span className="cc-num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-cc-surface-raised text-xs font-semibold text-cc-text-secondary">
                  {idx + 1}
                </span>
                <div>
                  <p className="font-medium text-cc-text-primary">{step.title}</p>
                  <p className="text-sm text-cc-text-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <AddQuoteModal
        open={showQuoteModal}
        onOpenChange={setShowQuoteModal}
        accountId={accountId}
        onSuccess={() => navigate('/customers')}
      />

      <AIAssistantModal
        open={isModalOpen}
        onOpenChange={(open) => (open ? openModal() : closeModal())}
        context={context}
      />
    </AppLayout>
  );
}
