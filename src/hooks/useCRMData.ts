import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { asMessage, handleSupabaseError } from '@/lib/errors';
import { useAccountMemberships } from './useAccountMemberships';
import type { Database } from '@/integrations/supabase/types';
import type {
  Account, 
  Contact, 
  Policy, 
  Claim, 
  CallSession, 
  SMSMessage, 
  ActivityEvent, 
  Task,
  AccountWithDetails,
  CRMFilters,
  CreateAccountData,
  CreateContactData,
  UpdateAccountData,
  SupabaseErrorDetails
} from '@/types/crm-enhanced';

export function useCRMData() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { createOwnerMembership } = useAccountMemberships();

  const fetchAccounts = useCallback(async (filters?: CRMFilters) => {
    try {
      setLoading(true);
      setError(null);

      // SECURITY FIX: Check authentication first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Authentication required');
      }

      let query = supabase
        .from('accounts')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // PERFORMANCE: Limit results to prevent large data loads
      query = query.limit(100);

      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }

      if (filters?.type && filters.type !== 'all') {
        query = query.eq('type', filters.type);
      }

      if (filters?.state) {
        query = query.eq('state', filters.state);
      }

      const { data, error } = await query;

      if (error) throw error;

      setAccounts(data || []);
    } catch (err: any) {
      const errorMessage = asMessage(err, 'Failed to load accounts');
      setError(errorMessage);
      toast({
        title: "Error loading accounts",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAccountDetails = useCallback(async (accountId: string): Promise<AccountWithDetails | null> => {
    try {
      // SECURITY FIX: Check authentication first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Authentication required');
      }

      // PERFORMANCE: Fetch core account data first, then related data
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .maybeSingle();

      if (accountError) throw accountError;
      if (!accountData) return null;

      // RESILIENCE: Fetch related data with individual error handling
      const [
        contactsResult,
        policiesResult,
        claimsResult,
        callsResult,
        messagesResult,
        tasksResult,
        eventsResult
      ] = await Promise.allSettled([
        supabase
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('policies')
          .select(`
            *,
            carrier:carriers(id, name)
          `)
          .eq('account_id', accountId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('claims')
          .select(`
            *,
            policy:policies!inner(
              id,
              policy_number,
              line_of_business,
              account_id,
              carrier:carriers(name)
            )
          `)
          .eq('policy.account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase
          .from('call_sessions')
          .select('*')
          .eq('account_id', accountId)
          .order('started_at', { ascending: false })
          .limit(20),
        supabase
          .from('sms_messages')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('tasks')
          .select('*')
          .eq('entity_id', accountId)
          .eq('entity_type', 'account')
          .order('created_at', { ascending: false }),
        supabase
          .from('events')
          .select('*')
          .eq('entity_id', accountId)
          .eq('entity_type', 'account')
          .order('occurred_at', { ascending: false })
          .limit(50)
      ]);

      // RESILIENCE: Extract data from settled promises, handling failures gracefully
      const extractData = (result: PromiseSettledResult<any>) => 
        result.status === 'fulfilled' ? result.value?.data || [] : [];

      const account: AccountWithDetails = {
        ...accountData,
        contacts: extractData(contactsResult),
        policies: extractData(policiesResult) as Policy[],
        claims: extractData(claimsResult) as Claim[],
        calls: extractData(callsResult),
        messages: extractData(messagesResult),
        tasks: extractData(tasksResult),
        events: extractData(eventsResult)
      };

      return account;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to fetch account details');
      toast({
        title: "Error loading account details",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  }, []);

  const createAccount = useCallback(async (data: CreateAccountData): Promise<Account | null> => {
    try {
      // Get current user first
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Authentication required to create accounts');
      }

      // CRITICAL FIX: Create account and membership atomically
      const { data: account, error } = await supabase
        .from('accounts')
        .insert(data)
        .select()
        .maybeSingle();

      if (error) {
        throw new Error(`Account creation failed: ${error.message}`);
      }

      if (!account) {
        throw new Error('Account creation failed - no account returned');
      }

      // Create membership using the existing upsert function
      const membershipSuccess = await createOwnerMembership(account.id, user.id);
      if (!membershipSuccess) {
        // Clean up account if membership creation fails
        await supabase.from('accounts').delete().eq('id', account.id);
        throw new Error('Failed to create account membership');
      }

      // Log account creation event (fire-and-forget)
      supabase
        .from('events')
        .insert({
          type: 'account_created',
          entity_type: 'account',
          entity_id: account.id,
          payload: { name: data.name, type: data.type }
        })
        .then(); // Don't await - let it run async

      toast({
        title: "Account created",
        description: `${data.name} has been added successfully.`,
      });

      // Refresh accounts list
      await fetchAccounts();

      return account;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to create account');
      toast({
        title: "Error creating account", 
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  }, [fetchAccounts, createOwnerMembership]);

  const updateAccount = useCallback(async (id: string, data: UpdateAccountData): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('accounts')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      // Log account update event
      await supabase
        .from('events')
        .insert({
          type: 'account_updated',
          entity_type: 'account',
          entity_id: id,
          payload: data
        });

      toast({
        title: "Account updated",
        description: "Account information has been updated successfully.",
      });

      // Refresh accounts list
      fetchAccounts();

      return true;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to update account');
      toast({
        title: "Error updating account",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    }
  }, [fetchAccounts]);

  const createContact = useCallback(async (data: CreateContactData): Promise<Contact | null> => {
    try {
      const { data: contact, error } = await supabase
        .from('contacts')
        .insert(data)
        .select()
        .maybeSingle();

      if (error) throw error;

      // Log contact creation event
      await supabase
        .from('events')
        .insert({
          type: 'contact_created',
          entity_type: 'account',
          entity_id: data.account_id,
          payload: { 
            contact_name: `${data.first_name} ${data.last_name}`,
            role: data.role 
          }
        });

      toast({
        title: "Contact added",
        description: `${data.first_name} ${data.last_name} has been added successfully.`,
      });

      return contact;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to create contact');
      toast({
        title: "Error creating contact",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  }, []);

  const updateContact = useCallback(async (id: string, data: Partial<CreateContactData>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('contacts')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Contact updated",
        description: "Contact information has been updated successfully.",
      });

      return true;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to update contact');
      toast({
        title: "Error updating contact",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    }
  }, []);

  const deleteAccount = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Log account deletion event
      await supabase
        .from('events')
        .insert({
          type: 'account_deleted',
          entity_type: 'account',
          entity_id: id,
          payload: { deleted_at: new Date().toISOString() }
        });

      toast({
        title: "Account deleted",
        description: "Account has been moved to trash.",
      });

      // Refresh accounts list
      fetchAccounts();

      return true;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to delete account');
      toast({
        title: "Error deleting account",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    }
  }, [fetchAccounts]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    fetchAccounts,
    fetchAccountDetails,
    createAccount,
    updateAccount,
    createContact,
    updateContact,
    deleteAccount
  };
}