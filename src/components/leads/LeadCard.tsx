// src/components/leads/LeadCard.tsx
import { Lead } from '@/types/leads';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Mail, 
  Phone, 
  MapPin, 
  TrendingUp, 
  Calendar,
  DollarSign,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface LeadCardProps {
  lead: Lead;
  isDragging?: boolean;
  compact?: boolean;
}

export function LeadCard({ lead, isDragging = false, compact = false }: LeadCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-blue-600 bg-blue-50';
    if (score >= 40) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <Card
      className={cn(
        'p-3 cursor-pointer hover:shadow-md transition-all',
        isDragging && 'shadow-lg ring-2 ring-primary',
        compact && 'p-2'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {lead.assigned_producer ? (
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={lead.assigned_producer.avatar_url} />
              <AvatarFallback className="text-xs">
                {getInitials(lead.first_name, lead.last_name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">
              {lead.first_name} {lead.last_name}
            </p>
            {!compact && lead.assigned_producer && (
              <p className="text-xs text-muted-foreground truncate">
                {lead.assigned_producer.full_name}
              </p>
            )}
          </div>
        </div>
        <Badge 
          className={cn('ml-2 flex-shrink-0', getScoreColor(lead.lead_score))}
          variant="secondary"
        >
          {lead.lead_score}
        </Badge>
      </div>

      {/* Contact Info */}
      {!compact && (
        <div className="space-y-1 mb-2">
          {lead.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.phone}</span>
            </div>
          )}
          {lead.city && lead.state && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.city}, {lead.state}</span>
            </div>
          )}
        </div>
      )}

      {/* Insurance Types */}
      {lead.insurance_types && lead.insurance_types.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {lead.insurance_types.slice(0, compact ? 2 : 3).map((type) => (
            <Badge key={type} variant="outline" className="text-xs">
              {type}
            </Badge>
          ))}
          {lead.insurance_types.length > (compact ? 2 : 3) && (
            <Badge variant="outline" className="text-xs">
              +{lead.insurance_types.length - (compact ? 2 : 3)}
            </Badge>
          )}
        </div>
      )}

      {/* Bottom Info */}
      {!compact && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            {lead.estimated_premium ? (
              <>
                <DollarSign className="h-3 w-3" />
                <span>${lead.estimated_premium.toLocaleString()}</span>
              </>
            ) : (
              <span>No estimate</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
