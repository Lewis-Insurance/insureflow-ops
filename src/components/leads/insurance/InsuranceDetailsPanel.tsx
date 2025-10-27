import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoInsuranceForm } from "./AutoInsuranceForm";
import { HomeInsuranceForm } from "./HomeInsuranceForm";
import { Car, Home, Building2, Heart, Umbrella, Key } from "lucide-react";

interface InsuranceDetailsPanelProps {
  leadId: string;
  insuranceTypes?: string[];
}

export const InsuranceDetailsPanel = ({ leadId, insuranceTypes = [] }: InsuranceDetailsPanelProps) => {
  const hasAuto = insuranceTypes.includes('auto');
  const hasHome = insuranceTypes.includes('home');
  const hasCommercial = insuranceTypes.includes('commercial');
  const hasLife = insuranceTypes.includes('life');
  const hasUmbrella = insuranceTypes.includes('umbrella');
  const hasRenters = insuranceTypes.includes('renters');

  // Default to showing auto if no types specified
  const defaultTab = hasAuto ? 'auto' : hasHome ? 'home' : hasCommercial ? 'commercial' : hasLife ? 'life' : hasUmbrella ? 'umbrella' : hasRenters ? 'renters' : 'auto';

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Insurance Details</h3>
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          {hasAuto && (
            <TabsTrigger value="auto" className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Auto
            </TabsTrigger>
          )}
          {hasHome && (
            <TabsTrigger value="home" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              Home
            </TabsTrigger>
          )}
          {hasCommercial && (
            <TabsTrigger value="commercial" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Commercial
            </TabsTrigger>
          )}
          {hasLife && (
            <TabsTrigger value="life" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Life
            </TabsTrigger>
          )}
          {hasUmbrella && (
            <TabsTrigger value="umbrella" className="flex items-center gap-2">
              <Umbrella className="h-4 w-4" />
              Umbrella
            </TabsTrigger>
          )}
          {hasRenters && (
            <TabsTrigger value="renters" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Renters
            </TabsTrigger>
          )}
        </TabsList>

        {hasAuto && (
          <TabsContent value="auto">
            <AutoInsuranceForm leadId={leadId} />
          </TabsContent>
        )}
        {hasHome && (
          <TabsContent value="home">
            <HomeInsuranceForm leadId={leadId} />
          </TabsContent>
        )}
        {hasCommercial && (
          <TabsContent value="commercial">
            <div className="p-4 text-muted-foreground">Commercial insurance form coming soon...</div>
          </TabsContent>
        )}
        {hasLife && (
          <TabsContent value="life">
            <div className="p-4 text-muted-foreground">Life insurance form coming soon...</div>
          </TabsContent>
        )}
        {hasUmbrella && (
          <TabsContent value="umbrella">
            <div className="p-4 text-muted-foreground">Umbrella insurance form coming soon...</div>
          </TabsContent>
        )}
        {hasRenters && (
          <TabsContent value="renters">
            <div className="p-4 text-muted-foreground">Renters insurance form coming soon...</div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
