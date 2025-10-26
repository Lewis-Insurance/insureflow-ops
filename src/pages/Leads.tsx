import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LeadCaptureForm } from '@/components/crm/LeadCaptureForm';
import { LeadsList } from '@/components/leads/LeadsList';
import { PipelineKanban } from '@/components/leads/PipelineKanban';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, List, LayoutGrid } from 'lucide-react';

export default function Leads() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'kanban' | 'list'>('kanban');

  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
    // TODO: Open lead detail panel/drawer
    console.log('Selected lead:', leadId);
  };

  const handleCreateSuccess = () => {
    setIsCreateDialogOpen(false);
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leads</h1>
            <p className="text-muted-foreground">
              Manage your sales pipeline and track lead progress
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={activeView === 'kanban' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveView('kanban')}
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              Pipeline
            </Button>
            <Button
              variant={activeView === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveView('list')}
            >
              <List className="mr-2 h-4 w-4" />
              List
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Lead
            </Button>
          </div>
        </div>

        {/* Content */}
        <div>
          {activeView === 'kanban' ? (
            <PipelineKanban onLeadClick={handleLeadSelect} />
          ) : (
            <LeadsList
              onLeadSelect={handleLeadSelect}
              onCreateLead={() => setIsCreateDialogOpen(true)}
            />
          )}
        </div>

        {/* Create Lead Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Lead</DialogTitle>
              <DialogDescription>
                Capture a new lead and add them to your pipeline
              </DialogDescription>
            </DialogHeader>
            <LeadCaptureForm onSuccess={handleCreateSuccess} />
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
