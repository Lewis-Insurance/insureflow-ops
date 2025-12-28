// ============================================================================
// COMMERCIAL VEHICLE LIST
// ============================================================================
// List component for displaying all commercial fleet vehicles with filtering
// and summary statistics.
// ============================================================================

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Truck,
  Search,
  Filter,
  Package,
  Users,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { CommercialVehicleCard } from './CommercialVehicleCard';

interface CommercialVehicle {
  id: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  unit_number?: string;
  vehicle_type?: string;
  body_type?: string;
  gvw?: number;
  gcw?: number;
  radius_class?: string;
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
  liability_limit?: number;
  cargo_limit?: number;
  physical_damage_deductible?: number;
  trailer_interchange?: boolean;
  hired_auto?: boolean;
  non_owned_auto?: boolean;
  raw_data?: Record<string, unknown>;
}

interface CommercialVehicleListProps {
  vehicles: CommercialVehicle[];
  isLoading?: boolean;
  showHeader?: boolean;
}

type FilterType = 'all' | 'owned' | 'leased' | 'hired' | 'non_owned';
type SortType = 'unit' | 'year' | 'gvw' | 'mileage';

export function CommercialVehicleList({
  vehicles,
  isLoading = false,
  showHeader = true,
}: CommercialVehicleListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('unit');

  // Calculate summary stats
  const stats = useMemo(() => {
    const owned = vehicles.filter((v) => v.is_owned).length;
    const leased = vehicles.filter((v) => v.is_leased).length;
    const hired = vehicles.filter((v) => v.is_hired).length;
    const nonOwned = vehicles.filter((v) => v.is_non_owned).length;
    const totalGVW = vehicles.reduce((sum, v) => sum + (v.gvw || 0), 0);
    const heavyVehicles = vehicles.filter((v) => (v.gvw || 0) >= 26001).length;
    const totalDrivers = vehicles.reduce((sum, v) => sum + (v.driver_count || 1), 0);

    return {
      total: vehicles.length,
      owned,
      leased,
      hired,
      nonOwned,
      avgGVW: vehicles.length > 0 ? Math.round(totalGVW / vehicles.length) : 0,
      heavyVehicles,
      totalDrivers,
    };
  }, [vehicles]);

  // Filter and sort vehicles
  const filteredVehicles = useMemo(() => {
    let result = [...vehicles];

    // Apply filter
    if (filterType !== 'all') {
      result = result.filter((v) => {
        switch (filterType) {
          case 'owned':
            return v.is_owned;
          case 'leased':
            return v.is_leased;
          case 'hired':
            return v.is_hired;
          case 'non_owned':
            return v.is_non_owned;
          default:
            return true;
        }
      });
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (v) =>
          v.unit_number?.toLowerCase().includes(query) ||
          v.vin?.toLowerCase().includes(query) ||
          v.make?.toLowerCase().includes(query) ||
          v.model?.toLowerCase().includes(query) ||
          `${v.year}`.includes(query)
      );
    }

    // Apply sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'unit':
          return (a.unit_number || '').localeCompare(b.unit_number || '');
        case 'year':
          return (b.year || 0) - (a.year || 0);
        case 'gvw':
          return (b.gvw || 0) - (a.gvw || 0);
        case 'mileage':
          return (b.annual_mileage || 0) - (a.annual_mileage || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [vehicles, filterType, searchQuery, sortBy]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Truck className="w-8 h-8 mx-auto mb-2 animate-pulse" />
          <p>Loading fleet vehicles...</p>
        </CardContent>
      </Card>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Truck className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No Commercial Vehicles</p>
          <p className="text-sm mt-1">No fleet vehicles found in this policy</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                <CardTitle className="text-base">Fleet Summary</CardTitle>
              </div>
              <Badge variant="secondary">{stats.total} vehicles</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Owned" value={stats.owned} icon={Truck} />
              <StatCard label="Leased" value={stats.leased} icon={Package} />
              <StatCard label="Total Drivers" value={stats.totalDrivers} icon={Users} />
              <StatCard
                label="Heavy (26k+ lbs)"
                value={stats.heavyVehicles}
                icon={AlertTriangle}
                highlight={stats.heavyVehicles > 0}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by unit #, VIN, make, model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="owned">Owned</SelectItem>
            <SelectItem value="leased">Leased</SelectItem>
            <SelectItem value="hired">Hired</SelectItem>
            <SelectItem value="non_owned">Non-Owned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortType)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unit">Sort by Unit #</SelectItem>
            <SelectItem value="year">Sort by Year</SelectItem>
            <SelectItem value="gvw">Sort by GVW</SelectItem>
            <SelectItem value="mileage">Sort by Mileage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      {searchQuery || filterType !== 'all' ? (
        <p className="text-sm text-muted-foreground">
          Showing {filteredVehicles.length} of {vehicles.length} vehicles
        </p>
      ) : null}

      {/* Vehicle list */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-4">
          {filteredVehicles.map((vehicle) => (
            <CommercialVehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      </ScrollArea>

      {filteredVehicles.length === 0 && (searchQuery || filterType !== 'all') && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No vehicles match your filters</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery('');
              setFilterType('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-amber-50' : 'bg-muted/50'}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${highlight ? 'text-amber-600' : 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-semibold mt-1 ${highlight ? 'text-amber-700' : ''}`}>
        {value}
      </p>
    </div>
  );
}

export default CommercialVehicleList;
