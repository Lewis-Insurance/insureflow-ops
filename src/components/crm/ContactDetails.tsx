import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPhoneForDisplay } from '@/lib/format';
import { Edit, Phone, Mail, MapPin, Calendar, User } from 'lucide-react';
import { SSNReveal } from './SSNReveal';
import { PermissionGuard } from '@/components/common/PermissionGuard';
import type { Database } from '@/integrations/supabase/types';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

type Contact = Database['public']['Tables']['contacts']['Row'];

interface ContactDetailsProps {
  contact: Contact;
  onEdit?: () => void;
  className?: string;
}

export function ContactDetails({ contact, onEdit, className = "" }: ContactDetailsProps) {
  const formatAddress = (address: any) => {
    if (!address || typeof address !== 'object') return null;
    
    const parts = [
      address.street,
      address.city,
      address.state,
      address.zip
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : null;
  };

  const getPreferredContact = () => {
    const methods = [];
    if (contact.phone_mobile) methods.push(`Mobile: ${formatPhoneForDisplay(contact.phone_mobile)}`);
    if (contact.phone_home) methods.push(`Home: ${formatPhoneForDisplay(contact.phone_home)}`);
    if (contact.phone_work) methods.push(`Work: ${formatPhoneForDisplay(contact.phone_work)}`);
    return methods.join(' • ');
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Contact Information</span>
          </CardTitle>
          <PermissionGuard permission="canEdit">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </PermissionGuard>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">Personal Details</h4>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Name:</strong> {contact.first_name} {contact.middle_name} {contact.last_name}
              </div>
              {contact.date_of_birth && (
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4" />
                  <span><strong>DOB:</strong> {formatLocalDateDisplay(contact.date_of_birth)}</span>
                </div>
              )}
              {contact.gender && (
                <div><strong>Gender:</strong> {contact.gender}</div>
              )}
              {contact.marital_status && (
                <div><strong>Marital Status:</strong> {contact.marital_status}</div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Identifiers</h4>
            <div className="space-y-2 text-sm">
              <div>
                <strong>SSN:</strong>
                <SSNReveal
                  contactId={contact.id}
                  encryptedSSN={contact.ssn_encrypted || undefined}
                  ssnLast4={contact.ssn_last4 || undefined}
                  className="ml-2"
                />
              </div>
              {contact.role && (
                <div><strong>Role:</strong> <Badge variant="outline">{contact.role}</Badge></div>
              )}
            </div>
          </div>
        </div>

        {/* Contact Methods */}
        <div>
          <h4 className="font-medium mb-2">Contact Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              {contact.email_primary && (
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>{contact.email_primary}</span>
                </div>
              )}
              {contact.email_other && contact.email_other.length > 0 && (
                <div className="ml-6 text-muted-foreground">
                  Additional: {contact.email_other.join(', ')}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              {(contact.phone_mobile || contact.phone_home || contact.phone_work) && (
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4" />
                  <span>{getPreferredContact()}</span>
                </div>
              )}
              {contact.preferred_contact_method && (
                <div className="text-muted-foreground">
                  Preferred: {contact.preferred_contact_method}
                </div>
              )}
              {contact.best_call_time && (
                <div className="text-muted-foreground">
                  Best time to call: {contact.best_call_time}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Addresses */}
        <div>
          <h4 className="font-medium mb-2">Addresses</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {contact.address_residential && (
              <div className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-medium">Residential</div>
                  <div className="text-muted-foreground">
                    {formatAddress(contact.address_residential)}
                  </div>
                </div>
              </div>
            )}
            
            {contact.address_mailing && (
              <div className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-medium">Mailing</div>
                  <div className="text-muted-foreground">
                    {formatAddress(contact.address_mailing)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scores & Analytics */}
        {(contact.lead_score || contact.risk_score || contact.renewal_probability) && (
          <div>
            <h4 className="font-medium mb-2">Analytics</h4>
            <div className="flex flex-wrap gap-4">
              {contact.lead_score && (
                <div className="text-sm">
                  <strong>Lead Score:</strong> {contact.lead_score}
                </div>
              )}
              {contact.risk_score && (
                <div className="text-sm">
                  <strong>Risk Score:</strong> {contact.risk_score}
                </div>
              )}
              {contact.renewal_probability && (
                <div className="text-sm">
                  <strong>Renewal Probability:</strong> {(contact.renewal_probability * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Tags</h4>
            <div className="flex flex-wrap gap-2">
              {contact.tags.map((tag, index) => (
                <Badge key={index} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Consent Tracking */}
        <div>
          <h4 className="font-medium mb-2">Consent Status</h4>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Badge variant={contact.consent_sms ? "default" : "secondary"}>
                SMS: {contact.consent_sms ? "Granted" : "Not granted"}
              </Badge>
              {contact.consent_sms_at && (
                <span className="text-muted-foreground">
                  ({new Date(contact.consent_sms_at).toLocaleDateString()})
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Badge variant={contact.consent_voice ? "default" : "secondary"}>
                Voice: {contact.consent_voice ? "Granted" : "Not granted"}
              </Badge>
              {contact.consent_voice_at && (
                <span className="text-muted-foreground">
                  ({new Date(contact.consent_voice_at).toLocaleDateString()})
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}