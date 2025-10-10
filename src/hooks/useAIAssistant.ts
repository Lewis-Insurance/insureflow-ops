import { useState } from 'react';

export function useAIAssistant() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);
  const toggleModal = () => setIsModalOpen(prev => !prev);

  const openSidebar = () => setIsSidebarOpen(true);
  const closeSidebar = () => setIsSidebarOpen(false);
  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

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
  };
}
