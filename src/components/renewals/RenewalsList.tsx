import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Building2, Phone, Mail, AlertTriangle, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import type { PolicyWithAccount } from '@/hooks/usePolicies';
import type { RenewalType } from '@/hooks/useRenewals';

interface RenewalsListProps {
  policies: PolicyWithAccount[];
  type: RenewalType;
  loading?: boolean;
  onPolicySelect: (policyId: string) => void;
}

export function RenewalsList({ policies, type, loading, onPolicySelect }: RenewalsListProps) {
  const navigate = useNavigate();
  
  const getDaysUntilExpiration = (expirationDate: string) => {
    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getExpirationBadge = (expirationDate: string, policyType: RenewalType) => {
    const days = getDaysUntilExpiration(expirationDate);
    
    if (policyType === 'expired' || days < 0) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Expired {Math.abs(days)} days ago
        </Badge>
      );
    }
    
    if (days <= 7) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {days} days left
        </Badge>
      );
    }
    
    if (days <= 30) {
      return (
        <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 text-yellow-700">
          <Clock className="h-3 w-3" />
          {days} days left
        </Badge>
      );
    }
    
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {days} days left
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (policies.length === 0) {
    const message = type === 'upcoming' 
      ? 'No policies expiring in the next 30 days'
      : 'No expired policies found';
    
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{message}</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {type === 'upcoming' 
              ? 'All your policies have renewal dates more than 30 days away.'
              : 'All your policies are current with no expired renewals requiring attention.'
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {policies.map((policy) => (
        <Card key={policy.id} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Policy #{policy.policy_number}
              </CardTitle>
              {policy.expiration_date && getExpirationBadge(policy.expiration_date, type)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Account Information */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {policy.account?.name || 'Unknown Account'}
                  </span>
                </div>
                
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <span>Carrier:</span>
                    <Button
                      variant="link"
                      className="p-0 h-auto font-medium text-sm"
                      onClick={() => navigate(`/carriers?carrier=${policy.carrier_info?.id || ''}`)}
                    >
                      {policy.carrier_info?.name || policy.carrier || 'Unknown'}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Line:</span>
                    <span className="font-medium">
                      {policy.line_of_business || 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Policy Details */}
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Effective:</span>
                    <span className="font-medium">
                      {policy.effective_date ? new Date(policy.effective_date).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Expires:</span>
                    <span className="font-medium">
                      {policy.expiration_date ? new Date(policy.expiration_date).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  {policy.premium && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      <span>Premium:</span>
                      <span className="font-medium">
                        {formatCurrency(policy.premium)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-end justify-end">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => onPolicySelect(policy.id)}
                  >
                    View Policy
                  </Button>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90"
                    onClick={() => navigate(`/renewals/${policy.id}/edit`)}
                  >
                    {type === 'expired' ? 'Renew Now' : 'Start Renewal'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}