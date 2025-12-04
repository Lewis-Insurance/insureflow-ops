// src/hooks/useSchemaValidator.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTableExists(tableName: string) {
  return useQuery({
    queryKey: ['table-exists', tableName],
    queryFn: async () => {
      const { error } = await supabase
        .from(tableName)
        .select('id')
        .limit(0);
      
      return !error;
    },
    staleTime: Infinity // Cache forever
  });
}

export function useTableColumns(tableName: string) {
  return useQuery({
    queryKey: ['table-columns', tableName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data ? Object.keys(data) : [];
    },
    enabled: tableName !== ''
  });
}
