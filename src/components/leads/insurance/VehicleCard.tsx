import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Trash2, Edit2, Check, X } from "lucide-react";
import { AutoVehicle, useUpdateAutoVehicle, useDeleteAutoVehicle } from "@/hooks/useAutoVehicles";

const vehicleSchema = z.object({
  vehicle_year: z.coerce.number().min(1900).max(new Date().getFullYear() + 2).optional(),
  vehicle_make: z.string().trim().max(50).optional(),
  vehicle_model: z.string().trim().max(50).optional(),
  vehicle_vin: z.string().trim().max(17).regex(/^[A-HJ-NPR-Z0-9]{17}$|^$/, "Invalid VIN format").optional(),
  vehicle_usage: z.enum(['personal', 'business', 'pleasure']).optional(),
  annual_mileage: z.coerce.number().min(0).max(100000).optional(),
  current_liability_limits: z.string().trim().max(50).optional(),
  current_collision_deductible: z.coerce.number().min(0).optional(),
  current_comprehensive_deductible: z.coerce.number().min(0).optional(),
  uninsured_motorist: z.boolean().default(false),
  rental_reimbursement: z.boolean().default(false),
  roadside_assistance: z.boolean().default(false),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

interface VehicleCardProps {
  vehicle: AutoVehicle;
  index: number;
}

export const VehicleCard = ({ vehicle, index }: VehicleCardProps) => {
  const [isEditing, setIsEditing] = useState(!vehicle.id);
  const updateVehicle = useUpdateAutoVehicle();
  const deleteVehicle = useDeleteAutoVehicle();

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      vehicle_year: vehicle.vehicle_year,
      vehicle_make: vehicle.vehicle_make || '',
      vehicle_model: vehicle.vehicle_model || '',
      vehicle_vin: vehicle.vehicle_vin || '',
      vehicle_usage: vehicle.vehicle_usage || 'personal',
      annual_mileage: vehicle.annual_mileage,
      current_liability_limits: vehicle.current_liability_limits || '',
      current_collision_deductible: vehicle.current_collision_deductible,
      current_comprehensive_deductible: vehicle.current_comprehensive_deductible,
      uninsured_motorist: vehicle.uninsured_motorist || false,
      rental_reimbursement: vehicle.rental_reimbursement || false,
      roadside_assistance: vehicle.roadside_assistance || false,
    },
  });

  const onSubmit = async (values: VehicleFormValues) => {
    if (vehicle.id) {
      await updateVehicle.mutateAsync({
        id: vehicle.id,
        lead_id: vehicle.lead_id,
        ...values,
      });
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (vehicle.id && confirm('Are you sure you want to remove this vehicle?')) {
      await deleteVehicle.mutateAsync({ id: vehicle.id, leadId: vehicle.lead_id });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">Vehicle {index + 1}</CardTitle>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} disabled={!vehicle.id}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={form.handleSubmit(onSubmit)} disabled={updateVehicle.isPending}>
                <Check className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleteVehicle.isPending}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <Form {...form}>
            <form className="space-y-4">
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
                        <Input placeholder="Honda" {...field} />
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
                        <Input placeholder="Accord" {...field} />
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
                        <Input placeholder="1HGCM82633A123456" maxLength={17} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="vehicle_usage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Usage</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="uninsured_motorist"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel>Uninsured Motorist Coverage</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rental_reimbursement"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel>Rental Reimbursement</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roadside_assistance"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel>Roadside Assistance</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        ) : (
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Vehicle:</span> {vehicle.vehicle_year} {vehicle.vehicle_make} {vehicle.vehicle_model}</p>
            {vehicle.vehicle_vin && <p><span className="font-medium">VIN:</span> {vehicle.vehicle_vin}</p>}
            {vehicle.annual_mileage && <p><span className="font-medium">Annual Mileage:</span> {vehicle.annual_mileage}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
