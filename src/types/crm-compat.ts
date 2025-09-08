// Compatibility types to bridge schema differences
import type { Database } from '@/integrations/supabase/types';

// Create Account type that includes both old and new field names for compatibility
export type AccountCompat = Database['public']['Tables']['accounts']['Row'] & {
  // Add 'type' as alias for 'account_type' for backward compatibility
  type: Database['public']['Tables']['accounts']['Row']['account_type'];
};

export type CreateAccountDataCompat = Database['public']['Tables']['accounts']['Insert'] & {
  // Add 'type' as alias for 'account_type' for form compatibility
  type: Database['public']['Tables']['accounts']['Insert']['account_type'];
};