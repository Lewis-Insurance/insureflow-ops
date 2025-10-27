import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileUp, Edit3, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AutoInsuranceForm } from "./insurance/AutoInsuranceForm";
import { HomeInsuranceForm } from "./insurance/HomeInsuranceForm";
import { CommercialInsuranceForm } from "./insurance/CommercialInsuranceForm";
import { LifeInsuranceForm } from "./insurance/LifeInsuranceForm";
import { UmbrellaInsuranceForm } from "./insurance/UmbrellaInsuranceForm";
import { RentersInsuranceForm } from "./insurance/RentersInsuranceForm";
import { BoatInsuranceForm } from "./insurance/BoatInsuranceForm";
import { MotorcycleInsuranceForm } from "./insurance/MotorcycleInsuranceForm";
import { RVInsuranceForm } from "./insurance/RVInsuranceForm";
import { DocumentUploadZone } from "./DocumentUploadZone";
import {
  useLeadInsuranceDetails,
  useUploadInsuranceDocument,
  useAutoPopulateFromDocument,
  type InsuranceType,
} from "@/integrations/supabase/hooks/useLeadInsuranceDetails";

interface InsuranceDetailsModalProps {
  leadId: string;
  insuranceType: InsuranceType;
  isOpen: boolean;
  onClose: () => void;
}

export const InsuranceDetailsModal: React.FC<InsuranceDetailsModalProps> = ({
  leadId,
  insuranceType,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'manual'>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const { data: existingDetails, isLoading } = useLeadInsuranceDetails(leadId, insuranceType);
  const uploadMutation = useUploadInsuranceDocument(leadId, insuranceType);
  const autoPopulateMutation = useAutoPopulateFromDocument(leadId, insuranceType);

  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
  };


  const handleUploadAndExtract = async () => {
    if (!uploadedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file first",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await uploadMutation.mutateAsync(uploadedFile);
      
      if (result.extractedData) {
        // Auto-populate the manual form with extracted data
        await autoPopulateMutation.mutateAsync(result.extractedData);
        setActiveTab('manual'); // Switch to manual tab to show populated data
        toast({
          title: "Success",
          description: "Document processed and form auto-populated",
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to process document",
        variant: "destructive",
      });
    }
  };

  const getInsuranceTypeLabel = () => {
    return insuranceType.charAt(0).toUpperCase() + insuranceType.slice(1);
  };

  const renderForm = () => {
    switch (insuranceType) {
      case 'auto':
        return <AutoInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'home':
        return <HomeInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'commercial':
        return <CommercialInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'life':
        return <LifeInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'umbrella':
        return <UmbrellaInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'renters':
        return <RentersInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'boat':
        return <BoatInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'motorcycle':
        return <MotorcycleInsuranceForm leadId={leadId} onSuccess={onClose} />;
      case 'rv':
        return <RVInsuranceForm leadId={leadId} onSuccess={onClose} />;
      default:
        return <div>Unsupported insurance type</div>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getInsuranceTypeLabel()} Insurance Details</DialogTitle>
          <DialogDescription>
            Upload a document or manually enter information to generate a quote
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              Upload Document
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-4">
              <DocumentUploadZone
                onFileSelect={handleFileSelect}
                acceptedTypes={['.pdf', '.jpg', '.jpeg', '.png', '.docx']}
                maxSizeMB={20}
              />

              {uploadedFile && (
                <Button
                  onClick={handleUploadAndExtract}
                  disabled={uploadMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Document...
                    </>
                  ) : (
                    <>
                      <FileUp className="mr-2 h-4 w-4" />
                      Extract & Auto-Fill Form
                    </>
                  )}
                </Button>
              )}

              <div className="p-4 bg-muted/50 border border-border rounded-lg">
                <h4 className="font-medium mb-2">
                  Supported Documents:
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Current insurance declarations page (Dec Page)</li>
                  <li>• Previous insurance quotes</li>
                  <li>• Policy documents</li>
                  <li>• Carrier statements</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              renderForm()
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
