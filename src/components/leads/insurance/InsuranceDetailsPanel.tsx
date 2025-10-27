import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, Home, Building2, Heart, Umbrella, Key, Plus } from "lucide-react";
import { InsuranceDetailsModal } from "../InsuranceDetailsModal";
import { type InsuranceType } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";

interface InsuranceDetailsPanelProps {
  leadId: string;
  insuranceTypes?: string[];
}

export const InsuranceDetailsPanel = ({ leadId, insuranceTypes = [] }: InsuranceDetailsPanelProps) => {
  const [selectedType, setSelectedType] = useState<InsuranceType | null>(null);

  const insuranceOptions = [
    { type: 'auto' as InsuranceType, label: 'Auto', icon: Car, enabled: insuranceTypes.includes('auto') },
    { type: 'home' as InsuranceType, label: 'Home', icon: Home, enabled: insuranceTypes.includes('home') },
    { type: 'commercial' as InsuranceType, label: 'Commercial', icon: Building2, enabled: insuranceTypes.includes('commercial') },
    { type: 'life' as InsuranceType, label: 'Life', icon: Heart, enabled: insuranceTypes.includes('life') },
    { type: 'umbrella' as InsuranceType, label: 'Umbrella', icon: Umbrella, enabled: insuranceTypes.includes('umbrella') },
    { type: 'renters' as InsuranceType, label: 'Renters', icon: Key, enabled: insuranceTypes.includes('renters') },
  ];

  const enabledOptions = insuranceOptions.filter(opt => opt.enabled);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Insurance Details</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {enabledOptions.map(({ type, label, icon: Icon }) => (
          <Card
            key={type}
            className="p-4 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => setSelectedType(type)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">Click to add/edit</p>
              </div>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
          </Card>
        ))}
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
    </div>
  );
};
