import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useAutomationActions,
  useDeleteAutomationAction,
  type AutomationAction,
} from '@/integrations/supabase/hooks/useAutomationRules';
import { Plus, Trash2, Edit, Mail, MessageSquare, UserPlus, Tag, CheckSquare, ArrowDown } from 'lucide-react';
import { ActionConfigModal } from './ActionConfigModal';
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

interface ActionBuilderProps {
  ruleId: string;
}

export function ActionBuilder({ ruleId }: ActionBuilderProps) {
  const { data: actions, isLoading } = useAutomationActions(ruleId);
  const deleteAction = useDeleteAutomationAction();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<AutomationAction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const getActionIcon = (actionType: string) => {
    const icons: Record<string, any> = {
      send_email: Mail,
      send_sms: MessageSquare,
      assign_to: UserPlus,
      add_tag: Tag,
      remove_tag: Tag,
      create_task: CheckSquare,
      enroll_campaign: Mail,
      update_field: Edit,
    };
    const Icon = icons[actionType] || CheckSquare;
    return <Icon className="h-4 w-4" />;
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      send_email: 'Send Email',
      send_sms: 'Send SMS',
      assign_to: 'Assign To',
      add_tag: 'Add Tag',
      remove_tag: 'Remove Tag',
      create_task: 'Create Task',
      enroll_campaign: 'Enroll in Campaign',
      update_field: 'Update Field',
      webhook: 'Call Webhook',
    };
    return labels[actionType] || actionType;
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Actions</h3>
            <p className="text-sm text-muted-foreground">
              Actions will execute in order when the trigger fires
            </p>
          </div>
          <Button size="sm" onClick={() => {
            setEditingAction(null);
            setIsModalOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Action
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : actions?.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No actions configured yet</p>
              <p className="text-sm mt-2">Add an action to define what happens when this rule triggers</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {actions?.map((action, index) => (
              <div key={action.id}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                          {getActionIcon(action.action_type)}
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {getActionLabel(action.action_type)}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              Step {action.action_order + 1}
                            </Badge>
                            {action.delay_minutes > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Delay: {action.delay_minutes}min
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingAction(action);
                            setIsModalOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteId(action.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
                
                {index < (actions?.length || 0) - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ActionConfigModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        ruleId={ruleId}
        action={editingAction}
        nextOrder={actions?.length || 0}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this action? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  deleteAction.mutate({ id: deleteId, ruleId });
                  setDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
