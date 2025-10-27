import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Edit2, Check, X } from "lucide-react";
import { AutoDriver, useUpdateAutoDriver, useDeleteAutoDriver } from "@/hooks/useAutoDrivers";

const driverSchema = z.object({
  driver_name: z.string().trim().min(1, "Driver name is required").max(100),
  driver_dob: z.string().optional(),
  driver_license: z.string().trim().max(50).optional(),
  driver_relationship: z.string().trim().max(50).optional(),
  is_primary: z.boolean().default(false),
  accidents_last_3_years: z.coerce.number().min(0).max(20).default(0),
  violations_last_3_years: z.coerce.number().min(0).max(20).default(0),
});

type DriverFormValues = z.infer<typeof driverSchema>;

interface DriverCardProps {
  driver: AutoDriver;
  index: number;
}

export const DriverCard = ({ driver, index }: DriverCardProps) => {
  const [isEditing, setIsEditing] = useState(!driver.id);
  const updateDriver = useUpdateAutoDriver();
  const deleteDriver = useDeleteAutoDriver();

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      driver_name: driver.driver_name || '',
      driver_dob: driver.driver_dob || '',
      driver_license: driver.driver_license || '',
      driver_relationship: driver.driver_relationship || '',
      is_primary: driver.is_primary || false,
      accidents_last_3_years: driver.accidents_last_3_years || 0,
      violations_last_3_years: driver.violations_last_3_years || 0,
    },
  });

  const onSubmit = async (values: DriverFormValues) => {
    if (driver.id) {
      await updateDriver.mutateAsync({
        id: driver.id,
        lead_id: driver.lead_id,
        driver_name: values.driver_name,
        ...values,
      });
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (driver.id && confirm('Are you sure you want to remove this driver?')) {
      await deleteDriver.mutateAsync({ id: driver.id, leadId: driver.lead_id });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">
          Driver {index + 1} {driver.is_primary && <span className="text-sm text-muted-foreground">(Primary)</span>}
        </CardTitle>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} disabled={!driver.id}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={form.handleSubmit(onSubmit)} disabled={updateDriver.isPending}>
                <Check className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleteDriver.isPending}>
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
                  name="driver_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="driver_dob"
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
                  name="driver_license"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Number</FormLabel>
                      <FormControl>
                        <Input placeholder="D1234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="driver_relationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <FormControl>
                        <Input placeholder="Self, Spouse, Child, etc." {...field} />
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
                        <Input type="number" min="0" {...field} />
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
                        <Input type="number" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="is_primary"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel>Set as Primary Driver</FormLabel>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        ) : (
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Name:</span> {driver.driver_name}</p>
            {driver.driver_relationship && <p><span className="font-medium">Relationship:</span> {driver.driver_relationship}</p>}
            {driver.driver_license && <p><span className="font-medium">License:</span> {driver.driver_license}</p>}
            <p><span className="font-medium">Accidents:</span> {driver.accidents_last_3_years || 0}</p>
            <p><span className="font-medium">Violations:</span> {driver.violations_last_3_years || 0}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
