import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2 } from "lucide-react";
import { RentersInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface RentersInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const RentersInsuranceForm = ({ leadId, onSuccess }: RentersInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'renters');
  const saveDetails = useSaveLeadInsuranceDetails('renters');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'renters');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'renters');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<RentersInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: RentersInsuranceDetails) => {
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
          <h3 className="text-lg font-semibold">Renters Insurance Details</h3>
          <Label htmlFor="renters-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="renters-doc-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="rental_address">Rental Address</Label>
            <Input id="rental_address" {...register('rental_address')} />
          </div>
          <div>
            <Label htmlFor="property_type">Property Type</Label>
            <Input id="property_type" placeholder="e.g., Apartment, House, Condo" {...register('property_type')} />
          </div>
          <div>
            <Label htmlFor="square_footage">Square Footage</Label>
            <Input id="square_footage" type="number" {...register('square_footage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="personal_property_coverage">Personal Property Coverage ($)</Label>
            <Input id="personal_property_coverage" type="number" {...register('personal_property_coverage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="liability_coverage">Liability Coverage ($)</Label>
            <Input id="liability_coverage" type="number" {...register('liability_coverage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="deductible">Deductible ($)</Label>
            <Input id="deductible" type="number" {...register('deductible', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="loss_of_use_coverage">Loss of Use Coverage ($)</Label>
            <Input id="loss_of_use_coverage" type="number" {...register('loss_of_use_coverage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="pet_type">Pet Type (if applicable)</Label>
            <Input id="pet_type" {...register('pet_type')} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="valuable_items_description">Valuable Items Description</Label>
            <Textarea id="valuable_items_description" rows={3} {...register('valuable_items_description')} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox id="alarm_system" {...register('alarm_system')} />
            <Label htmlFor="alarm_system">Alarm System</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="has_pets" {...register('has_pets')} />
            <Label htmlFor="has_pets">Has Pets</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="valuable_items" {...register('valuable_items')} />
            <Label htmlFor="valuable_items">High-Value Items (Jewelry, Electronics, etc.)</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Renters Insurance Details
      </Button>
    </form>
  );
};
