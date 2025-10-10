import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AIAssistantChat } from './AIAssistantChat';

interface AIAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIAssistantModal({ open, onOpenChange }: AIAssistantModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>AI Assistant</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <AIAssistantChat />
        </div>
      </DialogContent>
    </Dialog>
  );
}
