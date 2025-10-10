import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AIAssistantChat } from './AIAssistantChat';

interface AIAssistantSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIAssistantSidebar({ open, onOpenChange }: AIAssistantSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>AI Assistant</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <AIAssistantChat />
        </div>
      </SheetContent>
    </Sheet>
  );
}
