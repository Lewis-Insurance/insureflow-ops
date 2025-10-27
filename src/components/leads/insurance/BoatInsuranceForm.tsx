import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { BoatInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface BoatInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const BoatInsuranceForm = ({ leadId, onSuccess }: BoatInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'boat');
  const saveDetails = useSaveLeadInsuranceDetails('boat');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'boat');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'boat');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<BoatInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: BoatInsuranceDetails) => {
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
          <h3 className="text-lg font-semibold">Boat Insurance Details</h3>
          <Label htmlFor="boat-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="boat-doc-upload"
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
            <Label htmlFor="vessel_type">Vessel Type</Label>
            <Input id="vessel_type" placeholder="e.g., Sailboat, Powerboat" {...register('vessel_type')} />
          </div>
          <div>
            <Label htmlFor="year_built">Year Built</Label>
            <Input id="year_built" type="number" {...register('year_built', { valueAsNumber: true })} />
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
            <Label htmlFor="length_feet">Length (feet)</Label>
            <Input id="length_feet" type="number" {...register('length_feet', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="hull_id">Hull ID</Label>
            <Input id="hull_id" {...register('hull_id')} />
          </div>
          <div>
            <Label htmlFor="engine_type">Engine Type</Label>
            <Input id="engine_type" placeholder="e.g., Inboard, Outboard" {...register('engine_type')} />
          </div>
          <div>
            <Label htmlFor="engine_horsepower">Engine Horsepower</Label>
            <Input id="engine_horsepower" type="number" {...register('engine_horsepower', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="number_of_engines">Number of Engines</Label>
            <Input id="number_of_engines" type="number" {...register('number_of_engines', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="vessel_value">Vessel Value ($)</Label>
            <Input id="vessel_value" type="number" {...register('vessel_value', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="primary_use">Primary Use</Label>
            <Input id="primary_use" placeholder="e.g., Recreation, Fishing" {...register('primary_use')} />
          </div>
          <div>
            <Label htmlFor="navigation_area">Navigation Area</Label>
            <Input id="navigation_area" placeholder="e.g., Inland, Coastal" {...register('navigation_area')} />
          </div>
          <div>
            <Label htmlFor="storage_location">Storage Location</Label>
            <Input id="storage_location" {...register('storage_location')} />
          </div>
          <div>
            <Label htmlFor="operator_name">Primary Operator Name</Label>
            <Input id="operator_name" {...register('operator_name')} />
          </div>
          <div>
            <Label htmlFor="operator_experience_years">Operator Experience (years)</Label>
            <Input id="operator_experience_years" type="number" {...register('operator_experience_years', { valueAsNumber: true })} />
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
            <Checkbox id="trailer_included" {...register('trailer_included')} />
            <Label htmlFor="trailer_included">Trailer Included</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="boating_safety_course" {...register('boating_safety_course')} />
            <Label htmlFor="boating_safety_course">Boating Safety Course Completed</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Boat Insurance Details
      </Button>
    </form>
  );
};
