import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, Car, Home, Heart, Umbrella, Key, Ship, Bike } from "lucide-react";
import { type InsuranceType, useLeadInsuranceDetails } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";

interface InsuranceDetailsViewModalProps {
  leadId: string;
  insuranceType: InsuranceType;
  isOpen: boolean;
  onClose: () => void;
}

const ICONS: Record<InsuranceType, React.ElementType> = {
  auto: Car,
  home: Home,
  commercial: Building2,
  life: Heart,
  umbrella: Umbrella,
  renters: Key,
  boat: Ship,
  motorcycle: Bike,
  rv: Car,
};

const LABELS: Record<InsuranceType, string> = {
  auto: 'Auto Insurance',
  home: 'Home Insurance',
  commercial: 'Commercial Insurance',
  life: 'Life Insurance',
  umbrella: 'Umbrella Insurance',
  renters: 'Renters Insurance',
  boat: 'Boat Insurance',
  motorcycle: 'Motorcycle Insurance',
  rv: 'RV Insurance',
};

export const InsuranceDetailsViewModal = ({
  leadId,
  insuranceType,
  isOpen,
  onClose,
}: InsuranceDetailsViewModalProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, insuranceType);
  const Icon = ICONS[insuranceType];

  // Helper to render a field if it has a value
  const renderField = (label: string, value: any, format?: 'currency' | 'number' | 'text') => {
    if (value === null || value === undefined || value === '' || value === false) return null;
    
    let displayValue = value;
    if (format === 'currency' && typeof value === 'number') {
      displayValue = `$${value.toLocaleString()}`;
    } else if (format === 'number' && typeof value === 'number') {
      displayValue = value.toLocaleString();
    }
    
    return (
      <div key={label}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium">{displayValue}</p>
      </div>
    );
  };

  const renderCommercialDetails = (data: any) => {
    // Only show coverage types that are explicitly true
    const coverageTypes: string[] = [];
    if (data?.general_liability === true) coverageTypes.push('General Liability');
    if (data?.property === true) coverageTypes.push('Property');
    if (data?.workers_comp === true) coverageTypes.push('Workers Comp');
    if (data?.professional_liability === true) coverageTypes.push('Professional Liability');
    if (data?.cyber_liability === true) coverageTypes.push('Cyber Liability');
    if (data?.commercial_auto === true) coverageTypes.push('Commercial Auto');

    // Define all possible fields with their labels and formats
    const fields = [
      { key: 'business_name', label: 'Business Name' },
      { key: 'industry', label: 'Industry' },
      { key: 'annual_revenue', label: 'Annual Revenue', format: 'currency' as const },
      { key: 'employee_count', label: 'Employee Count', format: 'number' as const },
      { key: 'years_in_business', label: 'Years in Business', format: 'number' as const },
      { key: 'property_value', label: 'Property Value', format: 'currency' as const },
      { key: 'current_carrier', label: 'Current Carrier' },
      { key: 'current_premium', label: 'Current Premium', format: 'currency' as const },
      { key: 'policy_expiration', label: 'Policy Expiration' },
      { key: 'business_address', label: 'Business Address' },
      { key: 'notes', label: 'Notes' },
    ];

    return (
      <div className="space-y-4">
        {fields.map(({ key, label, format }) => renderField(label, data?.[key], format))}
        
        {coverageTypes.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">Coverage Types</p>
            <div className="flex flex-wrap gap-2">
              {coverageTypes.map((type) => (
                <Badge key={type} variant="secondary">{type}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAutoDetails = (data: any) => {
    const fields = [
      { key: 'vehicle_count', label: 'Vehicles', format: 'number' as const },
      { key: 'driver_count', label: 'Drivers', format: 'number' as const },
      { key: 'current_carrier', label: 'Current Carrier' },
      { key: 'current_premium', label: 'Current Premium', format: 'currency' as const },
      { key: 'policy_expiration', label: 'Policy Expiration' },
      { key: 'notes', label: 'Notes' },
    ];
    return (
      <div className="space-y-4">
        {fields.map(({ key, label, format }) => renderField(label, data?.[key], format))}
      </div>
    );
  };

  const renderHomeDetails = (data: any) => {
    const fields = [
      { key: 'property_address', label: 'Property Address' },
      { key: 'year_built', label: 'Year Built', format: 'number' as const },
      { key: 'square_feet', label: 'Square Feet', format: 'number' as const },
      { key: 'dwelling_coverage', label: 'Dwelling Coverage', format: 'currency' as const },
      { key: 'personal_property', label: 'Personal Property', format: 'currency' as const },
      { key: 'liability_coverage', label: 'Liability Coverage', format: 'currency' as const },
      { key: 'deductible', label: 'Deductible', format: 'currency' as const },
      { key: 'current_carrier', label: 'Current Carrier' },
      { key: 'current_premium', label: 'Current Premium', format: 'currency' as const },
      { key: 'notes', label: 'Notes' },
    ];
    return (
      <div className="space-y-4">
        {fields.map(({ key, label, format }) => renderField(label, data?.[key], format))}
      </div>
    );
  };

  const renderLifeDetails = (data: any) => {
    const fields = [
      { key: 'coverage_amount', label: 'Coverage Amount', format: 'currency' as const },
      { key: 'policy_type', label: 'Policy Type' },
      { key: 'beneficiaries', label: 'Beneficiaries' },
      { key: 'term_length', label: 'Term Length' },
      { key: 'current_carrier', label: 'Current Carrier' },
      { key: 'current_premium', label: 'Current Premium', format: 'currency' as const },
      { key: 'notes', label: 'Notes' },
    ];
    return (
      <div className="space-y-4">
        {fields.map(({ key, label, format }) => renderField(label, data?.[key], format))}
      </div>
    );
  };

  const renderGenericDetails = (data: any) => {
    // Skip internal fields and booleans, show everything else that has a value
    const skipFields = ['id', 'lead_id', 'created_at', 'updated_at', 'account_id'];
    
    const entries = Object.entries(data || {}).filter(([key, value]) => {
      if (skipFields.includes(key)) return false;
      if (value === null || value === undefined || value === '' || value === false) return false;
      if (typeof value === 'boolean') return false; // Skip boolean fields in generic view
      return true;
    });

    const formatLabel = (key: string) => {
      return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const formatValue = (key: string, value: any) => {
      if (typeof value === 'number') {
        if (key.includes('premium') || key.includes('coverage') || key.includes('value') || key.includes('revenue')) {
          return `$${value.toLocaleString()}`;
        }
        return value.toLocaleString();
      }
      return value;
    };

    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => (
          <div key={key}>
            <p className="text-sm text-muted-foreground">{formatLabel(key)}</p>
            <p className="font-medium">{formatValue(key, value)}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderDetails = () => {
    if (!details) return <p className="text-muted-foreground">No details saved</p>;
    
    switch (insuranceType) {
      case 'commercial':
        return renderCommercialDetails(details);
      case 'auto':
        return renderAutoDetails(details);
      case 'home':
        return renderHomeDetails(details);
      case 'life':
        return renderLifeDetails(details);
      default:
        return renderGenericDetails(details);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>{LABELS[insuranceType]} Details</DialogTitle>
          </div>
        </DialogHeader>
        <Separator />
        <div className="py-4">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
              <div className="h-6 bg-muted rounded w-2/3 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
            </div>
          ) : (
            renderDetails()
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
