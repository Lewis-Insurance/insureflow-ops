import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Edit,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle,
  Settings,
} from 'lucide-react';
import { useTaskTemplates, TaskTemplate, TriggerEvent } from '@/hooks/useTaskTemplates';
import { TaskTemplateForm } from './TaskTemplateForm';
import { SeedTemplates } from './SeedTemplates';
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

export function TaskTemplateManager() {
  const {
    templates,
    loading,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useTaskTemplates();

  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [filterEvent, setFilterEvent] = useState<string>('all');

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreateTemplate = async (templateData: Partial<TaskTemplate>) => {
    await createTemplate(templateData);
  };

  const handleUpdateTemplate = async (templateData: Partial<TaskTemplate>) => {
    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, templateData);
      setEditingTemplate(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (templateToDelete) {
      await deleteTemplate(templateToDelete);
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    }
  };

  const getTriggerEventLabel = (event: TriggerEvent) => {
    const labels: Record<TriggerEvent, string> = {
      manual: 'Manual',
      quote_requested: 'Quote Requested',
      quote_accepted: 'Quote Accepted',
      policy_issued: 'Policy Issued',
      policy_renewal_due: 'Renewal Due',
      claim_filed: 'Claim Filed',
      payment_overdue: 'Payment Overdue',
      service_request: 'Service Request',
    };
    return labels[event] || event;
  };

  const filteredTemplates = filterEvent === 'all'
    ? templates
    : templates.filter(t => t.trigger_event === filterEvent);

  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const event = template.trigger_event;
    if (!acc[event]) acc[event] = [];
    acc[event].push(template);
    return acc;
  }, {} as Record<string, TaskTemplate[]>);

  return (
    <>
      <div className="space-y-6">
        {/* Seed Templates Quick Start */}
        {templates.length === 0 && <SeedTemplates />}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Task Templates</h2>
            <p className="text-muted-foreground">
              Configure automatic task generation for business events
            </p>
          </div>
          <Button onClick={() => {
            setEditingTemplate(null);
            setFormOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter by Event:</span>
          </div>
          <Select value={filterEvent} onValueChange={setFilterEvent}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="quote_requested">Quote Requested</SelectItem>
              <SelectItem value="quote_accepted">Quote Accepted</SelectItem>
              <SelectItem value="policy_issued">Policy Issued</SelectItem>
              <SelectItem value="policy_renewal_due">Renewal Due</SelectItem>
              <SelectItem value="claim_filed">Claim Filed</SelectItem>
              <SelectItem value="payment_overdue">Payment Overdue</SelectItem>
              <SelectItem value="service_request">Service Request</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
        ) : Object.keys(groupedTemplates).length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Templates Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first task template to automate task generation
              </p>
              <Button onClick={() => {
                setEditingTemplate(null);
                setFormOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTemplates).map(([event, eventTemplates]) => (
              <Card key={event}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      <CardTitle>{getTriggerEventLabel(event as TriggerEvent)}</CardTitle>
                      <Badge variant="secondary">
                        {eventTemplates.length} template{eventTemplates.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {eventTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{template.name}</h4>
                            {template.is_active ? (
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Inactive
                              </Badge>
                            )}
                            <Badge variant="outline" className="capitalize">
                              {template.priority}
                            </Badge>
                            <Badge variant="outline">{template.category}</Badge>
                          </div>
                          {template.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {template.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {template.estimated_duration_hours && (
                              <span>Due in {template.estimated_duration_hours}h</span>
                            )}
                            <span>Order: {template.task_order}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingTemplate(template);
                              setFormOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setTemplateToDelete(template.id);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <TaskTemplateForm
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editingTemplate}
        onSubmit={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the task template. This action cannot be undone.
              Existing tasks created from this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
