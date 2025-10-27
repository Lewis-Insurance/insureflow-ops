import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { RVInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface RVInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const RVInsuranceForm = ({ leadId, onSuccess }: RVInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'rv');
  const saveDetails = useSaveLeadInsuranceDetails('rv');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'rv');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'rv');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<RVInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: RVInsuranceDetails) => {
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
          <h3 className="text-lg font-semibold">RV Insurance Details</h3>
          <Label htmlFor="rv-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="rv-doc-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="current_carrier">Current Carrier</Label>
            <Input id="current_carrier" {...register('current_carrier')} />
          </div>
          <div>
            <Label htmlFor="expiration_date">Expiration Date</Label>
            <Input id="expiration_date" type="date" {...register('expiration_date')} />
          </div>
          <div>
            <Label htmlFor="rv_type">RV Type</Label>
            <Input id="rv_type" placeholder="e.g., Class A, Class B, Class C, Fifth Wheel" {...register('rv_type')} />
          </div>
          <div>
            <Label htmlFor="year">Year</Label>
            <Input id="year" type="number" {...register('year', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="make">Make</Label>
            <Input id="make" {...register('make')} />
          </div>
          <div>
            <Label htmlFor="model">Model</Label>
            <Input id="model" {...register('model')} />
          </div>
          <div>
            <Label htmlFor="vin">VIN</Label>
            <Input id="vin" {...register('vin')} />
          </div>
          <div>
            <Label htmlFor="length_feet">Length (feet)</Label>
            <Input id="length_feet" type="number" {...register('length_feet', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="rv_value">RV Value ($)</Label>
            <Input id="rv_value" type="number" {...register('rv_value', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="primary_use">Primary Use</Label>
            <Input id="primary_use" placeholder="e.g., Recreation, Full-Time Living" {...register('primary_use')} />
          </div>
          <div>
            <Label htmlFor="towing_vehicle">Towing Vehicle</Label>
            <Input id="towing_vehicle" {...register('towing_vehicle')} />
          </div>
          <div>
            <Label htmlFor="storage_location">Storage Location</Label>
            <Input id="storage_location" {...register('storage_location')} />
          </div>
          <div>
            <Label htmlFor="total_mileage">Total Mileage</Label>
            <Input id="total_mileage" type="number" {...register('total_mileage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="annual_mileage">Annual Mileage</Label>
            <Input id="annual_mileage" type="number" {...register('annual_mileage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="slide_outs">Number of Slide-Outs</Label>
            <Input id="slide_outs" type="number" {...register('slide_outs', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="awnings">Number of Awnings</Label>
            <Input id="awnings" type="number" {...register('awnings', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="claims_last_5_years">Claims (Last 5 Years)</Label>
            <Input id="claims_last_5_years" type="number" {...register('claims_last_5_years', { valueAsNumber: true })} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox id="agreed_value" {...register('agreed_value')} />
            <Label htmlFor="agreed_value">Agreed Value Policy</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="full_timer" {...register('full_timer')} />
            <Label htmlFor="full_timer">Full-Timer Coverage</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="solar_panels" {...register('solar_panels')} />
            <Label htmlFor="solar_panels">Solar Panels</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="satellite_dish" {...register('satellite_dish')} />
            <Label htmlFor="satellite_dish">Satellite Dish</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save RV Insurance Details
      </Button>
    </form>
  );
};
