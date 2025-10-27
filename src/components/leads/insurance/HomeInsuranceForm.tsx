import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2 } from "lucide-react";
import { HomeInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface HomeInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const HomeInsuranceForm = ({ leadId, onSuccess }: HomeInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'home');
  const saveDetails = useSaveLeadInsuranceDetails('home');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'home');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'home');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<HomeInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: HomeInsuranceDetails) => {
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
          <h3 className="text-lg font-semibold">Home Insurance Details</h3>
          <Label htmlFor="home-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="home-doc-upload"
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
          <div className="md:col-span-2">
            <Label htmlFor="property_address">Property Address</Label>
            <Input id="property_address" {...register('property_address')} />
          </div>
          <div>
            <Label htmlFor="property_type">Property Type</Label>
            <Input id="property_type" placeholder="e.g., Single Family, Condo" {...register('property_type')} />
          </div>
          <div>
            <Label htmlFor="year_built">Year Built</Label>
            <Input id="year_built" type="number" {...register('year_built', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="square_footage">Square Footage</Label>
            <Input id="square_footage" type="number" {...register('square_footage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="construction_type">Construction Type</Label>
            <Input id="construction_type" placeholder="e.g., Frame, Masonry" {...register('construction_type')} />
          </div>
          <div>
            <Label htmlFor="roof_type">Roof Type</Label>
            <Input id="roof_type" {...register('roof_type')} />
          </div>
          <div>
            <Label htmlFor="roof_age">Roof Age (years)</Label>
            <Input id="roof_age" type="number" {...register('roof_age', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="number_of_stories">Number of Stories</Label>
            <Input id="number_of_stories" type="number" {...register('number_of_stories', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="dwelling_coverage">Dwelling Coverage ($)</Label>
            <Input id="dwelling_coverage" type="number" {...register('dwelling_coverage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="personal_property_coverage">Personal Property ($)</Label>
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
            <Label htmlFor="claims_last_5_years">Claims (Last 5 Years)</Label>
            <Input id="claims_last_5_years" type="number" {...register('claims_last_5_years', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="dog_breed">Dog Breed (if applicable)</Label>
            <Input id="dog_breed" {...register('dog_breed')} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="claim_details">Claim Details</Label>
            <Textarea id="claim_details" {...register('claim_details')} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox id="alarm_system" {...register('alarm_system')} />
            <Label htmlFor="alarm_system">Alarm System</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="sprinkler_system" {...register('sprinkler_system')} />
            <Label htmlFor="sprinkler_system">Sprinkler System</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="swimming_pool" {...register('swimming_pool')} />
            <Label htmlFor="swimming_pool">Swimming Pool</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="trampoline" {...register('trampoline')} />
            <Label htmlFor="trampoline">Trampoline</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="dogs" {...register('dogs')} />
            <Label htmlFor="dogs">Dogs</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Home Insurance Details
      </Button>
    </form>
  );
};
