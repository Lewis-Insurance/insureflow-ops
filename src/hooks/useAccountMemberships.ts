import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { asMessage } from '@/lib/errors';

export function useAccountMemberships() {
  /**
   * Create account membership when a new account is created
   * Automatically makes the current user the owner
   * Uses existing upsert_membership RPC function
   */
  const createOwnerMembership = useCallback(async (accountId: string, userId: string): Promise<boolean> => {
    try {
      // Cast to any to bypass TypeScript type checking until types are regenerated
      const { error } = await supabase.rpc('upsert_membership', {
        p_account: accountId,
        p_user: userId,
        p_role: 'owner'
      });

      if (error) throw error;
      return true;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to create account membership');
      toast({
        title: "Membership error",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    }
  }, []);

  /**
   * Add a user to an account with specified role
   * Only owners and staff can add members
   */
  const addMembership = useCallback(async (
    accountId: string, 
    userId: string, 
    role: 'owner' | 'staff' | 'member' = 'member'
  ): Promise<boolean> => {
    try {
      // Cast to any to bypass TypeScript type checking until types are regenerated
      const { error } = await supabase.rpc('upsert_membership', {
        p_account: accountId,
        p_user: userId,
        p_role: role
      });

      if (error) throw error;

      toast({
        title: "Member added",
        description: "User has been added to the account successfully.",
      });

      return true;
    } catch (err: unknown) {
      const errorMessage = asMessage(err, 'Failed to add member to account');
      toast({
        title: "Error adding member",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    }
  }, []);

  return {
    createOwnerMembership,
    addMembership
  };
}