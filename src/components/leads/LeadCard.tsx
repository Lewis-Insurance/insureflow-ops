// src/components/leads/LeadCard.tsx
import { Lead } from '@/types/leads';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, Mail, Clock, DollarSign, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LeadCardProps {
  lead: Lead;
  isDragging?: boolean;
  compact?: boolean;
}

export function LeadCard({ lead, isDragging, compact = false }: LeadCardProps) {
  const getLeadScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <Card 
      className={`cursor-pointer hover:shadow-md transition-shadow ${isDragging ? 'opacity-50' : ''} ${compact ? 'p-2' : ''}`}
    >
      <CardContent className={compact ? "p-3" : "p-4"}>
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Avatar className={compact ? "h-6 w-6" : "h-8 w-8"}>
              <AvatarFallback className="text-xs">
                {getInitials(lead.first_name, lead.last_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h4 className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>
                {lead.first_name} {lead.last_name}
              </h4>
            </div>
          </div>
          <Badge className={`${getLeadScoreColor(lead.lead_score)} text-white text-xs`}>
            {lead.lead_score}
          </Badge>
        </div>

        {!compact && (
          <>
            {/* Contact Info */}
            <div className="space-y-1 mb-2">
              {lead.email && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{lead.phone}</span>
                </div>
              )}
            </div>

            {/* Insurance Types */}
            {lead.insurance_types && lead.insurance_types.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {lead.insurance_types.slice(0, 3).map((type) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type.toUpperCase()}
                  </Badge>
                ))}
                {lead.insurance_types.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{lead.insurance_types.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
          </div>
          {lead.estimated_premium && (
            <div className="flex items-center gap-1 font-medium">
              <DollarSign className="h-3 w-3" />
              <span>{lead.estimated_premium.toLocaleString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
