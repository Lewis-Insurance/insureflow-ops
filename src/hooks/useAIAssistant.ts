import { useState } from 'react';

export interface AIContext {
  type: 'account' | 'policy' | 'quote' | 'task';
  id: string;
  name: string;
  metadata?: Record<string, any>;
}

export function useAIAssistant() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [context, setContext] = useState<AIContext | null>(null);

  const openModal = (ctx?: AIContext) => {
    if (ctx) setContext(ctx);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    // Clear context after a delay to avoid visual flash
    setTimeout(() => setContext(null), 300);
  };

  const toggleModal = (ctx?: AIContext) => {
    if (ctx) setContext(ctx);
    setIsModalOpen(prev => !prev);
  };

  const openSidebar = (ctx?: AIContext) => {
    if (ctx) setContext(ctx);
    setIsSidebarOpen(true);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
    setTimeout(() => setContext(null), 300);
  };

  const toggleSidebar = (ctx?: AIContext) => {
    if (ctx) setContext(ctx);
    setIsSidebarOpen(prev => !prev);
  };

  return {
    // Modal
    isModalOpen,
    openModal,
    closeModal,
    toggleModal,
    
    // Sidebar
    isSidebarOpen,
    openSidebar,
    closeSidebar,
    toggleSidebar,

    // Context
    context,
    setContext,
  };
}
