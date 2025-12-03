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

  const renderCommercialDetails = (data: any) => {
    const coverageTypes = [];
    if (data?.general_liability) coverageTypes.push('General Liability');
    if (data?.property) coverageTypes.push('Property');
    if (data?.workers_comp) coverageTypes.push('Workers Comp');
    if (data?.professional_liability) coverageTypes.push('Professional Liability');
    if (data?.cyber_liability) coverageTypes.push('Cyber Liability');
    if (data?.commercial_auto) coverageTypes.push('Commercial Auto');

    return (
      <div className="space-y-4">
        {data?.business_name && (
          <div>
            <p className="text-sm text-muted-foreground">Business Name</p>
            <p className="font-medium text-lg">{data.business_name}</p>
          </div>
        )}
        {data?.industry && (
          <div>
            <p className="text-sm text-muted-foreground">Industry</p>
            <p className="font-medium">{data.industry}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {data?.annual_revenue && (
            <div>
              <p className="text-sm text-muted-foreground">Annual Revenue</p>
              <p className="font-medium">${Number(data.annual_revenue).toLocaleString()}</p>
            </div>
          )}
          {data?.employee_count && (
            <div>
              <p className="text-sm text-muted-foreground">Employee Count</p>
              <p className="font-medium">{data.employee_count}</p>
            </div>
          )}
        </div>
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
        {data?.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="text-sm">{data.notes}</p>
          </div>
        )}
      </div>
    );
  };

  const renderAutoDetails = (data: any) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {data?.vehicle_count && (
          <div>
            <p className="text-sm text-muted-foreground">Vehicles</p>
            <p className="font-medium">{data.vehicle_count}</p>
          </div>
        )}
        {data?.driver_count && (
          <div>
            <p className="text-sm text-muted-foreground">Drivers</p>
            <p className="font-medium">{data.driver_count}</p>
          </div>
        )}
      </div>
      {data?.current_carrier && (
        <div>
          <p className="text-sm text-muted-foreground">Current Carrier</p>
          <p className="font-medium">{data.current_carrier}</p>
        </div>
      )}
      {data?.current_premium && (
        <div>
          <p className="text-sm text-muted-foreground">Current Premium</p>
          <p className="font-medium">${Number(data.current_premium).toLocaleString()}/year</p>
        </div>
      )}
    </div>
  );

  const renderHomeDetails = (data: any) => (
    <div className="space-y-4">
      {data?.property_address && (
        <div>
          <p className="text-sm text-muted-foreground">Property Address</p>
          <p className="font-medium">{data.property_address}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {data?.year_built && (
          <div>
            <p className="text-sm text-muted-foreground">Year Built</p>
            <p className="font-medium">{data.year_built}</p>
          </div>
        )}
        {data?.square_feet && (
          <div>
            <p className="text-sm text-muted-foreground">Square Feet</p>
            <p className="font-medium">{Number(data.square_feet).toLocaleString()}</p>
          </div>
        )}
        {data?.dwelling_coverage && (
          <div>
            <p className="text-sm text-muted-foreground">Dwelling Coverage</p>
            <p className="font-medium">${Number(data.dwelling_coverage).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderLifeDetails = (data: any) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {data?.coverage_amount && (
          <div>
            <p className="text-sm text-muted-foreground">Coverage Amount</p>
            <p className="font-medium">${Number(data.coverage_amount).toLocaleString()}</p>
          </div>
        )}
        {data?.policy_type && (
          <div>
            <p className="text-sm text-muted-foreground">Policy Type</p>
            <p className="font-medium capitalize">{data.policy_type}</p>
          </div>
        )}
      </div>
      {data?.beneficiaries && (
        <div>
          <p className="text-sm text-muted-foreground">Beneficiaries</p>
          <p className="font-medium">{data.beneficiaries}</p>
        </div>
      )}
    </div>
  );

  const renderGenericDetails = (data: any) => (
    <div className="space-y-4">
      {data?.current_carrier && (
        <div>
          <p className="text-sm text-muted-foreground">Current Carrier</p>
          <p className="font-medium">{data.current_carrier}</p>
        </div>
      )}
      {data?.current_premium && (
        <div>
          <p className="text-sm text-muted-foreground">Current Premium</p>
          <p className="font-medium">${Number(data.current_premium).toLocaleString()}/year</p>
        </div>
      )}
      {data?.notes && (
        <div>
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="text-sm">{data.notes}</p>
        </div>
      )}
    </div>
  );

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
