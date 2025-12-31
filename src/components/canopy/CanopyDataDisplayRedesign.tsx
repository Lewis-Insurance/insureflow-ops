// ============================================================================
// CANOPY DATA DISPLAY - COMPLETE REDESIGN
// ============================================================================
// Displays ALL insurance data imported from Canopy Connect in portal style
// Matches the Canopy Connect portal UI for familiarity
// Shows: policies, vehicles, drivers, dwellings, claims, documents,
//        addresses, agents, driving records, loss events
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  ChevronDown,
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
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());
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

  // Policies
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

  // Vehicles
  const { data: vehicles } = useQuery({
    queryKey: ['canopy-vehicles-full', effectivePullId],
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

  // Drivers
  const { data: drivers } = useQuery({
    queryKey: ['canopy-drivers-full', effectivePullId],
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

  // Dwellings
  const { data: dwellings } = useQuery({
    queryKey: ['canopy-dwellings-full', effectivePullId],
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

  // Claims
  const { data: claims } = useQuery({
    queryKey: ['canopy-claims-full', effectivePullId],
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

  // Documents
  const { data: documents } = useQuery({
    queryKey: ['canopy-documents-full', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId || !policies?.length) return [];
      const policyIds = policies.map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_documents')
        .select('*')
        .in('policy_id', policyIds);
      if (error) {
        logger.debug('Documents query error:', error);
        return [];
      }
      return data;
    },
    enabled: !!policies?.length,
  });

  // NEW: Addresses
  const { data: addresses } = useQuery({
    queryKey: ['canopy-addresses', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase
        .from('canopy_addresses')
        .select('*')
        .eq('pull_id', effectivePullId);
      if (error) {
        logger.debug('Addresses query error:', error);
        return [];
      }
      return data;
    },
    enabled: !!effectivePullId,
  });

  // NEW: Agents
  const { data: agents } = useQuery({
    queryKey: ['canopy-agents', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase
        .from('canopy_agents')
        .select('*')
        .eq('pull_id', effectivePullId);
      if (error) {
        logger.debug('Agents query error:', error);
        return [];
      }
      return data;
    },
    enabled: !!effectivePullId,
  });

  // NEW: Driving Records
  const { data: drivingRecords } = useQuery({
    queryKey: ['canopy-driving-records', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase
        .from('canopy_driving_records')
        .select('*')
        .eq('pull_id', effectivePullId);
      if (error) {
        logger.debug('Driving records query error:', error);
        return [];
      }
      return data;
    },
    enabled: !!effectivePullId,
  });

  // NEW: Loss Events
  const { data: lossEvents } = useQuery({
    queryKey: ['canopy-loss-events', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase
        .from('canopy_loss_events')
        .select('*')
        .eq('pull_id', effectivePullId);
      if (error) {
        logger.debug('Loss events query error:', error);
        return [];
      }
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
        toast({
          title: 'Refresh complete',
          description: `Updated ${data.policies || 0} policies, ${data.documents || 0} documents`,
        });
        // Invalidate all queries
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
      } else {
        toast({ title: 'Refresh issue', description: data?.message || 'Could not refresh', variant: 'destructive' });
      }
    } catch (err) {
      logger.error('Refresh failed:', err);
      toast({ title: 'Refresh failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownloadAllDocs = async () => {
    if (!documents?.length) return;

    for (const doc of documents) {
      if (doc.downloaded && doc.storage_path) {
        try {
          const bucket = doc.storage_bucket || 'canopy-documents';
          const { data } = await supabase.storage.from(bucket).createSignedUrl(doc.storage_path, 3600);
          if (data?.signedUrl) {
            window.open(data.signedUrl, '_blank');
          }
        } catch (err) {
          logger.error('Document download error:', err);
        }
      }
    }
    toast({ title: 'Documents opened', description: `Opened ${documents.length} documents in new tabs` });
  };

  const togglePolicyExpand = (policyId: string) => {
    setExpandedPolicies(prev => {
      const next = new Set(prev);
      if (next.has(policyId)) {
        next.delete(policyId);
      } else {
        next.add(policyId);
      }
      return next;
    });
  };

  // ============================================================================
  // LOADING & EMPTY STATES
  // ============================================================================

  if (!effectivePullId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No Canopy Data Available</p>
          <p className="text-sm mt-1">Insurance data will appear here after a Canopy Connect import</p>
        </CardContent>
      </Card>
    );
  }

  if (policiesLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-blue-600" />
          <p className="text-lg">Loading insurance data...</p>
        </CardContent>
      </Card>
    );
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getVehiclesForPolicy = (policyId: string) =>
    vehicles?.filter(v => v.policy_id === policyId) || [];

  const getDriversForPolicy = (policyId: string) =>
    drivers?.filter(d => d.policy_id === policyId) || [];

  const getDwellingsForPolicy = (policyId: string) =>
    dwellings?.filter(d => d.policy_id === policyId) || [];

  const getClaimsForPolicy = (policyId: string) =>
    claims?.filter(c => c.policy_id === policyId) || [];

  const getDocumentsForPolicy = (policyId: string) =>
    documents?.filter(d => d.policy_id === policyId) || [];

  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
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

  const getPolicyTypeIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'auto': return <Car className="w-4 h-4" />;
      case 'home':
      case 'homeowners':
      case 'renters':
      case 'condo': return <Home className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'expired': return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getAddressByType = (type: string) =>
    addresses?.find(a => a.address_nature?.toUpperCase() === type.toUpperCase());

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
      {/* HEADER SECTION */}
      {/* ================================================================== */}
      <Card className="border-l-4 border-l-blue-600">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{customerName || 'Customer'}</h2>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
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
                <div className="flex items-center gap-3 mt-3">
                  <Badge variant="outline" className="font-normal">
                    <Calendar className="w-3 h-3 mr-1" />
                    Imported {formatDate(pullData?.created_at)}
                  </Badge>
                  {pullData?.insurance_provider_name && (
                    <Badge className="bg-blue-600">
                      {pullData.insurance_provider_name}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    {policies?.length || 0} {policies?.length === 1 ? 'Policy' : 'Policies'}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* ADDRESSES SECTION */}
      {/* ================================================================== */}
      {addresses && addresses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Addresses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {mailingAddress && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mailing Address</p>
                  <p className="font-medium">{mailingAddress.full_address || `${mailingAddress.number || ''} ${mailingAddress.street || ''} ${mailingAddress.type || ''}`.trim()}</p>
                  {mailingAddress.sec_unit_type && (
                    <p className="text-sm text-muted-foreground">{mailingAddress.sec_unit_type} {mailingAddress.sec_unit_num}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {[mailingAddress.city, mailingAddress.state, mailingAddress.zip].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
              {physicalAddress && physicalAddress.canopy_address_id !== mailingAddress?.canopy_address_id && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Physical Address</p>
                  <p className="font-medium">{physicalAddress.full_address || `${physicalAddress.number || ''} ${physicalAddress.street || ''} ${physicalAddress.type || ''}`.trim()}</p>
                  {physicalAddress.sec_unit_type && (
                    <p className="text-sm text-muted-foreground">{physicalAddress.sec_unit_type} {physicalAddress.sec_unit_num}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {[physicalAddress.city, physicalAddress.state, physicalAddress.zip].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
              {/* Show other address types */}
              {addresses.filter(a =>
                a.address_nature?.toUpperCase() !== 'MAILING' &&
                a.address_nature?.toUpperCase() !== 'PHYSICAL'
              ).map(addr => (
                <div key={addr.id} className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {addr.address_nature?.replace(/_/g, ' ') || 'Other'} Address
                  </p>
                  <p className="font-medium">{addr.full_address || `${addr.number || ''} ${addr.street || ''} ${addr.type || ''}`.trim()}</p>
                  <p className="text-sm text-muted-foreground">
                    {[addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* POLICIES TABLE */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Policies
            <Badge variant="secondary" className="ml-2">{policies?.length || 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {policies && policies.length > 0 ? (
            <div className="border rounded-lg overflow-hidden mx-6 mb-6">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead>Policy Type</TableHead>
                    <TableHead>Policy ID</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead className="text-right">Premium</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((policy) => {
                    const isExpanded = expandedPolicies.has(policy.id);
                    const policyVehicles = getVehiclesForPolicy(policy.id);
                    const policyDrivers = getDriversForPolicy(policy.id);
                    const policyDwellings = getDwellingsForPolicy(policy.id);
                    const policyClaims = getClaimsForPolicy(policy.id);
                    const policyDocs = getDocumentsForPolicy(policy.id);
                    const hasExpandableContent = policyVehicles.length > 0 || policyDwellings.length > 0;

                    return (
                      <React.Fragment key={policy.id}>
                        <TableRow
                          className={`cursor-pointer hover:bg-muted/30 ${isExpanded ? 'bg-blue-50' : ''}`}
                          onClick={() => hasExpandableContent && togglePolicyExpand(policy.id)}
                        >
                          <TableCell>
                            {hasExpandableContent && (
                              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getPolicyTypeIcon(policy.policy_type)}
                              <span className="font-medium capitalize">{policy.policy_type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{policy.policy_number || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{policy.carrier_name || '-'}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-700">
                            {formatCurrency(policy.premium_amount)}
                            {policy.premium_frequency && (
                              <span className="text-xs text-muted-foreground font-normal">/{policy.premium_frequency}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(policy.status)}>
                              {policy.status || 'Active'}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(policy.effective_date)}</TableCell>
                          <TableCell>{formatDate(policy.expiration_date)}</TableCell>
                        </TableRow>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-slate-50 p-0">
                              <div className="p-6 space-y-6">
                                {/* Vehicles */}
                                {policyVehicles.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                      <Car className="w-4 h-4 text-orange-600" />
                                      Vehicles ({policyVehicles.length})
                                    </h4>
                                    <div className="space-y-4">
                                      {policyVehicles.map(vehicle => (
                                        <div key={vehicle.id} className="bg-white rounded-lg border p-4">
                                          <div className="flex items-start justify-between mb-4">
                                            <div>
                                              <p className="font-semibold text-lg">
                                                {vehicle.year} {vehicle.make} {vehicle.model}
                                              </p>
                                              <p className="text-sm text-muted-foreground font-mono">
                                                VIN: {vehicle.vin || 'N/A'}
                                              </p>
                                            </div>
                                            <div className="text-right text-sm">
                                              {vehicle.ownership && (
                                                <Badge variant="outline" className="capitalize">{vehicle.ownership}</Badge>
                                              )}
                                            </div>
                                          </div>

                                          {/* Vehicle Details Grid */}
                                          <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                                            <div>
                                              <p className="text-xs text-muted-foreground">Usage</p>
                                              <p className="font-medium capitalize">{vehicle.usage_type || '-'}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Annual Mileage</p>
                                              <p className="font-medium">{vehicle.annual_mileage?.toLocaleString() || '-'}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Body Type</p>
                                              <p className="font-medium capitalize">{vehicle.body_type || '-'}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Garage Location</p>
                                              <p className="font-medium">{vehicle.garage_city ? `${vehicle.garage_city}, ${vehicle.garage_state}` : '-'}</p>
                                            </div>
                                          </div>

                                          {/* Lien Holder */}
                                          {vehicle.lien_holder_name && (
                                            <div className="mb-4 p-3 bg-amber-50 rounded-lg">
                                              <p className="text-xs font-semibold text-amber-700 mb-1">Lien Holder</p>
                                              <p className="text-sm font-medium">{vehicle.lien_holder_name}</p>
                                              {vehicle.lien_holder_address_line1 && (
                                                <p className="text-xs text-muted-foreground">
                                                  {vehicle.lien_holder_address_line1}, {vehicle.lien_holder_city}, {vehicle.lien_holder_state} {vehicle.lien_holder_zip}
                                                </p>
                                              )}
                                            </div>
                                          )}

                                          {/* Coverage Table */}
                                          <div className="border rounded-lg overflow-hidden">
                                            <Table>
                                              <TableHeader>
                                                <TableRow className="bg-muted/30">
                                                  <TableHead className="text-xs">Coverage</TableHead>
                                                  <TableHead className="text-xs text-right">Limit/Deductible</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {vehicle.liability_bi && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Bodily Injury Liability</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.liability_bi)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {vehicle.liability_pd && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Property Damage Liability</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.liability_pd)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {vehicle.collision_deductible && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Collision Deductible</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.collision_deductible)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {vehicle.comprehensive_deductible && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Comprehensive Deductible</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.comprehensive_deductible)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {vehicle.uninsured_motorist && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Uninsured Motorist (UM/UIM)</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.uninsured_motorist)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {vehicle.medical_payments && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Medical Payments</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.medical_payments)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {vehicle.rental_reimbursement && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Rental Reimbursement</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.rental_reimbursement)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {vehicle.towing && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Towing/Roadside</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(vehicle.towing)}</TableCell>
                                                  </TableRow>
                                                )}
                                              </TableBody>
                                            </Table>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Dwellings */}
                                {policyDwellings.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                      <Home className="w-4 h-4 text-purple-600" />
                                      Properties ({policyDwellings.length})
                                    </h4>
                                    <div className="space-y-4">
                                      {policyDwellings.map(dwelling => (
                                        <div key={dwelling.id} className="bg-white rounded-lg border p-4">
                                          <div className="flex items-start justify-between mb-4">
                                            <div>
                                              <p className="font-semibold text-lg">{dwelling.address_line1}</p>
                                              <p className="text-sm text-muted-foreground">
                                                {[dwelling.city, dwelling.state, dwelling.zip].filter(Boolean).join(', ')}
                                              </p>
                                            </div>
                                            {dwelling.property_type && (
                                              <Badge variant="outline" className="capitalize">{dwelling.property_type.replace(/_/g, ' ')}</Badge>
                                            )}
                                          </div>

                                          {/* Property Details Grid */}
                                          <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                                            <div>
                                              <p className="text-xs text-muted-foreground">Year Built</p>
                                              <p className="font-medium">{dwelling.year_built || '-'}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Square Feet</p>
                                              <p className="font-medium">{dwelling.square_footage?.toLocaleString() || '-'}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Construction</p>
                                              <p className="font-medium capitalize">{dwelling.construction_type || '-'}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground">Roof Type</p>
                                              <p className="font-medium capitalize">{dwelling.roof_type || '-'}</p>
                                            </div>
                                          </div>

                                          {/* Additional Property Details */}
                                          <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                                            {dwelling.num_beds && (
                                              <div>
                                                <p className="text-xs text-muted-foreground">Bedrooms</p>
                                                <p className="font-medium">{dwelling.num_beds}</p>
                                              </div>
                                            )}
                                            {(dwelling.num_baths_full || dwelling.num_baths_partial) && (
                                              <div>
                                                <p className="text-xs text-muted-foreground">Bathrooms</p>
                                                <p className="font-medium">{dwelling.num_baths_full || 0}{dwelling.num_baths_partial ? `.${dwelling.num_baths_partial}` : ''}</p>
                                              </div>
                                            )}
                                            {dwelling.stories && (
                                              <div>
                                                <p className="text-xs text-muted-foreground">Stories</p>
                                                <p className="font-medium">{dwelling.stories}</p>
                                              </div>
                                            )}
                                            {dwelling.roof_year && (
                                              <div>
                                                <p className="text-xs text-muted-foreground">Roof Year</p>
                                                <p className="font-medium">{dwelling.roof_year}</p>
                                              </div>
                                            )}
                                          </div>

                                          {/* Mortgagee Info */}
                                          {dwelling.mortgagee_name && (
                                            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                                              <p className="text-xs font-semibold text-blue-700 mb-1">Mortgagee</p>
                                              <p className="text-sm font-medium">{dwelling.mortgagee_name}</p>
                                              {dwelling.mortgage_loan_number && (
                                                <p className="text-xs text-muted-foreground">Loan #: {dwelling.mortgage_loan_number}</p>
                                              )}
                                              {dwelling.mortgagee_address_line1 && (
                                                <p className="text-xs text-muted-foreground">
                                                  {dwelling.mortgagee_address_line1}, {dwelling.mortgagee_city}, {dwelling.mortgagee_state} {dwelling.mortgagee_zip}
                                                </p>
                                              )}
                                            </div>
                                          )}

                                          {/* Property Features */}
                                          <div className="flex flex-wrap gap-2 mb-4">
                                            {dwelling.has_fireplace && <Badge variant="outline">Fireplace</Badge>}
                                            {dwelling.has_pool && <Badge variant="outline">Pool</Badge>}
                                            {dwelling.swimming_pool && <Badge variant="outline">Swimming Pool</Badge>}
                                            {dwelling.security_system && <Badge variant="outline">Security System</Badge>}
                                            {dwelling.fire_alarm && <Badge variant="outline">Fire Alarm</Badge>}
                                            {dwelling.sprinkler_system && <Badge variant="outline">Sprinklers</Badge>}
                                            {dwelling.gated_community && <Badge variant="outline">Gated Community</Badge>}
                                          </div>

                                          {/* Coverage Table */}
                                          <div className="border rounded-lg overflow-hidden">
                                            <Table>
                                              <TableHeader>
                                                <TableRow className="bg-muted/30">
                                                  <TableHead className="text-xs">Coverage</TableHead>
                                                  <TableHead className="text-xs text-right">Limit</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {dwelling.dwelling_coverage && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Dwelling (Coverage A)</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(dwelling.dwelling_coverage)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {dwelling.other_structures && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Other Structures (Coverage B)</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(dwelling.other_structures)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {dwelling.personal_property && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Personal Property (Coverage C)</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(dwelling.personal_property)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {dwelling.loss_of_use && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Loss of Use (Coverage D)</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(dwelling.loss_of_use)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {dwelling.liability_coverage && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Personal Liability (Coverage E)</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(dwelling.liability_coverage)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {dwelling.medical_payments && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Medical Payments (Coverage F)</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(dwelling.medical_payments)}</TableCell>
                                                  </TableRow>
                                                )}
                                                {dwelling.deductible && (
                                                  <TableRow>
                                                    <TableCell className="text-sm">Deductible</TableCell>
                                                    <TableCell className="text-sm text-right font-medium">{formatCurrency(dwelling.deductible)}</TableCell>
                                                  </TableRow>
                                                )}
                                              </TableBody>
                                            </Table>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Claims for this policy */}
                                {policyClaims.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                                      Claims ({policyClaims.length})
                                    </h4>
                                    <div className="space-y-2">
                                      {policyClaims.map(claim => (
                                        <div key={claim.id} className="bg-white rounded-lg border p-3 flex items-center justify-between">
                                          <div>
                                            <p className="font-medium">{claim.claim_type || 'Claim'} #{claim.claim_number || 'N/A'}</p>
                                            <p className="text-sm text-muted-foreground">Filed: {formatDate(claim.claim_date)}</p>
                                          </div>
                                          <div className="text-right">
                                            <Badge className={claim.status === 'closed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                                              {claim.status || 'Open'}
                                            </Badge>
                                            {claim.amount_paid && (
                                              <p className="text-sm font-medium mt-1">{formatCurrency(claim.amount_paid)} paid</p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Documents for this policy */}
                                {policyDocs.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                      <FileText className="w-4 h-4 text-blue-600" />
                                      Documents ({policyDocs.length})
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                      {policyDocs.map(doc => (
                                        <Badge key={doc.id} variant="outline" className="cursor-pointer hover:bg-muted">
                                          <FileText className="w-3 h-3 mr-1" />
                                          {doc.title || doc.document_type || 'Document'}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground mx-6 mb-6">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No policies imported</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* DRIVERS SECTION */}
      {/* ================================================================== */}
      {drivers && drivers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              Drivers
              <Badge variant="secondary" className="ml-2">{drivers.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {drivers.map(driver => {
                const age = calculateAge(driver.date_of_birth);
                const driverRecords = drivingRecords?.filter(r => r.driver_id === driver.id || r.canopy_driver_id === driver.canopy_driver_id) || [];

                return (
                  <div key={driver.id} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-full">
                          <User className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-lg">{driver.first_name} {driver.last_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {driver.is_primary && <Badge className="bg-blue-600 text-xs">Primary</Badge>}
                            {driver.relation_to_insured && (
                              <Badge variant="outline" className="text-xs capitalize">{driver.relation_to_insured}</Badge>
                            )}
                            {driver.is_excluded && <Badge variant="destructive" className="text-xs">Excluded</Badge>}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <IdCard className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Driver's License</p>
                          <p className="font-medium">{driver.license_number || 'N/A'} ({driver.license_state || '-'})</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">DOB / Age</p>
                          <p className="font-medium">{formatDate(driver.date_of_birth)} {age ? `(${age})` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Gender</p>
                          <p className="font-medium capitalize">{driver.gender || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Marital Status</p>
                          <p className="font-medium capitalize">{driver.marital_status || 'N/A'}</p>
                        </div>
                      </div>
                      {(driver.education || driver.education_level) && (
                        <div className="flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Education</p>
                            <p className="font-medium capitalize">{(driver.education || driver.education_level)?.replace(/_/g, ' ') || 'N/A'}</p>
                          </div>
                        </div>
                      )}
                      {driver.occupation && (
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Occupation</p>
                            <p className="font-medium capitalize">{driver.occupation?.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                      )}
                      {driver.years_licensed && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Years Licensed</p>
                            <p className="font-medium">{driver.years_licensed}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">License Status</p>
                          <p className={`font-medium capitalize ${driver.license_status === 'valid' ? 'text-green-600' : ''}`}>
                            {driver.license_status || 'Valid'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SR-22 Indicator */}
                    {driver.sr22_required && (
                      <div className="mt-4 p-2 bg-amber-50 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-700">SR-22 Required</span>
                      </div>
                    )}

                    {/* Violations/Accidents from driver record */}
                    {((driver.violations && driver.violations.length > 0) || (driver.accidents && driver.accidents.length > 0)) && (
                      <div className="mt-4 p-3 bg-amber-50 rounded-lg">
                        <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Driving History
                        </p>
                        {driver.violations?.map((v: any, i: number) => (
                          <div key={i} className="text-sm text-amber-800 flex items-center gap-1 mb-1">
                            <ChevronRight className="w-3 h-3" />
                            {v.type || v.description || 'Violation'} {v.date && `- ${formatDate(v.date)}`}
                          </div>
                        ))}
                        {driver.accidents?.map((a: any, i: number) => (
                          <div key={i} className="text-sm text-red-700 flex items-center gap-1 mb-1">
                            <XCircle className="w-3 h-3" />
                            {a.type || a.description || 'Accident'} {a.date && `- ${formatDate(a.date)}`}
                            {a.at_fault && <Badge variant="destructive" className="text-xs ml-2">At Fault</Badge>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Driving Records from separate table */}
                    {driverRecords.length > 0 && (
                      <div className="mt-4 p-3 bg-amber-50 rounded-lg">
                        <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                          <History className="w-3 h-3" />
                          MVR Records ({driverRecords.length})
                        </p>
                        {driverRecords.map((record, i) => (
                          <div key={i} className={`text-sm flex items-center gap-1 mb-1 ${record.incident_type === 'ACCIDENT' ? 'text-red-700' : 'text-amber-800'}`}>
                            {record.incident_type === 'ACCIDENT' ? <XCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            <span className="capitalize">{record.violation_type?.replace(/_/g, ' ') || record.incident_type}</span>
                            {record.incident_date && <span className="text-muted-foreground">- {formatDate(record.incident_date)}</span>}
                            {record.is_at_fault && <Badge variant="destructive" className="text-xs ml-2">At Fault</Badge>}
                            {record.points && <span className="text-xs text-muted-foreground ml-2">({record.points} pts)</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Clean record indicator */}
                    {!driver.violations?.length && !driver.accidents?.length && !driverRecords.length && (
                      <div className="mt-4 flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Clean Driving Record</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* CLAIMS SECTION (if any not associated with policies) */}
      {/* ================================================================== */}
      {claims && claims.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Claims History
              <Badge variant="secondary" className="ml-2">{claims.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {claims.map(claim => (
                <div key={claim.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{claim.claim_type || 'Claim'}</p>
                      <p className="text-sm text-muted-foreground">
                        Claim #{claim.claim_number || claim.carrier_claim_identifier || 'N/A'}
                      </p>
                    </div>
                    <Badge className={claim.status === 'closed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                      {claim.status || 'Open'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Date Filed</p>
                      <p className="font-medium">{formatDate(claim.claim_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Amount Paid</p>
                      <p className="font-medium">{formatCurrency(claim.amount_paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Deductible</p>
                      <p className="font-medium">{formatCurrency(claim.deductible_applied)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">At Fault</p>
                      <p className="font-medium">{claim.at_fault ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                  {claim.representative_name && (
                    <div className="mt-3 pt-3 border-t text-sm">
                      <p className="text-xs text-muted-foreground mb-1">Claims Representative</p>
                      <p className="font-medium">{claim.representative_name}</p>
                      <div className="flex gap-4 text-muted-foreground">
                        {claim.representative_phone && <span>{claim.representative_phone}</span>}
                        {claim.representative_email && <span>{claim.representative_email}</span>}
                      </div>
                    </div>
                  )}
                  {claim.description && (
                    <p className="mt-3 text-sm text-muted-foreground">{claim.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* LOSS EVENTS SECTION */}
      {/* ================================================================== */}
      {lossEvents && lossEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Loss Events
              <Badge variant="secondary" className="ml-2">{lossEvents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lossEvents.map(event => (
                <div key={event.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold capitalize">{event.type?.replace(/_/g, ' ') || 'Loss Event'}</p>
                      <p className="text-sm text-muted-foreground">
                        Occurred: {formatDate(event.date_of_occurrence)}
                      </p>
                    </div>
                    {event.is_claim_open && (
                      <Badge variant="destructive">Claim Open</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Amount Paid</p>
                      <p className="font-medium">{event.amount_paid_cents ? formatCurrency(event.amount_paid_cents / 100) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Amount Reserved</p>
                      <p className="font-medium">{event.amount_reserved_cents ? formatCurrency(event.amount_reserved_cents / 100) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium">{event.location || '-'}</p>
                    </div>
                  </div>
                  {event.description && (
                    <p className="mt-3 text-sm text-muted-foreground">{event.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* INCUMBENT AGENTS SECTION */}
      {/* ================================================================== */}
      {agents && agents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Incumbent Agent(s)
              <Badge variant="secondary" className="ml-2">{agents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {agents.map(agent => (
                <div key={agent.id} className="border rounded-lg p-4 bg-slate-50">
                  <p className="font-semibold">{agent.agency_name || 'Unknown Agency'}</p>
                  {agent.agent_full_name && (
                    <p className="text-sm text-muted-foreground">Agent: {agent.agent_full_name}</p>
                  )}
                  <div className="mt-2 space-y-1 text-sm">
                    {agent.phone_number && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {agent.phone_number}
                      </div>
                    )}
                    {agent.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        {agent.email}
                      </div>
                    )}
                    {agent.address_line1 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {agent.address_line1}, {agent.city}, {agent.state} {agent.zip}
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
      {/* DOCUMENTS SECTION */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Documents
              <Badge variant="secondary" className="ml-2">{documents?.length || 0}</Badge>
            </CardTitle>
            {documents && documents.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownloadAllDocs}>
                <Download className="w-4 h-4 mr-2" />
                Download All Documents
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {documents && documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map(doc => (
                <DocumentRow key={doc.id} document={doc} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Download className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No Documents Available</p>
              <p className="text-sm mt-1">Documents like ID cards and dec pages depend on the carrier.</p>
              <p className="text-xs mt-2">Not all carriers provide documents through Canopy Connect.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// DOCUMENT ROW COMPONENT
// ============================================================================

function DocumentRow({ document }: { document: any }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const getDocTypeLabel = (type: string | null | undefined) => {
    const labels: Record<string, string> = {
      'id_card': 'Insurance ID Card',
      'dec_page': 'Declaration Page',
      'policy_doc': 'Policy Document',
      'endorsement': 'Endorsement',
      'certificate': 'Certificate of Insurance',
      'other': 'Document',
    };
    return labels[type || 'other'] || 'Document';
  };

  const isLocal = document.downloaded && document.storage_path;

  const handleView = async () => {
    if (!isLocal) {
      window.open('https://app.usecanopy.com', '_blank');
      return;
    }

    setIsLoading(true);
    try {
      const bucket = document.storage_bucket || 'canopy-documents';
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(document.storage_path, 3600);
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      logger.error('Document view error:', err);
      toast({ title: 'Error', description: 'Could not open document', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${isLocal ? 'bg-green-100' : 'bg-amber-100'}`}>
          <FileText className={`w-4 h-4 ${isLocal ? 'text-green-600' : 'text-amber-600'}`} />
        </div>
        <div>
          <p className="font-medium">{document.title || getDocTypeLabel(document.document_type)}</p>
          <p className="text-xs text-muted-foreground">{document.file_name || 'Document'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isLocal ? (
          <Badge variant="outline" className="text-green-600 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Saved
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600 border-amber-200">
            <ExternalLink className="w-3 h-3 mr-1" />
            Canopy
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={handleView} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isLocal ? (
            <Download className="w-4 h-4" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default CanopyDataDisplayRedesign;
