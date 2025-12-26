// ============================================================================
// CANOPY DATA DISPLAY COMPONENT
// ============================================================================
// Displays comprehensive insurance data imported from Canopy Connect
// Shows policies, vehicles, drivers, dwellings, and claims
// ============================================================================

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Shield,
  Car,
  User,
  Home,
  FileText,
  AlertTriangle,
  Calendar,
  DollarSign,
  MapPin,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CanopyDataDisplayProps {
  pullId?: string;
  leadId?: string;
  showHeader?: boolean;
}

export function CanopyDataDisplay({ pullId, leadId, showHeader = true }: CanopyDataDisplayProps) {
  // Get pull ID from lead if not provided directly
  const { data: pullFromLead } = useQuery({
    queryKey: ['canopy-pull-from-lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from('canopy_pulls')
        .select('id, canopy_pull_id, status, policy_count, carrier_count, created_at, completed_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!leadId && !pullId,
  });

  const effectivePullId = pullId || pullFromLead?.id;

  // Get all policies for this pull
  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ['canopy-policies', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase
        .from('canopy_policies')
        .select('*')
        .eq('pull_id', effectivePullId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!effectivePullId,
  });

  // Get all vehicles
  const { data: vehicles } = useQuery({
    queryKey: ['canopy-vehicles', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_vehicles')
        .select('*')
        .in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  // Get all drivers
  const { data: drivers } = useQuery({
    queryKey: ['canopy-drivers', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_drivers')
        .select('*')
        .in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  // Get all dwellings
  const { data: dwellings } = useQuery({
    queryKey: ['canopy-dwellings', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_dwellings')
        .select('*')
        .in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  // Get all claims
  const { data: claims } = useQuery({
    queryKey: ['canopy-claims', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_claims')
        .select('*')
        .in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  // Get all documents
  const { data: documents } = useQuery({
    queryKey: ['canopy-documents', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_documents')
        .select('*')
        .in('policy_id', policyIds);
      if (error) {
        console.log('Documents query error (table may not exist):', error);
        return [];
      }
      return data;
    },
    enabled: !!policies?.length,
  });

  if (!effectivePullId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No Canopy data available for this lead</p>
        </CardContent>
      </Card>
    );
  }

  if (policiesLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Clock className="w-8 h-8 mx-auto mb-2 animate-pulse" />
          <p>Loading Canopy data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!policies?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No policy data imported yet</p>
          <p className="text-sm mt-2">Data will appear here after the import completes</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center gap-4">
          <div className="p-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Imported Insurance Data</h3>
            <p className="text-sm text-muted-foreground">
              {policies.length} {policies.length === 1 ? 'policy' : 'policies'} •
              {vehicles?.length || 0} vehicles •
              {drivers?.length || 0} drivers
              {documents?.length ? ` • ${documents.length} documents` : ''}
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="policies" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="policies" className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Policies</span>
            <Badge variant="secondary" className="ml-1">{policies?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="flex items-center gap-1">
            <Car className="w-4 h-4" />
            <span className="hidden sm:inline">Vehicles</span>
            <Badge variant="secondary" className="ml-1">{vehicles?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="drivers" className="flex items-center gap-1">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Drivers</span>
            <Badge variant="secondary" className="ml-1">{drivers?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dwellings" className="flex items-center gap-1">
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Properties</span>
            <Badge variant="secondary" className="ml-1">{dwellings?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="claims" className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Claims</span>
            <Badge variant="secondary" className="ml-1">{claims?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Docs</span>
            <Badge variant="secondary" className="ml-1">{documents?.length || 0}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          {policies?.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </TabsContent>

        {/* Vehicles Tab */}
        <TabsContent value="vehicles" className="space-y-4">
          {vehicles?.length ? (
            vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))
          ) : (
            <EmptyState icon={Car} message="No vehicles imported" />
          )}
        </TabsContent>

        {/* Drivers Tab */}
        <TabsContent value="drivers" className="space-y-4">
          {drivers?.length ? (
            drivers.map((driver) => (
              <DriverCard key={driver.id} driver={driver} />
            ))
          ) : (
            <EmptyState icon={User} message="No drivers imported" />
          )}
        </TabsContent>

        {/* Dwellings Tab */}
        <TabsContent value="dwellings" className="space-y-4">
          {dwellings?.length ? (
            dwellings.map((dwelling) => (
              <DwellingCard key={dwelling.id} dwelling={dwelling} />
            ))
          ) : (
            <EmptyState icon={Home} message="No properties imported" />
          )}
        </TabsContent>

        {/* Claims Tab */}
        <TabsContent value="claims" className="space-y-4">
          {claims?.length ? (
            claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p className="font-medium">No claims on record</p>
              <p className="text-sm">Clean claims history</p>
            </div>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          {documents?.length ? (
            documents.map((doc: any) => (
              <DocumentCard key={doc.id} document={doc} />
            ))
          ) : (
            <EmptyState icon={Download} message="No documents available" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function PolicyCard({ policy }: { policy: any }) {
  const getPolicyTypeIcon = (type: string) => {
    switch (type) {
      case 'auto': return <Car className="w-5 h-5" />;
      case 'home':
      case 'renters':
      case 'condo': return <Home className="w-5 h-5" />;
      default: return <Shield className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-500';
      case 'expired': return 'bg-red-500';
      case 'cancelled': return 'bg-gray-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              {getPolicyTypeIcon(policy.policy_type)}
            </div>
            <div>
              <CardTitle className="text-lg capitalize">
                {policy.policy_type} Insurance
              </CardTitle>
              <CardDescription>
                {policy.carrier_name} • #{policy.policy_number || 'N/A'}
              </CardDescription>
            </div>
          </div>
          <Badge className={getStatusColor(policy.status)}>
            {policy.status || 'Active'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataItem
            icon={DollarSign}
            label="Premium"
            value={policy.premium_amount ? `$${policy.premium_amount.toLocaleString()}` : 'N/A'}
            subValue={policy.premium_frequency}
          />
          <DataItem
            icon={Calendar}
            label="Effective"
            value={formatDate(policy.effective_date)}
          />
          <DataItem
            icon={Calendar}
            label="Expires"
            value={formatDate(policy.expiration_date)}
            highlight={isExpiringSoon(policy.expiration_date)}
          />
          <DataItem
            icon={DollarSign}
            label="Deductible"
            value={policy.deductible ? `$${policy.deductible.toLocaleString()}` : 'N/A'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function VehicleCard({ vehicle }: { vehicle: any }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </CardTitle>
              <CardDescription>
                VIN: {vehicle.vin || 'N/A'}
              </CardDescription>
            </div>
          </div>
          {vehicle.ownership && (
            <Badge variant="outline" className="capitalize">{vehicle.ownership}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <DataItem label="Usage" value={vehicle.usage_type || 'N/A'} />
          <DataItem label="Annual Mileage" value={vehicle.annual_mileage?.toLocaleString() || 'N/A'} />
          <DataItem label="Body Type" value={vehicle.body_type || 'N/A'} />
          <DataItem label="Trim" value={vehicle.trim || 'N/A'} />
        </div>

        {vehicle.garage_zip && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <MapPin className="w-4 h-4" />
            {[vehicle.garage_address, vehicle.garage_city, vehicle.garage_state, vehicle.garage_zip]
              .filter(Boolean)
              .join(', ')}
          </div>
        )}

        <Separator className="my-4" />

        <div className="space-y-2">
          <p className="text-sm font-medium">Coverages</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {vehicle.liability_bi && (
              <CoverageItem label="Bodily Injury" value={`$${vehicle.liability_bi.toLocaleString()}`} />
            )}
            {vehicle.liability_pd && (
              <CoverageItem label="Property Damage" value={`$${vehicle.liability_pd.toLocaleString()}`} />
            )}
            {vehicle.collision_deductible && (
              <CoverageItem label="Collision Ded." value={`$${vehicle.collision_deductible.toLocaleString()}`} />
            )}
            {vehicle.comprehensive_deductible && (
              <CoverageItem label="Comp Ded." value={`$${vehicle.comprehensive_deductible.toLocaleString()}`} />
            )}
            {vehicle.uninsured_motorist && (
              <CoverageItem label="UM/UIM" value={`$${vehicle.uninsured_motorist.toLocaleString()}`} />
            )}
            {vehicle.medical_payments && (
              <CoverageItem label="Med Pay" value={`$${vehicle.medical_payments.toLocaleString()}`} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DriverCard({ driver }: { driver: any }) {
  const hasViolations = driver.violations?.length > 0;
  const hasAccidents = driver.accidents?.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <User className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {driver.first_name} {driver.last_name}
                {driver.is_primary && <Badge className="ml-2 bg-blue-500">Primary</Badge>}
              </CardTitle>
              <CardDescription>
                {driver.relation_to_insured || 'Insured'} • {calculateAge(driver.date_of_birth)} years old
              </CardDescription>
            </div>
          </div>
          {driver.is_excluded && (
            <Badge variant="destructive">Excluded</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <DataItem label="Date of Birth" value={formatDate(driver.date_of_birth)} />
          <DataItem label="Gender" value={driver.gender || 'N/A'} />
          <DataItem label="Marital Status" value={driver.marital_status || 'N/A'} />
          <DataItem label="Years Licensed" value={driver.years_licensed?.toString() || 'N/A'} />
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <DataItem label="License #" value={driver.license_number || 'N/A'} />
          <DataItem label="State" value={driver.license_state || 'N/A'} />
          <DataItem label="Status" value={driver.license_status || 'Valid'} />
          <DataItem label="SR-22" value={driver.sr22_required ? 'Required' : 'No'} />
        </div>

        {(hasViolations || hasAccidents) && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3">
              {hasViolations && (
                <div>
                  <p className="text-sm font-medium text-amber-600 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Violations ({driver.violations.length})
                  </p>
                  <div className="space-y-1">
                    {driver.violations.map((v: any, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <ChevronRight className="w-3 h-3" />
                        {v.type || v.description || 'Violation'} {v.date && `(${formatDate(v.date)})`}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hasAccidents && (
                <div>
                  <p className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Accidents ({driver.accidents.length})
                  </p>
                  <div className="space-y-1">
                    {driver.accidents.map((a: any, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <ChevronRight className="w-3 h-3" />
                        {a.type || a.description || 'Accident'} {a.date && `(${formatDate(a.date)})`}
                        {a.at_fault && <Badge variant="destructive" className="text-xs">At Fault</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {!hasViolations && !hasAccidents && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" />
            Clean driving record
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DwellingCard({ dwelling }: { dwelling: any }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-lg">
              {dwelling.address_line1 || 'Property'}
            </CardTitle>
            <CardDescription>
              {[dwelling.city, dwelling.state, dwelling.zip].filter(Boolean).join(', ')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <DataItem label="Property Type" value={dwelling.property_type || 'N/A'} />
          <DataItem label="Year Built" value={dwelling.year_built?.toString() || 'N/A'} />
          <DataItem label="Sq Ft" value={dwelling.square_footage?.toLocaleString() || 'N/A'} />
          <DataItem label="Stories" value={dwelling.stories?.toString() || 'N/A'} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <DataItem label="Construction" value={dwelling.construction_type || 'N/A'} />
          <DataItem label="Roof Type" value={dwelling.roof_type || 'N/A'} />
          <DataItem label="Roof Year" value={dwelling.roof_year?.toString() || 'N/A'} />
          <DataItem label="Occupancy" value={dwelling.occupancy_type || 'N/A'} />
        </div>

        <Separator className="my-4" />

        <div className="space-y-2">
          <p className="text-sm font-medium">Coverages</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {dwelling.dwelling_coverage && (
              <CoverageItem label="Dwelling (A)" value={`$${dwelling.dwelling_coverage.toLocaleString()}`} />
            )}
            {dwelling.other_structures && (
              <CoverageItem label="Other Structures (B)" value={`$${dwelling.other_structures.toLocaleString()}`} />
            )}
            {dwelling.personal_property && (
              <CoverageItem label="Personal Property (C)" value={`$${dwelling.personal_property.toLocaleString()}`} />
            )}
            {dwelling.loss_of_use && (
              <CoverageItem label="Loss of Use (D)" value={`$${dwelling.loss_of_use.toLocaleString()}`} />
            )}
            {dwelling.liability_coverage && (
              <CoverageItem label="Liability (E)" value={`$${dwelling.liability_coverage.toLocaleString()}`} />
            )}
            {dwelling.medical_payments && (
              <CoverageItem label="Med Pay (F)" value={`$${dwelling.medical_payments.toLocaleString()}`} />
            )}
            {dwelling.deductible && (
              <CoverageItem label="Deductible" value={`$${dwelling.deductible.toLocaleString()}`} />
            )}
          </div>
        </div>

        {/* Property Features */}
        <div className="flex flex-wrap gap-2 mt-4">
          {dwelling.swimming_pool && <Badge variant="outline">Pool</Badge>}
          {dwelling.security_system && <Badge variant="outline">Security System</Badge>}
          {dwelling.fire_alarm && <Badge variant="outline">Fire Alarm</Badge>}
          {dwelling.sprinkler_system && <Badge variant="outline">Sprinklers</Badge>}
          {dwelling.gated_community && <Badge variant="outline">Gated Community</Badge>}
          {dwelling.flood_coverage && <Badge variant="secondary">Flood Coverage</Badge>}
          {dwelling.earthquake_coverage && <Badge variant="secondary">Earthquake Coverage</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function ClaimCard({ claim }: { claim: any }) {
  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return <Badge variant="destructive">Open</Badge>;
      case 'closed': return <Badge className="bg-green-500">Closed</Badge>;
      case 'pending': return <Badge variant="secondary">Pending</Badge>;
      case 'denied': return <Badge variant="outline">Denied</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {claim.claim_type || 'Claim'} #{claim.claim_number || 'N/A'}
              </CardTitle>
              <CardDescription>
                Filed: {formatDate(claim.claim_date)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {claim.at_fault && <Badge variant="destructive">At Fault</Badge>}
            {getStatusBadge(claim.status)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataItem label="Category" value={claim.claim_category || 'N/A'} />
          <DataItem
            label="Amount Paid"
            value={claim.amount_paid ? `$${claim.amount_paid.toLocaleString()}` : 'N/A'}
          />
          <DataItem
            label="Deductible"
            value={claim.deductible_applied ? `$${claim.deductible_applied.toLocaleString()}` : 'N/A'}
          />
          <DataItem label="Close Date" value={formatDate(claim.close_date)} />
        </div>
        {claim.description && (
          <p className="mt-4 text-sm text-muted-foreground">{claim.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// DOCUMENT CARD
// ============================================================================

function DocumentCard({ document }: { document: any }) {
  const getDocumentTypeLabel = (type: string | null | undefined): string => {
    const labels: Record<string, string> = {
      'id_card': 'Insurance ID Card',
      'dec_page': 'Declaration Page',
      'policy_doc': 'Policy Document',
      'endorsement': 'Endorsement',
      'certificate': 'Certificate of Insurance',
      'other': 'Other Document',
    };
    return labels[type || 'other'] || 'Document';
  };

  const handleDownload = () => {
    if (document.file_url) {
      window.open(document.file_url, '_blank');
    } else if (document.storage_path) {
      // TODO: Generate signed URL for Supabase storage download
      console.log('Download from storage:', document.storage_path);
    }
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">{getDocumentTypeLabel(document.document_type)}</p>
              <p className="text-sm text-muted-foreground">
                {document.file_name || 'Unnamed document'}
              </p>
              {document.created_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Added {formatDate(document.created_at)}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {(document.file_url || document.storage_path) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="flex items-center gap-1"
              >
                {document.file_url ? (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    View
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        {document.downloaded && (
          <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3 h-3" />
            Saved to your files
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function DataItem({
  icon: Icon,
  label,
  value,
  subValue,
  highlight,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </p>
      <p className={`text-sm font-medium ${highlight ? 'text-amber-600' : ''}`}>
        {value}
      </p>
      {subValue && <p className="text-xs text-muted-foreground capitalize">{subValue}</p>}
    </div>
  );
}

function CoverageItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-muted rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Icon className="w-12 h-12 mx-auto mb-4 opacity-20" />
      <p>{message}</p>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(date: string | null | undefined): string {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}

function calculateAge(dob: string | null | undefined): number {
  if (!dob) return 0;
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return 0;
  }
}

function isExpiringSoon(date: string | null | undefined): boolean {
  if (!date) return false;
  try {
    const expDate = new Date(date);
    const today = new Date();
    const daysUntil = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil <= 30 && daysUntil >= 0;
  } catch {
    return false;
  }
}

export default CanopyDataDisplay;
