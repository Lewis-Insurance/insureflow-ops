import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { UmbrellaInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface UmbrellaInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const UmbrellaInsuranceForm = ({ leadId, onSuccess }: UmbrellaInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'umbrella');
  const saveDetails = useSaveLeadInsuranceDetails('umbrella');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'umbrella');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'umbrella');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<UmbrellaInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: UmbrellaInsuranceDetails) => {
    saveDetails.mutate({ ...data, lead_id: leadId }, {
      onSuccess: () => {
        onSuccess?.();
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadDoc.mutateAsync(file);
      setValue('document_url', result.documentUrl);
      setValue('extracted_data', result.extractedData);
      
      if (result.extractedData) {
        await autoPopulate.mutateAsync(result.extractedData);
      }
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Umbrella Insurance Details</h3>
          <Label htmlFor="umbrella-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="umbrella-doc-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="desired_coverage_amount">Desired Coverage ($)</Label>
            <Input id="desired_coverage_amount" type="number" {...register('desired_coverage_amount', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="number_of_vehicles">Number of Vehicles</Label>
            <Input id="number_of_vehicles" type="number" {...register('number_of_vehicles', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="number_of_properties">Number of Properties</Label>
            <Input id="number_of_properties" type="number" {...register('number_of_properties', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="number_of_drivers">Number of Drivers</Label>
            <Input id="number_of_drivers" type="number" {...register('number_of_drivers', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="auto_liability_limits">Auto Liability Limits</Label>
            <Input id="auto_liability_limits" placeholder="e.g., 250/500/100" {...register('auto_liability_limits')} />
          </div>
          <div>
            <Label htmlFor="home_liability_limits">Home Liability Limits</Label>
            <Input id="home_liability_limits" placeholder="e.g., $300,000" {...register('home_liability_limits')} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label className="text-base font-semibold">Additional Assets</Label>
          <div className="flex items-center space-x-2">
            <Checkbox id="has_watercraft" {...register('has_watercraft')} />
            <Label htmlFor="has_watercraft">Watercraft (Boats, Jet Skis)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="has_recreational_vehicles" {...register('has_recreational_vehicles')} />
            <Label htmlFor="has_recreational_vehicles">Recreational Vehicles (RVs, ATVs)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="owns_rental_property" {...register('owns_rental_property')} />
            <Label htmlFor="owns_rental_property">Rental Property</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="teen_drivers" {...register('teen_drivers')} />
            <Label htmlFor="teen_drivers">Teen Drivers</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Umbrella Insurance Details
      </Button>
    </form>
  );
};
