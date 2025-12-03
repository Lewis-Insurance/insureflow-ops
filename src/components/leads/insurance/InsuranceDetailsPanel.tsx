import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Home, Building2, Heart, Umbrella, Key, Plus, Eye, Edit3 } from "lucide-react";
import { InsuranceDetailsModal } from "../InsuranceDetailsModal";
import { InsuranceDetailsViewModal } from "./InsuranceDetailsViewModal";
import { type InsuranceType, useLeadInsuranceDetails } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";

interface InsuranceDetailsPanelProps {
  leadId: string;
  insuranceTypes?: string[];
}

export const InsuranceDetailsPanel = ({ leadId, insuranceTypes = [] }: InsuranceDetailsPanelProps) => {
  const [selectedType, setSelectedType] = useState<InsuranceType | null>(null);
  const [viewType, setViewType] = useState<InsuranceType | null>(null);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {enabledOptions.map(({ type, label, icon: Icon }) => {
          const InsuranceCard = () => {
            const { data: details } = useLeadInsuranceDetails(leadId, type);
            
            // Get summary info for commercial
            const getSummary = () => {
              if (!details) return null;
              
              if (type === 'commercial') {
                const coverages: string[] = [];
                // Only show coverages that are explicitly true
                if (details.general_liability === true) coverages.push('GL');
                if (details.property_coverage === true) coverages.push('Prop');
                if (details.workers_comp === true) coverages.push('WC');
                if (details.commercial_auto === true) coverages.push('Auto');
                
                return {
                  title: details.business_name || null,
                  subtitle: coverages.length > 0 ? coverages.join(' • ') : null,
                };
              }
              
              if (type === 'auto') {
                return {
                  title: details.current_carrier || null,
                  subtitle: details.vehicle_count ? `${details.vehicle_count} vehicle(s)` : null,
                };
              }
              
              if (type === 'home') {
                return {
                  title: details.property_address || null,
                  subtitle: details.dwelling_coverage ? `$${Number(details.dwelling_coverage).toLocaleString()} coverage` : null,
                };
              }
              
              if (type === 'life') {
                return {
                  title: details.policy_type ? `${details.policy_type} policy` : null,
                  subtitle: details.coverage_amount ? `$${Number(details.coverage_amount).toLocaleString()} coverage` : null,
                };
              }
              
              return {
                title: details.current_carrier || null,
                subtitle: null,
              };
            };
            
            const summary = getSummary();
            
            return (
              <Card className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{label}</p>
                    {details ? (
                      <div className="mt-1">
                        {summary?.title && (
                          <p className="text-sm font-medium text-foreground truncate">
                            {summary.title}
                          </p>
                        )}
                        {summary?.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">
                            {summary.subtitle}
                          </p>
                        )}
                        {!summary?.title && !summary?.subtitle && (
                          <Badge variant="outline" className="text-xs">Details saved</Badge>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Click to add details</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSelectedType(type)}
                  >
                    {details ? (
                      <>
                        <Edit3 className="h-3 w-3 mr-1" />
                        Edit Details
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Details
                      </>
                    )}
                  </Button>
                  {details && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewType(type);
                      }}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  )}
                </div>
              </Card>
            );
          };
          return <InsuranceCard key={type} />;
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

      {viewType && (
        <InsuranceDetailsViewModal
          leadId={leadId}
          insuranceType={viewType}
          isOpen={!!viewType}
          onClose={() => setViewType(null)}
        />
      )}
    </div>
  );
};
