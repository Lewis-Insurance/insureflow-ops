import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MapPin, FileText, User, Edit, MessageSquare, Send } from 'lucide-react';
import { EditContactInfoModal } from './EditContactInfoModal';
import { useState } from 'react';
import { SMSComposerModal } from '@/components/communications/SMSComposerModal';
import { formatInsuredDisplay } from '@/lib/insuredNames';
import { Chip, maskDob } from '@/components/cc';
import { humanizeEnum, humanizeStatus } from '@/lib/format';

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
      <CardContent className="space-y-4">
        {/* Identity: name (wide) + account type */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="text-xs font-medium text-cc-text-muted">
              {account.type === 'household' && secondaryInsuredDisplay ? 'Named Insureds' : 'Customer Name'}
            </label>
            <p className="text-sm font-semibold">
              {primaryInsuredDisplay}
              {account.date_of_birth && (
                <span className="text-cc-text-muted font-normal text-xs ml-2 cc-num">
                  (DOB: {maskDob(account.date_of_birth)})
                </span>
              )}
              {account.type === 'household' && secondaryInsuredDisplay && (
                <>
                  <span className="text-cc-text-muted font-normal"> &amp; {secondaryInsuredDisplay}</span>
                  {account.spouse_date_of_birth && (
                    <span className="text-cc-text-muted font-normal text-xs ml-1 cc-num">
                      (DOB: {maskDob(account.spouse_date_of_birth)})
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-cc-text-muted">Account Type</label>
            <div className="flex flex-wrap gap-2 mt-1">
              <Chip>{humanizeEnum(account.type) || 'Individual'}</Chip>
              {account.account_status && <Chip>{humanizeStatus(account.account_status)}</Chip>}
            </div>
          </div>
        </div>

        {/* Contact tiles: email | phone | address, one row on wide screens */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Email */}
          <div className="p-3 bg-cc-surface-raised rounded-cc-md border border-cc-border-subtle">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="shrink-0 p-1.5 rounded-full bg-cc-surface-overlay">
                  <Mail className="h-4 w-4 text-cc-text-muted" />
                </div>
                <div className="min-w-0">
                  <label className="text-xs font-medium text-cc-text-muted">Email</label>
                  {account.email ? (
                    <p className="truncate text-sm font-semibold text-cc-text-primary" title={account.email}>
                      {account.email}
                    </p>
                  ) : (
                    <p className="text-sm text-cc-text-muted italic">No email on file</p>
                  )}
                </div>
              </div>
              {account.email && onSendEmail && (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={onSendEmail}
                  aria-label="Send email"
                  className="h-8 w-8 shrink-0 border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="p-3 bg-cc-surface-raised rounded-cc-md border border-cc-border-subtle">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="shrink-0 p-1.5 rounded-full bg-cc-surface-overlay">
                  <Phone className="h-4 w-4 text-cc-text-muted" />
                </div>
                <div className="min-w-0">
                  <label className="text-xs font-medium text-cc-text-muted">Phone</label>
                  {account.phone ? (
                    <a href={`tel:${account.phone}`} className="block truncate text-sm font-semibold text-cc-text-primary hover:underline">
                      {account.phone}
                    </a>
                  ) : (
                    <p className="text-sm text-cc-text-muted italic">No phone on file</p>
                  )}
                  {account.phone_secondary && (
                    <a href={`tel:${account.phone_secondary}`} className="block truncate text-xs text-cc-text-muted hover:underline">
                      {account.phone_secondary} (secondary)
                    </a>
                  )}
                </div>
              </div>
              {account.phone && (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setSmsModalOpen(true)}
                  aria-label="Send text"
                  className="h-8 w-8 shrink-0 border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="p-3 bg-cc-surface-raised rounded-cc-md border border-cc-border-subtle sm:col-span-2 lg:col-span-1">
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 p-1.5 rounded-full bg-cc-surface-overlay">
                <MapPin className="h-4 w-4 text-cc-text-muted" />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-cc-text-muted">Address</label>
                <p className="text-sm text-cc-text-primary">{formatAddress()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Meta: business + timestamps, compact 3-up grid */}
        <div className="grid gap-x-4 gap-y-3 border-t border-cc-border-subtle pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {account.tin_last4 && (
            <div>
              <label className="text-xs font-medium text-cc-text-muted">TIN (Last 4)</label>
              <p className="text-sm cc-num">****{account.tin_last4}</p>
            </div>
          )}
          {account.source && (
            <div>
              <label className="text-xs font-medium text-cc-text-muted">Lead Source</label>
              <p className="text-sm">{humanizeEnum(account.source)}</p>
            </div>
          )}
          {account.lead_source_detail && (
            <div>
              <label className="text-xs font-medium text-cc-text-muted">Source Details</label>
              <p className="text-sm">{account.lead_source_detail}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-cc-text-muted">Created</label>
            <p className="text-sm cc-num">{new Date(account.created_at).toLocaleDateString()}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-cc-text-muted">Last Updated</label>
            <p className="text-sm cc-num">{new Date(account.updated_at).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Notes */}
        {account.notes && (
          <div className="border-t border-cc-border-subtle pt-3">
            <div className="flex items-center gap-2 mb-1.5">
              <FileText className="h-4 w-4 text-cc-text-muted" />
              <label className="text-xs font-medium text-cc-text-muted">Customer Notes</label>
            </div>
            <p className="text-sm bg-cc-surface-raised p-3 rounded-cc-md border border-cc-border-subtle">{account.notes}</p>
          </div>
        )}
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