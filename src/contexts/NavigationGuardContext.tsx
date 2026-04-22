import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface Guard {
  isDirty: () => boolean;
  onSave: () => Promise<boolean>;
}

interface NavigationGuardContextValue {
  registerGuard: (guard: Guard) => () => void;
  requestNavigation: (to: string) => void;
  isAnyDirty: () => boolean;
}

export const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function useNavigationGuardContext() {
  return useContext(NavigationGuardContext);
}

// Call this from any page that has unsaved state.
// isDirty and onSave are read via refs so they never need to be stable.
export function useNavigationGuard(isDirty: boolean, onSave: () => Promise<boolean>) {
  const ctx = useContext(NavigationGuardContext);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!ctx) { console.log('[NavGuard] useNavigationGuard: ctx is null — no provider found'); return; }
    console.log('[NavGuard] guard registered', { isDirty: isDirtyRef.current });
    const cleanup = ctx.registerGuard({
      isDirty: () => isDirtyRef.current,
      onSave: () => onSaveRef.current(),
    });
    return () => { console.log('[NavGuard] guard unregistered'); cleanup(); };
  }, [ctx]);
}

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const guardsRef = useRef<Set<Guard>>(new Set());
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const registerGuard = useCallback((guard: Guard) => {
    guardsRef.current.add(guard);
    return () => { guardsRef.current.delete(guard); };
  }, []);

  const isAnyDirty = useCallback(() => {
    const guards = Array.from(guardsRef.current);
    const dirtyStates = guards.map((g) => g.isDirty());
    console.log('[NavGuard] isAnyDirty', { guardCount: guards.length, dirtyStates });
    return dirtyStates.some(Boolean);
  }, []);

  const requestNavigation = useCallback((to: string) => {
    if (!isAnyDirty()) { navigate(to); return; }
    setPendingPath(to);
  }, [isAnyDirty, navigate]);

  const handleStay = () => setPendingPath(null);

  const handleDiscard = () => {
    const to = pendingPath;
    setPendingPath(null);
    if (to) navigate(to);
  };

  const handleSave = async () => {
    setSaving(true);
    let allOk = true;
    for (const guard of guardsRef.current) {
      if (!guard.isDirty()) continue;
      const ok = await guard.onSave().catch(() => false);
      if (!ok) { allOk = false; break; }
    }
    setSaving(false);
    if (allOk) {
      const to = pendingPath;
      setPendingPath(null);
      if (to) navigate(to);
    }
  };

  return (
    <NavigationGuardContext.Provider value={{ registerGuard, requestNavigation, isAnyDirty }}>
      {children}
      <AlertDialog open={pendingPath !== null} onOpenChange={(open) => { if (!open && !saving) handleStay(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this page. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleStay} disabled={saving}>Stay</AlertDialogCancel>
            <Button variant="ghost" onClick={handleDiscard} disabled={saving}>Discard</Button>
            <AlertDialogAction onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigationGuardContext.Provider>
  );
}
