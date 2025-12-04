import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Shield, Phone, MessageSquare, Mail, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ConsentEvidence, TwilioConsent } from '@/types/crm-enhanced-clean';

interface TCPAComplianceProps {
  contactId: string;
  contactName?: string;
}

export function TCPACompliance({ contactId, contactName }: TCPAComplianceProps) {
  const [consents, setConsents] = useState<ConsentEvidence[]>([]);
  const [twilioConsents, setTwilioConsents] = useState<TwilioConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [newConsent, setNewConsent] = useState({
    consent_type: '',
    method: '',
    notes: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchConsents();
  }, [contactId]);

  const fetchConsents = async () => {
    try {
      setLoading(true);
      
      // Fetch consent evidence
      const { data: consentData, error: consentError } = await supabase
        .from('consent_evidence')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (consentError) throw consentError;

      // Fetch Twilio consents
      const { data: twilioData, error: twilioError } = await supabase
        .from('twilio_consents')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (twilioError) throw twilioError;

      setConsents(consentData || []);
      setTwilioConsents(twilioData || []);
    } catch (error) {
      console.error('Error fetching consents:', error);
      toast({
        title: "Error loading consent data",
        description: "Failed to fetch TCPA compliance information.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddConsent = async () => {
    if (!newConsent.consent_type || !newConsent.method) {
      toast({
        title: "Missing information",
        description: "Please select consent type and method.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('consent_evidence')
        .insert({
          contact_id: contactId,
          consent_type: newConsent.consent_type,
          method: newConsent.method,
          status: 'granted',
          granted_at: new Date().toISOString(),
          notes: newConsent.notes || null,
          ip_address: null, // Would be captured in real implementation
          user_agent: navigator.userAgent,
        });

      if (error) throw error;

      toast({
        title: "Consent recorded",
        description: "TCPA consent has been successfully documented.",
      });

      setShowConsentDialog(false);
      setNewConsent({ consent_type: '', method: '', notes: '' });
      fetchConsents();
    } catch (error) {
      console.error('Error adding consent:', error);
      toast({
        title: "Error recording consent",
        description: "Failed to save consent information.",
        variant: "destructive",
      });
    }
  };

  const getConsentIcon = (type: string) => {
    switch (type) {
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'voice': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string, revokedAt?: string | null) => {
    if (revokedAt) {
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Revoked</Badge>;
    }
    
    switch (status) {
      case 'granted':
        return <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              TCPA Compliance
            </CardTitle>
            <CardDescription>
              Consent tracking for {contactName || 'contact'}
            </CardDescription>
          </div>
          <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Shield className="h-4 w-4 mr-2" />
                Record Consent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record TCPA Consent</DialogTitle>
                <DialogDescription>
                  Document consent for communication with this contact
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Consent Type</label>
                  <Select value={newConsent.consent_type} onValueChange={(value) => 
                    setNewConsent(prev => ({ ...prev, consent_type: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="Select consent type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sms">SMS/Text Messages</SelectItem>
                      <SelectItem value="voice">Voice Calls</SelectItem>
                      <SelectItem value="email">Email Communications</SelectItem>
                      <SelectItem value="data_processing">Data Processing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Consent Method</label>
                  <Select value={newConsent.method} onValueChange={(value) => 
                    setNewConsent(prev => ({ ...prev, method: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="How was consent obtained?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verbal">Verbal (Phone)</SelectItem>
                      <SelectItem value="written">Written Form</SelectItem>
                      <SelectItem value="web_form">Web Form</SelectItem>
                      <SelectItem value="sms_keyword">SMS Keyword</SelectItem>
                      <SelectItem value="api">API/System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea
                    placeholder="Additional details about consent..."
                    value={newConsent.notes}
                    onChange={(e) => setNewConsent(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowConsentDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddConsent}>
                  Record Consent
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {consents.length === 0 && twilioConsents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No consent records found</p>
            <p className="text-sm">Record consent before initiating communication</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Consent Evidence */}
            {consents.map((consent) => (
              <div key={consent.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getConsentIcon(consent.consent_type)}
                  <div>
                    <div className="font-medium capitalize">
                      {consent.consent_type.replace('_', ' ')} Consent
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Method: {consent.method} • {new Date(consent.granted_at).toLocaleDateString()}
                    </div>
                    {consent.notes && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {consent.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(consent.status, consent.revoked_at)}
                </div>
              </div>
            ))}

            {/* Twilio Consents */}
            {twilioConsents.map((consent) => (
              <div key={consent.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getConsentIcon(consent.channel)}
                  <div>
                    <div className="font-medium capitalize">
                      {consent.channel} - Twilio
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Event: {consent.event} • {new Date(consent.created_at).toLocaleDateString()}
                    </div>
                    {consent.method && (
                      <div className="text-sm text-muted-foreground">
                        Method: {consent.method}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {consent.event === 'consent_granted' ? (
                    <Badge variant="default">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Granted
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Revoked
                    </Badge>
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