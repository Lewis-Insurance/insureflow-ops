import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { InsuranceDocument, ComparisonResult } from '@/types/insurance-comparison';

interface ComparisonSession {
  id: string;
  account_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  option1_data: InsuranceDocument;
  option2_data: InsuranceDocument;
  comparison_results: ComparisonResult | null;
  report_url: string | null;
  status: 'draft' | 'completed' | 'archived';
  client_name: string | null;
  notes: string | null;
}

interface ExtractedPolicy {
  id: string;
  session_id: string;
  account_id: string;
  carrier: string;
  policy_number: string | null;
  document_path: string | null;
  extracted_data: any;
  confidence_scores: Record<string, number> | null;
  extraction_metadata: any;
  created_at: string;
  updated_at: string;
}

export function useComparisonSessions(accountId?: string) {
  return useQuery({
    queryKey: ['comparison-sessions', accountId],
    queryFn: async () => {
      let query = supabase
        .from('comparison_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch comparison sessions: ${error.message}`);
      }

      return data as unknown as ComparisonSession[];
    },
    enabled: !!accountId,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useComparisonSession(sessionId: string) {
  return useQuery({
    queryKey: ['comparison-session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comparison_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch comparison session: ${error.message}`);
      }

      return data as unknown as ComparisonSession;
    },
    enabled: !!sessionId,
    staleTime: 60 * 1000,
  });
}

export function useSaveComparisonSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      accountId,
      option1,
      option2,
      comparisonResults,
      clientName,
    }: {
      accountId: string;
      option1: InsuranceDocument;
      option2: InsuranceDocument;
      comparisonResults?: ComparisonResult;
      clientName?: string;
    }) => {
      const { data, error } = await supabase
        .from('comparison_sessions')
        .insert({
          account_id: accountId,
          option1_data: option1 as any,
          option2_data: option2 as any,
          comparison_results: comparisonResults as any || null,
          client_name: clientName || option1.insuredName,
          status: comparisonResults ? 'completed' : 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['comparison-sessions'] });
      toast({
        title: 'Success',
        description: 'Comparison session saved successfully',
      });
      return data;
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: `Failed to save session: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateComparisonSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      sessionId,
      updates,
    }: {
      sessionId: string;
      updates: Partial<Omit<ComparisonSession, 'id' | 'created_at' | 'updated_at'>>;
    }) => {
      const { data, error } = await supabase
        .from('comparison_sessions')
        .update(updates as any)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['comparison-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['comparison-session', data.id] });
      toast({
        title: 'Success',
        description: 'Comparison session updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: `Failed to update session: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteComparisonSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('comparison_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comparison-sessions'] });
      toast({
        title: 'Success',
        description: 'Comparison session deleted',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: `Failed to delete session: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export function useSaveExtractedPolicy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      sessionId,
      accountId,
      carrier,
      policyNumber,
      documentPath,
      extractedData,
      confidenceScores,
      extractionMetadata,
    }: {
      sessionId: string;
      accountId: string;
      carrier: string;
      policyNumber?: string;
      documentPath?: string;
      extractedData: any;
      confidenceScores?: Record<string, number>;
      extractionMetadata?: any;
    }) => {
      const { data, error } = await supabase
        .from('extracted_policies')
        .insert({
          session_id: sessionId,
          account_id: accountId,
          carrier,
          policy_number: policyNumber,
          document_path: documentPath,
          extracted_data: extractedData,
          confidence_scores: confidenceScores || null,
          extraction_metadata: extractionMetadata || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracted-policies'] });
      toast({
        title: 'Success',
        description: 'Policy extraction saved',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: `Failed to save extraction: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export function useExtractedPolicies(sessionId: string) {
  return useQuery({
    queryKey: ['extracted-policies', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extracted_policies')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch extracted policies: ${error.message}`);
      }

      return data as ExtractedPolicy[];
    },
    enabled: !!sessionId,
    staleTime: 60 * 1000,
  });
}

export type { ComparisonSession, ExtractedPolicy };
