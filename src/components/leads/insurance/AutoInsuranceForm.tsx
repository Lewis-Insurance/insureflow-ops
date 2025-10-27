import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import {
  useSaveLeadInsuranceDetails,
  useLeadInsuranceDetails,
  type AutoInsuranceDetails,
} from "@/integrations/supabase/hooks/useLeadInsuranceDetails";

const autoInsuranceSchema = z.object({
  vehicle_year: z.coerce
    .number()
    .min(1900, { message: "Year must be 1900 or later" })
    .max(new Date().getFullYear() + 1, { message: "Year cannot be in the future" })
    .optional(),
  vehicle_make: z.string()
    .trim()
    .max(50, { message: "Make must be less than 50 characters" })
    .optional()
    .or(z.literal('')),
  vehicle_model: z.string()
    .trim()
    .max(50, { message: "Model must be less than 50 characters" })
    .optional()
    .or(z.literal('')),
  vehicle_vin: z.string()
    .trim()
    .regex(/^$|^[A-HJ-NPR-Z0-9]{17}$/, { 
      message: "VIN must be exactly 17 alphanumeric characters (excluding I, O, Q)" 
    })
    .optional()
    .or(z.literal('')),
  vehicle_usage: z.enum(['personal', 'business', 'pleasure']).optional(),
  annual_mileage: z.coerce
    .number()
    .min(0, { message: "Mileage cannot be negative" })
    .max(100000, { message: "Mileage must be less than 100,000" })
    .optional(),
  current_liability_limits: z.string()
    .trim()
    .max(50, { message: "Liability limits must be less than 50 characters" })
    .optional()
    .or(z.literal('')),
  current_collision_deductible: z.coerce
    .number()
    .min(0, { message: "Deductible cannot be negative" })
    .max(10000, { message: "Deductible must be less than $10,000" })
    .optional(),
  current_comprehensive_deductible: z.coerce
    .number()
    .min(0, { message: "Deductible cannot be negative" })
    .max(10000, { message: "Deductible must be less than $10,000" })
    .optional(),
  uninsured_motorist: z.boolean().default(false),
  rental_reimbursement: z.boolean().default(false),
  roadside_assistance: z.boolean().default(false),
  primary_driver_name: z.string()
    .trim()
    .max(100, { message: "Name must be less than 100 characters" })
    .optional()
    .or(z.literal('')),
  primary_driver_dob: z.string().optional().or(z.literal('')),
  primary_driver_license: z.string()
    .trim()
    .max(50, { message: "License number must be less than 50 characters" })
    .optional()
    .or(z.literal('')),
  accidents_last_3_years: z.coerce
    .number()
    .min(0, { message: "Cannot be negative" })
    .max(20, { message: "Must be 20 or less" })
    .default(0),
  violations_last_3_years: z.coerce
    .number()
    .min(0, { message: "Cannot be negative" })
    .max(20, { message: "Must be 20 or less" })
    .default(0),
});

type AutoInsuranceFormValues = z.infer<typeof autoInsuranceSchema>;

interface AutoInsuranceFormProps {
  leadId: string;
}

export const AutoInsuranceForm: React.FC<AutoInsuranceFormProps> = ({
  leadId,
}) => {
  const { data: initialData, isLoading } = useLeadInsuranceDetails(leadId, 'auto');
  const saveMutation = useSaveLeadInsuranceDetails('auto');

  const form = useForm<AutoInsuranceFormValues>({
    resolver: zodResolver(autoInsuranceSchema),
    defaultValues: {
      vehicle_year: initialData?.vehicle_year,
      vehicle_make: initialData?.vehicle_make || '',
      vehicle_model: initialData?.vehicle_model || '',
      vehicle_vin: initialData?.vehicle_vin || '',
      vehicle_usage: (initialData?.vehicle_usage as any) || 'personal',
      annual_mileage: initialData?.annual_mileage,
      current_liability_limits: initialData?.current_liability_limits || '',
      current_collision_deductible: initialData?.current_collision_deductible,
      current_comprehensive_deductible: initialData?.current_comprehensive_deductible,
      uninsured_motorist: initialData?.uninsured_motorist || false,
      rental_reimbursement: initialData?.rental_reimbursement || false,
      roadside_assistance: initialData?.roadside_assistance || false,
      primary_driver_name: initialData?.primary_driver_name || '',
      primary_driver_dob: initialData?.primary_driver_dob || '',
      primary_driver_license: initialData?.primary_driver_license || '',
      accidents_last_3_years: initialData?.accidents_last_3_years || 0,
      violations_last_3_years: initialData?.violations_last_3_years || 0,
    },
  });

  // Update form when data loads
  React.useEffect(() => {
    if (initialData) {
      form.reset({
        vehicle_year: initialData.vehicle_year,
        vehicle_make: initialData.vehicle_make || '',
        vehicle_model: initialData.vehicle_model || '',
        vehicle_vin: initialData.vehicle_vin || '',
        vehicle_usage: (initialData.vehicle_usage as any) || 'personal',
        annual_mileage: initialData.annual_mileage,
        current_liability_limits: initialData.current_liability_limits || '',
        current_collision_deductible: initialData.current_collision_deductible,
        current_comprehensive_deductible: initialData.current_comprehensive_deductible,
        uninsured_motorist: initialData.uninsured_motorist || false,
        rental_reimbursement: initialData.rental_reimbursement || false,
        roadside_assistance: initialData.roadside_assistance || false,
        primary_driver_name: initialData.primary_driver_name || '',
        primary_driver_dob: initialData.primary_driver_dob || '',
        primary_driver_license: initialData.primary_driver_license || '',
        accidents_last_3_years: initialData.accidents_last_3_years || 0,
        violations_last_3_years: initialData.violations_last_3_years || 0,
      });
    }
  }, [initialData, form]);

  const onSubmit = async (values: AutoInsuranceFormValues) => {
    await saveMutation.mutateAsync({
      lead_id: leadId,
      ...values,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Vehicle Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Vehicle Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="vehicle_year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="2024" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vehicle_make"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Make</FormLabel>
                  <FormControl>
                    <Input placeholder="Honda" maxLength={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vehicle_model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Input placeholder="Accord" maxLength={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vehicle_vin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VIN</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="1HGCM82633A123456" 
                      maxLength={17} 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>17 characters, no I, O, or Q</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vehicle_usage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Usage</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select usage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="pleasure">Pleasure</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="annual_mileage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Annual Mileage</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="12000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Current Coverage */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Current Coverage</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="current_liability_limits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Liability Limits</FormLabel>
                  <FormControl>
                    <Input placeholder="100/300/100" maxLength={50} {...field} />
                  </FormControl>
                  <FormDescription>Format: BI/PD (e.g., 100/300/100)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="current_collision_deductible"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Collision Deductible ($)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="500" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="current_comprehensive_deductible"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comprehensive Deductible ($)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="500" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3">
            <FormField
              control={form.control}
              name="uninsured_motorist"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Uninsured Motorist Coverage</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rental_reimbursement"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Rental Reimbursement</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roadside_assistance"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Roadside Assistance</FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Driver Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Primary Driver Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="primary_driver_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" maxLength={100} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="primary_driver_dob"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="primary_driver_license"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>License Number</FormLabel>
                  <FormControl>
                    <Input placeholder="D1234567" maxLength={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accidents_last_3_years"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accidents (Last 3 Years)</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" max="20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="violations_last_3_years"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Violations (Last 3 Years)</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" max="20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            className="min-w-[120px]"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Details'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};
