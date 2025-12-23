/**
 * Document Collection Board
 * 
 * Displays a visual board of document requirements with status tiles.
 * Matches the design concept: tiles for each doc type showing status.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  MoreVertical,
  Plus,
  Send,
  Link2,
  Eye,
  RefreshCw,
  Bell,
  Inbox,
  FileCheck,
  FileClock,
  FileX,
  Mail,
  ExternalLink,
  Copy,
  Loader2,
} from 'lucide-react';
import {
  useCollectionPackets,
  useCollectionRequirements,
  useCollectionStatusSummary,
  useUpdateUploadStatus,
  useSendReminder,
  useAgentUpload,
  CollectionPacket,
  CollectionRequirement,
} from '@/hooks/useDocumentCollection';
import { CreatePacketModal } from './CreatePacketModal';
import { RequirementDetailModal } from './RequirementDetailModal';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { getDocType } from '@/config/documentTypes';

// =============================================================================
// DOC TYPE ICONS (dynamic from config, with fallback)
// =============================================================================

function getDocTypeIcon(docTypeKey: string): React.ElementType {
  const docType = getDocType(docTypeKey.toUpperCase());
  return docType?.icon || FileText;
}

const statusConfig: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  not_requested: { color: 'text-gray-500', bg: 'bg-gray-50', icon: Clock, label: 'Not Requested' },
  requested: { color: 'text-blue-600', bg: 'bg-blue-50', icon: Send, label: 'Requested' },
  uploaded: { color: 'text-amber-600', bg: 'bg-amber-50', icon: Upload, label: 'Uploaded' },
  processing: { color: 'text-purple-600', bg: 'bg-purple-50', icon: Loader2, label: 'Processing' },
  needs_review: { color: 'text-orange-600', bg: 'bg-orange-50', icon: Eye, label: 'Needs Review' },
  accepted: { color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2, label: 'Accepted' },
  rejected: { color: 'text-red-600', bg: 'bg-red-50', icon: XCircle, label: 'Rejected' },
  expired: { color: 'text-gray-400', bg: 'bg-gray-100', icon: AlertTriangle, label: 'Expired' },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface DocumentCollectionBoardProps {
  accountId: string;
  policyId?: string;
}

export function DocumentCollectionBoard({ accountId, policyId }: DocumentCollectionBoardProps) {
  const { toast } = useToast();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [selectedRequirement, setSelectedRequirement] = useState<CollectionRequirement | null>(null);

  const { data: packets = [], isLoading: packetsLoading } = useCollectionPackets(accountId);
  const activePackets = packets.filter(p => p.status !== 'archived');
  const archivedPackets = packets.filter(p => p.status === 'archived');

  // Auto-select first packet if none selected
  React.useEffect(() => {
    if (!selectedPacketId && activePackets.length > 0) {
      setSelectedPacketId(activePackets[0].id);
    }
  }, [activePackets, selectedPacketId]);

  const selectedPacket = packets.find(p => p.id === selectedPacketId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Document Collection</CardTitle>
          </div>
          <Button onClick={() => setCreateModalOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Packet
          </Button>
        </div>
        <CardDescription>
          Collect and track required documents from clients
        </CardDescription>
      </CardHeader>

      <CardContent>
        {packetsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : packets.length === 0 ? (
          <div className="text-center py-8">
            <Inbox className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No document collection packets yet</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={() => setCreateModalOpen(true)}
            >
              Create Your First Packet
            </Button>
          </div>
        ) : (
          <Tabs value={selectedPacketId || undefined} onValueChange={setSelectedPacketId}>
            <TabsList className="w-full justify-start overflow-auto">
              {activePackets.map(packet => (
                <TabsTrigger key={packet.id} value={packet.id} className="text-sm">
                  {packet.name}
                </TabsTrigger>
              ))}
              {archivedPackets.length > 0 && (
                <TabsTrigger value="archived" className="text-sm text-muted-foreground">
                  Archived ({archivedPackets.length})
                </TabsTrigger>
              )}
            </TabsList>

            {activePackets.map(packet => (
              <TabsContent key={packet.id} value={packet.id} className="mt-4">
                <PacketDetail 
                  packet={packet} 
                  onSelectRequirement={setSelectedRequirement}
                />
              </TabsContent>
            ))}

            {archivedPackets.length > 0 && (
              <TabsContent value="archived" className="mt-4">
                <div className="space-y-2">
                  {archivedPackets.map(packet => (
                    <div 
                      key={packet.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{packet.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Created {formatDistanceToNow(new Date(packet.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedPacketId(packet.id)}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </CardContent>

      <CreatePacketModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        accountId={accountId}
        policyId={policyId}
      />

      {selectedRequirement && (
        <RequirementDetailModal
          requirement={selectedRequirement}
          open={!!selectedRequirement}
          onOpenChange={(open) => !open && setSelectedRequirement(null)}
        />
      )}
    </Card>
  );
}

// =============================================================================
// PACKET DETAIL
// =============================================================================

interface PacketDetailProps {
  packet: CollectionPacket;
  onSelectRequirement: (req: CollectionRequirement) => void;
}

function PacketDetail({ packet, onSelectRequirement }: PacketDetailProps) {
  const { toast } = useToast();
  const { data: requirements = [], isLoading } = useCollectionRequirements(packet.id);
  const { data: statusSummary } = useCollectionStatusSummary(packet.id);
  const sendReminder = useSendReminder();

  const handleCopyLink = async () => {
    // This would get the portal URL - for now just show toast
    toast({
      title: 'Link Copied',
      description: 'Portal link has been copied to clipboard.',
    });
  };

  return (
    <div className="space-y-4">
      {/* Status Summary Bar */}
      {statusSummary && (
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                {statusSummary.completed_count} / {statusSummary.total_requirements} complete
              </span>
            </div>
            <Progress value={statusSummary.progress_percent} className="h-2" />
          </div>
          
          <Separator orientation="vertical" className="h-8" />
          
          <div className="flex items-center gap-3 text-sm">
            {statusSummary.pending_review_count > 0 && (
              <div className="flex items-center gap-1 text-orange-600">
                <Eye className="h-4 w-4" />
                <span>{statusSummary.pending_review_count} to review</span>
              </div>
            )}
            {statusSummary.rejected_count > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <XCircle className="h-4 w-4" />
                <span>{statusSummary.rejected_count} rejected</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCopyLink}
            >
              <Link2 className="h-4 w-4 mr-1" />
              Copy Link
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => sendReminder.mutate(packet.id)}
              disabled={sendReminder.isPending}
            >
              {sendReminder.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Bell className="h-4 w-4 mr-1" />
              )}
              Remind
            </Button>
          </div>
        </div>
      )}

      {/* Requirements Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {requirements.map(req => (
            <RequirementTile 
              key={req.id} 
              requirement={req} 
              onClick={() => onSelectRequirement(req)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// REQUIREMENT TILE
// =============================================================================

interface RequirementTileProps {
  requirement: CollectionRequirement;
  onClick: () => void;
}

function RequirementTile({ requirement, onClick }: RequirementTileProps) {
  const status = statusConfig[requirement.status] || statusConfig.not_requested;
  const Icon = getDocTypeIcon(requirement.doc_type);
  const StatusIcon = status.icon;
  
  const uploadCount = requirement.collection_uploads?.length || 0;
  const lastUpload = requirement.collection_uploads?.[0];

  return (
    <div
      onClick={onClick}
      className={`
        relative p-4 rounded-lg border-2 cursor-pointer transition-all
        hover:shadow-md hover:border-blue-300
        ${status.bg} border-transparent
      `}
    >
      {/* Required indicator */}
      {requirement.is_required && (
        <div className="absolute top-2 right-2">
          <span className="text-xs text-red-500 font-medium">Required</span>
        </div>
      )}

      {/* Icon and Label */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`p-2 rounded-lg bg-white shadow-sm ${status.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{requirement.label}</p>
          <p className="text-xs text-muted-foreground">
            {requirement.doc_type.replace(/_/g, ' ').toUpperCase()}
          </p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 ${status.color}`}>
          <StatusIcon className={`h-4 w-4 ${requirement.status === 'processing' ? 'animate-spin' : ''}`} />
          <span className="text-xs font-medium">{status.label}</span>
        </div>
        
        {uploadCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {uploadCount} file{uploadCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Last activity */}
      {lastUpload && (
        <p className="text-xs text-muted-foreground mt-2 truncate">
          {formatDistanceToNow(new Date(lastUpload.created_at), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}

export default DocumentCollectionBoard;

