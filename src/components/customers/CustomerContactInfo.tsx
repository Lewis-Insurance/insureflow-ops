import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, MapPin, Building, Calendar, FileText, User } from 'lucide-react';

interface CustomerAccount {
  id: string;
  name: string;
  type: string;
  account_type?: string;
  account_status?: string;
  email?: string;
  phone?: string;
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
}

interface CustomerContactInfoProps {
  account: CustomerAccount;
}

export function CustomerContactInfo({ account }: CustomerContactInfoProps) {
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Customer Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Customer Name</label>
            <p className="text-sm font-semibold">{account.name}</p>
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

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {account.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-sm">{account.email}</p>
              </div>
            </div>
          )}
          {account.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Phone</label>
                <p className="text-sm">{account.phone}</p>
              </div>
            </div>
          )}
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
    </Card>
  );
}