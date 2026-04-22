import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date/localDate';
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

function isExpired(expirationDate: string): boolean {
  const expDate = new Date(expirationDate);
  const now = new Date();
  return expDate < now;
}

function getStatusBadgeClasses(status: string): string {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700';
    case 'expired':
      return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700';
    case 'cancelled':
    case 'canceled':
      return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700';
    case 'suspended':
      return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700';
  }
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
                <TableHead>MGA / Carrier</TableHead>
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
                      {policy.mga_info ? (
                        <>
                          <div className="font-medium text-primary">{policy.mga_info.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {policy.carrier}
                          </div>
                        </>
                      ) : policy.carrier_info?.id ? (
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
                      {format(parseLocalDate(policy.effective_date), 'MMM dd, yyyy')}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div className={`flex items-center gap-1 text-sm ${isExpired(policy.expiration_date) ? 'text-red-600 font-bold dark:text-red-400' : ''}`}>
                        <Calendar className={`h-3 w-3 ${isExpired(policy.expiration_date) ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
                        {format(parseLocalDate(policy.expiration_date), 'MMM dd, yyyy')}
                      </div>
                      {isExpired(policy.expiration_date) && (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1" />
                          Expired
                        </Badge>
                      )}
                      {!isExpired(policy.expiration_date) && isExpiringSoon(policy.expiration_date) && (
                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Expires Soon
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1 font-medium">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      {policy.premium?.toLocaleString() ?? '-'}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`flex items-center gap-1 w-fit ${getStatusBadgeClasses(policy.status || 'unknown')}`}
                    >
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