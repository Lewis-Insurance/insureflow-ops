import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { AutoInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface AutoInsuranceFormProps {
  leadId: string;
}

export const AutoInsuranceForm = ({ leadId }: AutoInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'auto');
  const saveDetails = useSaveLeadInsuranceDetails('auto');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'auto');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'auto');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<AutoInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: AutoInsuranceDetails) => {
    saveDetails.mutate({ ...data, lead_id: leadId });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadDoc.mutateAsync(file);
      setValue('document_url', result.documentUrl);
      setValue('extracted_data', result.extractedData);
      
      // Auto-populate form
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
          <h3 className="text-lg font-semibold">Auto Insurance Details</h3>
          <Label htmlFor="auto-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="auto-doc-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vehicle_year">Vehicle Year</Label>
            <Input id="vehicle_year" type="number" {...register('vehicle_year', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="vehicle_make">Vehicle Make</Label>
            <Input id="vehicle_make" {...register('vehicle_make')} />
          </div>
          <div>
            <Label htmlFor="vehicle_model">Vehicle Model</Label>
            <Input id="vehicle_model" {...register('vehicle_model')} />
          </div>
          <div>
            <Label htmlFor="vehicle_vin">VIN</Label>
            <Input id="vehicle_vin" {...register('vehicle_vin')} />
          </div>
          <div>
            <Label htmlFor="vehicle_usage">Vehicle Usage</Label>
            <Input id="vehicle_usage" placeholder="e.g., Personal, Business" {...register('vehicle_usage')} />
          </div>
          <div>
            <Label htmlFor="annual_mileage">Annual Mileage</Label>
            <Input id="annual_mileage" type="number" {...register('annual_mileage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="current_liability_limits">Liability Limits</Label>
            <Input id="current_liability_limits" placeholder="e.g., 100/300/100" {...register('current_liability_limits')} />
          </div>
          <div>
            <Label htmlFor="current_collision_deductible">Collision Deductible</Label>
            <Input id="current_collision_deductible" type="number" {...register('current_collision_deductible', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="current_comprehensive_deductible">Comprehensive Deductible</Label>
            <Input id="current_comprehensive_deductible" type="number" {...register('current_comprehensive_deductible', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="primary_driver_name">Primary Driver Name</Label>
            <Input id="primary_driver_name" {...register('primary_driver_name')} />
          </div>
          <div>
            <Label htmlFor="primary_driver_dob">Driver DOB</Label>
            <Input id="primary_driver_dob" type="date" {...register('primary_driver_dob')} />
          </div>
          <div>
            <Label htmlFor="primary_driver_license">Driver License #</Label>
            <Input id="primary_driver_license" {...register('primary_driver_license')} />
          </div>
          <div>
            <Label htmlFor="accidents_last_3_years">Accidents (Last 3 Years)</Label>
            <Input id="accidents_last_3_years" type="number" {...register('accidents_last_3_years', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="violations_last_3_years">Violations (Last 3 Years)</Label>
            <Input id="violations_last_3_years" type="number" {...register('violations_last_3_years', { valueAsNumber: true })} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox id="uninsured_motorist" {...register('uninsured_motorist')} />
            <Label htmlFor="uninsured_motorist">Uninsured Motorist Coverage</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="rental_reimbursement" {...register('rental_reimbursement')} />
            <Label htmlFor="rental_reimbursement">Rental Reimbursement</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="roadside_assistance" {...register('roadside_assistance')} />
            <Label htmlFor="roadside_assistance">Roadside Assistance</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Auto Insurance Details
      </Button>
    </form>
  );
};
