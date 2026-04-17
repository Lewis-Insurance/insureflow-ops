import { createContext, useContext } from 'react';

export interface AORenewalDirtyRegistration {
  id: string;
  label: string;
  isDirty: () => boolean;
  save: () => Promise<boolean>;
}

export interface AORenewalEditorContextValue {
  registerDirtySource: (registration: AORenewalDirtyRegistration) => () => void;
}

export const AORenewalEditorContext = createContext<AORenewalEditorContextValue | null>(null);

export function useAORenewalEditor() {
  return useContext(AORenewalEditorContext);
}
