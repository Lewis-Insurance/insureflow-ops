import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';

interface ExportRequest {
  id: string;
  request_type: string;
  status: string;
  export_url: string | null;
  expires_at: string | null;
  requested_at: string;
  completed_at: string | null;
  download_count: number;
}

export function DataExport() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  useEffect(() => {
    fetchExportRequests();
  }, [user]);

  const fetchExportRequests = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('data_export_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false });

      if (error) throw error;

      setRequests(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading export requests",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const requestExport = async (type: 'profile' | 'activity' | 'full') => {
    if (!user) return;

    // Check for recent requests (rate limiting)
    const recentRequest = requests.find(
      req => req.request_type === type && 
      new Date(req.requested_at) > new Date(Date.now() - 60 * 60 * 1000) // 1 hour
    );

    if (recentRequest) {
      toast({
        title: "Request too recent",
        description: "Please wait before requesting another export of this type.",
        variant: "destructive",
      });
      return;
    }

    setRequesting(type);
    try {
      const { error } = await supabase
        .from('data_export_requests')
        .insert({
          user_id: user.id,
          request_type: type,
          status: 'pending'
        });

      if (error) throw error;

      // Trigger background processing
      await supabase.functions.invoke('process-data-export', {
        body: { request_type: type }
      });

      await fetchExportRequests();
      
      toast({
        title: "Export requested",
        description: "Your data export has been queued for processing. You'll receive an email when it's ready.",
      });
    } catch (error: any) {
      toast({
        title: "Error requesting export",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRequesting(null);
    }
  };

  const downloadExport = async (request: ExportRequest) => {
    if (!request.export_url) return;

    try {
      // Track download
      await supabase
        .from('data_export_requests')
        .update({ download_count: request.download_count + 1 })
        .eq('id', request.id);

      // Open download
      window.open(request.export_url, '_blank');
      
      // Update local state
      setRequests(prev => prev.map(req => 
        req.id === request.id 
          ? { ...req, download_count: req.download_count + 1 }
          : req
      ));
    } catch (error: any) {
      toast({
        title: "Error downloading export",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-info animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'processing':
        return 'default';
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getExportTypeLabel = (type: string) => {
    switch (type) {
      case 'profile':
        return 'Profile Data';
      case 'activity':
        return 'Activity Log';
      case 'full':
        return 'Complete Export';
      default:
        return type;
    }
  };

  const getExportDescription = (type: string) => {
    switch (type) {
      case 'profile':
        return 'Your profile information, settings, and preferences';
      case 'activity':
        return 'Your activity history, access logs, and session data';
      case 'full':
        return 'Complete data package including profile, activity, and all associated records';
      default:
        return '';
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data Export</CardTitle>
          <CardDescription>Loading export requests...</CardDescription>
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
          <Download className="h-5 w-5" />
          Data Export
        </CardTitle>
        <CardDescription>
          Export your personal data in machine-readable formats (JSON/CSV)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export Options */}
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { type: 'profile', label: 'Profile Data', icon: <FileText className="h-4 w-4" /> },
            { type: 'activity', label: 'Activity Log', icon: <Clock className="h-4 w-4" /> },
            { type: 'full', label: 'Complete Export', icon: <Download className="h-4 w-4" /> }
          ].map(({ type, label, icon }) => (
            <Card key={type} className="p-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {icon}
                  <h4 className="font-medium">{label}</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getExportDescription(type)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requestExport(type as any)}
                  disabled={requesting === type}
                  className="w-full"
                >
                  {requesting === type ? "Requesting..." : "Request Export"}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Rate Limiting Notice */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Rate Limits:</strong> You can request each export type once per hour. 
            Downloads expire after 7 days and are limited to 5 downloads per request.
          </AlertDescription>
        </Alert>

        {/* Export History */}
        <div className="space-y-4">
          <h4 className="font-medium">Export History</h4>
          
          {requests.length === 0 ? (
            <div className="text-center py-8">
              <Download className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No export requests yet</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Export Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Downloads</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-medium">
                          {getExportTypeLabel(request.request_type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(request.status)}
                          <Badge variant={getStatusBadgeVariant(request.status)}>
                            {request.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(request.requested_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell>
                        {request.expires_at ? (
                          <div className={`text-sm ${isExpired(request.expires_at) ? 'text-destructive' : ''}`}>
                            {isExpired(request.expires_at) ? 'Expired' : 
                             formatDistanceToNow(new Date(request.expires_at), { addSuffix: true })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {request.download_count} / 5
                        </div>
                      </TableCell>
                      <TableCell>
                        {request.status === 'completed' && 
                         request.export_url && 
                         !isExpired(request.expires_at) && 
                         request.download_count < 5 ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => downloadExport(request)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}