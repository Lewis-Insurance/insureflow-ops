// src/components/leads/LeadDetailPanel.tsx
import { Lead } from '@/types/leads';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Phone, Mail, MapPin, Calendar, DollarSign, ExternalLink, Shield, Car, User, FileText, Home, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date/localDate';

interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailPanel({ lead, open, onOpenChange }: LeadDetailPanelProps) {
  const navigate = useNavigate();

  // Query for Canopy data linked to this lead - FULL DATA
  const { data: canopyPull } = useQuery({
    queryKey: ['canopy-pull-for-lead-panel-full', lead?.id],
    queryFn: async () => {
      if (!lead?.id) return null;
      const { data, error } = await supabase
        .from('canopy_pulls')
        .select(`
          id,
          status,
          policy_count,
          carrier_count,
          completed_at,
          metadata,
          canopy_policies (
            id,
            carrier_name,
            policy_type,
            policy_number,
            premium_amount,
            premium_frequency,
            status,
            effective_date,
            expiration_date,
            deductible
          )
        `)
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!lead?.id && open,
  });

  // Fetch vehicles for the policies
  const { data: vehicles } = useQuery({
    queryKey: ['canopy-vehicles-for-lead-panel', canopyPull?.id],
    queryFn: async () => {
      if (!canopyPull?.canopy_policies?.length) return [];
      const policyIds = (canopyPull.canopy_policies as any[]).map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_vehicles')
        .select('*')
        .in('policy_id', policyIds);
      if (error) return [];
      return data;
    },
    enabled: !!canopyPull?.canopy_policies?.length,
  });

  // Fetch drivers for the policies
  const { data: drivers } = useQuery({
    queryKey: ['canopy-drivers-for-lead-panel', canopyPull?.id],
    queryFn: async () => {
      if (!canopyPull?.canopy_policies?.length) return [];
      const policyIds = (canopyPull.canopy_policies as any[]).map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_drivers')
        .select('*')
        .in('policy_id', policyIds);
      if (error) return [];
      return data;
    },
    enabled: !!canopyPull?.canopy_policies?.length,
  });

  // Fetch dwellings for the policies
  const { data: dwellings } = useQuery({
    queryKey: ['canopy-dwellings-for-lead-panel', canopyPull?.id],
    queryFn: async () => {
      if (!canopyPull?.canopy_policies?.length) return [];
      const policyIds = (canopyPull.canopy_policies as any[]).map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_dwellings')
        .select('*')
        .in('policy_id', policyIds);
      if (error) return [];
      return data;
    },
    enabled: !!canopyPull?.canopy_policies?.length,
  });

  if (!lead) return null;

  const getLeadScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-blue-600 bg-blue-50';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-purple-100 text-purple-800',
      qualified: 'bg-green-100 text-green-800',
      quoted: 'bg-yellow-100 text-yellow-800',
      won: 'bg-emerald-100 text-emerald-800',
      lost: 'bg-red-100 text-red-800',
      nurturing: 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-2xl">
                {lead.first_name} {lead.last_name}
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <Badge className={getStatusColor(lead.status)}>
                  {lead.status.replace('_', ' ').toUpperCase()}
                </Badge>
                <Badge className={getLeadScoreColor(lead.lead_score)}>
                  Score: {lead.lead_score}
                </Badge>
                {canopyPull && (
                  <Badge variant="secondary" className="gap-1">
                    <Shield className="h-3 w-3" />
                    Canopy Import
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                navigate(`/leads/${lead.id}`);
              }}
              className="gap-1"
            >
              <ExternalLink className="h-4 w-4" />
              View Full Details
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Contact Information */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Contact Information</h3>
            <div className="space-y-3">
              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {lead.address}
                    {lead.city && `, ${lead.city}`}
                    {lead.state && `, ${lead.state}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Insurance Details */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Insurance Details</h3>
            <div className="space-y-3">
              {lead.insurance_types && lead.insurance_types.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Insurance Types</p>
                  <div className="flex flex-wrap gap-2">
                    {lead.insurance_types.map((type) => (
                      <Badge key={type} variant="outline">
                        {type.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {lead.current_carrier && (
                <div>
                  <p className="text-xs text-muted-foreground">Current Carrier</p>
                  <p className="text-sm font-medium">{lead.current_carrier}</p>
                </div>
              )}
              {lead.estimated_premium && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Premium</p>
                    <p className="text-sm font-medium">
                      ${lead.estimated_premium.toLocaleString()}/year
                    </p>
                  </div>
                </div>
              )}
              {lead.decision_timeframe && (
                <div>
                  <p className="text-xs text-muted-foreground">Decision Timeframe</p>
                  <p className="text-sm font-medium capitalize">
                    {lead.decision_timeframe.replace(/_/g, ' ')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Created:</span>
                <span className="font-medium">{format(new Date(lead.created_at), 'PPp')}</span>
              </div>
              {lead.last_contact_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last Contact:</span>
                  <span className="font-medium">
                    {format(new Date(lead.last_contact_at), 'PPp')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Canopy Imported Data - FULL DISPLAY */}
          {canopyPull && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Imported Insurance Data
                </h3>

                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Policies</p>
                    <p className="text-lg font-bold text-blue-700">{canopyPull.policy_count || 0}</p>
                  </div>
                  <div className="p-2 bg-purple-50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Carriers</p>
                    <p className="text-lg font-bold text-purple-700">{canopyPull.carrier_count || 0}</p>
                  </div>
                  <div className="p-2 bg-orange-50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Vehicles</p>
                    <p className="text-lg font-bold text-orange-700">{vehicles?.length || 0}</p>
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Drivers</p>
                    <p className="text-lg font-bold text-green-700">{drivers?.length || 0}</p>
                  </div>
                </div>

                <Accordion type="multiple" className="w-full" defaultValue={["policies"]}>
                  {/* Policies Accordion */}
                  {canopyPull.canopy_policies && (canopyPull.canopy_policies as any[]).length > 0 && (
                    <AccordionItem value="policies">
                      <AccordionTrigger className="text-sm">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          Policies ({(canopyPull.canopy_policies as any[]).length})
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {(canopyPull.canopy_policies as any[]).map((policy: any) => (
                            <div key={policy.id} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{policy.carrier_name}</span>
                                  <Badge variant="outline" className="text-xs capitalize">{policy.policy_type}</Badge>
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${policy.status === 'active' ? 'bg-green-100 text-green-800' : ''}`}
                                  >
                                    {policy.status || 'Active'}
                                  </Badge>
                                </div>
                                {policy.premium_amount && (
                                  <span className="font-semibold text-green-700">
                                    ${policy.premium_amount.toLocaleString()}/{policy.premium_frequency || 'yr'}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                {policy.policy_number && (
                                  <div>Policy #: <span className="text-foreground">{policy.policy_number}</span></div>
                                )}
                                {policy.effective_date && (
                                  <div>Effective: <span className="text-foreground">{format(parseLocalDate(policy.effective_date), 'MM/dd/yyyy')}</span></div>
                                )}
                                {policy.expiration_date && (
                                  <div>Expires: <span className="text-foreground font-medium">{format(parseLocalDate(policy.expiration_date), 'MM/dd/yyyy')}</span></div>
                                )}
                                {policy.deductible && (
                                  <div>Deductible: <span className="text-foreground">${policy.deductible.toLocaleString()}</span></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Vehicles Accordion */}
                  {vehicles && vehicles.length > 0 && (
                    <AccordionItem value="vehicles">
                      <AccordionTrigger className="text-sm">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-orange-600" />
                          Vehicles ({vehicles.length})
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {vehicles.map((vehicle: any) => (
                            <div key={vehicle.id} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">
                                  {vehicle.year} {vehicle.make} {vehicle.model}
                                </span>
                                {vehicle.ownership && (
                                  <Badge variant="outline" className="text-xs capitalize">{vehicle.ownership}</Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                {vehicle.vin && (
                                  <div>VIN: <span className="text-foreground font-mono">{vehicle.vin}</span></div>
                                )}
                                {vehicle.usage_type && (
                                  <div>Usage: <span className="text-foreground capitalize">{vehicle.usage_type}</span></div>
                                )}
                                {vehicle.annual_mileage && (
                                  <div>Annual Miles: <span className="text-foreground">{vehicle.annual_mileage.toLocaleString()}</span></div>
                                )}
                                {vehicle.body_type && (
                                  <div>Body: <span className="text-foreground capitalize">{vehicle.body_type}</span></div>
                                )}
                              </div>
                              {/* Coverages */}
                              {(vehicle.liability_bi || vehicle.liability_pd || vehicle.collision_deductible || vehicle.comprehensive_deductible) && (
                                <div className="mt-2 pt-2 border-t border-muted">
                                  <p className="text-xs font-medium mb-1">Coverages:</p>
                                  <div className="grid grid-cols-2 gap-1 text-xs">
                                    {vehicle.liability_bi && (
                                      <div className="text-muted-foreground">BI: <span className="text-foreground">${vehicle.liability_bi.toLocaleString()}</span></div>
                                    )}
                                    {vehicle.liability_pd && (
                                      <div className="text-muted-foreground">PD: <span className="text-foreground">${vehicle.liability_pd.toLocaleString()}</span></div>
                                    )}
                                    {vehicle.collision_deductible && (
                                      <div className="text-muted-foreground">Collision Ded: <span className="text-foreground">${vehicle.collision_deductible}</span></div>
                                    )}
                                    {vehicle.comprehensive_deductible && (
                                      <div className="text-muted-foreground">Comp Ded: <span className="text-foreground">${vehicle.comprehensive_deductible}</span></div>
                                    )}
                                    {vehicle.uninsured_motorist && (
                                      <div className="text-muted-foreground">UM: <span className="text-foreground">${vehicle.uninsured_motorist.toLocaleString()}</span></div>
                                    )}
                                    {vehicle.medical_payments && (
                                      <div className="text-muted-foreground">Med Pay: <span className="text-foreground">${vehicle.medical_payments.toLocaleString()}</span></div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Drivers Accordion */}
                  {drivers && drivers.length > 0 && (
                    <AccordionItem value="drivers">
                      <AccordionTrigger className="text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-green-600" />
                          Drivers ({drivers.length})
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {drivers.map((driver: any) => (
                            <div key={driver.id} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">
                                  {driver.first_name} {driver.last_name}
                                </span>
                                <div className="flex gap-1">
                                  {driver.is_primary && (
                                    <Badge variant="default" className="text-xs">Primary</Badge>
                                  )}
                                  {driver.relation_to_insured && (
                                    <Badge variant="outline" className="text-xs capitalize">{driver.relation_to_insured}</Badge>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                {driver.date_of_birth && (
                                  <div>DOB: <span className="text-foreground">{format(parseLocalDate(driver.date_of_birth), 'MM/dd/yyyy')}</span></div>
                                )}
                                {driver.gender && (
                                  <div>Gender: <span className="text-foreground capitalize">{driver.gender}</span></div>
                                )}
                                {driver.marital_status && (
                                  <div>Marital: <span className="text-foreground capitalize">{driver.marital_status}</span></div>
                                )}
                                {driver.license_state && (
                                  <div>License: <span className="text-foreground">{driver.license_state} {driver.license_number ? `- ${driver.license_number.slice(-4)}` : ''}</span></div>
                                )}
                                {driver.years_licensed && (
                                  <div>Years Licensed: <span className="text-foreground">{driver.years_licensed}</span></div>
                                )}
                                {driver.license_status && (
                                  <div>Status: <span className={`text-foreground capitalize ${driver.license_status === 'valid' ? 'text-green-600' : ''}`}>{driver.license_status}</span></div>
                                )}
                              </div>
                              {/* Violations/Accidents */}
                              {((driver.violations && driver.violations.length > 0) || (driver.accidents && driver.accidents.length > 0)) && (
                                <div className="mt-2 pt-2 border-t border-muted">
                                  <div className="flex items-center gap-1 text-xs text-amber-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    {driver.violations?.length > 0 && (
                                      <span>{driver.violations.length} violation(s)</span>
                                    )}
                                    {driver.accidents?.length > 0 && (
                                      <span>{driver.accidents.length} accident(s)</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Dwellings Accordion */}
                  {dwellings && dwellings.length > 0 && (
                    <AccordionItem value="dwellings">
                      <AccordionTrigger className="text-sm">
                        <div className="flex items-center gap-2">
                          <Home className="h-4 w-4 text-purple-600" />
                          Properties ({dwellings.length})
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {dwellings.map((dwelling: any) => (
                            <div key={dwelling.id} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">
                                  {dwelling.address_line1}
                                </span>
                                {dwelling.property_type && (
                                  <Badge variant="outline" className="text-xs capitalize">{dwelling.property_type.replace('_', ' ')}</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mb-2">
                                {[dwelling.city, dwelling.state, dwelling.zip].filter(Boolean).join(', ')}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                {dwelling.year_built && (
                                  <div>Year Built: <span className="text-foreground">{dwelling.year_built}</span></div>
                                )}
                                {dwelling.square_footage && (
                                  <div>Sq Ft: <span className="text-foreground">{dwelling.square_footage.toLocaleString()}</span></div>
                                )}
                                {dwelling.construction_type && (
                                  <div>Construction: <span className="text-foreground capitalize">{dwelling.construction_type}</span></div>
                                )}
                                {dwelling.roof_type && (
                                  <div>Roof: <span className="text-foreground capitalize">{dwelling.roof_type}</span></div>
                                )}
                              </div>
                              {/* Coverages */}
                              {(dwelling.dwelling_coverage || dwelling.personal_property || dwelling.liability_coverage) && (
                                <div className="mt-2 pt-2 border-t border-muted">
                                  <p className="text-xs font-medium mb-1">Coverages:</p>
                                  <div className="grid grid-cols-2 gap-1 text-xs">
                                    {dwelling.dwelling_coverage && (
                                      <div className="text-muted-foreground">Dwelling: <span className="text-foreground">${dwelling.dwelling_coverage.toLocaleString()}</span></div>
                                    )}
                                    {dwelling.personal_property && (
                                      <div className="text-muted-foreground">Personal Property: <span className="text-foreground">${dwelling.personal_property.toLocaleString()}</span></div>
                                    )}
                                    {dwelling.liability_coverage && (
                                      <div className="text-muted-foreground">Liability: <span className="text-foreground">${dwelling.liability_coverage.toLocaleString()}</span></div>
                                    )}
                                    {dwelling.deductible && (
                                      <div className="text-muted-foreground">Deductible: <span className="text-foreground">${dwelling.deductible.toLocaleString()}</span></div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 mt-4"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/leads/${lead.id}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  View Full Lead Details
                </Button>
              </div>
            </>
          )}

          {/* Notes */}
          {lead.notes && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {lead.notes}
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
