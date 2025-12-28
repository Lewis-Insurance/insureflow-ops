// ============================================================================
// COMMERCIAL DATA SECTION
// ============================================================================
// Unified component for displaying all commercial lines data from Canopy
// including fleet vehicles, business operations, locations, and payroll.
// ============================================================================

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Truck,
  Building2,
  MapPin,
  HardHat,
  Loader2,
  Briefcase,
} from 'lucide-react';
import { logger } from '@/lib/logger';

import { CommercialVehicleList } from './CommercialVehicleList';
import { BusinessOperationsCard } from './BusinessOperationsCard';
import { BusinessLocationCard } from './BusinessLocationCard';
import { PayrollTable } from './PayrollCard';

interface CommercialDataSectionProps {
  pullId: string;
  policyId?: string;
}

export function CommercialDataSection({ pullId, policyId }: CommercialDataSectionProps) {
  // Fetch commercial vehicles
  const { data: commercialVehicles, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['canopy-commercial-vehicles', pullId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_commercial_vehicles')
        .select('*')
        .eq('pull_id', pullId);

      if (error) {
        logger.debug('Commercial vehicles query error:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!pullId,
  });

  // Fetch business operations
  const { data: businessOps, isLoading: businessLoading } = useQuery({
    queryKey: ['canopy-business-operations', pullId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_business_operations')
        .select('*')
        .eq('pull_id', pullId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.debug('Business operations query error:', error);
        return null;
      }
      return data;
    },
    enabled: !!pullId,
  });

  // Fetch business locations
  const { data: locations, isLoading: locationsLoading } = useQuery({
    queryKey: ['canopy-business-locations', pullId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_business_locations')
        .select('*')
        .eq('pull_id', pullId)
        .order('location_number', { ascending: true });

      if (error) {
        logger.debug('Business locations query error:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!pullId,
  });

  // Fetch payroll/class codes
  const { data: payrollData, isLoading: payrollLoading } = useQuery({
    queryKey: ['canopy-payroll', pullId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_payroll')
        .select('*')
        .eq('pull_id', pullId)
        .order('is_governing_class', { ascending: false });

      if (error) {
        logger.debug('Payroll query error:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!pullId,
  });

  const isLoading = vehiclesLoading || businessLoading || locationsLoading || payrollLoading;

  // Check if we have any commercial data
  const hasCommercialVehicles = (commercialVehicles?.length || 0) > 0;
  const hasBusinessOps = !!businessOps;
  const hasLocations = (locations?.length || 0) > 0;
  const hasPayroll = (payrollData?.length || 0) > 0;
  const hasAnyData = hasCommercialVehicles || hasBusinessOps || hasLocations || hasPayroll;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasAnyData) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No Commercial Data</p>
          <p className="text-sm mt-1">
            No commercial lines data found for this policy.
            This may be a personal lines policy.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Determine default tab based on available data
  const defaultTab = hasCommercialVehicles
    ? 'fleet'
    : hasBusinessOps
      ? 'business'
      : hasLocations
        ? 'locations'
        : 'payroll';

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              <CardTitle className="text-base">Commercial Lines Data</CardTitle>
            </div>
            <div className="flex gap-2">
              {hasCommercialVehicles && (
                <Badge variant="secondary">
                  <Truck className="w-3 h-3 mr-1" />
                  {commercialVehicles?.length} vehicles
                </Badge>
              )}
              {hasLocations && (
                <Badge variant="secondary">
                  <MapPin className="w-3 h-3 mr-1" />
                  {locations?.length} locations
                </Badge>
              )}
              {hasPayroll && (
                <Badge variant="secondary">
                  <HardHat className="w-3 h-3 mr-1" />
                  {payrollData?.length} class codes
                </Badge>
              )}
            </div>
          </div>
          <CardDescription>
            Comprehensive commercial insurance data imported from Canopy Connect
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Tabbed Content */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="fleet" disabled={!hasCommercialVehicles}>
            <Truck className="w-4 h-4 mr-2" />
            Fleet
            {hasCommercialVehicles && (
              <Badge variant="secondary" className="ml-2">
                {commercialVehicles?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="business" disabled={!hasBusinessOps}>
            <Building2 className="w-4 h-4 mr-2" />
            Business
          </TabsTrigger>
          <TabsTrigger value="locations" disabled={!hasLocations}>
            <MapPin className="w-4 h-4 mr-2" />
            Locations
            {hasLocations && (
              <Badge variant="secondary" className="ml-2">
                {locations?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="payroll" disabled={!hasPayroll}>
            <HardHat className="w-4 h-4 mr-2" />
            Payroll
            {hasPayroll && (
              <Badge variant="secondary" className="ml-2">
                {payrollData?.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Fleet Tab */}
        <TabsContent value="fleet">
          {hasCommercialVehicles ? (
            <CommercialVehicleList vehicles={commercialVehicles || []} />
          ) : (
            <EmptyTabContent
              icon={Truck}
              title="No Fleet Vehicles"
              description="No commercial fleet vehicles found"
            />
          )}
        </TabsContent>

        {/* Business Tab */}
        <TabsContent value="business">
          {hasBusinessOps && businessOps ? (
            <BusinessOperationsCard business={businessOps} />
          ) : (
            <EmptyTabContent
              icon={Building2}
              title="No Business Info"
              description="No business operations data found"
            />
          )}
        </TabsContent>

        {/* Locations Tab */}
        <TabsContent value="locations">
          {hasLocations ? (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {locations?.map((location) => (
                  <BusinessLocationCard key={location.id} location={location} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <EmptyTabContent
              icon={MapPin}
              title="No Locations"
              description="No business locations found"
            />
          )}
        </TabsContent>

        {/* Payroll Tab */}
        <TabsContent value="payroll">
          {hasPayroll ? (
            <PayrollTable classCodes={payrollData || []} />
          ) : (
            <EmptyTabContent
              icon={HardHat}
              title="No Payroll Data"
              description="No workers compensation class codes found"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyTabContent({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        <Icon className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="font-medium">{title}</p>
        <p className="text-sm mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export default CommercialDataSection;
