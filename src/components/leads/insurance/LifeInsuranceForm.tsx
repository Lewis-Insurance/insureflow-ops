import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2 } from "lucide-react";
import { LifeInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface LifeInsuranceFormProps {
  leadId: string;
}

export const LifeInsuranceForm = ({ leadId }: LifeInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'life');
  const saveDetails = useSaveLeadInsuranceDetails('life');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'life');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'life');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue } = useForm<LifeInsuranceDetails>();

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: LifeInsuranceDetails) => {
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
          <h3 className="text-lg font-semibold">Life Insurance Details</h3>
          <Label htmlFor="life-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="life-doc-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="insured_name">Insured Name</Label>
            <Input id="insured_name" {...register('insured_name')} />
          </div>
          <div>
            <Label htmlFor="insured_dob">Date of Birth</Label>
            <Input id="insured_dob" type="date" {...register('insured_dob')} />
          </div>
          <div>
            <Label htmlFor="insured_age">Age</Label>
            <Input id="insured_age" type="number" {...register('insured_age', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="gender">Gender</Label>
            <Input id="gender" {...register('gender')} />
          </div>
          <div>
            <Label htmlFor="coverage_type">Coverage Type</Label>
            <Input id="coverage_type" placeholder="e.g., Term, Whole Life, Universal" {...register('coverage_type')} />
          </div>
          <div>
            <Label htmlFor="coverage_amount">Coverage Amount ($)</Label>
            <Input id="coverage_amount" type="number" {...register('coverage_amount', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="term_length">Term Length (years)</Label>
            <Input id="term_length" type="number" {...register('term_length', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="height_inches">Height (inches)</Label>
            <Input id="height_inches" type="number" {...register('height_inches', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="weight_lbs">Weight (lbs)</Label>
            <Input id="weight_lbs" type="number" {...register('weight_lbs', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="beneficiary_name">Beneficiary Name</Label>
            <Input id="beneficiary_name" {...register('beneficiary_name')} />
          </div>
          <div>
            <Label htmlFor="beneficiary_relationship">Beneficiary Relationship</Label>
            <Input id="beneficiary_relationship" {...register('beneficiary_relationship')} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="family_history">Family Medical History</Label>
            <Textarea id="family_history" rows={3} {...register('family_history')} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="tobacco_use" {...register('tobacco_use')} />
            <Label htmlFor="tobacco_use">Tobacco Use</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Life Insurance Details
      </Button>
    </form>
  );
};
