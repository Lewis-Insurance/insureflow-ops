import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPhoneForDisplay } from '@/lib/format';
import { 
  Phone, 
  PhoneOutgoing, 
  PhoneIncoming,
  User,
  Clock,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { asMessage } from '@/lib/asMessage';
import { format } from 'date-fns';

interface CallWithClient {
  id: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  disposition?: string;
  recording_url?: string;
  account_id?: string;
  contact_id?: string;
  // Client info
  client_name?: string;
  client_phone?: string;
  account_name?: string;
}

export function CallClientConnection() {
  const [calls, setCalls] = useState<CallWithClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCallsWithClients();
  }, []);

  const fetchCallsWithClients = async () => {
    try {
      setLoading(true);

      // Fetch call sessions with related client information
      const { data: callsData, error } = await supabase
        .from('call_sessions')
        .select(`
          id,
          from_number,
          to_number,
          started_at,
          ended_at,
          duration_seconds,
          disposition,
          recording_url,
          account_id,
          contact_id,
          accounts!call_sessions_account_id_fkey(
            id,
            name,
            phone
          ),
          contacts!call_sessions_contact_id_fkey(
            id,
            first_name,
            last_name,
            phone
          )
        `)
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Process and format the call data
      const formattedCalls: CallWithClient[] = (callsData || []).map(call => {
        // Determine call direction based on Twilio number
        const twilioNumber = '+13864879494';
        const direction = call.from_number === twilioNumber ? 'outbound' : 'inbound';
        
        return {
          id: call.id,
          from_number: call.from_number,
          to_number: call.to_number,
          direction,
          started_at: call.started_at,
          ended_at: call.ended_at || undefined,
          duration_seconds: call.duration_seconds || undefined,
          disposition: call.disposition || undefined,
          recording_url: call.recording_url || undefined,
          account_id: call.account_id || undefined,
          contact_id: call.contact_id || undefined,
          // Client information
          account_name: call.accounts?.name,
          client_name: call.contacts ? 
            `${call.contacts.first_name} ${call.contacts.last_name}`.trim() : 
            undefined,
          client_phone: call.contacts?.phone || call.accounts?.phone || undefined
        };
      });

      setCalls(formattedCalls);
    } catch (error) {
      toast({
        title: "Error loading calls",
        description: asMessage(error, "Failed to load call data"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'inbound' ? (
      <PhoneIncoming className="h-4 w-4 text-green-600" />
    ) : (
      <PhoneOutgoing className="h-4 w-4 text-blue-600" />
    );
  };

  const getDispositionColor = (disposition?: string) => {
    switch (disposition) {
      case 'completed': return 'default';
      case 'no-answer': return 'secondary';
      case 'busy': return 'destructive';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call-Client Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Call-Client Connections
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          How incoming and outgoing calls are linked to client records
        </p>
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <div className="text-center py-8">
            <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Call Data Yet</h3>
            <p className="text-muted-foreground mb-4">
              Call sessions will appear here once your Twilio integration is active
            </p>
            <div className="bg-muted/50 p-4 rounded-lg text-left">
              <h4 className="font-medium mb-2">How Call-Client Linking Works:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• <strong>Incoming calls:</strong> System matches caller's phone number to existing contacts/accounts</li>
                <li>• <strong>Outgoing calls:</strong> Agent selects client before dialing, creating automatic link</li>
                <li>• <strong>Account linking:</strong> Calls are connected via account_id and contact_id fields</li>
                <li>• <strong>Phone matching:</strong> System searches contacts and accounts by phone number</li>
                <li>• <strong>Call history:</strong> All calls appear in client's activity timeline</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {calls.map((call) => (
              <div key={call.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getDirectionIcon(call.direction)}
                    <div>
                      <p className="font-medium">
                        {call.direction === 'inbound' ? call.from_number : call.to_number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(call.started_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getDispositionColor(call.disposition)}>
                      {call.disposition || 'Unknown'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(call.duration_seconds)}
                    </span>
                  </div>
                </div>

                {/* Client Connection Info */}
                <div className="bg-muted/30 rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Connected to:</span>
                  </div>
                  
                  {call.account_id || call.contact_id ? (
                    <div className="space-y-1">
                      {call.client_name && (
                        <p className="text-sm">
                          <strong>Contact:</strong> {call.client_name}
                        </p>
                      )}
                      {call.account_name && (
                        <p className="text-sm">
                          <strong>Account:</strong> {call.account_name}
                        </p>
                      )}
                      {call.client_phone && (
                        <p className="text-sm">
                          <strong>Phone:</strong> {formatPhoneForDisplay(call.client_phone)}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => window.open(`/account/${call.account_id}`, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Client
                        </Button>
                        {call.recording_url && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => window.open(call.recording_url, '_blank')}
                          >
                            Play Recording
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No client record linked - phone number not found in system
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}