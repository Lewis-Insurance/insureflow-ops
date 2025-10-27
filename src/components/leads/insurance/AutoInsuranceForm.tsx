import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VehicleCard } from "./VehicleCard";
import { DriverCard } from "./DriverCard";
import { useAutoVehicles, useAddAutoVehicle } from "@/hooks/useAutoVehicles";
import { useAutoDrivers, useAddAutoDriver } from "@/hooks/useAutoDrivers";
import { toast } from "sonner";

interface AutoInsuranceFormProps {
  leadId: string;
  onSuccess?: () => void;
}

export const AutoInsuranceForm: React.FC<AutoInsuranceFormProps> = ({
  leadId,
  onSuccess,
}) => {
  const { data: vehicles = [], isLoading: vehiclesLoading } = useAutoVehicles(leadId);
  const { data: drivers = [], isLoading: driversLoading } = useAutoDrivers(leadId);
  const addVehicle = useAddAutoVehicle();
  const addDriver = useAddAutoDriver();

  const handleAddVehicle = async () => {
    await addVehicle.mutateAsync({
      lead_id: leadId,
      vehicle_usage: 'personal',
      uninsured_motorist: false,
      rental_reimbursement: false,
      roadside_assistance: false,
    });
  };

  const handleAddDriver = async () => {
    await addDriver.mutateAsync({
      lead_id: leadId,
      driver_name: '',
      is_primary: drivers.length === 0,
      accidents_last_3_years: 0,
      violations_last_3_years: 0,
    });
  };

  if (vehiclesLoading || driversLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Vehicles</CardTitle>
            <Button onClick={handleAddVehicle} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {vehicles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No vehicles added yet. Click "Add Vehicle" to get started.
            </p>
          ) : (
            vehicles.map((vehicle, index) => (
              <VehicleCard key={vehicle.id || index} vehicle={vehicle} index={index} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Drivers</CardTitle>
            <Button onClick={handleAddDriver} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Driver
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {drivers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No drivers added yet. Click "Add Driver" to get started.
            </p>
          ) : (
            drivers.map((driver, index) => (
              <DriverCard key={driver.id || index} driver={driver} index={index} />
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSuccess} disabled={vehicles.length === 0 || drivers.length === 0}>
          Continue
        </Button>
      </div>
    </div>
  );
};
