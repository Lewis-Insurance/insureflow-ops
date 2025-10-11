import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AIAssistantChat, AIContext } from './AIAssistantChat';
import { Bot } from 'lucide-react';

interface AIAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: AIContext | null;
}

export function AIAssistantModal({ open, onOpenChange, context }: AIAssistantModalProps) {
  const getContextDescription = () => {
    if (!context) return 'Ask me anything about insurance, policies, or quotes';
    
    // Special handling for document context
    if (context.type === 'account' && context.metadata?.documentId) {
      return `Document Analysis: ${context.name}`;
    }
    
    switch (context.type) {
      case 'account':
        return `Context: Customer ${context.name}`;
      case 'policy':
        return `Context: Policy ${context.name}`;
      case 'quote':
        return `Context: Quote ${context.name}`;
      case 'task':
        return `Context: Task ${context.name}`;
      default:
        return 'Ask me anything about insurance, policies, or quotes';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>AI Assistant</DialogTitle>
          </div>
          <DialogDescription>{getContextDescription()}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <AIAssistantChat context={context} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
