import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2 } from "lucide-react";
import { CommercialInsuranceDetails, useLeadInsuranceDetails, useSaveLeadInsuranceDetails, useUploadInsuranceDocument, useAutoPopulateFromDocument } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";
import { useEffect, useState } from "react";

interface CommercialInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const CommercialInsuranceForm = ({ leadId, onSuccess }: CommercialInsuranceFormProps) => {
  const { data: details, isLoading } = useLeadInsuranceDetails(leadId, 'commercial');
  const saveDetails = useSaveLeadInsuranceDetails('commercial');
  const uploadDoc = useUploadInsuranceDocument(leadId, 'commercial');
  const autoPopulate = useAutoPopulateFromDocument(leadId, 'commercial');
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<CommercialInsuranceDetails>();
  
  // Watch checkbox values
  const generalLiability = watch('general_liability');
  const propertyCoverage = watch('property_coverage');
  const workersComp = watch('workers_comp');
  const commercialAuto = watch('commercial_auto');
  const professionalLiability = watch('professional_liability');
  const cyberLiability = watch('cyber_liability');

  useEffect(() => {
    if (details) {
      reset(details);
    }
  }, [details, reset]);

  const onSubmit = (data: CommercialInsuranceDetails) => {
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
          <h3 className="text-lg font-semibold">Commercial Insurance Details</h3>
          <Label htmlFor="commercial-doc-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Policy
            </div>
            <Input
              id="commercial-doc-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="business_name">Business Name</Label>
            <Input id="business_name" {...register('business_name')} />
          </div>
          <div>
            <Label htmlFor="business_type">Business Type</Label>
            <Input id="business_type" placeholder="e.g., LLC, Corporation" {...register('business_type')} />
          </div>
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" {...register('industry')} />
          </div>
          <div>
            <Label htmlFor="years_in_business">Years in Business</Label>
            <Input id="years_in_business" type="number" {...register('years_in_business', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="annual_revenue">Annual Revenue ($)</Label>
            <Input id="annual_revenue" type="number" {...register('annual_revenue', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="number_of_employees">Number of Employees</Label>
            <Input id="number_of_employees" type="number" {...register('number_of_employees', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="payroll_amount">Annual Payroll ($)</Label>
            <Input id="payroll_amount" type="number" {...register('payroll_amount', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="number_of_vehicles">Number of Vehicles</Label>
            <Input id="number_of_vehicles" type="number" {...register('number_of_vehicles', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="liability_limit">General Liability Limit ($)</Label>
            <Input id="liability_limit" type="number" {...register('liability_limit', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="property_value">Property Value ($)</Label>
            <Input id="property_value" type="number" {...register('property_value', { valueAsNumber: true })} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="business_description">Business Description</Label>
            <Textarea id="business_description" rows={3} {...register('business_description')} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label className="text-base font-semibold">Coverage Types</Label>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="general_liability" 
              checked={generalLiability === true}
              onCheckedChange={(checked) => setValue('general_liability', checked === true)}
            />
            <Label htmlFor="general_liability">General Liability</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="property_coverage" 
              checked={propertyCoverage === true}
              onCheckedChange={(checked) => setValue('property_coverage', checked === true)}
            />
            <Label htmlFor="property_coverage">Property Coverage</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="workers_comp" 
              checked={workersComp === true}
              onCheckedChange={(checked) => setValue('workers_comp', checked === true)}
            />
            <Label htmlFor="workers_comp">Workers' Compensation</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="commercial_auto" 
              checked={commercialAuto === true}
              onCheckedChange={(checked) => setValue('commercial_auto', checked === true)}
            />
            <Label htmlFor="commercial_auto">Commercial Auto</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="professional_liability" 
              checked={professionalLiability === true}
              onCheckedChange={(checked) => setValue('professional_liability', checked === true)}
            />
            <Label htmlFor="professional_liability">Professional Liability (E&O)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="cyber_liability" 
              checked={cyberLiability === true}
              onCheckedChange={(checked) => setValue('cyber_liability', checked === true)}
            />
            <Label htmlFor="cyber_liability">Cyber Liability</Label>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saveDetails.isPending}>
        {saveDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Commercial Insurance Details
      </Button>
    </form>
  );
};
