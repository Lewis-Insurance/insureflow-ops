/**
 * Property Policy - Overview Tab
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, Users, Calendar, FileText } from 'lucide-react';
import type { PropertyPolicyDetails } from '@/types/commercial-property';
import { formatCurrency, formatDate, FORM_TYPE_LABELS, InfoField, AddressDisplay } from './shared';

interface OverviewTabProps {
  details: PropertyPolicyDetails;
}

export function OverviewTab({ details }: OverviewTabProps) {
  const { identity, dates, form, valuation } = details;

  return (
    <>
      {/* Policy Identity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoField label="Carrier" value={identity.carrier_name} icon={Building2} />
        <InfoField label="NAIC" value={identity.carrier_naic || 'N/A'} />
        <InfoField label="Policy Number" value={identity.policy_number} mono />
        <InfoField
          label="Transaction Type"
          value={
            <Badge variant="secondary">
              {identity.transaction_type?.toUpperCase() || 'N/A'}
            </Badge>
          }
        />
      </div>

      <Separator />

      {/* Named Insured */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Named Insured
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Legal Name" value={identity.named_insured} />
          <InfoField label="DBA" value={identity.dba || 'N/A'} />
        </div>
        {identity.mailing_address && (
          <AddressDisplay address={identity.mailing_address} />
        )}
      </div>

      <Separator />

      {/* Dates */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Policy Period
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoField label="Effective Date" value={formatDate(dates.effective_date)} />
          <InfoField label="Expiration Date" value={formatDate(dates.expiration_date)} />
          <InfoField label="Issue Date" value={formatDate(dates.issue_date)} />
        </div>
      </div>

      <Separator />

      {/* Form & Valuation */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Form & Valuation
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Policy Form</div>
            <div className="font-medium">
              <Badge variant={form.form_type === 'special' ? 'default' : 'secondary'}>
                {FORM_TYPE_LABELS[form.form_type] || form.form_type}
              </Badge>
            </div>
          </Card>
          {valuation && (
            <>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Valuation Basis</div>
                <div className="font-medium">
                  {valuation.is_blanket && (
                    <Badge variant="outline" className="mr-1">Blanket</Badge>
                  )}
                  {valuation.is_agreed_value && (
                    <Badge variant="outline" className="mr-1">Agreed</Badge>
                  )}
                </div>
              </Card>
              {valuation.coinsurance_percent && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Coinsurance</div>
                  <div className="text-xl font-bold">{valuation.coinsurance_percent}%</div>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Blanket Coverage Info */}
        {valuation?.is_blanket && valuation.blanket_limit && (
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-blue-700">
                Blanket Limit: {formatCurrency(valuation.blanket_limit)}
              </Badge>
              {valuation.margin_clause_percent && (
                <span className="text-sm text-blue-600">
                  Margin Clause: {valuation.margin_clause_percent}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
