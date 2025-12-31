// ============================================================================
// CANOPY DATA DISPLAY - CLEAN TABLE-BASED DESIGN
// ============================================================================
// Matches Canopy Connect portal visual style for familiarity
// Table-based layout with expandable rows showing coverage details
// ============================================================================

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
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
  Home,
  Heart,
  FileText,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  Loader2,
  CheckCircle,
  User,
  IdCard,
  AlertTriangle,
} from 'lucide-react';

interface CanopyDataDisplayRedesignProps {
  pullId?: string;
  leadId?: string;
}

// Coverage item from Canopy's coverages JSONB array
interface CoverageItem {
  name: string;
  friendly_name?: string;
  premium_cents?: number;
  per_person_limit_cents?: number;
  per_incident_limit_cents?: number;
  per_day_limit_cents?: number;
  deductible_cents?: number;
  is_declined?: boolean;
}

export function CanopyDataDisplayRedesign({ pullId, leadId }: CanopyDataDisplayRedesignProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get pull data
  const { data: pullData } = useQuery({
    queryKey: ['canopy-pull-data', leadId, pullId],
    queryFn: async () => {
      if (pullId) {
        const { data, error } = await supabase.from('canopy_pulls').select('*').eq('id', pullId).single();
        if (error) return null;
        return data;
      }
      if (leadId) {
        const { data, error } = await supabase.from('canopy_pulls').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).single();
        if (error) return null;
        return data;
      }
      return null;
    },
    enabled: !!leadId || !!pullId,
  });

  const effectivePullId = pullId || pullData?.id;
  const canopyPullId = pullData?.canopy_pull_id;

  // Data queries
  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ['canopy-policies-full', effectivePullId],
    queryFn: async () => {
      if (!effectivePullId) return [];
      const { data, error } = await supabase.from('canopy_policies').select('*').eq('pull_id', effectivePullId).order('created_at', { ascending: false });
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

  // Actions
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
        queryClient.invalidateQueries({ queryKey: ['canopy-documents-full', effectivePullId] });
        queryClient.invalidateQueries({ queryKey: ['canopy-addresses', effectivePullId] });
      }
    } catch (err) {
      logger.error('Refresh failed:', err);
      toast({ title: 'Refresh failed', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewDocument = async (doc: { id: string; file_url?: string | null; canopy_document_id?: string | null }) => {
    setLoadingDocId(doc.id);
    try {
      let documentId = doc.canopy_document_id;
      if (!documentId && doc.file_url) {
        const match = doc.file_url.match(/documents\/([a-f0-9-]+)\/download/);
        if (match) documentId = match[1];
      }

      if (!documentId) {
        toast({ title: 'Cannot view document', description: 'Document ID not available', variant: 'destructive' });
        return;
      }

      const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/canopy-document-proxy?documentId=${documentId}`;
      window.open(proxyUrl, '_blank');
    } catch (err) {
      logger.error('Failed to view document:', err);
      toast({ title: 'Failed to load document', variant: 'destructive' });
    } finally {
      setLoadingDocId(null);
    }
  };

  const togglePolicy = (policyId: string) => {
    setExpandedPolicies(prev => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId);
      else next.add(policyId);
      return next;
    });
  };

  // Helpers
  const formatCurrency = (cents: number | null | undefined) => {
    if (!cents && cents !== 0) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };

  const formatCurrencyDollars = (amount: number | null | undefined) => {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return date;
    }
  };

  const getVehiclesForPolicy = (policyId: string) => vehicles?.filter(v => v.policy_id === policyId) || [];
  const getDriversForPolicy = (policyId: string) => drivers?.filter(d => d.policy_id === policyId) || [];
  const getDwellingsForPolicy = (policyId: string) => dwellings?.filter(d => d.policy_id === policyId) || [];
  const getAddressByType = (type: string) => addresses?.find(a => a.address_nature?.toUpperCase() === type.toUpperCase());

  const getPolicyIcon = (type: string | null) => {
    switch (type?.toLowerCase()) {
      case 'auto': return <Car className="w-4 h-4" />;
      case 'home': case 'homeowners': case 'renters': return <Home className="w-4 h-4" />;
      case 'life': case 'term_life': return <Heart className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const friendlyCoverageName = (name: string) => {
    const map: Record<string, string> = {
      'BODILY_INJURY_LIABILITY': 'Bodily Injury Liability',
      'PROPERTY_DAMAGE_LIABILITY': 'Property Damage Liability',
      'UNINSURED_MOTORISTS': 'Uninsured / Underinsured Motorist Bodily Injury Liability',
      'UNDERINSURED_MOTORISTS': 'Underinsured Motorist',
      'PERSONAL_INJURY_PROTECTION': 'Personal Injury Protection',
      'MEDICAL_PAYMENTS': 'Medical Payments',
      'COLLISION': 'Collision',
      'COMPREHENSIVE': 'Comprehensive',
      'EMERGENCY_ROAD_SERVICE': 'Emergency Road Service',
      'RENTAL_REIMBURSEMENT': 'Rental Reimbursement',
      'TOWING_AND_LABOR': 'Towing and Labor',
    };
    return map[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Loading & empty states
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

  // All drivers across all policies (deduplicated by name)
  const allDrivers = drivers || [];

  return (
    <div className="space-y-8">
      {/* ================================================================== */}
      {/* CUSTOMER INFO HEADER - Clean text layout */}
      {/* ================================================================== */}
      <div className="flex items-start justify-between border-b pb-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">{customerName}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-muted-foreground">
              {pullData?.consumer_email && <span>{pullData.consumer_email}</span>}
              {(pullData?.phone || pullData?.mobile_phone) && <span>{pullData.mobile_phone || pullData.phone}</span>}
            </div>
          </div>

          {/* Addresses in a clean row */}
          <div className="flex gap-8 text-sm">
            {mailingAddress && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mailing Address</p>
                <p>{mailingAddress.full_address || `${mailingAddress.number || ''} ${mailingAddress.street || ''}`}</p>
                <p className="text-muted-foreground">{[mailingAddress.city, mailingAddress.state, mailingAddress.zip].filter(Boolean).join(', ')}</p>
              </div>
            )}
            {physicalAddress && physicalAddress.canopy_address_id !== mailingAddress?.canopy_address_id && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Physical Address</p>
                <p>{physicalAddress.full_address || `${physicalAddress.number || ''} ${physicalAddress.street || ''}`}</p>
                <p className="text-muted-foreground">{[physicalAddress.city, physicalAddress.state, physicalAddress.zip].filter(Boolean).join(', ')}</p>
              </div>
            )}
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* ================================================================== */}
      {/* POLICIES TABLE */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Policies</h2>

        {policies && policies.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary text-primary-foreground hover:bg-primary">
                  <TableHead className="text-primary-foreground font-semibold">Policy Type</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Policy ID</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Premium</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Status</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Effective Dates</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => {
                  const isExpanded = expandedPolicies.has(policy.id);
                  const policyVehicles = getVehiclesForPolicy(policy.id);
                  const policyDwellings = getDwellingsForPolicy(policy.id);
                  const policyDrivers = getDriversForPolicy(policy.id);

                  return (
                    <React.Fragment key={policy.id}>
                      {/* Policy Row */}
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => togglePolicy(policy.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="gap-1 capitalize">
                              {getPolicyIcon(policy.policy_type)}
                              {policy.policy_type}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{policy.policy_number || '-'}</TableCell>
                        <TableCell className="font-medium">{formatCurrencyDollars(policy.premium_amount)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="capitalize">{policy.status || 'Active'}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(policy.effective_date)} - {formatDate(policy.expiration_date)}</TableCell>
                        <TableCell>
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0 bg-muted/20">
                            <div className="p-6 space-y-6">
                              {/* Vehicles with Coverage Table */}
                              {policyVehicles.map((vehicle) => {
                                const coverages = (vehicle.coverages as CoverageItem[]) || [];

                                return (
                                  <div key={vehicle.id} className="space-y-4">
                                    <div>
                                      <h4 className="text-lg font-semibold">
                                        {vehicle.year} {vehicle.make?.toUpperCase()} {vehicle.model}
                                      </h4>
                                      <p className="text-sm text-muted-foreground font-mono">VIN: {vehicle.vin || 'N/A'}</p>
                                    </div>

                                    {/* Coverage Table */}
                                    {coverages.length > 0 && (
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Coverage</TableHead>
                                            <TableHead>Per Person Limit</TableHead>
                                            <TableHead>Per Incident Limit</TableHead>
                                            <TableHead>Deductible</TableHead>
                                            <TableHead className="text-right">Premium</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {coverages.filter(c => !c.is_declined).map((coverage, idx) => (
                                            <TableRow key={idx}>
                                              <TableCell>{coverage.friendly_name || friendlyCoverageName(coverage.name)}</TableCell>
                                              <TableCell>{formatCurrency(coverage.per_person_limit_cents)}</TableCell>
                                              <TableCell>{formatCurrency(coverage.per_incident_limit_cents)}</TableCell>
                                              <TableCell>{formatCurrency(coverage.deductible_cents)}</TableCell>
                                              <TableCell className="text-right font-medium">{formatCurrency(coverage.premium_cents)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    )}

                                    {/* Vehicle Details */}
                                    <div className="grid grid-cols-4 gap-4 text-sm pt-2 border-t">
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
                                        <p className="uppercase">{vehicle.body_type || '-'}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Garage</p>
                                        <p>{vehicle.garage_city ? `${vehicle.garage_city?.toUpperCase()}, ${vehicle.garage_state}` : '-'}</p>
                                      </div>
                                    </div>

                                    {/* Lien Holder */}
                                    {vehicle.lien_holder_name && (
                                      <div className="text-sm border-t pt-2">
                                        <p className="text-xs text-muted-foreground">Lien Holder</p>
                                        <p className="font-medium">{vehicle.lien_holder_name}</p>
                                        {vehicle.lien_holder_address_line1 && (
                                          <p className="text-muted-foreground">{vehicle.lien_holder_city}, {vehicle.lien_holder_state} {vehicle.lien_holder_zip}</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Dwellings */}
                              {policyDwellings.map((dwelling) => {
                                const coverages = (dwelling.coverages as CoverageItem[]) || [];

                                return (
                                  <div key={dwelling.id} className="space-y-4">
                                    <div>
                                      <h4 className="text-lg font-semibold">{dwelling.address_line1}</h4>
                                      <p className="text-sm text-muted-foreground">{[dwelling.city, dwelling.state, dwelling.zip].filter(Boolean).join(', ')}</p>
                                    </div>

                                    {/* Coverage Table */}
                                    {coverages.length > 0 && (
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Coverage</TableHead>
                                            <TableHead>Limit</TableHead>
                                            <TableHead>Deductible</TableHead>
                                            <TableHead className="text-right">Premium</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {coverages.filter(c => !c.is_declined).map((coverage, idx) => (
                                            <TableRow key={idx}>
                                              <TableCell>{coverage.friendly_name || friendlyCoverageName(coverage.name)}</TableCell>
                                              <TableCell>{formatCurrency(coverage.per_incident_limit_cents)}</TableCell>
                                              <TableCell>{formatCurrency(coverage.deductible_cents)}</TableCell>
                                              <TableCell className="text-right font-medium">{formatCurrency(coverage.premium_cents)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    )}

                                    {/* Property Details */}
                                    <div className="grid grid-cols-4 gap-4 text-sm pt-2 border-t">
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
                                        <p className="text-xs text-muted-foreground">Roof Type</p>
                                        <p className="capitalize">{dwelling.roof_type || '-'}</p>
                                      </div>
                                    </div>

                                    {/* Mortgagee */}
                                    {dwelling.mortgagee_name && (
                                      <div className="text-sm border-t pt-2">
                                        <p className="text-xs text-muted-foreground">Mortgagee</p>
                                        <p className="font-medium">{dwelling.mortgagee_name}</p>
                                        {dwelling.mortgage_loan_number && <p className="text-muted-foreground">Loan #: {dwelling.mortgage_loan_number}</p>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Drivers for this policy */}
                              {policyDrivers.length > 0 && (
                                <div className="border-t pt-4">
                                  <h5 className="text-sm font-semibold mb-3">Drivers on this Policy</h5>
                                  <div className="grid md:grid-cols-2 gap-3">
                                    {policyDrivers.map(driver => (
                                      <div key={driver.id} className="flex items-center gap-3 p-3 border rounded-lg bg-background">
                                        <User className="w-5 h-5 text-muted-foreground" />
                                        <div className="flex-1">
                                          <p className="font-medium">{driver.first_name} {driver.last_name}</p>
                                          <p className="text-sm text-muted-foreground">
                                            {driver.gender && <span className="capitalize">{driver.gender}</span>}
                                            {driver.marital_status && <span className="capitalize"> • {driver.marital_status}</span>}
                                          </p>
                                        </div>
                                        <div className="flex gap-1">
                                          {driver.is_primary && <Badge size="sm">Primary</Badge>}
                                          {driver.is_excluded && <Badge variant="destructive" size="sm">Excluded</Badge>}
                                        </div>
                                      </div>
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
          <div className="text-center py-12 border rounded-lg bg-muted/20">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">No policies found</p>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* DOCUMENTS */}
      {/* ================================================================== */}
      {documents && documents.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Documents</h2>
          <div className="border rounded-lg divide-y">
            {documents.map(doc => {
              const hasDocumentAccess = doc.canopy_document_id || doc.file_url;
              const isLoading = loadingDocId === doc.id;

              return (
                <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {doc.document_type === 'id_card' ? (
                      <IdCard className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium capitalize">{doc.document_type?.replace(/_/g, ' ') || 'Document'}</p>
                      <p className="text-xs text-muted-foreground">{doc.file_name || 'Document'}</p>
                    </div>
                  </div>
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
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* DRIVERS (All) */}
      {/* ================================================================== */}
      {allDrivers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Drivers</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allDrivers.map(driver => {
              const hasViolations = (driver.violations as unknown[])?.length > 0;
              const hasAccidents = (driver.accidents as unknown[])?.length > 0;

              return (
                <div key={driver.id} className="border rounded-lg p-4 bg-card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        <User className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{driver.first_name} {driver.last_name}</p>
                        <div className="flex gap-1 mt-1">
                          {driver.is_primary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                          {driver.is_excluded && <Badge variant="destructive" className="text-xs">Excluded</Badge>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="capitalize">{driver.gender || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Marital Status</p>
                      <p className="capitalize">{driver.marital_status || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">License State</p>
                      <p>{driver.license_state || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Relationship</p>
                      <p className="capitalize">{driver.relationship || '-'}</p>
                    </div>
                  </div>
                  {(hasViolations || hasAccidents) && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="w-4 h-4" />
                      {hasViolations && <span>{(driver.violations as unknown[]).length} violation(s)</span>}
                      {hasAccidents && <span>{(driver.accidents as unknown[]).length} accident(s)</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default CanopyDataDisplayRedesign;
