import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MapPin, Building, Calendar, FileText, User, Edit, MessageSquare, Send } from 'lucide-react';
import { EditContactInfoModal } from './EditContactInfoModal';
import { useState } from 'react';
import { SMSComposerModal } from '@/components/communications/SMSComposerModal';
import { formatInsuredDisplay } from '@/lib/insuredNames';

interface CustomerAccount {
  id: string;
  name: string;
  date_of_birth?: string;
  spouse_name?: string;
  spouse_date_of_birth?: string;
  type: string;
  account_type?: string;
  account_status?: string;
  email?: string;
  phone?: string;
  phone_secondary?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  tin_last4?: string;
  source?: string;
  lead_source_detail?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Trust/Estate fields
  primary_entity_type?: 'trust' | 'estate' | null;
  primary_entity_name?: string;
  trustee_name?: string;
  trust_date?: string;
  secondary_entity_type?: 'trust' | 'estate' | null;
  secondary_entity_name?: string;
}

interface CustomerContactInfoProps {
  account: CustomerAccount;
  onSendEmail?: () => void;
}

export function CustomerContactInfo({ account, onSendEmail }: CustomerContactInfoProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);

  // Format primary insured display (may include trust/estate)
  const primaryInsuredDisplay = formatInsuredDisplay({
    personName: account.name || null,
    entityType: account.primary_entity_type || null,
    entityName: account.primary_entity_name || null,
    trusteeName: account.trustee_name || null,
  });

  // Format secondary insured display (may include trust/estate)
  const secondaryInsuredDisplay = (account.spouse_name || account.secondary_entity_name)
    ? formatInsuredDisplay({
        personName: account.spouse_name || null,
        entityType: account.secondary_entity_type || null,
        entityName: account.secondary_entity_name || null,
        trusteeName: null,
      })
    : null;

  const formatDateOfBirth = (dob: string | undefined) => {
    if (!dob) return null;
    const date = new Date(dob + 'T00:00:00'); // Avoid timezone issues
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const formatAddress = () => {
    const parts = [
      account.address_line1,
      account.address_line2,
      account.city,
      account.state,
      account.zip_code
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'No address on file';
  };

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Customer Information
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditModalOpen(true)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              {account.type === 'household' && secondaryInsuredDisplay ? 'Named Insureds' : 'Customer Name'}
            </label>
            <p className="text-sm font-semibold">
              {primaryInsuredDisplay}
              {account.date_of_birth && (
                <span className="text-muted-foreground font-normal text-xs ml-2">
                  (DOB: {formatDateOfBirth(account.date_of_birth)})
                </span>
              )}
              {account.type === 'household' && secondaryInsuredDisplay && (
                <>
                  <span className="text-muted-foreground font-normal"> & {secondaryInsuredDisplay}</span>
                  {account.spouse_date_of_birth && (
                    <span className="text-muted-foreground font-normal text-xs ml-1">
                      (DOB: {formatDateOfBirth(account.spouse_date_of_birth)})
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Account Type</label>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="capitalize">
                {account.type || 'Individual'}
              </Badge>
              {account.account_status && (
                <Badge variant={account.account_status === 'active' ? 'default' : 'secondary'}>
                  {account.account_status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Contact Information - Prominent with Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Email Section */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  {account.email ? (
                    <p className="text-sm font-semibold">{account.email}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No email on file</p>
                  )}
                </div>
              </div>
              {account.email && onSendEmail && (
                <Button
                  size="sm"
                  onClick={onSendEmail}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Email
                </Button>
              )}
            </div>
          </div>

          {/* Phone Section */}
          <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                  <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  {account.phone ? (
                    <a href={`tel:${account.phone}`} className="text-sm font-semibold hover:underline block">
                      {account.phone}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No phone on file</p>
                  )}
                  {account.phone_secondary && (
                    <a href={`tel:${account.phone_secondary}`} className="text-xs text-muted-foreground hover:underline block">
                      {account.phone_secondary} (secondary)
                    </a>
                  )}
                </div>
              </div>
              {account.phone && (
                <Button
                  size="sm"
                  onClick={() => setSmsModalOpen(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Text
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
          <div className="flex-1">
            <label className="text-sm font-medium text-muted-foreground">Address</label>
            <p className="text-sm">{formatAddress()}</p>
          </div>
        </div>

        {/* Business Information */}
        {(account.tin_last4 || account.source || account.lead_source_detail) && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Building className="h-4 w-4" />
              Business Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {account.tin_last4 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">TIN (Last 4)</label>
                  <p className="text-sm">****{account.tin_last4}</p>
                </div>
              )}
              {account.source && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Lead Source</label>
                  <p className="text-sm capitalize">{account.source}</p>
                </div>
              )}
              {account.lead_source_detail && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Source Details</label>
                  <p className="text-sm">{account.lead_source_detail}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {account.notes && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4" />
              <label className="text-sm font-medium text-muted-foreground">Customer Notes</label>
            </div>
            <p className="text-sm bg-muted/30 p-3 rounded">{account.notes}</p>
          </div>
        )}

        {/* Timestamps */}
        <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created</label>
              <p className="text-sm">{new Date(account.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
              <p className="text-sm">{new Date(account.updated_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </CardContent>
      
      <EditContactInfoModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        account={account}
        onSuccess={() => window.location.reload()}
      />

      {account.phone && (
        <SMSComposerModal
          open={smsModalOpen}
          onOpenChange={setSmsModalOpen}
          accountId={account.id}
          accountName={account.name}
          defaultPhone={account.phone}
        />
      )}
    </Card>
  );
}