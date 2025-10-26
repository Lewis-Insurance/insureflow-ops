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
import { LeadDetailView } from '@/components/crm/LeadDetailView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLeads } from '@/hooks/useLeads';
import { Plus, List, LayoutGrid } from 'lucide-react';

export default function Leads() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'kanban' | 'list'>('kanban');

  // Fetch leads data to get the selected lead
  const { data: leads = [] } = useLeads();

  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
  };

  const handleCreateSuccess = () => {
    setIsCreateDialogOpen(false);
  };

  // Find the selected lead from the leads data
  const selectedLead = selectedLeadId 
    ? leads.find(lead => lead.id === selectedLeadId) || null
    : null;

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

        {/* Lead Detail Panel */}
        <LeadDetailView
          lead={selectedLead as any}
          open={!!selectedLeadId}
          onOpenChange={(open) => !open && setSelectedLeadId(null)}
        />
      </div>
    </AppLayout>
  );
}
