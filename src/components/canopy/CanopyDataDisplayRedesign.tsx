// ============================================================================
// CANOPY DATA DISPLAY - THEME-AWARE FULL PAGE DESIGN
// ============================================================================
// Displays ALL insurance data imported from Canopy Connect
// Properly supports light/dark themes using CSS variables
// Designed for full-page display with clean, readable layout
// ============================================================================

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  RefreshCw,
  Loader2,
  Mail,
  Phone,
  Building2,
  IdCard,
  GraduationCap,
  Briefcase,
  Users,
  AlertCircle,
  History,
} from 'lucide-react';

interface CanopyDataDisplayRedesignProps {
  pullId?: string;
  leadId?: string;
}

export function CanopyDataDisplayRedesign({ pullId, leadId }: CanopyDataDisplayRedesignProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get pull data from lead if not provided directly
  const { data: pullData } = useQuery({
    queryKey: ['canopy-pull-data', leadId, pullId],
    queryFn: async () => {
      if (pullId) {
        const { data, error } = await supabase
          .from('canopy_pulls')
          .select('*')
          .eq('id', pullId)
          .single();
        if (error) return null;
        return data;
      }
      if (leadId) {
        const { data, error } = await supabase
          .from('canopy_pulls')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (error) return null;
        return data;
      }
      return null;
    },
    enabled: !!leadId || !!pullId,
  });

  const effectivePullId = pullId || pullData?.id;
  const canopyPullId = pullData?.canopy_pull_id;

  // ============================================================================
  // DATA QUERIES
  // ============================================================================

  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ['canopy-policies-full', effectivePullId],
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

  const { data: vehicles } = useQuery({
    queryKey: ['canopy-vehicles-full', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase.from('canopy_vehicles').select('*').in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  const { data: drivers } = useQuery({
    queryKey: ['canopy-drivers-full', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase.from('canopy_drivers').select('*').in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  const { data: dwellings } = useQuery({
    queryKey: ['canopy-dwellings-full', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase.from('canopy_dwellings').select('*').in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  const { data: claims } = useQuery({
    queryKey: ['canopy-claims-full', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase.from('canopy_claims').select('*').in('policy_id', policyIds);
      if (error) throw error;
      return data;
    },
    enabled: !!policies?.length,
  });

  const { data: documents } = useQuery({
    queryKey: ['canopy-documents-full', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase.from('canopy_documents').select('*').in('policy_id', policyIds);
      if (error) return [];
      return data;
    },
    enabled: !!policies?.length,
  });

  const { data: addresses } = useQuery({
    queryKey: ['canopy-addresses', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase.from('canopy_addresses').select('*').eq('pull_id', effectivePullId);
      if (error) return [];
      return data;
    },
    enabled: !!effectivePullId,
  });

  const { data: agents } = useQuery({
    queryKey: ['canopy-agents', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase.from('canopy_agents').select('*').eq('pull_id', effectivePullId);
      if (error) return [];
      return data;
    },
    enabled: !!effectivePullId,
  });

  const { data: drivingRecords } = useQuery({
    queryKey: ['canopy-driving-records', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase.from('canopy_driving_records').select('*').eq('pull_id', effectivePullId);
      if (error) return [];
      return data;
    },
    enabled: !!effectivePullId,
  });

  const { data: lossEvents } = useQuery({
    queryKey: ['canopy-loss-events', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase.from('canopy_loss_events').select('*').eq('pull_id', effectivePullId);
      if (error) return [];
      return data;
    },
    enabled: !!effectivePullId,
  });

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleRefresh = async () => {
    const pullIdToRefresh = canopyPullId || effectivePullId;
    if (!pullIdToRefresh) {
      toast({ title: 'Cannot refresh', description: 'No pull ID available', variant: 'destructive' });
      return;
    }

    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('canopy-reprocess', {
        body: { pullId: pullIdToRefresh, force: true }
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Refresh complete', description: `Updated ${data.policies || 0} policies` });
        queryClient.invalidateQueries({ queryKey: ['canopy-policies-full', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-vehicles-full', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-drivers-full', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-dwellings-full', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-claims-full', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-documents-full', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-addresses', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-agents', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-driving-records', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-loss-events', effectivePullId] });
      }
    } catch (err) {
      logger.error('Refresh failed:', err);
      toast({ title: 'Refresh failed', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewDocument = async (doc: { id: string; file_url?: string | null; canopy_document_id?: string | null; file_name?: string | null; document_type?: string | null }) => {
    setLoadingDocId(doc.id);
    try {
      // Extract document ID from file_url if available, otherwise use canopy_document_id
      let documentId = doc.canopy_document_id;
      if (!documentId && doc.file_url) {
        const match = doc.file_url.match(/documents\/([a-f0-9-]+)\/download/);
        if (match) {
          documentId = match[1];
        }
      }

      if (!documentId) {
        toast({
          title: 'Cannot view document',
          description: 'Document ID not available',
          variant: 'destructive',
        });
        return;
      }

      // Call the proxy function
      const { data, error } = await supabase.functions.invoke('canopy-document-proxy', {
        body: { documentId, id: doc.id },
      });

      if (error) {
        // Try to open via direct URL as fallback if document ID exists
        if (doc.file_url) {
          window.open(doc.file_url, '_blank');
          return;
        }
        throw error;
      }

      // The function returns raw bytes, we need to handle it differently
      // For now, let's use a URL-based approach
      const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/canopy-document-proxy?documentId=${documentId}`;
      window.open(proxyUrl, '_blank');

    } catch (err) {
      logger.error('Failed to view document:', err);
      toast({
        title: 'Failed to load document',
        description: 'Could not retrieve document from Canopy',
        variant: 'destructive',
      });
    } finally {
      setLoadingDocId(null);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return date;
    }
  };

  const calculateAge = (dob: string | null | undefined) => {
    if (!dob) return null;
    try {
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    } catch {
      return null;
    }
  };

  const getVehiclesForPolicy = (policyId: string) => vehicles?.filter(v => v.policy_id === policyId) || [];
  const getDriversForPolicy = (policyId: string) => drivers?.filter(d => d.policy_id === policyId) || [];
  const getDwellingsForPolicy = (policyId: string) => dwellings?.filter(d => d.policy_id === policyId) || [];
  const getAddressByType = (type: string) => addresses?.find(a => a.address_nature?.toUpperCase() === type.toUpperCase());

  // ============================================================================
  // LOADING & EMPTY STATES
  // ============================================================================

  if (!effectivePullId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">No Canopy Data Available</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Insurance data will appear here after a Canopy Connect import</p>
        </div>
      </div>
    );
  }

  if (policiesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading insurance data...</p>
        </div>
      </div>
    );
  }

  const customerName = pullData
    ? `${pullData.consumer_first_name || ''} ${pullData.consumer_middle_name || ''} ${pullData.consumer_last_name || ''}`.trim()
    : 'Unknown';

  const mailingAddress = getAddressByType('MAILING');
  const physicalAddress = getAddressByType('PHYSICAL');

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* HEADER */}
      {/* ================================================================== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary text-primary-foreground">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{customerName || 'Customer'}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
              {pullData?.consumer_email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {pullData.consumer_email}
                </span>
              )}
              {(pullData?.phone || pullData?.mobile_phone) && (
                <span className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {pullData.mobile_phone || pullData.phone}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge variant="outline">
                <Calendar className="w-3 h-3 mr-1" />
                Imported {formatDate(pullData?.created_at)}
              </Badge>
              {pullData?.insurance_provider_name && (
                <Badge variant="secondary">{pullData.insurance_provider_name}</Badge>
              )}
              <Badge variant="secondary">
                {policies?.length || 0} {policies?.length === 1 ? 'Policy' : 'Policies'}
              </Badge>
              {vehicles?.length ? <Badge variant="outline">{vehicles.length} Vehicles</Badge> : null}
              {drivers?.length ? <Badge variant="outline">{drivers.length} Drivers</Badge> : null}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* ================================================================== */}
      {/* ADDRESSES */}
      {/* ================================================================== */}
      {addresses && addresses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Addresses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mailingAddress && (
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Mailing</p>
                  <p className="font-medium">{mailingAddress.full_address || `${mailingAddress.number || ''} ${mailingAddress.street || ''} ${mailingAddress.type || ''}`.trim()}</p>
                  <p className="text-sm text-muted-foreground">{[mailingAddress.city, mailingAddress.state, mailingAddress.zip].filter(Boolean).join(', ')}</p>
                </div>
              )}
              {physicalAddress && physicalAddress.canopy_address_id !== mailingAddress?.canopy_address_id && (
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Physical</p>
                  <p className="font-medium">{physicalAddress.full_address || `${physicalAddress.number || ''} ${physicalAddress.street || ''} ${physicalAddress.type || ''}`.trim()}</p>
                  <p className="text-sm text-muted-foreground">{[physicalAddress.city, physicalAddress.state, physicalAddress.zip].filter(Boolean).join(', ')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* POLICIES */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Policies
            <Badge variant="secondary" className="ml-1">{policies?.length || 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {policies && policies.length > 0 ? (
            <Accordion type="multiple" className="space-y-3" defaultValue={[policies[0]?.id]}>
              {policies.map((policy) => {
                const policyVehicles = getVehiclesForPolicy(policy.id);
                const policyDrivers = getDriversForPolicy(policy.id);
                const policyDwellings = getDwellingsForPolicy(policy.id);

                return (
                  <AccordionItem key={policy.id} value={policy.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          {policy.policy_type === 'auto' ? (
                            <Car className="w-5 h-5 text-muted-foreground" />
                          ) : policy.policy_type === 'home' || policy.policy_type === 'homeowners' ? (
                            <Home className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <Shield className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div className="text-left">
                            <p className="font-medium capitalize">{policy.policy_type} Insurance</p>
                            <p className="text-sm text-muted-foreground">{policy.carrier_name} • {policy.policy_number || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(policy.premium_amount)}</p>
                            <p className="text-xs text-muted-foreground">/{policy.premium_frequency || 'year'}</p>
                          </div>
                          <Badge variant={policy.status === 'active' ? 'default' : 'secondary'}>
                            {policy.status || 'Active'}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <Separator className="mb-4" />

                      {/* Policy Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div>
                          <p className="text-xs text-muted-foreground">Effective Date</p>
                          <p className="font-medium">{formatDate(policy.effective_date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Expiration Date</p>
                          <p className="font-medium">{formatDate(policy.expiration_date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Deductible</p>
                          <p className="font-medium">{formatCurrency(policy.deductible)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Policy Number</p>
                          <p className="font-medium font-mono">{policy.policy_number || '-'}</p>
                        </div>
                      </div>

                      {/* Vehicles */}
                      {policyVehicles.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Car className="w-4 h-4" />
                            Vehicles ({policyVehicles.length})
                          </h4>
                          <div className="space-y-4">
                            {policyVehicles.map(vehicle => (
                              <div key={vehicle.id} className="border rounded-lg p-4 bg-muted/30">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <p className="font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                                    <p className="text-sm text-muted-foreground font-mono">VIN: {vehicle.vin || 'N/A'}</p>
                                  </div>
                                  {vehicle.ownership && <Badge variant="outline" className="capitalize">{vehicle.ownership}</Badge>}
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Usage</p>
                                    <p className="capitalize">{vehicle.usage_type || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Annual Mileage</p>
                                    <p>{vehicle.annual_mileage?.toLocaleString() || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Body Type</p>
                                    <p className="capitalize">{vehicle.body_type || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Garage</p>
                                    <p>{vehicle.garage_city ? `${vehicle.garage_city}, ${vehicle.garage_state}` : '-'}</p>
                                  </div>
                                </div>

                                {/* Coverages */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {vehicle.liability_bi && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Bodily Injury</p>
                                      <p className="font-medium">{formatCurrency(vehicle.liability_bi)}</p>
                                    </div>
                                  )}
                                  {vehicle.liability_pd && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Property Damage</p>
                                      <p className="font-medium">{formatCurrency(vehicle.liability_pd)}</p>
                                    </div>
                                  )}
                                  {vehicle.collision_deductible && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Collision Ded.</p>
                                      <p className="font-medium">{formatCurrency(vehicle.collision_deductible)}</p>
                                    </div>
                                  )}
                                  {vehicle.comprehensive_deductible && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Comp Ded.</p>
                                      <p className="font-medium">{formatCurrency(vehicle.comprehensive_deductible)}</p>
                                    </div>
                                  )}
                                  {vehicle.uninsured_motorist && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">UM/UIM</p>
                                      <p className="font-medium">{formatCurrency(vehicle.uninsured_motorist)}</p>
                                    </div>
                                  )}
                                  {vehicle.medical_payments && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Med Pay</p>
                                      <p className="font-medium">{formatCurrency(vehicle.medical_payments)}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Lien Holder */}
                                {vehicle.lien_holder_name && (
                                  <div className="mt-3 p-3 rounded border border-dashed">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Lien Holder</p>
                                    <p className="text-sm font-medium">{vehicle.lien_holder_name}</p>
                                    {vehicle.lien_holder_address_line1 && (
                                      <p className="text-xs text-muted-foreground">
                                        {vehicle.lien_holder_address_line1}, {vehicle.lien_holder_city}, {vehicle.lien_holder_state} {vehicle.lien_holder_zip}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dwellings */}
                      {policyDwellings.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Home className="w-4 h-4" />
                            Properties ({policyDwellings.length})
                          </h4>
                          <div className="space-y-4">
                            {policyDwellings.map(dwelling => (
                              <div key={dwelling.id} className="border rounded-lg p-4 bg-muted/30">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <p className="font-semibold">{dwelling.address_line1}</p>
                                    <p className="text-sm text-muted-foreground">{[dwelling.city, dwelling.state, dwelling.zip].filter(Boolean).join(', ')}</p>
                                  </div>
                                  {dwelling.property_type && <Badge variant="outline" className="capitalize">{dwelling.property_type.replace(/_/g, ' ')}</Badge>}
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Year Built</p>
                                    <p>{dwelling.year_built || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Sq Ft</p>
                                    <p>{dwelling.square_footage?.toLocaleString() || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Construction</p>
                                    <p className="capitalize">{dwelling.construction_type || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Roof</p>
                                    <p className="capitalize">{dwelling.roof_type || '-'}</p>
                                  </div>
                                </div>

                                {/* Coverages */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {dwelling.dwelling_coverage && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Dwelling (A)</p>
                                      <p className="font-medium">{formatCurrency(dwelling.dwelling_coverage)}</p>
                                    </div>
                                  )}
                                  {dwelling.other_structures && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Other Structures (B)</p>
                                      <p className="font-medium">{formatCurrency(dwelling.other_structures)}</p>
                                    </div>
                                  )}
                                  {dwelling.personal_property && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Personal Prop (C)</p>
                                      <p className="font-medium">{formatCurrency(dwelling.personal_property)}</p>
                                    </div>
                                  )}
                                  {dwelling.liability_coverage && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Liability (E)</p>
                                      <p className="font-medium">{formatCurrency(dwelling.liability_coverage)}</p>
                                    </div>
                                  )}
                                  {dwelling.deductible && (
                                    <div className="p-2 rounded bg-background border">
                                      <p className="text-xs text-muted-foreground">Deductible</p>
                                      <p className="font-medium">{formatCurrency(dwelling.deductible)}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Mortgagee */}
                                {dwelling.mortgagee_name && (
                                  <div className="mt-3 p-3 rounded border border-dashed">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Mortgagee</p>
                                    <p className="text-sm font-medium">{dwelling.mortgagee_name}</p>
                                    {dwelling.mortgage_loan_number && <p className="text-xs text-muted-foreground">Loan #: {dwelling.mortgage_loan_number}</p>}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Drivers for this policy */}
                      {policyDrivers.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Drivers ({policyDrivers.length})
                          </h4>
                          <div className="grid md:grid-cols-2 gap-3">
                            {policyDrivers.map(driver => {
                              const age = calculateAge(driver.date_of_birth);
                              return (
                                <div key={driver.id} className="border rounded-lg p-3 bg-muted/30">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="font-medium">{driver.first_name} {driver.last_name}</p>
                                    <div className="flex gap-1">
                                      {driver.is_primary && <Badge>Primary</Badge>}
                                      {driver.is_excluded && <Badge variant="destructive">Excluded</Badge>}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">Age: </span>
                                      <span>{age || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Gender: </span>
                                      <span className="capitalize">{driver.gender || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">License: </span>
                                      <span>{driver.license_state || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Marital: </span>
                                      <span className="capitalize">{driver.marital_status || '-'}</span>
                                    </div>
                                  </div>
                                  {((driver.violations && driver.violations.length > 0) || (driver.accidents && driver.accidents.length > 0)) && (
                                    <div className="mt-2 pt-2 border-t flex items-center gap-1 text-sm text-destructive">
                                      <AlertTriangle className="w-3 h-3" />
                                      {driver.violations?.length > 0 && <span>{driver.violations.length} violation(s)</span>}
                                      {driver.accidents?.length > 0 && <span>{driver.accidents.length} accident(s)</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No policies imported</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* CLAIMS */}
      {/* ================================================================== */}
      {claims && claims.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Claims History
              <Badge variant="secondary" className="ml-1">{claims.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {claims.map(claim => (
                <div key={claim.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">{claim.claim_type || 'Claim'}</p>
                      <p className="text-sm text-muted-foreground">#{claim.claim_number || claim.carrier_claim_identifier || 'N/A'} • Filed {formatDate(claim.claim_date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {claim.at_fault && <Badge variant="destructive">At Fault</Badge>}
                      <Badge variant={claim.status === 'closed' ? 'default' : 'secondary'}>{claim.status || 'Open'}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Amount Paid: </span>
                      <span className="font-medium">{formatCurrency(claim.amount_paid)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Deductible: </span>
                      <span className="font-medium">{formatCurrency(claim.deductible_applied)}</span>
                    </div>
                    {claim.close_date && (
                      <div>
                        <span className="text-muted-foreground">Closed: </span>
                        <span>{formatDate(claim.close_date)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* INCUMBENT AGENTS */}
      {/* ================================================================== */}
      {agents && agents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Current Agent
              <Badge variant="secondary" className="ml-1">{agents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {agents.map(agent => (
                <div key={agent.id} className="border rounded-lg p-4">
                  <p className="font-semibold">{agent.agency_name || 'Unknown Agency'}</p>
                  {agent.agent_full_name && <p className="text-sm text-muted-foreground">{agent.agent_full_name}</p>}
                  <div className="mt-2 space-y-1 text-sm">
                    {agent.phone_number && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3 h-3" />{agent.phone_number}
                      </div>
                    )}
                    {agent.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3 h-3" />{agent.email}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* DOCUMENTS */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Documents
              <Badge variant="secondary" className="ml-1">{documents?.length || 0}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {documents && documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map(doc => {
                const hasDocumentAccess = doc.canopy_document_id || doc.file_url;
                const isLoading = loadingDocId === doc.id;

                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      {doc.document_type === 'id_card' ? (
                        <IdCard className="w-5 h-5 text-muted-foreground" />
                      ) : doc.document_type === 'dec_page' ? (
                        <FileText className="w-5 h-5 text-primary" />
                      ) : (
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium capitalize">
                          {doc.document_type?.replace(/_/g, ' ') || doc.title || 'Document'}
                        </p>
                        <p className="text-xs text-muted-foreground">{doc.file_name || 'Document'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.downloaded && doc.storage_path ? (
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />Saved
                        </Badge>
                      ) : null}
                      {hasDocumentAccess && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDocument(doc)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <ExternalLink className="w-4 h-4 mr-1" />
                              View
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Download className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No documents available</p>
              <p className="text-sm mt-1">Not all carriers provide documents through Canopy</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CanopyDataDisplayRedesign;
