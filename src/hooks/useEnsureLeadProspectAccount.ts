import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type LeadProspectRow = {
  id: string;
  account_id: string | null;
  converted_account_id: string | null;
  agency_workspace_id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  insurance_types: string[] | null;
};

function resolveAccountType(lead: LeadProspectRow): 'commercial_business' | 'household' {
  const leadType = (lead as { lead_type?: string }).lead_type;
  if (leadType === 'commercial' || leadType === 'business') {
    return 'commercial_business';
  }
  if (lead.insurance_types?.includes('commercial') || !!lead.company_name?.trim()) {
    return 'commercial_business';
  }
  return 'household';
}

function buildProspectName(lead: LeadProspectRow): string {
  const company = lead.company_name?.trim();
  if (company) return company;
  const person = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
  return person || 'Lead prospect';
}

/**
 * Ensures a lead has a real accounts.id without full conversion.
 * Creates or resolves a thin prospect account and links it on leads.account_id.
 */
export function useEnsureLeadProspectAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string): Promise<string> => {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select(
          'id, account_id, converted_account_id, agency_workspace_id, first_name, last_name, company_name, email, phone, insurance_types',
        )
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        throw new Error('Failed to fetch lead');
      }

      const row = lead as LeadProspectRow;

      if (row.account_id) {
        return row.account_id;
      }

      if (row.converted_account_id) {
        const { error: updateError } = await supabase
          .from('leads')
          .update({ account_id: row.converted_account_id })
          .eq('id', leadId);

        if (updateError) {
          throw new Error('Failed to link converted account');
        }

        return row.converted_account_id;
      }

      const { data: resolved, error: resolveError } = await supabase.rpc('import_resolve_account', {
        p_agency_workspace_id: row.agency_workspace_id,
        p_batch_id: crypto.randomUUID(),
        p_name: buildProspectName(row),
        p_type: resolveAccountType(row),
        p_email: row.email || null,
        p_phone: row.phone || null,
        p_source: 'Lead',
      });

      if (resolveError) {
        throw new Error(resolveError.message || 'Failed to create prospect account');
      }

      const resolution = resolved as { account_id?: string } | null;
      const accountId = resolution?.account_id;
      if (!accountId) {
        throw new Error('Account resolve returned no account_id');
      }

      const { error: linkError } = await supabase
        .from('leads')
        .update({ account_id: accountId })
        .eq('id', leadId);

      if (linkError) {
        throw new Error('Failed to link account to lead');
      }

      return accountId;
    },
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
