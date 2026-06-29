import { ReactNode } from 'react';
import { useAIAssistantContext, AIAssistantProvider } from '@/contexts/AIAssistantContext';
import { MessengerProvider } from '@/contexts/MessengerContext';
import { useGlobalMessageNotifications } from '@/hooks/useGlobalMessageNotifications';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { AIAssistantSidebar } from '@/components/ai/AIAssistantSidebar';
import { FloatingMessenger } from '@/components/messaging/FloatingMessenger';
import { NewLeadBanner } from '@/components/leads/NewLeadBanner';
import { ChromeProvider } from './chrome/ChromeContext';
import { AppRail } from './chrome/AppRail';
import { AppHeader } from './chrome/AppHeader';
import { CommandPalette } from './chrome/CommandPalette';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Calm Command global chrome shell (direction B). The rail, header, and command
 * palette are separate components composed here; the main content area is passed
 * through unchanged. Providers and overlays (AI assistant, messenger) are kept.
 */
function AppLayoutContent({ children }: AppLayoutProps) {
  const { isModalOpen, openModal, closeModal, isSidebarOpen, openSidebar, closeSidebar, context } =
    useAIAssistantContext();

  useGlobalMessageNotifications();

  return (
    <div className="flex min-h-screen w-full bg-cc-bg text-cc-text-primary">
      {/* Skip to content (keyboard + landmarks) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-cc-md focus:bg-cc-surface-overlay focus:px-4 focus:py-2 focus:text-cc-text-primary focus:outline focus:outline-2 focus:outline-cc-accent"
      >
        Skip to content
      </a>

      <AppRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <NewLeadBanner />
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Global command palette (Cmd-K) */}
      <CommandPalette />

      {/* Overlays (unchanged behavior) */}
      <AIAssistantModal
        open={isModalOpen}
        onOpenChange={(open) => (open ? openModal() : closeModal())}
        context={context}
      />
      <AIAssistantSidebar
        open={isSidebarOpen}
        onOpenChange={(open) => (open ? openSidebar() : closeSidebar())}
        context={context}
      />
      <FloatingMessenger />
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <AIAssistantProvider>
      <MessengerProvider>
        <ChromeProvider>
          <AppLayoutContent>{children}</AppLayoutContent>
        </ChromeProvider>
      </MessengerProvider>
    </AIAssistantProvider>
  );
}
