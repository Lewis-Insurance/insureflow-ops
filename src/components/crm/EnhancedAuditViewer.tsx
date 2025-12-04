import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, User, Calendar, Activity, Eye, Shield, UserCheck, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import type { AuditLog, DetailedAuditLog, ImpersonationLog, ProfileAccessLog } from '@/types/crm-enhanced-clean';

// Type guard for ip_address
function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

interface EnhancedAuditViewerProps {
  entityId?: string;
  entityType?: string;
}

export function EnhancedAuditViewer({ entityId, entityType }: EnhancedAuditViewerProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [detailedLogs, setDetailedLogs] = useState<DetailedAuditLog[]>([]);
  const [impersonationLogs, setImpersonationLogs] = useState<ImpersonationLog[]>([]);
  const [accessLogs, setAccessLogs] = useState<ProfileAccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [showLogDetail, setShowLogDetail] = useState(false);
  const [filters, setFilters] = useState({
    action: '',
    user: '',
    dateFrom: '',
    dateTo: '',
    logType: 'audit'
  });
  
  const { canViewAuditLogs, isAdmin } = usePermissions();
  const { toast } = useToast();

  useEffect(() => {
    if (canViewAuditLogs) {
      fetchAuditData();
    }
  }, [canViewAuditLogs, entityId, entityType, filters]);

  const fetchAuditData = async () => {
    try {
      setLoading(true);
      
      // Build base query with explicit typing to prevent circular type inference
      let auditQuery = supabase.from('audit_logs').select('*');
      let detailedQuery = supabase.from('detailed_audit_logs').select('*');
      
      if (entityId && entityType) {
        auditQuery = auditQuery.eq('entity_id', entityId).eq('entity', entityType);
        detailedQuery = detailedQuery.eq('entity_id', entityId).eq('entity_type', entityType);
      }

      // Apply filters
      if (filters.action) {
        auditQuery = auditQuery.eq('action', filters.action);
        detailedQuery = detailedQuery.eq('action', filters.action);
      }
      
      if (filters.user) {
        auditQuery = auditQuery.eq('changed_by', filters.user);
        detailedQuery = detailedQuery.eq('user_id', filters.user);
      }
      
      if (filters.dateFrom) {
        auditQuery = auditQuery.gte('created_at', filters.dateFrom);
        detailedQuery = detailedQuery.gte('created_at', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        auditQuery = auditQuery.lte('created_at', filters.dateTo);
        detailedQuery = detailedQuery.lte('created_at', filters.dateTo);
      }

      // Fetch audit logs
      const { data: auditData, error: auditError } = await auditQuery
        .order('created_at', { ascending: false })
        .limit(100);

      if (auditError) throw auditError;

      // Fetch detailed audit logs
      const { data: detailedData, error: detailedError } = await detailedQuery
        .order('created_at', { ascending: false })
        .limit(100);

      if (detailedError) throw detailedError;

      // Map audit_logs schema to AuditLog interface
      const mappedAuditLogs: AuditLog[] = (auditData || []).map(log => ({
        id: String(log.id),
        entity_type: log.entity || '',
        entity_id: log.entity_id || '',
        action: log.action,
        user_id: log.user_id || null,
        user_name: log.changed_by || null,
        session_id: null,
        ip_address: null,
        user_agent: null,
        changed_fields: log.diff || null,
        metadata: log.details || null,
        occurred_at: log.changed_at || log.created_at,
        created_at: log.created_at
      }));

      setAuditLogs(mappedAuditLogs);
      setDetailedLogs(detailedData || []);

      // Fetch impersonation logs if admin
      if (isAdmin) {
        const { data: impersonationData, error: impersonationError } = await supabase
          .from('impersonation_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (impersonationError) {
          console.error('Error fetching impersonation logs:', impersonationError);
        } else {
          setImpersonationLogs((impersonationData || []) as ImpersonationLog[]);
        }

        // Fetch profile access logs
        const { data: accessData, error: accessError } = await supabase
          .from('profile_access_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (accessError) {
          console.error('Error fetching access logs:', accessError);
        } else {
          setAccessLogs(accessData || []);
        }
      }

    } catch (error) {
      console.error('Error fetching audit data:', error);
      toast({
        title: "Error loading audit data",
        description: "Failed to fetch audit information.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action.toLowerCase()) {
      case 'insert':
        return <Badge variant="default">Created</Badge>;
      case 'update':
        return <Badge variant="secondary">Updated</Badge>;
      case 'delete':
        return <Badge variant="destructive">Deleted</Badge>;
      case 'select':
        return <Badge variant="outline">Viewed</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'insert': return <Database className="h-4 w-4" />;
      case 'update': return <FileText className="h-4 w-4" />;
      case 'delete': return <Activity className="h-4 w-4" />;
      case 'select': return <Eye className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatLogEntry = (log: any) => (
    <div 
      key={log.id} 
      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
      onClick={() => {
        setSelectedLog(log);
        setShowLogDetail(true);
      }}
    >
      <div className="flex items-center gap-3">
        {getActionIcon(log.action)}
        <div>
          <div className="font-medium">
            {log.entity_type || log.entity || 'Unknown'} - {log.action}
          </div>
          <div className="text-sm text-muted-foreground">
            User: {log.user_name || log.changed_by || 'System'} • 
            {new Date(log.created_at || log.occurred_at).toLocaleString()}
          </div>
          {log.session_id && (
            <div className="text-xs text-muted-foreground">
              Session: {log.session_id.slice(0, 8)}...
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {getActionBadge(log.action)}
        {log.ip_address && isStringOrNull(log.ip_address) && (
          <Badge variant="outline" className="text-xs">
            {log.ip_address}
          </Badge>
        )}
      </div>
    </div>
  );

  if (!canViewAuditLogs) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Access Denied</p>
            <p className="text-sm">You don't have permission to view audit logs</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Enhanced Audit Trail
          </CardTitle>
          <CardDescription>
            Comprehensive system activity and security monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Select value={filters.action || '__all__'} onValueChange={(value) => 
              setFilters(prev => ({ ...prev, action: value === '__all__' ? '' : value }))
            }>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Actions</SelectItem>
                <SelectItem value="INSERT">Created</SelectItem>
                <SelectItem value="UPDATE">Updated</SelectItem>
                <SelectItem value="DELETE">Deleted</SelectItem>
                <SelectItem value="SELECT">Viewed</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              placeholder="User ID or name"
              value={filters.user}
              onChange={(e) => setFilters(prev => ({ ...prev, user: e.target.value }))}
            />
            
            <Input
              type="date"
              placeholder="From date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
            
            <Input
              type="date"
              placeholder="To date"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
            
            <Button onClick={fetchAuditData}>
              Refresh
            </Button>
          </div>

          {/* Tabs for different log types */}
          <Tabs defaultValue="audit" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="audit" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Audit Logs ({auditLogs.length})
              </TabsTrigger>
              <TabsTrigger value="detailed" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Detailed ({detailedLogs.length})
              </TabsTrigger>
              {isAdmin && (
                <>
                  <TabsTrigger value="impersonation" className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Impersonation ({impersonationLogs.length})
                  </TabsTrigger>
                  <TabsTrigger value="access" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Access ({accessLogs.length})
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="audit">
              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse p-4 border rounded-lg">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {auditLogs.map(formatLogEntry)}
                    {auditLogs.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No audit logs found</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="detailed">
              <ScrollArea className="h-[600px]">
                <div className="space-y-2">
                  {detailedLogs.map(formatLogEntry)}
                  {detailedLogs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No detailed logs found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {isAdmin && (
              <>
                <TabsContent value="impersonation">
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {impersonationLogs.map((log) => (
                        <div key={log.id} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <UserCheck className="h-4 w-4" />
                              <div>
                                <div className="font-medium">
                                  Impersonation Session
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Impersonator: {log.impersonator_id} → Target: {log.target_user_id}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Started: {new Date(log.started_at).toLocaleString()}
                                  {log.ended_at && ` • Ended: ${new Date(log.ended_at).toLocaleString()}`}
                                </div>
                                {log.reason && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Reason: {log.reason}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Badge variant={log.ended_at ? "outline" : "destructive"}>
                              {log.ended_at ? "Ended" : "Active"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {impersonationLogs.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No impersonation logs found</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="access">
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {accessLogs.map((log) => (
                        <div key={log.id} className="p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Eye className="h-4 w-4" />
                            <div>
                              <div className="font-medium">
                                Profile Access: {log.action}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Target: {log.target_user_id} • Accessor: {log.accessor_user_id || 'System'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {new Date(log.created_at).toLocaleString()}
                                {log.ip_address && isStringOrNull(log.ip_address) && ` • IP: ${log.ip_address}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {accessLogs.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No access logs found</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={showLogDetail} onOpenChange={setShowLogDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Detailed information about this audit entry
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Action</label>
                  <div className="text-sm">{selectedLog.action}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Entity</label>
                  <div className="text-sm">{selectedLog.entity_type || selectedLog.entity}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">User</label>
                  <div className="text-sm">{selectedLog.user_name || selectedLog.changed_by || 'System'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Timestamp</label>
                  <div className="text-sm">{new Date(selectedLog.created_at || selectedLog.occurred_at).toLocaleString()}</div>
                </div>
              </div>
              
              {selectedLog.changed_fields && (
                <div>
                  <label className="text-sm font-medium">Changed Fields</label>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(selectedLog.changed_fields, null, 2)}
                  </pre>
                </div>
              )}
              
              {selectedLog.metadata && (
                <div>
                  <label className="text-sm font-medium">Metadata</label>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
              
              {selectedLog.diff && (
                <div>
                  <label className="text-sm font-medium">Changes</label>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(selectedLog.diff, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}