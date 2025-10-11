import { createContext, useContext, ReactNode } from 'react';
import { useAIAssistant, AIContext } from '@/hooks/useAIAssistant';

interface AIAssistantContextType {
  isModalOpen: boolean;
  openModal: (ctx?: AIContext) => void;
  closeModal: () => void;
  toggleModal: (ctx?: AIContext) => void;
  isSidebarOpen: boolean;
  openSidebar: (ctx?: AIContext) => void;
  closeSidebar: () => void;
  toggleSidebar: (ctx?: AIContext) => void;
  context: AIContext | null;
  setContext: (ctx: AIContext | null) => void;
}

const AIAssistantContext = createContext<AIAssistantContextType | undefined>(undefined);

export function AIAssistantProvider({ children }: { children: ReactNode }) {
  const aiAssistant = useAIAssistant();
  
  return (
    <AIAssistantContext.Provider value={aiAssistant}>
      {children}
    </AIAssistantContext.Provider>
  );
}

export function useAIAssistantContext() {
  const context = useContext(AIAssistantContext);
  if (context === undefined) {
    throw new Error('useAIAssistantContext must be used within an AIAssistantProvider');
  }
  return context;
}
