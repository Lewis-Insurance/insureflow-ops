import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { History, User, Calendar, Edit3, Trash2, Plus, Eye, Download } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  user_name: string;
  user_id: string;
  occurred_at: string;
  changed_fields?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
  ip_address?: string;
}

interface AuditTrailProps {
  entityType: 'account' | 'contact';
  entityId: string;
  className?: string;
}

export function AuditTrail({ entityType, entityId, className }: AuditTrailProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: '1',
      action: 'CREATE',
      user_name: 'John Smith',
      user_id: 'user-1',
      occurred_at: '2024-12-01T10:00:00Z',
      changed_fields: {
        name: { old: null, new: 'Smith Family' },
        email: { old: null, new: 'smith@email.com' },
        phone: { old: null, new: '(555) 123-4567' }
      },
      metadata: { source: 'manual_entry' }
    },
    {
      id: '2',
      action: 'UPDATE',
      user_name: 'Sarah Johnson',
      user_id: 'user-2',
      occurred_at: '2024-12-01T14:30:00Z',
      changed_fields: {
        phone: { old: '(555) 123-4567', new: '(555) 987-6543' },
        address_line1: { old: '123 Main St', new: '456 Oak Ave' }
      },
      metadata: { source: 'profile_update' },
      ip_address: '192.168.1.100'
    },
    {
      id: '3',
      action: 'MERGE',
      user_name: 'Mike Davis',
      user_id: 'user-3',
      occurred_at: '2024-12-02T09:15:00Z',
      changed_fields: {
        merged_from: { old: null, new: 'duplicate-account-123' }
      },
      metadata: { 
        source: 'duplicate_merge',
        merge_operation_id: 'merge-456',
        preserved_data: ['contacts', 'policies', 'timeline']
      }
    },
    {
      id: '4',
      action: 'TAG_ADDED',
      user_name: 'John Smith',
      user_id: 'user-1',
      occurred_at: '2024-12-02T11:45:00Z',
      changed_fields: {
        tags: { old: ['vip'], new: ['vip', 'renewal-priority'] }
      },
      metadata: { source: 'bulk_action', batch_id: 'batch-789' }
    }
  ]);
  
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const filteredLogs = auditLogs.filter(log => {
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesUser = filterUser === 'all' || log.user_id === filterUser;
    const matchesSearch = searchTerm === '' || 
      log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      Object.keys(log.changed_fields || {}).some(field => 
        field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    return matchesAction && matchesUser && matchesSearch;
  });

  const uniqueUsers = Array.from(
    new Set(auditLogs.map(log => log.user_id))
  ).map(userId => {
    const log = auditLogs.find(l => l.user_id === userId);
    return { id: userId, name: log?.user_name || 'Unknown' };
  });

  const uniqueActions = Array.from(
    new Set(auditLogs.map(log => log.action))
  );

  const getActionBadge = (action: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      'CREATE': 'default',
      'UPDATE': 'secondary',
      'DELETE': 'destructive',
      'MERGE': 'outline',
      'TAG_ADDED': 'secondary',
      'TAG_REMOVED': 'secondary',
      'CONTACT_ADDED': 'default',
      'POLICY_LINKED': 'default'
    };
    
    return (
      <Badge variant={variants[action] || 'outline'} className="text-xs">
        {action.replace('_', ' ')}
      </Badge>
    );
  };

  const openDetailDialog = (log: AuditLog) => {
    setSelectedLog(log);
    setDetailDialogOpen(true);
  };

  const exportAuditLog = () => {
    // In a real implementation, this would generate and download a CSV/PDF
    const csvContent = [
      ['Date', 'Action', 'User', 'Changes', 'IP Address'].join(','),
      ...filteredLogs.map(log => [
        format(new Date(log.occurred_at), 'yyyy-MM-dd HH:mm:ss'),
        log.action,
        log.user_name,
        Object.keys(log.changed_fields || {}).join('; '),
        log.ip_address || 'N/A'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${entityType}-${entityId}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit Trail
            </CardTitle>
            <CardDescription>
              Complete history of changes and actions performed on this {entityType}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportAuditLog}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by user, action, or field..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {uniqueActions.map(action => (
                <SelectItem key={action} value={action}>
                  {action.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {uniqueUsers.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Audit Log Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Changes</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          {format(new Date(log.occurred_at), 'MMM d, yyyy')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(log.occurred_at), 'h:mm a')}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {getActionBadge(log.action)}
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{log.user_name}</span>
                    </div>
                    {log.ip_address && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {log.ip_address}
                      </div>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <div className="space-y-1">
                      {log.changed_fields && Object.entries(log.changed_fields).slice(0, 2).map(([field, change]) => (
                        <div key={field} className="text-sm">
                          <span className="font-medium">{field}:</span>
                          <span className="text-muted-foreground ml-1">
                            {change.old ? `"${change.old}"` : 'null'} → "{change.new}"
                          </span>
                        </div>
                      ))}
                      {log.changed_fields && Object.keys(log.changed_fields).length > 2 && (
                        <div className="text-xs text-muted-foreground">
                          +{Object.keys(log.changed_fields).length - 2} more changes
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDetailDialog(log)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No audit logs found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        )}
      </CardContent>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit Log Details
            </DialogTitle>
            <DialogDescription>
              Complete details of the audit log entry
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Action</Label>
                  <div className="mt-1">{getActionBadge(selectedLog.action)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">User</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {selectedLog.user_name}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Date & Time</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(selectedLog.occurred_at), 'MMM d, yyyy h:mm:ss a')}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">IP Address</Label>
                  <div className="mt-1 font-mono text-sm">
                    {selectedLog.ip_address || 'N/A'}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Field Changes */}
              {selectedLog.changed_fields && Object.keys(selectedLog.changed_fields).length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Field Changes</h4>
                  <div className="space-y-3">
                    {Object.entries(selectedLog.changed_fields).map(([field, change]) => (
                      <div key={field} className="border rounded-lg p-3">
                        <div className="font-medium mb-2">{field}</div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground mb-1">Previous Value</div>
                            <div className="p-2 bg-red-50 border border-red-200 rounded">
                              <code className="text-red-800">
                                {change.old !== null ? JSON.stringify(change.old) : 'null'}
                              </code>
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-1">New Value</div>
                            <div className="p-2 bg-green-50 border border-green-200 rounded">
                              <code className="text-green-800">
                                {JSON.stringify(change.new)}
                              </code>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Additional Context</h4>
                  <div className="bg-muted p-3 rounded-lg">
                    <pre className="text-sm overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-sm font-medium", className)}>{children}</div>;
}