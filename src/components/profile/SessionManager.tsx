import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Monitor, Smartphone, Tablet, Globe, LogOut, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';

interface UserSession {
  id: string;
  device_info: any;
  ip_address: string | null;
  user_agent: string;
  location_data: any;
  last_active: string;
  created_at: string;
  is_current: boolean;
}

export function SessionManager() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, [user]);

  const fetchSessions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('last_active', { ascending: false });

      if (error) throw error;

      // Mark current session (you'd need to implement session detection)
      const currentSessionId = await getCurrentSessionId();
      const sessionsWithCurrent = data.map(session => ({
        ...session,
        is_current: session.id === currentSessionId
      }));

      setSessions(sessionsWithCurrent.map(session => ({
        ...session,
        ip_address: session.ip_address as string || 'Unknown'
      })));
    } catch (error: any) {
      toast({
        title: "Error loading sessions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurrentSessionId = async (): Promise<string | null> => {
    // This would typically be stored in localStorage or session storage
    return localStorage.getItem('current_session_id');
  };

  const getDeviceIcon = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="h-4 w-4" />;
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return <Tablet className="h-4 w-4" />;
    } else {
      return <Monitor className="h-4 w-4" />;
    }
  };

  const getDeviceType = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'Mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'Tablet';
    } else {
      return 'Desktop';
    }
  };

  const getBrowser = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    return 'Unknown';
  };

  const revokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      // Remove from local state
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      toast({
        title: "Session revoked",
        description: "The session has been successfully terminated.",
      });
    } catch (error: any) {
      toast({
        title: "Error revoking session",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllSessions = async () => {
    if (!user) return;

    setRevoking('all');
    try {
      const currentSessionId = await getCurrentSessionId();
      
      const { error } = await supabase
        .from('user_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .neq('id', currentSessionId || '');

      if (error) throw error;

      // Keep only current session
      setSessions(prev => prev.filter(s => s.is_current));
      
      toast({
        title: "All other sessions revoked",
        description: "You have been logged out of all other devices.",
      });
    } catch (error: any) {
      toast({
        title: "Error revoking sessions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Loading your active sessions...</CardDescription>
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
          <Globe className="h-5 w-5" />
          Active Sessions
        </CardTitle>
        <CardDescription>
          Manage your active login sessions across all devices
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.length > 1 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              You have {sessions.length} active sessions
            </span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={revokeAllSessions}
              disabled={revoking === 'all'}
            >
              {revoking === 'all' ? "Revoking..." : "Revoke All Others"}
            </Button>
          </div>
        )}

        {sessions.length === 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No active sessions found. This may indicate a session tracking issue.
            </AlertDescription>
          </Alert>
        )}

        {sessions.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getDeviceIcon(session.user_agent)}
                        <div>
                          <div className="font-medium">
                            {getDeviceType(session.user_agent)} • {getBrowser(session.user_agent)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {session.ip_address}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {session.location_data?.city ? (
                          <>
                            {session.location_data.city}, {session.location_data.region}
                            <br />
                            <span className="text-xs text-muted-foreground">
                              {session.location_data.country}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDistanceToNow(new Date(session.last_active), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {session.is_current ? (
                        <Badge variant="default">Current Session</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!session.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeSession(session.id)}
                          disabled={revoking === session.id}
                        >
                          {revoking === session.id ? (
                            "Revoking..."
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
