// ============================================================================
// COMMERCIAL VEHICLE CARD
// ============================================================================
// Display component for commercial auto vehicles with fleet-specific fields
// like GVW, radius of operation, cargo type, etc.
// ============================================================================

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Truck,
  MapPin,
  Weight,
  Route,
  Package,
  Shield,
  Users,
  Gauge,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

interface CommercialVehicle {
  id: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  unit_number?: string;
  vehicle_type?: string;
  body_type?: string;
  gvw?: number; // Gross Vehicle Weight
  gcw?: number; // Gross Combined Weight
  radius_class?: string; // Local, Intermediate, Long Haul
  radius_miles?: number;
  cargo_type?: string;
  is_owned?: boolean;
  is_leased?: boolean;
  is_hired?: boolean;
  is_non_owned?: boolean;
  driver_count?: number;
  garaging_address?: string;
  garaging_city?: string;
  garaging_state?: string;
  garaging_zip?: string;
  annual_mileage?: number;
  farthest_terminal?: string;
  dot_number?: string;
  mc_number?: string;
  // Coverages
  liability_limit?: number;
  cargo_limit?: number;
  physical_damage_deductible?: number;
  trailer_interchange?: boolean;
  hired_auto?: boolean;
  non_owned_auto?: boolean;
  // Raw data for additional fields
  raw_data?: Record<string, unknown>;
}

interface CommercialVehicleCardProps {
  vehicle: CommercialVehicle;
  showCoverages?: boolean;
}

const VEHICLE_TYPES: Record<string, { label: string; icon: React.ElementType }> = {
  truck: { label: 'Truck', icon: Truck },
  tractor: { label: 'Tractor', icon: Truck },
  trailer: { label: 'Trailer', icon: Truck },
  van: { label: 'Van', icon: Truck },
  pickup: { label: 'Pickup', icon: Truck },
  bus: { label: 'Bus', icon: Users },
  other: { label: 'Other', icon: Truck },
};

const RADIUS_CLASSES: Record<string, { label: string; miles: string; color: string }> = {
  local: { label: 'Local', miles: '0-50 mi', color: 'bg-green-100 text-green-700' },
  intermediate: { label: 'Intermediate', miles: '51-200 mi', color: 'bg-blue-100 text-blue-700' },
  long_haul: { label: 'Long Haul', miles: '200+ mi', color: 'bg-purple-100 text-purple-700' },
};

export function CommercialVehicleCard({
  vehicle,
  showCoverages = true,
}: CommercialVehicleCardProps) {
  const vehicleTypeConfig = VEHICLE_TYPES[vehicle.vehicle_type?.toLowerCase() || 'truck'];
  const VehicleIcon = vehicleTypeConfig?.icon || Truck;
  const radiusConfig = RADIUS_CLASSES[vehicle.radius_class?.toLowerCase() || 'local'];

  const getOwnershipBadges = () => {
    const badges = [];
    if (vehicle.is_owned) badges.push({ label: 'Owned', variant: 'default' as const });
    if (vehicle.is_leased) badges.push({ label: 'Leased', variant: 'secondary' as const });
    if (vehicle.is_hired) badges.push({ label: 'Hired', variant: 'outline' as const });
    if (vehicle.is_non_owned) badges.push({ label: 'Non-Owned', variant: 'outline' as const });
    return badges;
  };

  const formatWeight = (weight?: number) => {
    if (!weight) return 'N/A';
    return `${weight.toLocaleString()} lbs`;
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return `$${amount.toLocaleString()}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <VehicleIcon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {vehicle.year} {vehicle.make} {vehicle.model}
                {vehicle.unit_number && (
                  <Badge variant="secondary" className="text-xs">
                    Unit #{vehicle.unit_number}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {vehicle.vehicle_type && (
                  <span className="capitalize">{vehicle.vehicle_type}</span>
                )}
                {vehicle.body_type && ` • ${vehicle.body_type}`}
                {vehicle.vin && ` • VIN: ${vehicle.vin}`}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {getOwnershipBadges().map((badge, idx) => (
              <Badge key={idx} variant={badge.variant}>
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Weight & Radius Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataItem
            icon={Weight}
            label="GVW"
            value={formatWeight(vehicle.gvw)}
            tooltip="Gross Vehicle Weight"
          />
          <DataItem
            icon={Weight}
            label="GCW"
            value={formatWeight(vehicle.gcw)}
            tooltip="Gross Combined Weight"
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Route className="w-3 h-3" />
              Radius Class
            </p>
            {radiusConfig ? (
              <Badge className={`${radiusConfig.color} text-xs`}>
                {radiusConfig.label} ({radiusConfig.miles})
              </Badge>
            ) : (
              <p className="text-sm font-medium">
                {vehicle.radius_miles ? `${vehicle.radius_miles} mi` : 'N/A'}
              </p>
            )}
          </div>
          <DataItem
            icon={Gauge}
            label="Annual Mileage"
            value={vehicle.annual_mileage?.toLocaleString() || 'N/A'}
          />
        </div>

        {/* Operations Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataItem
            icon={Package}
            label="Cargo Type"
            value={vehicle.cargo_type || 'General Freight'}
          />
          <DataItem
            icon={Users}
            label="Driver Count"
            value={vehicle.driver_count?.toString() || '1'}
          />
          <DataItem
            icon={Route}
            label="Farthest Terminal"
            value={vehicle.farthest_terminal || 'N/A'}
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">DOT / MC Numbers</p>
            <p className="text-sm font-medium">
              {vehicle.dot_number || vehicle.mc_number
                ? `${vehicle.dot_number || ''} ${vehicle.mc_number ? `/ ${vehicle.mc_number}` : ''}`
                : 'N/A'}
            </p>
          </div>
        </div>

        {/* Garaging Location */}
        {(vehicle.garaging_address || vehicle.garaging_city) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>Garaged at: </span>
            <span className="text-foreground">
              {[
                vehicle.garaging_address,
                vehicle.garaging_city,
                vehicle.garaging_state,
                vehicle.garaging_zip,
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        )}

        {showCoverages && (
          <>
            <Separator />

            {/* Coverages Section */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Coverages
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {vehicle.liability_limit && (
                  <CoverageItem
                    label="Liability"
                    value={formatCurrency(vehicle.liability_limit)}
                  />
                )}
                {vehicle.cargo_limit && (
                  <CoverageItem
                    label="Cargo"
                    value={formatCurrency(vehicle.cargo_limit)}
                  />
                )}
                {vehicle.physical_damage_deductible && (
                  <CoverageItem
                    label="Physical Damage Ded."
                    value={formatCurrency(vehicle.physical_damage_deductible)}
                  />
                )}
              </div>

              {/* Additional Coverages */}
              <div className="flex flex-wrap gap-2 mt-2">
                {vehicle.trailer_interchange && (
                  <Badge variant="outline" className="text-xs">
                    Trailer Interchange
                  </Badge>
                )}
                {vehicle.hired_auto && (
                  <Badge variant="outline" className="text-xs">
                    Hired Auto
                  </Badge>
                )}
                {vehicle.non_owned_auto && (
                  <Badge variant="outline" className="text-xs">
                    Non-Owned Auto
                  </Badge>
                )}
              </div>
            </div>
          </>
        )}

        {/* Weight Class Warning */}
        {vehicle.gvw && vehicle.gvw >= 26001 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
            <div className="text-xs text-amber-700">
              <p className="font-medium">Heavy Vehicle (Class 7+)</p>
              <p className="mt-0.5">
                GVW over 26,000 lbs may require additional endorsements and CDL verification.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper component for data items
function DataItem({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  tooltip?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1" title={tooltip}>
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

// Helper component for coverage items
function CoverageItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-muted rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default CommercialVehicleCard;
