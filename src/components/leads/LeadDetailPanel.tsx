// src/components/leads/LeadDetailPanel.tsx
import { Lead } from '@/types/leads';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Phone, Mail, MapPin, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailPanel({ lead, open, onOpenChange }: LeadDetailPanelProps) {
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
          <SheetTitle className="text-2xl">
            {lead.first_name} {lead.last_name}
          </SheetTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getStatusColor(lead.status)}>
              {lead.status.replace('_', ' ').toUpperCase()}
            </Badge>
            <Badge className={getLeadScoreColor(lead.lead_score)}>
              Score: {lead.lead_score}
            </Badge>
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
