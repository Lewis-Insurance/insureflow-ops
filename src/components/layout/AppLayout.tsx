import { ReactNode, useState } from 'react';
import { Sparkles } from 'lucide-react';
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
import { FloorCockpitDrawer } from '@/components/floor/FloorCockpitDrawer';
import { isFloorCockpitEnabled } from '@/floor/launchControl';
import { buildFloorCockpitInitialContext } from '@/floor/floorCockpitContext';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { useFloorAgentBinding } from '@/hooks/useFloorAgentBinding';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Calm Command global chrome shell (direction B). The rail, header, and command
 * palette are separate components composed here; the main content area is passed
 * through unchanged. Providers and overlays (AI assistant, messenger, floor
 * cockpit) are kept.
 */
function AppLayoutContent({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const { isModalOpen, openModal, closeModal, isSidebarOpen, openSidebar, closeSidebar, context } =
    useAIAssistantContext();
  const [isFloorCockpitOpen, setIsFloorCockpitOpen] = useState(false);
  const floorCockpitEnabled = isFloorCockpitEnabled();
  const { activeAgency } = useActiveAgency();
  const { data: floorAgentBinding } = useFloorAgentBinding();
  const floorInitialContext = floorCockpitEnabled
    ? buildFloorCockpitInitialContext({
        agentBinding: floorAgentBinding,
        agencyName: activeAgency?.agency?.name ?? null,
      })
    : null;

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
        <div className="flex items-center gap-2 border-b border-cc-border-subtle">
          <div className="min-w-0 flex-1">
            <AppHeader />
          </div>
          {floorCockpitEnabled && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsFloorCockpitOpen(true)}
              className="mr-4 shrink-0 gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Lewis Floor</span>
            </Button>
          )}
        </div>
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

      {/* Lewis Floor Cockpit: separate from legacy AI assistant and practice-safe by default. */}
      <FloorCockpitDrawer
        open={isFloorCockpitOpen}
        onOpenChange={setIsFloorCockpitOpen}
        initialContext={floorInitialContext}
        agencyWorkspaceId={activeAgency?.agency_workspace_id ?? null}
        actorId={user?.id ?? null}
        launchControlEnabled={floorCockpitEnabled}
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
