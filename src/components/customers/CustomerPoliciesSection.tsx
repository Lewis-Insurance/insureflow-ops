import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePolicies } from '@/hooks/usePolicies';
import { Shield, Calendar, DollarSign, Building, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CustomerPoliciesSectionProps {
  accountId: string;
}

export function CustomerPoliciesSection({ accountId }: CustomerPoliciesSectionProps) {
  const { data: allPolicies = [], isLoading } = usePolicies();
  
  // Filter policies for this specific customer
  const policies = allPolicies.filter(policy => policy.account_id === accountId);

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'bound':
        return 'default';
      case 'pending':
      case 'quoted':
        return 'secondary';
      case 'expired':
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Policies & Quotes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading policies...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Policies & Quotes ({policies.length})
        </CardTitle>
        <Button size="sm" asChild>
          <Link to="/quotes/new">
            <Plus className="h-4 w-4 mr-2" />
            New Quote
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {policies.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Policies or Quotes</h3>
            <p className="text-muted-foreground mb-4">
              This customer doesn't have any policies or quotes yet.
            </p>
            <Button asChild>
              <Link to="/quotes/new">
                <Plus className="h-4 w-4 mr-2" />
                Create First Quote
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Policy Basic Info */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{policy.line_of_business || 'General Policy'}</h4>
                      <Badge variant={getStatusColor(policy.status || 'active')}>
                        {policy.status || 'Active'}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {policy.policy_number && (
                        <div className="flex items-center gap-2">
                          <span>Policy #:</span>
                          <span className="font-mono">{policy.policy_number}</span>
                        </div>
                      )}
                      {policy.carrier && (
                        <div className="flex items-center gap-2">
                          <Building className="h-3 w-3" />
                          <span>{policy.carrier}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <div className="space-y-1 text-sm">
                      {policy.effective_date && (
                        <div>
                          <label className="text-muted-foreground">Effective:</label>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(policy.effective_date).toLocaleDateString()}</span>
                          </div>
                        </div>
                      )}
                      {policy.expiration_date && (
                        <div>
                          <label className="text-muted-foreground">Expires:</label>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(policy.expiration_date).toLocaleDateString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Premium */}
                  <div>
                    <div className="text-sm">
                      <label className="text-muted-foreground">Premium:</label>
                      <div className="flex items-center gap-1 font-semibold">
                        <DollarSign className="h-3 w-3" />
                        <span>{formatCurrency(policy.premium)}</span>
                      </div>
                      {policy.premium && (
                        <span className="text-muted-foreground text-xs">
                          / {policy.billing_frequency || 'annual'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                {policy.coverage && (
                  <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                    <span>Coverage: {JSON.stringify(policy.coverage)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}