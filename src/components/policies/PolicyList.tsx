import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  FileText, 
  Calendar, 
  Building2, 
  DollarSign, 
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PolicyWithAccount } from '@/hooks/usePolicies';

interface PolicyListProps {
  policies: PolicyWithAccount[];
  loading?: boolean;
  onPolicySelect?: (policy: PolicyWithAccount) => void;
}

function getStatusIcon(status: string) {
  switch (status?.toLowerCase()) {
    case 'active':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'expired':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-gray-500" />;
    case 'suspended':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    default:
      return <FileText className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'default';
    case 'expired':
    case 'cancelled':
      return 'destructive';
    case 'pending':
    case 'suspended':
      return 'secondary';
    default:
      return 'outline';
  }
}

function isExpiringSoon(expirationDate: string): boolean {
  const expDate = new Date(expirationDate);
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);
  
  return expDate > now && expDate <= thirtyDaysFromNow;
}

export function PolicyList({ policies, loading, onPolicySelect }: PolicyListProps) {
  const navigate = useNavigate();
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Policies...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No policies found</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search criteria or filters to find policies.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Policies ({policies.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy Number</TableHead>
                <TableHead>Insured</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Line of Business</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Expiration Date</TableHead>
                <TableHead>Premium</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((policy) => (
                <TableRow 
                  key={policy.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => onPolicySelect?.(policy)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {policy.policy_number}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{policy.account?.name || 'Unknown'}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {policy.account?.type || 'Unknown Type'}
                        {policy.account?.zip_code && (
                          <span className="ml-2">• {policy.account.zip_code}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      {policy.carrier_info?.id ? (
                        <Button
                          variant="link"
                          className="p-0 h-auto font-medium"
                          onClick={() => navigate(`/carriers?carrier=${policy.carrier_info!.id}`)}
                        >
                          {policy.carrier}
                        </Button>
                      ) : (
                        <div className="font-medium">{policy.carrier}</div>
                      )}
                      {policy.carrier_info?.name && policy.carrier_info.name !== policy.carrier && (
                        <div className="text-sm text-muted-foreground">
                          {policy.carrier_info.name}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline">
                      {policy.line_of_business || 'Not specified'}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {format(new Date(policy.effective_date), 'MMM dd, yyyy')}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(policy.expiration_date), 'MMM dd, yyyy')}
                      </div>
                      {isExpiringSoon(policy.expiration_date) && (
                        <Badge variant="secondary" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Expires Soon
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1 font-medium">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      {policy.premium.toLocaleString()}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={getStatusVariant(policy.status || 'unknown')} className="flex items-center gap-1 w-fit">
                      {getStatusIcon(policy.status || 'unknown')}
                      {policy.status || 'Unknown'}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPolicySelect?.(policy);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}