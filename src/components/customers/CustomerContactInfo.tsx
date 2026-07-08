import { Button } from '@/components/ui/button';
import { Mail, Phone, MapPin, FileText, Edit, MessageSquare, Send } from 'lucide-react';
import { EditContactInfoModal } from './EditContactInfoModal';
import { useState } from 'react';
import { SMSComposerModal } from '@/components/communications/SMSComposerModal';
import { humanizeEnum, humanizeLine } from '@/lib/format';
import { usePolicies } from '@/hooks/usePolicies';

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
  /** Refresh the account row after an edit (avoids a full-page reload of the whole record). */
  onAccountUpdated?: () => void;
}

export function CustomerContactInfo({ account, onSendEmail, onAccountUpdated }: CustomerContactInfoProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);

  // Active-policy bubbles in the contact header row. Same React Query key as the
  // Policies section, so this shares that fetch rather than issuing a second one.
  const { data: allPolicies = [] } = usePolicies({ accountId: account.id });
  const activePolicies = allPolicies.filter(
    (p) => p.account_id === account.id && ['active', 'bound', 'pending'].includes((p.status ?? 'active').toLowerCase()),
  );

  /** Jump from a policy bubble to that policy's card below and flash it. */
  const scrollToPolicy = (policyId: string) => {
    const el = document.getElementById(`policy-${policyId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('cc-flash-target');
    window.setTimeout(() => el.classList.remove('cc-flash-target'), 1400);
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
    <>
      <div className="mt-5 space-y-4 border-t border-cc-border-subtle pt-5">
        {/* Header: "Contact" label with the active-policy bubbles + Edit grouped on
            the right (bubbles left of Edit). No name field - the customer name lives
            in the identity panel above. */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Contact</span>
          <div className="flex min-w-0 items-center gap-2">
            {activePolicies.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1.5">
                {activePolicies.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => scrollToPolicy(p.id)}
                    title={`Go to ${humanizeLine(p.line_of_business) || 'policy'}`}
                    className="rounded-pill border border-cc-border-interactive bg-cc-surface-raised px-2.5 py-1 text-xs font-medium text-cc-text-secondary transition-colors duration-fast hover:border-cc-accent hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                  >
                    {humanizeLine(p.line_of_business) || 'Policy'}
                  </button>
                ))}
              </div>
            )}
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setEditModalOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
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

        {/* Meta: TIN + lead source, only when present */}
        {(account.tin_last4 || account.source || account.lead_source_detail) && (
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
          </div>
        )}

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
      </div>

      <EditContactInfoModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        account={account}
        onSuccess={() => (onAccountUpdated ? onAccountUpdated() : window.location.reload())}
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
    </>
  );
}