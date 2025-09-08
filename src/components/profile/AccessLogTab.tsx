import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Edit, Download, EyeOff, Search, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';

interface AccessLog {
  id: string;
  accessor_user_id: string | null;
  action: string;
  details: any;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
  accessor_profile?: {
    full_name: string;
    role: string;
  };
}

export function AccessLogTab() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    fetchAccessLogs();
  }, [user]);

  const fetchAccessLogs = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profile_access_logs')
        .select(`
          *,
          accessor_profile:profiles!accessor_user_id(full_name, role)
        `)
        .eq('target_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setLogs((data || []).map(log => ({
        ...log,
        ip_address: log.ip_address as string || 'Unknown'
      })));
    } catch (error: any) {
      toast({
        title: "Error loading access logs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'view':
        return <Eye className="h-4 w-4" />;
      case 'edit':
        return <Edit className="h-4 w-4" />;
      case 'export':
        return <Download className="h-4 w-4" />;
      case 'reveal_pii':
        return <EyeOff className="h-4 w-4" />;
      default:
        return <Eye className="h-4 w-4" />;
    }
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'view':
        return 'default';
      case 'edit':
        return 'secondary';
      case 'export':
        return 'outline';
      case 'reveal_pii':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'view':
        return 'Profile Viewed';
      case 'edit':
        return 'Profile Edited';
      case 'export':
        return 'Data Exported';
      case 'reveal_pii':
        return 'PII Revealed';
      default:
        return action;
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = searchTerm === '' || 
      log.accessor_profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ip_address.includes(searchTerm) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = actionFilter === 'all' || log.action === actionFilter;
    
    return matchesSearch && matchesFilter;
  });

  const uniqueActions = Array.from(new Set(logs.map(log => log.action)));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile Access Log</CardTitle>
          <CardDescription>Loading access history...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-1/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Profile Access Log
        </CardTitle>
        <CardDescription>
          See who has accessed or modified your profile in the last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, IP, or action..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 border border-input bg-background rounded-md text-sm"
            >
              <option value="all">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>
                  {getActionLabel(action)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Access Log Table */}
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8">
            <Eye className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">
              {searchTerm || actionFilter !== 'all' ? 'No matching access logs found' : 'No access logs available'}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Accessed By</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {log.accessor_profile?.full_name || 'System'}
                        </div>
                        {log.accessor_profile?.role && (
                          <div className="text-xs text-muted-foreground capitalize">
                            {log.accessor_profile.role}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {log.ip_address}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.details && Object.keys(log.details).length > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {log.details.fields_changed && (
                            <div>Changed: {log.details.fields_changed.join(', ')}</div>
                          )}
                          {log.details.export_type && (
                            <div>Export: {log.details.export_type}</div>
                          )}
                          {log.details.revealed_field && (
                            <div>Revealed: {log.details.revealed_field}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Summary */}
        {filteredLogs.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {filteredLogs.length} of {logs.length} access events
          </div>
        )}
      </CardContent>
    </Card>
  );
}