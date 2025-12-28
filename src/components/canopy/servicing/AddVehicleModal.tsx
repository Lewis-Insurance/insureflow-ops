// ============================================================================
// ADD VEHICLE MODAL
// ============================================================================
// Modal for adding a new vehicle to a policy via Canopy Servicing API.
// Includes VIN decoder integration and validation.
// ============================================================================

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAddVehicle } from '@/hooks/useCanopyServicing';
import { useToast } from '@/hooks/use-toast';
import { Car, Loader2, Search, AlertCircle, Check } from 'lucide-react';

interface AddVehicleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pullId: string;
  onSuccess?: () => void;
}

interface VehicleFormData {
  year: string;
  make: string;
  model: string;
  vin: string;
  usage_type: string;
  annual_mileage: string;
}

const USAGE_TYPES = [
  { value: 'pleasure', label: 'Pleasure' },
  { value: 'commute', label: 'Commute' },
  { value: 'business', label: 'Business' },
  { value: 'farm', label: 'Farm' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => CURRENT_YEAR - i + 1);

export function AddVehicleModal({
  open,
  onOpenChange,
  pullId,
  onSuccess,
}: AddVehicleModalProps) {
  const [formData, setFormData] = useState<VehicleFormData>({
    year: '',
    make: '',
    model: '',
    vin: '',
    usage_type: 'pleasure',
    annual_mileage: '',
  });
  const [isDecodingVin, setIsDecodingVin] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleFormData, string>>>({});

  const { addVehicle, isPending } = useAddVehicle(pullId);
  const { toast } = useToast();

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof VehicleFormData, string>> = {};

    if (!formData.year) {
      newErrors.year = 'Year is required';
    }
    if (!formData.make) {
      newErrors.make = 'Make is required';
    }
    if (!formData.model) {
      newErrors.model = 'Model is required';
    }
    if (formData.vin && formData.vin.length !== 17) {
      newErrors.vin = 'VIN must be 17 characters';
    }
    if (formData.annual_mileage && isNaN(Number(formData.annual_mileage))) {
      newErrors.annual_mileage = 'Must be a number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDecodeVin = async () => {
    if (!formData.vin || formData.vin.length !== 17) {
      setErrors({ ...errors, vin: 'Enter a valid 17-character VIN' });
      return;
    }

    setIsDecodingVin(true);
    try {
      // Call NHTSA VIN decoder API (free, no key required)
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${formData.vin}?format=json`
      );
      const data = await response.json();

      if (data.Results) {
        const getValue = (variableId: number): string => {
          const result = data.Results.find((r: any) => r.VariableId === variableId);
          return result?.Value || '';
        };

        const year = getValue(29); // ModelYear
        const make = getValue(26); // Make
        const model = getValue(28); // Model

        if (year || make || model) {
          setFormData((prev) => ({
            ...prev,
            year: year || prev.year,
            make: make || prev.make,
            model: model || prev.model,
          }));
          setVinDecoded(true);
          toast({
            title: 'VIN decoded',
            description: `${year} ${make} ${model}`,
          });
        } else {
          toast({
            title: 'VIN not found',
            description: 'Could not decode this VIN. Please enter vehicle details manually.',
            variant: 'destructive',
          });
        }
      }
    } catch (err) {
      toast({
        title: 'VIN decode failed',
        description: 'Could not connect to VIN decoder service',
        variant: 'destructive',
      });
    } finally {
      setIsDecodingVin(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const result = await addVehicle({
        year: parseInt(formData.year, 10),
        make: formData.make,
        model: formData.model,
        vin: formData.vin || undefined,
        usage_type: formData.usage_type,
        annual_mileage: formData.annual_mileage
          ? parseInt(formData.annual_mileage, 10)
          : undefined,
      });

      if (result.success) {
        toast({
          title: 'Vehicle added',
          description: result.confirmation_required
            ? 'Awaiting carrier confirmation'
            : 'Vehicle has been added to the policy',
        });
        onOpenChange(false);
        onSuccess?.();
        resetForm();
      } else {
        throw new Error(result.error || 'Failed to add vehicle');
      }
    } catch (err) {
      toast({
        title: 'Failed to add vehicle',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      year: '',
      make: '',
      model: '',
      vin: '',
      usage_type: 'pleasure',
      annual_mileage: '',
    });
    setErrors({});
    setVinDecoded(false);
  };

  const handleChange = (field: keyof VehicleFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (field === 'vin') {
      setVinDecoded(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5" />
            Add Vehicle to Policy
          </DialogTitle>
          <DialogDescription>
            Add a new vehicle to this policy. The carrier will be notified of this change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* VIN Input with Decoder */}
          <div className="space-y-2">
            <Label htmlFor="vin">VIN (optional)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="vin"
                  value={formData.vin}
                  onChange={(e) => handleChange('vin', e.target.value.toUpperCase())}
                  placeholder="Enter 17-character VIN"
                  maxLength={17}
                  className={errors.vin ? 'border-red-500' : ''}
                />
                {vinDecoded && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleDecodeVin}
                disabled={isDecodingVin || formData.vin.length !== 17}
              >
                {isDecodingVin ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
            {errors.vin && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.vin}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Enter VIN to auto-fill year, make, and model
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Year */}
            <div className="space-y-2">
              <Label htmlFor="year">Year *</Label>
              <Select
                value={formData.year}
                onValueChange={(value) => handleChange('year', value)}
              >
                <SelectTrigger className={errors.year ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.year && (
                <p className="text-xs text-red-500">{errors.year}</p>
              )}
            </div>

            {/* Make */}
            <div className="space-y-2">
              <Label htmlFor="make">Make *</Label>
              <Input
                id="make"
                value={formData.make}
                onChange={(e) => handleChange('make', e.target.value)}
                placeholder="e.g. Toyota"
                className={errors.make ? 'border-red-500' : ''}
              />
              {errors.make && (
                <p className="text-xs text-red-500">{errors.make}</p>
              )}
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="model">Model *</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => handleChange('model', e.target.value)}
                placeholder="e.g. Camry"
                className={errors.model ? 'border-red-500' : ''}
              />
              {errors.model && (
                <p className="text-xs text-red-500">{errors.model}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Usage Type */}
            <div className="space-y-2">
              <Label htmlFor="usage_type">Usage</Label>
              <Select
                value={formData.usage_type}
                onValueChange={(value) => handleChange('usage_type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_TYPES.map((usage) => (
                    <SelectItem key={usage.value} value={usage.value}>
                      {usage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Annual Mileage */}
            <div className="space-y-2">
              <Label htmlFor="annual_mileage">Annual Mileage</Label>
              <Input
                id="annual_mileage"
                value={formData.annual_mileage}
                onChange={(e) => handleChange('annual_mileage', e.target.value)}
                placeholder="e.g. 12000"
                type="number"
                className={errors.annual_mileage ? 'border-red-500' : ''}
              />
              {errors.annual_mileage && (
                <p className="text-xs text-red-500">{errors.annual_mileage}</p>
              )}
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-xs text-amber-700">
                <p className="font-medium">Carrier Confirmation May Be Required</p>
                <p className="mt-1">
                  Some carriers require policyholder confirmation before adding a vehicle.
                  You'll be notified of the status.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Car className="w-4 h-4 mr-2" />
                Add Vehicle
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddVehicleModal;
