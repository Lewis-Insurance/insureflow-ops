import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface QuoteDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteDocument: string;
  leadInfo: {
    name: string;
    email: string | null;
    phone: string | null;
    insuranceType: string;
  };
  isLoading?: boolean;
}

export const QuoteDocumentModal: React.FC<QuoteDocumentModalProps> = ({
  isOpen,
  onClose,
  quoteDocument,
  leadInfo,
  isLoading = false,
}) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(quoteDocument);
    toast({
      title: "Copied to clipboard",
      description: "Quote document copied successfully",
    });
  };

  const handleDownload = () => {
    const blob = new Blob([quoteDocument], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${leadInfo.name.replace(/\s+/g, '_')}_${leadInfo.insuranceType}_quote_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Quote document downloaded successfully",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {leadInfo.insuranceType.charAt(0).toUpperCase() + leadInfo.insuranceType.slice(1)} Insurance Quote Document
          </DialogTitle>
          <DialogDescription>
            Professional quote document for {leadInfo.name}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Generating quote document...</span>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[500px] w-full border rounded-md p-4 bg-muted/30">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap font-mono text-sm">
                {quoteDocument}
              </div>
            </ScrollArea>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleCopy}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </Button>
              <Button
                onClick={handleDownload}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Document
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
