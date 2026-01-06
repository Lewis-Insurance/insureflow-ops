import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface MessengerContextValue {
  // Open/close state
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;

  // Selected conversation
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;

  // Convenience method to open messenger to a specific conversation
  openConversation: (conversationId: string) => void;

  // Close messenger
  close: () => void;

  // Track which conversation is currently being viewed (for focus detection)
  activeViewingConversationId: string | null;
  setActiveViewingConversationId: (id: string | null) => void;
}

const MessengerContext = createContext<MessengerContextValue | null>(null);

interface MessengerProviderProps {
  children: ReactNode;
}

export function MessengerProvider({ children }: MessengerProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activeViewingConversationId, setActiveViewingConversationId] = useState<string | null>(null);

  const openConversation = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedConversationId(null);
    setActiveViewingConversationId(null);
  }, []);

  return (
    <MessengerContext.Provider
      value={{
        isOpen,
        setIsOpen,
        selectedConversationId,
        setSelectedConversationId,
        openConversation,
        close,
        activeViewingConversationId,
        setActiveViewingConversationId,
      }}
    >
      {children}
    </MessengerContext.Provider>
  );
}

export function useMessenger() {
  const context = useContext(MessengerContext);
  if (!context) {
    throw new Error('useMessenger must be used within a MessengerProvider');
  }
  return context;
}

// Optional hook that doesn't throw if context is missing (for conditional usage)
export function useMessengerOptional() {
  return useContext(MessengerContext);
}
