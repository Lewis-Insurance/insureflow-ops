import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AIAssistantChat, AIContext } from './AIAssistantChat';
import { Bot } from 'lucide-react';

interface AIAssistantSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: AIContext | null;
}

export function AIAssistantSidebar({ open, onOpenChange, context }: AIAssistantSidebarProps) {
  const getContextDescription = () => {
    if (!context) return 'Ask me anything';
    
    // Special handling for document context
    if (context.type === 'account' && context.metadata?.documentId) {
      return `Analyzing: ${context.name}`;
    }
    
    switch (context.type) {
      case 'account':
        return `Helping with: ${context.name}`;
      case 'policy':
        return `Policy: ${context.name}`;
      case 'quote':
        return `Quote: ${context.name}`;
      case 'task':
        return `Task: ${context.name}`;
      default:
        return 'Ask me anything';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            <SheetTitle>AI Assistant</SheetTitle>
          </div>
          {context && (
            <SheetDescription className="text-sm text-muted-foreground">
              {getContextDescription()}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <AIAssistantChat context={context} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
