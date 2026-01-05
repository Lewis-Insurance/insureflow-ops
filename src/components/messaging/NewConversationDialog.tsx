import { useState } from 'react';
import { Check, Users, MessageSquare, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useCreateConversation, useTeamMembers } from '@/hooks/useTeamMessaging';
import { useAuth } from '@/hooks/useAuth';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyWorkspaceId: string | null;
  onConversationCreated: (conversationId: string) => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function NewConversationDialog({
  open,
  onOpenChange,
  agencyWorkspaceId,
  onConversationCreated,
}: NewConversationDialogProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [channelName, setChannelName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: teamMembers } = useTeamMembers(agencyWorkspaceId);
  const createConversation = useCreateConversation();

  // Filter out current user and filter by search
  const filteredMembers = teamMembers?.filter((member) => {
    if (member.id === user?.id) return false;
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      member.full_name?.toLowerCase().includes(searchLower) ||
      member.email?.toLowerCase().includes(searchLower)
    );
  }) || [];

  const toggleUser = (userId: string) => {
    if (tab === 'direct') {
      // For DMs, only allow one selection
      setSelectedUsers(selectedUsers[0] === userId ? [] : [userId]);
    } else {
      // For groups, allow multiple
      setSelectedUsers(
        selectedUsers.includes(userId)
          ? selectedUsers.filter((id) => id !== userId)
          : [...selectedUsers, userId]
      );
    }
  };

  const handleCreate = async () => {
    if (!agencyWorkspaceId) return;

    if (tab === 'direct' && selectedUsers.length !== 1) return;
    if (tab === 'group' && (selectedUsers.length === 0 || !channelName.trim())) return;

    try {
      const result = await createConversation.mutateAsync({
        type: tab,
        name: tab === 'group' ? channelName.trim() : undefined,
        participantIds: selectedUsers,
        agencyWorkspaceId,
      });

      onConversationCreated(result.id);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      // Error handled by hook
    }
  };

  const resetForm = () => {
    setSelectedUsers([]);
    setChannelName('');
    setSearchQuery('');
    setTab('direct');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Start a direct message or create a group channel
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => {
          setTab(v as 'direct' | 'group');
          setSelectedUsers([]);
        }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Direct Message
            </TabsTrigger>
            <TabsTrigger value="group" className="gap-2">
              <Users className="h-4 w-4" />
              Group Channel
            </TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="mt-4">
            <div className="space-y-4">
              <div>
                <Label>Search team members</Label>
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <ScrollArea className="h-64 border rounded-lg">
                {filteredMembers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No team members found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => toggleUser(member.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                          selectedUsers.includes(member.id)
                            ? 'bg-primary/10'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-xs">
                            {getInitials(member.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-medium truncate">
                            {member.full_name || member.email}
                          </p>
                          {member.full_name && member.email && (
                            <p className="text-xs text-muted-foreground truncate">
                              {member.email}
                            </p>
                          )}
                        </div>
                        {selectedUsers.includes(member.id) && (
                          <Check className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="group" className="mt-4">
            <div className="space-y-4">
              <div>
                <Label>Channel name</Label>
                <Input
                  placeholder="e.g., Sales Team, Commercial Lines..."
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Add members</Label>
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((userId) => {
                    const member = teamMembers?.find((m) => m.id === userId);
                    return (
                      <button
                        key={userId}
                        onClick={() => toggleUser(userId)}
                        className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full text-sm"
                      >
                        {member?.full_name || member?.email || 'Unknown'}
                        <span className="text-muted-foreground">&times;</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <ScrollArea className="h-48 border rounded-lg">
                {filteredMembers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No team members found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => toggleUser(member.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                          selectedUsers.includes(member.id)
                            ? 'bg-primary/10'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(member.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.full_name || member.email}
                          </p>
                        </div>
                        {selectedUsers.includes(member.id) && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              createConversation.isPending ||
              (tab === 'direct' && selectedUsers.length !== 1) ||
              (tab === 'group' && (selectedUsers.length === 0 || !channelName.trim()))
            }
          >
            {createConversation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
