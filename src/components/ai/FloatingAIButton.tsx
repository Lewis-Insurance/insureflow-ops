import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bot } from 'lucide-react';
import { AIAssistantModal } from './AIAssistantModal';
import { useAIAssistant } from '@/hooks/useAIAssistant';

export function FloatingAIButton() {
  const { isModalOpen, openModal, closeModal } = useAIAssistant();

  return (
    <>
      <Button
        onClick={openModal}
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        aria-label="Open AI Assistant"
      >
        <Bot className="h-6 w-6" />
      </Button>

      <AIAssistantModal open={isModalOpen} onOpenChange={(open) => open ? openModal() : closeModal()} />
    </>
  );
}
