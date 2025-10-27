import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { MotorcycleInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface MotorcycleInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const MotorcycleInsuranceForm = ({ leadId, onSuccess }: MotorcycleInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'motorcycle');
  const saveDetails = useSaveLeadInsuranceDetails('motorcycle');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'motorcycle');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'motorcycle');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<MotorcycleInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: MotorcycleInsuranceDetails) => {
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
          <h3 className="text-lg font-semibold">Motorcycle Insurance Details</h3>
          <Label htmlFor="motorcycle-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="motorcycle-doc-upload"
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
            <Label htmlFor="motorcycle_type">Motorcycle Type</Label>
            <Input id="motorcycle_type" placeholder="e.g., Sport, Cruiser, Touring" {...register('motorcycle_type')} />
          </div>
          <div>
            <Label htmlFor="engine_size_cc">Engine Size (cc)</Label>
            <Input id="engine_size_cc" type="number" {...register('engine_size_cc', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="custom_parts_value">Custom Parts Value ($)</Label>
            <Input id="custom_parts_value" type="number" {...register('custom_parts_value', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="storage_location">Storage Location</Label>
            <Input id="storage_location" {...register('storage_location')} />
          </div>
          <div>
            <Label htmlFor="annual_mileage">Annual Mileage</Label>
            <Input id="annual_mileage" type="number" {...register('annual_mileage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="primary_use">Primary Use</Label>
            <Input id="primary_use" placeholder="e.g., Pleasure, Commuting" {...register('primary_use')} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox id="anti_theft_device" {...register('anti_theft_device')} />
            <Label htmlFor="anti_theft_device">Anti-Theft Device Installed</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Motorcycle Insurance Details
      </Button>
    </form>
  );
};
