import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import {
    Loader2,
    FileText,
    CheckCircle2,
    XCircle,
    Clock,
    Trash2,
    Link as LinkIcon,
    Unlink,
    MoreHorizontal,
    ExternalLink
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EntityBadge } from './EntityBadge';
import { LinkWorkspaceDialog } from './LinkWorkspaceDialog';
import { useDeleteWorkspace } from '@/hooks/useWorkspaces';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { WorkspaceWithEntities } from '@/types/workspace';

interface WorkspaceItemProps {
    workspace: WorkspaceWithEntities;
    onClick?: () => void;
    selected?: boolean;
    onSelect?: (selected: boolean) => void;
}

// Local hook for unlinking workspace
function useUnlinkWorkspace() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (workspaceId: string) => {
            const { data, error } = await supabase
                .from('workspaces')
                .update({
                    account_id: null,
                    lead_id: null,
                    policy_id: null,
                })
                .eq('id', workspaceId)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (_, workspaceId) => {
            queryClient.invalidateQueries({ queryKey: ['workspaces'] });
            queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
            toast({
                title: 'Workspace unlinked',
                description: 'Entity link removed',
            });
        },
        onError: (error: Error) => {
            toast({
                title: 'Error unlinking workspace',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
}

export function WorkspaceItem({ workspace, onClick, selected, onSelect }: WorkspaceItemProps) {
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const deleteWorkspace = useDeleteWorkspace();
    const unlinkWorkspace = useUnlinkWorkspace();

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'processing':
                return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
            case 'completed':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-500" />;
            default:
                return <Clock className="h-4 w-4 text-gray-500" />;
        }
    };

    const getStatusBadge = (status: string) => {
        const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
            idle: { variant: 'outline' },
            processing: { variant: 'default', className: 'bg-blue-500' },
            completed: { variant: 'secondary', className: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' },
            failed: { variant: 'destructive' },
        };
        const { variant, className } = config[status] || config.idle;
        return <Badge variant={variant} className={className}>{status}</Badge>;
    };

    const handleDelete = () => {
        deleteWorkspace.mutate(workspace.id);
        setShowDeleteDialog(false);
    };

    const handleUnlink = () => {
        unlinkWorkspace.mutate(workspace.id);
    };

    return (
        <>
            <div
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group"
                onClick={onClick}
            >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Selection checkbox */}
                    {onSelect && (
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                                e.stopPropagation();
                                onSelect(e.target.checked);
                            }}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                    )}

                    {/* Status icon */}
                    <div className="mt-0.5">
                        {getStatusIcon(workspace.status)}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base truncate">{workspace.name}</h3>
                            {getStatusBadge(workspace.status)}
                        </div>

                        {/* Entity badge - THE KEY ADDITION */}
                        <div className="flex items-center gap-2">
                            <EntityBadge workspace={workspace} />
                        </div>

                        {/* Metadata grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm">
                            <div>
                                <span className="text-muted-foreground">Type:</span>{' '}
                                <span className="font-medium">{workspace.task_type}</span>
                            </div>

                            <div>
                                <span className="text-muted-foreground">User:</span>{' '}
                                <span className="font-medium">{workspace.creator_name || 'Unknown'}</span>
                            </div>

                            <div>
                                <span className="text-muted-foreground">Updated:</span>{' '}
                                <span className="font-medium">
                                    {formatDistanceToNow(new Date(workspace.updated_at), { addSuffix: true })}
                                </span>
                            </div>

                            {/* Show policy details if linked */}
                            {workspace.policy_number && (
                                <div>
                                    <span className="text-muted-foreground">Policy:</span>{' '}
                                    <span className="font-medium">{workspace.policy_number}</span>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        {workspace.notes && (
                            <p className="text-sm text-muted-foreground truncate">{workspace.notes}</p>
                        )}

                        {/* Timestamp */}
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(workspace.updated_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                setShowLinkDialog(true);
                            }}>
                                <LinkIcon className="h-4 w-4 mr-2" />
                                {workspace.linked_entity_type ? 'Change Link' : 'Link to Record'}
                            </DropdownMenuItem>

                            {workspace.linked_entity_type && (
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnlink();
                                }}>
                                    <Unlink className="h-4 w-4 mr-2" />
                                    Unlink
                                </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            <DropdownMenuItem asChild>
                                <Link to={`/workspace/${workspace.id}`} onClick={(e) => e.stopPropagation()}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    View Details
                                </Link>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDeleteDialog(true);
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
            </div>

            {/* Link Dialog */}
            <LinkWorkspaceDialog
                workspace={workspace}
                open={showLinkDialog}
                onOpenChange={setShowLinkDialog}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete "{workspace.name}" and all associated data.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteWorkspace.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                'Delete'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
