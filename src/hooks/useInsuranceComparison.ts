import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSaveComparisonSession } from '@/hooks/useComparisonSessions';
import type { InsuranceDocument, ComparisonResult } from '@/types/insurance-comparison';

/**
 * Types for Supabase function responses
 */
interface AnalysisExtracted {
  insuredName?: string;
  account_id?: string;
  effectiveDate: string | Date;
  expirationDate: string | Date;
  [k: string]: unknown;
}

interface AnalysisResponse {
  extracted: AnalysisExtracted;
  [k: string]: unknown;
}

/**
 * Internal state & reducer
 */
type State = {
  isProcessing: boolean;
  uploadedFiles1: File[];
  uploadedFiles2: File[];
  option1: InsuranceDocument | null;
  option2: InsuranceDocument | null;
  comparison: ComparisonResult | null;
  currentSessionId: string | null;
  error: string | null;
};

type Action =
  | { type: 'SET_PROCESSING'; value: boolean }
  | { type: 'SET_UPLOADED'; which: 1 | 2; files: File[] }
  | { type: 'SET_OPTION'; which: 1 | 2; doc: InsuranceDocument | null }
  | { type: 'SET_COMPARISON'; comparison: ComparisonResult | null }
  | { type: 'SET_SESSION_ID'; id: string | null }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

const initialState: State = {
  isProcessing: false,
  uploadedFiles1: [],
  uploadedFiles2: [],
  option1: null,
  option2: null,
  comparison: null,
  currentSessionId: null,
  error: null
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.value };
    case 'SET_UPLOADED':
      return action.which === 1
        ? { ...state, uploadedFiles1: action.files }
        : { ...state, uploadedFiles2: action.files };
    case 'SET_OPTION':
      return action.which === 1
        ? { ...state, option1: action.doc }
        : { ...state, option2: action.doc };
    case 'SET_COMPARISON':
      return { ...state, comparison: action.comparison };
    case 'SET_SESSION_ID':
      return { ...state, currentSessionId: action.id };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

/**
 * Helper to ensure Date object
 */
function ensureDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Sanitize filename for storage
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function useInsuranceComparison() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { toast } = useToast();
  const mountedRef = useRef(true);
  
  const saveSession = useSaveComparisonSession();

  // Cleanup mounted ref on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Safe dispatch that checks if component is mounted
  const safeDispatch = useCallback((action: Action) => {
    if (mountedRef.current) {
      dispatch(action);
    }
  }, []);

  // DRY: Upload files to storage with better collision avoidance
  const uploadToStorage = useCallback(async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file, index) => {
      const uniqueId = crypto.randomUUID();
      const sanitized = sanitizeFilename(file.name);
      const filePath = `insurance-comparison/${Date.now()}-${index}-${uniqueId}-${sanitized}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;
      return filePath;
    });

    return Promise.all(uploadPromises);
  }, []);

  // DRY: Analyze documents with type-safe response
  const analyzeDocuments = useCallback(async (paths: string[]): Promise<AnalysisResponse> => {
    console.log('Analyzing documents with paths:', paths);
    
    const { data, error } = await supabase.functions.invoke<AnalysisResponse>(
      'ai-document-analysis',
      {
        body: {
          documentPaths: paths,
          analysisType: 'insurance_extraction'
        }
      }
    );

    console.log('Analysis response:', { data, error });

    if (error) throw error;
    if (!data) throw new Error('No data returned from analysis');
    
    return data;
  }, []);

  // Convert analysis response to InsuranceDocument
  const createDocumentFromAnalysis = useCallback((analysisData: AnalysisResponse): InsuranceDocument => {
    if (!analysisData || !analysisData.extracted) {
      throw new Error('Invalid analysis data: missing extracted field');
    }
    const extracted = analysisData.extracted;
    
    // Validate required fields
    if (!extracted.insuredName && !extracted.carrier) {
      throw new Error('Analysis failed: Could not extract insurance information from document. The document may not be a valid insurance policy or quote.');
    }
    
    return {
      id: crypto.randomUUID(),
      type: extracted.type ?? 'quote',
      carrier: extracted.carrier ?? '',
      policyNumber: extracted.policyNumber ?? '',
      insuredName: extracted.insuredName ?? '',
      effectiveDate: ensureDate(extracted.effectiveDate),
      expirationDate: ensureDate(extracted.expirationDate),
      term: extracted.term ?? '',
      coverages: Array.isArray(extracted.coverages) ? extracted.coverages : [],
      premiums: Array.isArray(extracted.premiums) ? extracted.premiums : [],
      vehicles: extracted.vehicles ?? [],
      properties: extracted.properties ?? [],
      totalPremium: typeof extracted.totalPremium === 'number' ? extracted.totalPremium : undefined,
      account_id: extracted.account_id,
      rawData: analysisData
    } as InsuranceDocument;
  }, []);

  const compareOptions = useCallback(async () => {
    if (state.isProcessing) return;
    
    if (!state.option1 || !state.option2) {
      toast({
        title: 'Missing Documents',
        description: 'Please upload documents for both options',
        variant: 'destructive'
      });
      return;
    }

    safeDispatch({ type: 'SET_PROCESSING', value: true });
    safeDispatch({ type: 'SET_ERROR', error: null });

    try {
      // Use AI to generate detailed comparison
      const { data, error: compareError } = await supabase.functions.invoke<ComparisonResult>(
        'compare-insurance-options',
        {
          body: {
            option1: state.option1,
            option2: state.option2
          }
        }
      );

      if (compareError) throw compareError;
      if (!data) throw new Error('No comparison data returned');

      safeDispatch({ type: 'SET_COMPARISON', comparison: data });

      // Save the comparison session (only if account_id exists)
      if (state.option1.account_id) {
        const savedSession = await saveSession.mutateAsync({
          accountId: state.option1.account_id,
          option1: state.option1,
          option2: state.option2,
          comparisonResults: data,
          clientName: state.option1.insuredName,
        });
        
        if (savedSession) {
          safeDispatch({ type: 'SET_SESSION_ID', id: savedSession.id });
        }
      }

      toast({
        title: 'Comparison Complete',
        description: 'Analysis report generated and saved successfully'
      });

    } catch (err: any) {
      const errorMsg = err.message || 'Failed to compare options';
      safeDispatch({ type: 'SET_ERROR', error: errorMsg });
      toast({
        title: 'Comparison Error',
        description: errorMsg,
        variant: 'destructive'
      });
    } finally {
      safeDispatch({ type: 'SET_PROCESSING', value: false });
    }
  }, [state.option1, state.option2, saveSession, toast, safeDispatch]);

  const uploadFiles = useCallback((files: File[], optionNumber: 1 | 2) => {
    safeDispatch({ type: 'SET_UPLOADED', which: optionNumber, files });
  }, [safeDispatch]);

  const processAllDocuments = useCallback(async () => {
    if (state.isProcessing) return;
    
    if (state.uploadedFiles1.length === 0 || state.uploadedFiles2.length === 0) {
      toast({
        title: 'Missing Documents',
        description: 'Please upload documents for both options',
        variant: 'destructive'
      });
      return;
    }

    safeDispatch({ type: 'SET_PROCESSING', value: true });
    safeDispatch({ type: 'SET_ERROR', error: null });

    try {
      // Parallelize uploads and analysis for both options
      const [paths1, paths2] = await Promise.all([
        uploadToStorage(state.uploadedFiles1),
        uploadToStorage(state.uploadedFiles2),
      ]);

      const [analysisData1, analysisData2] = await Promise.all([
        analyzeDocuments(paths1),
        analyzeDocuments(paths2),
      ]);

      const [extractedDoc1, extractedDoc2] = [
        createDocumentFromAnalysis(analysisData1),
        createDocumentFromAnalysis(analysisData2)
      ];

      safeDispatch({ type: 'SET_OPTION', which: 1, doc: extractedDoc1 });
      safeDispatch({ type: 'SET_OPTION', which: 2, doc: extractedDoc2 });

      toast({
        title: 'Success',
        description: 'Both documents processed successfully'
      });

    } catch (err: any) {
      const errorMsg = err.message || 'Failed to process documents';
      safeDispatch({ type: 'SET_ERROR', error: errorMsg });
      toast({
        title: 'Processing Error',
        description: errorMsg,
        variant: 'destructive'
      });
    } finally {
      safeDispatch({ type: 'SET_PROCESSING', value: false });
    }
  }, [state.isProcessing, state.uploadedFiles1, state.uploadedFiles2, uploadToStorage, analyzeDocuments, createDocumentFromAnalysis, toast, safeDispatch]);

  const reset = useCallback(() => {
    safeDispatch({ type: 'RESET' });
  }, [safeDispatch]);

  // Derived state: can we compare?
  const canCompare = useMemo(
    () => Boolean(state.option1 && state.option2 && !state.comparison),
    [state.option1, state.option2, state.comparison]
  );

  return {
    isProcessing: state.isProcessing,
    uploadedFiles1: state.uploadedFiles1,
    uploadedFiles2: state.uploadedFiles2,
    option1: state.option1,
    option2: state.option2,
    comparison: state.comparison,
    currentSessionId: state.currentSessionId,
    error: state.error,
    canCompare,
    uploadFiles,
    processAllDocuments,
    compareOptions,
    reset
  };
}
