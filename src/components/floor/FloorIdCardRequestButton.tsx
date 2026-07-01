import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { invokeFloorAction } from '@/floor/floorActionClient';
import { isFloorCockpitEnabled } from '@/floor/launchControl';
import { ID_CARD_PLAY_ID, ID_CARD_PLAY_VERSION } from '@/floor/spine/plays/idCardIssueInbound';

interface FloorIdCardRequestButtonProps {
  accountId: string;
  agencyWorkspaceId: string;
}

export function FloorIdCardRequestButton({ accountId, agencyWorkspaceId }: FloorIdCardRequestButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!isFloorCockpitEnabled()) {
    return null;
  }

  const clientRef = `account:${accountId.replace(/-/g, '')}`;

  async function handleClick() {
    setLoading(true);
    try {
      await invokeFloorAction({
        action: 'create_internal_package',
        agency_workspace_id: agencyWorkspaceId,
        idempotency_key: `crm:id-card:${accountId}:${new Date().toISOString().slice(0, 10)}`,
        play_id: ID_CARD_PLAY_ID,
        play_version: ID_CARD_PLAY_VERSION,
        clientRef,
        source: 'crm_button',
      });

      toast({
        title: 'ID card request queued',
        description: 'Open Lewis Floor cockpit from the header to review and approve.',
      });
    } catch (error) {
      toast({
        title: 'Floor request failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void handleClick()}>
      <CreditCard className="mr-1 h-4 w-4" aria-hidden="true" />
      Request ID card
    </Button>
  );
}
