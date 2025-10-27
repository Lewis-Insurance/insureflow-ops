import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, Home, Building2, Heart, Umbrella, Key, Plus, FileText } from "lucide-react";
import { InsuranceDetailsModal } from "../InsuranceDetailsModal";
import { QuoteDocumentModal } from "./QuoteDocumentModal";
import { type InsuranceType, useLeadInsuranceDetails } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useGenerateQuoteDoc } from "@/hooks/useGenerateQuoteDoc";

interface InsuranceDetailsPanelProps {
  leadId: string;
  insuranceTypes?: string[];
}

export const InsuranceDetailsPanel = ({ leadId, insuranceTypes = [] }: InsuranceDetailsPanelProps) => {
  const [selectedType, setSelectedType] = useState<InsuranceType | null>(null);
  const [showQuoteDoc, setShowQuoteDoc] = useState(false);
  const [quoteDocData, setQuoteDocData] = useState<any>(null);
  const generateQuoteDoc = useGenerateQuoteDoc();

  const insuranceOptions = [
    { type: 'auto' as InsuranceType, label: 'Auto', icon: Car, enabled: insuranceTypes.includes('auto') },
    { type: 'home' as InsuranceType, label: 'Home', icon: Home, enabled: insuranceTypes.includes('home') },
    { type: 'commercial' as InsuranceType, label: 'Commercial', icon: Building2, enabled: insuranceTypes.includes('commercial') },
    { type: 'life' as InsuranceType, label: 'Life', icon: Heart, enabled: insuranceTypes.includes('life') },
    { type: 'umbrella' as InsuranceType, label: 'Umbrella', icon: Umbrella, enabled: insuranceTypes.includes('umbrella') },
    { type: 'renters' as InsuranceType, label: 'Renters', icon: Key, enabled: insuranceTypes.includes('renters') },
  ];

  const enabledOptions = insuranceOptions.filter(opt => opt.enabled);

  const handleGenerateQuoteDoc = async (type: InsuranceType, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await generateQuoteDoc.mutateAsync({
        leadId,
        insuranceType: type,
      });
      setQuoteDocData(result);
      setShowQuoteDoc(true);
    } catch (error) {
      console.error('Error generating quote doc:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Insurance Details</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {enabledOptions.map(({ type, label, icon: Icon }) => {
          const InsuranceDetailsComponent = () => {
            const { data: details } = useLeadInsuranceDetails(leadId, type);
            return (
              <Card
                key={type}
                className="p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {details ? 'Details saved' : 'Click to add'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSelectedType(type)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {details ? 'Edit' : 'Add'} Details
                  </Button>
                  {details && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={(e) => handleGenerateQuoteDoc(type, e)}
                      disabled={generateQuoteDoc.isPending}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      Generate Doc
                    </Button>
                  )}
                </div>
              </Card>
            );
          };
          return <InsuranceDetailsComponent key={type} />;
        })}
      </div>

      {enabledOptions.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">No insurance types selected for this lead</p>
        </Card>
      )}

      {selectedType && (
        <InsuranceDetailsModal
          leadId={leadId}
          insuranceType={selectedType}
          isOpen={!!selectedType}
          onClose={() => setSelectedType(null)}
        />
      )}

      {showQuoteDoc && quoteDocData && (
        <QuoteDocumentModal
          isOpen={showQuoteDoc}
          onClose={() => {
            setShowQuoteDoc(false);
            setQuoteDocData(null);
          }}
          quoteDocument={quoteDocData.quoteDocument}
          leadInfo={quoteDocData.leadInfo}
          isLoading={generateQuoteDoc.isPending}
        />
      )}
    </div>
  );
};
