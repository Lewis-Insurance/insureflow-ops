// ============================================================================
// BUSINESS LOCATION CARD
// ============================================================================
// Display component for commercial property locations with building values,
// construction details, and coverage information.
// ============================================================================

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  MapPin,
  DollarSign,
  Shield,
  Flame,
  Droplets,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Square,
} from 'lucide-react';

interface BusinessLocation {
  id: string;
  location_number?: number;
  // Address
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  // Building Info
  building_type?: string;
  construction_type?: string;
  year_built?: number;
  stories?: number;
  square_footage?: number;
  occupancy_type?: string;
  // Values
  building_value?: number;
  contents_value?: number;
  business_income_value?: number;
  extra_expense_value?: number;
  // Protection
  protection_class?: number;
  fire_district?: string;
  distance_to_fire_hydrant?: number;
  distance_to_fire_station?: number;
  // Features
  sprinkler_system?: boolean;
  sprinkler_type?: string;
  fire_alarm?: boolean;
  burglar_alarm?: boolean;
  security_cameras?: boolean;
  // Hazards
  flood_zone?: string;
  earthquake_zone?: string;
  hurricane_zone?: boolean;
  // Deductibles
  building_deductible?: number;
  contents_deductible?: number;
  // Raw data
  raw_data?: Record<string, unknown>;
}

interface BusinessLocationCardProps {
  location: BusinessLocation;
  showCoverages?: boolean;
}

const CONSTRUCTION_TYPES: Record<string, { label: string; rating: 'good' | 'fair' | 'poor' }> = {
  fire_resistive: { label: 'Fire Resistive', rating: 'good' },
  masonry_non_combustible: { label: 'Masonry Non-Combustible', rating: 'good' },
  non_combustible: { label: 'Non-Combustible', rating: 'good' },
  masonry: { label: 'Masonry', rating: 'fair' },
  modified_fire_resistive: { label: 'Modified Fire Resistive', rating: 'fair' },
  joisted_masonry: { label: 'Joisted Masonry', rating: 'fair' },
  frame: { label: 'Frame', rating: 'poor' },
  wood_frame: { label: 'Wood Frame', rating: 'poor' },
};

const FLOOD_ZONES: Record<string, { label: string; risk: 'high' | 'moderate' | 'low' }> = {
  A: { label: 'Zone A (High Risk)', risk: 'high' },
  AE: { label: 'Zone AE (High Risk)', risk: 'high' },
  AO: { label: 'Zone AO (Flood Depths)', risk: 'high' },
  AH: { label: 'Zone AH (Shallow Flooding)', risk: 'high' },
  V: { label: 'Zone V (Coastal High Risk)', risk: 'high' },
  VE: { label: 'Zone VE (Coastal High Risk)', risk: 'high' },
  B: { label: 'Zone B (Moderate Risk)', risk: 'moderate' },
  X: { label: 'Zone X (Low Risk)', risk: 'low' },
  C: { label: 'Zone C (Low Risk)', risk: 'low' },
  D: { label: 'Zone D (Undetermined)', risk: 'moderate' },
};

export function BusinessLocationCard({
  location,
  showCoverages = true,
}: BusinessLocationCardProps) {
  const constructionConfig = CONSTRUCTION_TYPES[
    location.construction_type?.toLowerCase().replace(/[\s-]/g, '_') || ''
  ];
  const floodConfig = FLOOD_ZONES[location.flood_zone?.toUpperCase() || 'X'];

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const getTotalInsuredValue = () => {
    const total =
      (location.building_value || 0) +
      (location.contents_value || 0) +
      (location.business_income_value || 0) +
      (location.extra_expense_value || 0);
    return total;
  };

  const getProtectionClassBadge = (pc?: number) => {
    if (!pc) return null;
    if (pc <= 3) {
      return <Badge className="bg-green-100 text-green-700">PC {pc} (Excellent)</Badge>;
    }
    if (pc <= 6) {
      return <Badge className="bg-blue-100 text-blue-700">PC {pc} (Good)</Badge>;
    }
    if (pc <= 8) {
      return <Badge className="bg-amber-100 text-amber-700">PC {pc} (Fair)</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700">PC {pc} (Poor)</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {location.location_number && (
                  <Badge variant="outline">Loc #{location.location_number}</Badge>
                )}
                {location.building_type || 'Commercial Location'}
              </CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                {[
                  location.address_line1,
                  location.city,
                  location.state,
                  location.zip,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Insured Value</p>
            <p className="text-lg font-semibold">{formatCurrency(getTotalInsuredValue())}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Building Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataItem
            icon={Building2}
            label="Construction"
            value={constructionConfig?.label || location.construction_type || 'N/A'}
            badge={
              constructionConfig && (
                <Badge
                  variant="outline"
                  className={`text-xs ml-2 ${
                    constructionConfig.rating === 'good'
                      ? 'text-green-600'
                      : constructionConfig.rating === 'fair'
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  {constructionConfig.rating}
                </Badge>
              )
            }
          />
          <DataItem
            icon={Calendar}
            label="Year Built"
            value={location.year_built?.toString() || 'N/A'}
          />
          <DataItem
            icon={Square}
            label="Square Footage"
            value={location.square_footage?.toLocaleString() || 'N/A'}
          />
          <DataItem
            icon={Building2}
            label="Stories"
            value={location.stories?.toString() || 'N/A'}
          />
        </div>

        {/* Values Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ValueCard label="Building" value={location.building_value} />
          <ValueCard label="Contents" value={location.contents_value} />
          <ValueCard label="Business Income" value={location.business_income_value} />
          <ValueCard label="Extra Expense" value={location.extra_expense_value} />
        </div>

        <Separator />

        {/* Protection & Features */}
        <div className="space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Protection Details
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Protection Class</p>
              {getProtectionClassBadge(location.protection_class)}
            </div>
            <DataItem
              label="Fire Hydrant"
              value={
                location.distance_to_fire_hydrant
                  ? `${location.distance_to_fire_hydrant} ft`
                  : 'N/A'
              }
            />
            <DataItem
              label="Fire Station"
              value={
                location.distance_to_fire_station
                  ? `${(location.distance_to_fire_station / 5280).toFixed(1)} mi`
                  : 'N/A'
              }
            />
            <DataItem label="Fire District" value={location.fire_district || 'N/A'} />
          </div>

          {/* Safety Features */}
          <div className="flex flex-wrap gap-2">
            {location.sprinkler_system && (
              <Badge className="bg-blue-100 text-blue-700">
                <Droplets className="w-3 h-3 mr-1" />
                Sprinkler System {location.sprinkler_type && `(${location.sprinkler_type})`}
              </Badge>
            )}
            {location.fire_alarm && (
              <Badge className="bg-orange-100 text-orange-700">
                <Flame className="w-3 h-3 mr-1" />
                Fire Alarm
              </Badge>
            )}
            {location.burglar_alarm && (
              <Badge variant="outline">Burglar Alarm</Badge>
            )}
            {location.security_cameras && (
              <Badge variant="outline">Security Cameras</Badge>
            )}
          </div>
        </div>

        {/* Hazard Zones */}
        {(location.flood_zone || location.earthquake_zone || location.hurricane_zone) && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Hazard Zones
              </p>
              <div className="flex flex-wrap gap-2">
                {floodConfig && (
                  <Badge
                    className={`${
                      floodConfig.risk === 'high'
                        ? 'bg-red-100 text-red-700'
                        : floodConfig.risk === 'moderate'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {floodConfig.label}
                  </Badge>
                )}
                {location.earthquake_zone && (
                  <Badge className="bg-purple-100 text-purple-700">
                    Earthquake Zone: {location.earthquake_zone}
                  </Badge>
                )}
                {location.hurricane_zone && (
                  <Badge className="bg-cyan-100 text-cyan-700">Hurricane Zone</Badge>
                )}
              </div>
            </div>
          </>
        )}

        {/* Deductibles */}
        {showCoverages && (location.building_deductible || location.contents_deductible) && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              {location.building_deductible && (
                <div className="p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Building Deductible</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(location.building_deductible)}
                  </p>
                </div>
              )}
              {location.contents_deductible && (
                <div className="p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Contents Deductible</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(location.contents_deductible)}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DataItem({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </p>
      <p className="text-sm font-medium flex items-center">
        {value}
        {badge}
      </p>
    </div>
  );
}

function ValueCard({ label, value }: { label: string; value?: number }) {
  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${amount.toLocaleString()}`;
  };

  return (
    <div className="p-3 bg-muted rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{formatCurrency(value)}</p>
    </div>
  );
}

export default BusinessLocationCard;
