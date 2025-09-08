import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Shield, Phone, MessageSquare, Mail, Globe, Plus, ExternalLink, Calendar, User, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { Contact } from '@/types/crm';

interface ConsentRecord {
  id: string;
  consent_type: 'sms' | 'voice' | 'email' | 'data_processing';
  method: 'verbal' | 'written' | 'web_form' | 'sms_keyword' | 'api';
  status: 'granted' | 'revoked';
  evidence_ref?: string;
  ip_address?: string;
  user_agent?: string;
  location_data?: any;
  notes?: string;
  granted_at: string;
  expires_at?: string;
  revoked_at?: string;
  created_by?: string;
}

interface ConsentEvidenceProps {
  contact: Contact;
  onConsentUpdate?: () => void;
  className?: string;
}

export function ConsentEvidence({ contact, onConsentUpdate, className }: ConsentEvidenceProps) {
  const [consentRecords, setConsentRecords] = useState<ConsentRecord[]>([
    {
      id: '1',
      consent_type: 'sms',
      method: 'verbal',
      status: 'granted',
      evidence_ref: 'CALL_REC_20241201_001',
      ip_address: '192.168.1.100',
      user_agent: 'Mozilla/5.0...',
      notes: 'Customer verbally consented during phone call about policy renewal',
      granted_at: '2024-12-01T14:30:00Z',
      created_by: 'John Smith'
    },
    {
      id: '2',
      consent_type: 'voice',
      method: 'web_form',
      status: 'granted',
      evidence_ref: 'WEB_FORM_20241201_002',
      ip_address: '73.123.45.67',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      location_data: { city: 'Miami', state: 'FL', country: 'US' },
      granted_at: '2024-12-01T10:15:00Z'
    }
  ]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newConsent, setNewConsent] = useState({
    consent_type: 'sms' as ConsentRecord['consent_type'],
    method: 'verbal' as ConsentRecord['method'],
    evidence_ref: '',
    notes: ''
  });

  const getConsentIcon = (type: ConsentRecord['consent_type']) => {
    switch (type) {
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'voice': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'data_processing': return <Shield className="h-4 w-4" />;
    }
  };

  const getMethodBadge = (method: ConsentRecord['method']) => {
    const variants = {
      'verbal': 'default',
      'written': 'secondary',
      'web_form': 'outline',
      'sms_keyword': 'outline',
      'api': 'secondary'
    } as const;
    
    return (
      <Badge variant={variants[method]} className="text-xs">
        {method.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getStatusBadge = (status: ConsentRecord['status']) => {
    return (
      <Badge 
        variant={status === 'granted' ? 'default' : 'destructive'} 
        className="text-xs"
      >
        {status.toUpperCase()}
      </Badge>
    );
  };

  const handleAddConsent = async () => {
    try {
      const consent: ConsentRecord = {
        id: Date.now().toString(),
        ...newConsent,
        status: 'granted',
        granted_at: new Date().toISOString(),
        created_by: 'Current User'
      };
      
      setConsentRecords(prev => [consent, ...prev]);
      setDialogOpen(false);
      setNewConsent({
        consent_type: 'sms',
        method: 'verbal',
        evidence_ref: '',
        notes: ''
      });
      
      onConsentUpdate?.();
      
      toast({
        title: "Consent recorded",
        description: "The consent evidence has been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error recording consent",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const revokeConsent = async (consentId: string) => {
    try {
      setConsentRecords(prev =>
        prev.map(record =>
          record.id === consentId
            ? { ...record, status: 'revoked' as const, revoked_at: new Date().toISOString() }
            : record
        )
      );
      
      onConsentUpdate?.();
      
      toast({
        title: "Consent revoked",
        description: "The consent has been marked as revoked.",
      });
    } catch (error) {
      toast({
        title: "Error revoking consent",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const activeConsents = consentRecords.filter(record => record.status === 'granted');
  const revokedConsents = consentRecords.filter(record => record.status === 'revoked');

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Consent Evidence
            </CardTitle>
            <CardDescription>
              Legal documentation of consent for {contact.first_name} {contact.last_name}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Record Consent
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Active Consents */}
        {activeConsents.length > 0 && (
          <div>
            <h4 className="font-medium text-green-700 mb-3">Active Consents</h4>
            <div className="space-y-4">
              {activeConsents.map((consent) => (
                <Card key={consent.id} className="border-green-200 bg-green-50">
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getConsentIcon(consent.consent_type)}
                          <span className="font-medium capitalize">
                            {consent.consent_type.replace('_', ' ')} Consent
                          </span>
                          {getStatusBadge(consent.status)}
                        </div>
                        <div className="flex items-center gap-2">
                          {getMethodBadge(consent.method)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeConsent(consent.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Granted:</span>
                          <span className="ml-2">
                            {format(new Date(consent.granted_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        
                        {consent.evidence_ref && (
                          <div>
                            <span className="text-muted-foreground">Evidence:</span>
                            <span className="ml-2 font-mono text-xs">{consent.evidence_ref}</span>
                          </div>
                        )}
                        
                        {consent.ip_address && (
                          <div>
                            <span className="text-muted-foreground">IP Address:</span>
                            <span className="ml-2 font-mono text-xs">{consent.ip_address}</span>
                          </div>
                        )}
                        
                        {consent.location_data && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">
                              {consent.location_data.city}, {consent.location_data.state}
                            </span>
                          </div>
                        )}
                        
                        {consent.created_by && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{consent.created_by}</span>
                          </div>
                        )}
                      </div>
                      
                      {consent.notes && (
                        <div className="pt-2 border-t">
                          <p className="text-sm text-muted-foreground">{consent.notes}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Revoked Consents */}
        {revokedConsents.length > 0 && (
          <div>
            <Separator />
            <h4 className="font-medium text-red-700 mb-3">Revoked Consents</h4>
            <div className="space-y-3">
              {revokedConsents.map((consent) => (
                <Card key={consent.id} className="border-red-200 bg-red-50 opacity-60">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getConsentIcon(consent.consent_type)}
                        <span className="font-medium capitalize">
                          {consent.consent_type.replace('_', ' ')} Consent
                        </span>
                        {getStatusBadge(consent.status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Revoked {consent.revoked_at && format(new Date(consent.revoked_at), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* No Consents */}
        {consentRecords.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No consent records found</p>
            <p className="text-sm">Record consent to ensure compliance</p>
          </div>
        )}
      </CardContent>

      {/* Add Consent Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Consent</DialogTitle>
            <DialogDescription>
              Document consent evidence for {contact.first_name} {contact.last_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Consent Type</Label>
                <Select 
                  value={newConsent.consent_type} 
                  onValueChange={(value: ConsentRecord['consent_type']) => 
                    setNewConsent(prev => ({ ...prev, consent_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS/Text Messages</SelectItem>
                    <SelectItem value="voice">Voice Calls</SelectItem>
                    <SelectItem value="email">Email Marketing</SelectItem>
                    <SelectItem value="data_processing">Data Processing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Collection Method</Label>
                <Select 
                  value={newConsent.method} 
                  onValueChange={(value: ConsentRecord['method']) => 
                    setNewConsent(prev => ({ ...prev, method: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verbal">Verbal (Phone Call)</SelectItem>
                    <SelectItem value="written">Written Form</SelectItem>
                    <SelectItem value="web_form">Web Form</SelectItem>
                    <SelectItem value="sms_keyword">SMS Keyword</SelectItem>
                    <SelectItem value="api">API/Integration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Evidence Reference</Label>
              <Input
                placeholder="e.g., CALL_REC_20241201_001, FORM_12345"
                value={newConsent.evidence_ref}
                onChange={(e) => setNewConsent(prev => ({ 
                  ...prev, 
                  evidence_ref: e.target.value 
                }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Reference to recording, form submission, or other proof
              </p>
            </div>
            
            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional context about how consent was obtained..."
                value={newConsent.notes}
                onChange={(e) => setNewConsent(prev => ({ 
                  ...prev, 
                  notes: e.target.value 
                }))}
                rows={3}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddConsent}>
              Record Consent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}