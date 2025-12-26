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
import { Phone, Mail, MapPin, Calendar, DollarSign, ExternalLink, Shield, Car, User, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailPanel({ lead, open, onOpenChange }: LeadDetailPanelProps) {
  const navigate = useNavigate();

  // Query for Canopy data linked to this lead
  const { data: canopyPull } = useQuery({
    queryKey: ['canopy-pull-for-lead-panel', lead?.id],
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
          canopy_policies (
            id,
            carrier_name,
            policy_type,
            premium_amount
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

          {/* Canopy Imported Data */}
          {canopyPull && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Imported Insurance Data
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Policies</p>
                      <p className="text-lg font-bold text-blue-700">{canopyPull.policy_count || 0}</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Carriers</p>
                      <p className="text-lg font-bold text-purple-700">{canopyPull.carrier_count || 0}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-lg font-bold text-green-700 capitalize">{canopyPull.status}</p>
                    </div>
                  </div>

                  {/* Policy Summary */}
                  {canopyPull.canopy_policies && canopyPull.canopy_policies.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Policies:</p>
                      {(canopyPull.canopy_policies as any[]).map((policy: any) => (
                        <div key={policy.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{policy.carrier_name}</span>
                            <Badge variant="outline" className="text-xs">{policy.policy_type}</Badge>
                          </div>
                          {policy.premium_amount && (
                            <span className="text-sm font-medium">
                              ${policy.premium_amount.toLocaleString()}/yr
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/leads/${lead.id}`);
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    View All Imported Data (Vehicles, Drivers, Coverages)
                  </Button>
                </div>
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
