// ============================================
// useIntakeAutoSave Hook
// Manages auto-saving of intake form responses
// with localStorage backup and server sync
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import type { AutoSaveState, RestorePrompt } from '@/types/intake';

// ============================================
// TYPES
// ============================================

interface UseIntakeAutoSaveOptions {
  intakeId: string;
  submissionId?: string;
  saveInterval?: number;
  localStorageKey?: string;
  onSaveSuccess?: () => void;
  onSaveError?: (error: Error) => void;
  enabled?: boolean;
}

interface UseIntakeAutoSaveReturn {
  saveToLocal: (responses: Record<string, any>, currentSection?: number) => void;
  saveToServer: (responses: Record<string, any>) => Promise<boolean>;
  restoreFromLocal: () => AutoSaveState | null;
  restoreFromServer: () => Promise<AutoSaveState | null>;
  clearSavedData: () => void;
  checkForSavedProgress: () => RestorePrompt;
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const LOCAL_STORAGE_PREFIX = 'intake_autosave_';
const DEFAULT_SAVE_INTERVAL = 30000; // 30 seconds

// ============================================
// HOOK
// ============================================

export function useIntakeAutoSave({
  intakeId,
  submissionId,
  saveInterval = DEFAULT_SAVE_INTERVAL,
  localStorageKey,
  onSaveSuccess,
  onSaveError,
  enabled = true,
}: UseIntakeAutoSaveOptions): UseIntakeAutoSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();

  const pendingChangesRef = useRef<Record<string, any> | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const storageKey = localStorageKey || `${LOCAL_STORAGE_PREFIX}${intakeId}`;

  // ============================================
  // LOCAL STORAGE OPERATIONS
  // ============================================

  const saveToLocal = useCallback(
    (responses: Record<string, any>, currentSection?: number) => {
      if (!enabled) return;

      try {
        const state: AutoSaveState = {
          intakeId,
          responses,
          savedAt: new Date().toISOString(),
          currentSection,
        };

        localStorage.setItem(storageKey, JSON.stringify(state));
        setHasUnsavedChanges(true);
        pendingChangesRef.current = responses;
      } catch (error) {
        logger.error('Failed to save to localStorage:', error);
      }
    },
    [intakeId, storageKey, enabled]
  );

  const restoreFromLocal = useCallback((): AutoSaveState | null => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;

      const state = JSON.parse(saved) as AutoSaveState;

      // Validate the state
      if (state.intakeId !== intakeId) return null;

      return state;
    } catch (error) {
      logger.error('Failed to restore from localStorage:', error);
      return null;
    }
  }, [intakeId, storageKey]);

  const clearSavedData = useCallback(() => {
    localStorage.removeItem(storageKey);
    setHasUnsavedChanges(false);
    pendingChangesRef.current = null;
  }, [storageKey]);

  // ============================================
  // SERVER SYNC OPERATIONS
  // ============================================

  const saveToServer = useCallback(
    async (responses: Record<string, any>): Promise<boolean> => {
      if (!submissionId || !enabled) return false;

      setIsSaving(true);

      try {
        const { error } = await supabase
          .from('intake_submissions')
          .update({
            draft_responses: responses,
            last_draft_save: new Date().toISOString(),
          })
          .eq('id', submissionId);

        if (error) throw error;

        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        pendingChangesRef.current = null;
        onSaveSuccess?.();

        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to save');
        onSaveError?.(err);
        logger.error('Failed to save to server:', error);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [submissionId, enabled, onSaveSuccess, onSaveError]
  );

  const restoreFromServer = useCallback(async (): Promise<AutoSaveState | null> => {
    if (!submissionId) return null;

    try {
      const { data, error } = await supabase
        .from('intake_submissions')
        .select('draft_responses, last_draft_save')
        .eq('id', submissionId)
        .single();

      if (error) throw error;

      if (!data?.draft_responses) return null;

      return {
        intakeId,
        responses: data.draft_responses as Record<string, any>,
        savedAt: data.last_draft_save || new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to restore from server:', error);
      return null;
    }
  }, [submissionId, intakeId]);

  // ============================================
  // CHECK FOR SAVED PROGRESS
  // ============================================

  const checkForSavedProgress = useCallback((): RestorePrompt => {
    const localState = restoreFromLocal();

    if (!localState) {
      return { available: false };
    }

    const savedAt = new Date(localState.savedAt);
    const hoursSinceSave = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);

    // Don't show prompt for very old saves (> 7 days)
    if (hoursSinceSave > 24 * 7) {
      clearSavedData();
      return { available: false };
    }

    return {
      available: true,
      savedProgress: localState,
      hoursSinceSave: Math.round(hoursSinceSave * 10) / 10,
    };
  }, [restoreFromLocal, clearSavedData]);

  // ============================================
  // AUTO-SAVE TIMER
  // ============================================

  useEffect(() => {
    if (!enabled || !submissionId) return;

    // Set up periodic server sync
    saveTimerRef.current = setInterval(async () => {
      if (pendingChangesRef.current && hasUnsavedChanges) {
        await saveToServer(pendingChangesRef.current);
      }
    }, saveInterval);

    return () => {
      if (saveTimerRef.current) {
        clearInterval(saveTimerRef.current);
      }
    };
  }, [enabled, submissionId, saveInterval, hasUnsavedChanges, saveToServer]);

  // ============================================
  // CLEANUP ON UNMOUNT
  // ============================================

  useEffect(() => {
    return () => {
      // Save any pending changes before unmount
      if (pendingChangesRef.current && submissionId) {
        // Fire and forget - we're unmounting
        supabase
          .from('intake_submissions')
          .update({
            draft_responses: pendingChangesRef.current,
            last_draft_save: new Date().toISOString(),
          })
          .eq('id', submissionId)
          .then(() => {
            logger.debug('Final auto-save completed');
          })
          .catch((error) => {
            logger.error('Final auto-save failed:', error);
          });
      }
    };
  }, [submissionId]);

  // ============================================
  // BEFORE UNLOAD WARNING
  // ============================================

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return {
    saveToLocal,
    saveToServer,
    restoreFromLocal,
    restoreFromServer,
    clearSavedData,
    checkForSavedProgress,
    isSaving,
    lastSaved,
    hasUnsavedChanges,
  };
}

// ============================================
// UTILITY: RESTORE DIALOG COMPONENT
// ============================================

export function shouldShowRestoreDialog(prompt: RestorePrompt): boolean {
  if (!prompt.available) return false;
  if (!prompt.savedProgress) return false;

  // Check if there's meaningful saved data
  const responses = prompt.savedProgress.responses || {};
  const hasResponses = Object.values(responses).some(
    (v) => v !== null && v !== undefined && v !== ''
  );

  return hasResponses;
}

export default useIntakeAutoSave;
