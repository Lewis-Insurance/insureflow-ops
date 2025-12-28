/**
 * Coverage Limit Standards Editor
 *
 * Allows agency admins to customize the minimum/good/excellent thresholds
 * for coverage limit scoring. System defaults cannot be deleted, only overridden.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Trash2, RefreshCw, Building2 } from 'lucide-react';
import {
  useAllCoverageLimitStandards,
  useCreateCoverageLimitStandard,
  useUpdateCoverageLimitStandard,
  useDeleteCoverageLimitStandard,
  formatLimitAmount,
  type CoverageLimitStandard,
  type CreateCoverageLimitStandardInput,
} from '@/hooks/useCoverageLimitStandards';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';

const LINES_OF_BUSINESS = [
  { value: 'auto', label: 'Auto' },
  { value: 'home', label: 'Homeowners' },
  { value: 'commercial', label: 'Commercial' },
];

const PARSE_MODES = [
  { value: 'single', label: 'Single Limit' },
  { value: 'per_person', label: 'Per Person (split limit)' },
  { value: 'per_occurrence', label: 'Per Occurrence (split limit)' },
  { value: 'aggregate', label: 'Aggregate' },
];

export function CoverageLimitStandardsEditor() {
  const { agency } = useActiveAgency();
  const { data: standards, isLoading, refetch } = useAllCoverageLimitStandards();
  const createStandard = useCreateCoverageLimitStandard();
  const updateStandard = useUpdateCoverageLimitStandard();
  const deleteStandard = useDeleteCoverageLimitStandard();

  const [selectedLOB, setSelectedLOB] = useState('auto');
  const [editingStandard, setEditingStandard] = useState<CoverageLimitStandard | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state for create/edit
  const [formData, setFormData] = useState<CreateCoverageLimitStandardInput>({
    coverage_type: '',
    line_of_business: 'auto',
    min_recommended: 0,
    good_limit: 0,
    excellent_limit: 0,
    limit_parse_mode: 'single',
  });

  const filteredStandards = standards?.filter(s => s.line_of_business === selectedLOB) || [];

  const handleCreate = async () => {
    await createStandard.mutateAsync(formData);
    setIsCreateOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingStandard) return;
    await updateStandard.mutateAsync({
      id: editingStandard.id,
      min_recommended: formData.min_recommended,
      good_limit: formData.good_limit,
      excellent_limit: formData.excellent_limit,
      limit_parse_mode: formData.limit_parse_mode,
    });
    setEditingStandard(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coverage standard? The system default will be used instead.')) return;
    await deleteStandard.mutateAsync(id);
  };

  const resetForm = () => {
    setFormData({
      coverage_type: '',
      line_of_business: selectedLOB,
      min_recommended: 0,
      good_limit: 0,
      excellent_limit: 0,
      limit_parse_mode: 'single',
    });
  };

  const startEdit = (standard: CoverageLimitStandard) => {
    setEditingStandard(standard);
    setFormData({
      coverage_type: standard.coverage_type,
      line_of_business: standard.line_of_business,
      min_recommended: standard.min_recommended,
      good_limit: standard.good_limit,
      excellent_limit: standard.excellent_limit,
      limit_parse_mode: standard.limit_parse_mode,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Coverage Limit Standards
              {agency && (
                <Badge variant="outline" className="font-normal">
                  <Building2 className="h-3 w-3 mr-1" />
                  {agency.name}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Define minimum, good, and excellent thresholds for coverage limits.
              Agency-specific standards override system defaults.
            </CardDescription>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedLOB} onValueChange={setSelectedLOB}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              {LINES_OF_BUSINESS.map(lob => (
                <TabsTrigger key={lob.value} value={lob.value}>
                  {lob.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setFormData(f => ({ ...f, line_of_business: selectedLOB })); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Standard
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Coverage Standard</DialogTitle>
                  <DialogDescription>
                    Create an agency-specific coverage limit standard.
                  </DialogDescription>
                </DialogHeader>
                <StandardForm
                  formData={formData}
                  setFormData={setFormData}
                  isCreate
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createStandard.isPending}>
                    {createStandard.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {LINES_OF_BUSINESS.map(lob => (
            <TabsContent key={lob.value} value={lob.value}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coverage Type</TableHead>
                    <TableHead>Min Recommended</TableHead>
                    <TableHead>Good</TableHead>
                    <TableHead>Excellent</TableHead>
                    <TableHead>Parse Mode</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStandards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No coverage standards for {lob.label}. Add one to customize scoring.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStandards.map(standard => (
                      <TableRow key={standard.id}>
                        <TableCell className="font-medium">{standard.coverage_type}</TableCell>
                        <TableCell>{formatLimitAmount(standard.min_recommended)}</TableCell>
                        <TableCell>{formatLimitAmount(standard.good_limit)}</TableCell>
                        <TableCell>{formatLimitAmount(standard.excellent_limit)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {PARSE_MODES.find(m => m.value === standard.limit_parse_mode)?.label || standard.limit_parse_mode}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {standard.agency_workspace_id ? (
                            <Badge variant="default" className="text-xs">Agency</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">System</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(standard)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            {standard.agency_workspace_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(standard.id)}
                                disabled={deleteStandard.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          ))}
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={!!editingStandard} onOpenChange={(open) => !open && setEditingStandard(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Coverage Standard</DialogTitle>
              <DialogDescription>
                {editingStandard?.agency_workspace_id
                  ? 'Update your agency-specific coverage limits.'
                  : 'Create an agency override for this system default.'}
              </DialogDescription>
            </DialogHeader>
            <StandardForm
              formData={formData}
              setFormData={setFormData}
              isCreate={false}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingStandard(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updateStandard.isPending}>
                {updateStandard.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Form component for creating/editing standards
function StandardForm({
  formData,
  setFormData,
  isCreate,
}: {
  formData: CreateCoverageLimitStandardInput;
  setFormData: React.Dispatch<React.SetStateAction<CreateCoverageLimitStandardInput>>;
  isCreate: boolean;
}) {
  return (
    <div className="space-y-4 py-4">
      {isCreate && (
        <>
          <div className="space-y-2">
            <Label>Coverage Type</Label>
            <Input
              placeholder="e.g., BI, PD, COMP, Dwelling, GL"
              value={formData.coverage_type}
              onChange={(e) => setFormData(f => ({ ...f, coverage_type: e.target.value.toUpperCase() }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Line of Business</Label>
            <Select
              value={formData.line_of_business}
              onValueChange={(v) => setFormData(f => ({ ...f, line_of_business: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINES_OF_BUSINESS.map(lob => (
                  <SelectItem key={lob.value} value={lob.value}>{lob.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Minimum Recommended</Label>
          <Input
            type="number"
            placeholder="50000"
            value={formData.min_recommended || ''}
            onChange={(e) => setFormData(f => ({ ...f, min_recommended: parseInt(e.target.value) || 0 }))}
          />
          <p className="text-xs text-muted-foreground">Below = 0 pts</p>
        </div>
        <div className="space-y-2">
          <Label>Good Limit</Label>
          <Input
            type="number"
            placeholder="100000"
            value={formData.good_limit || ''}
            onChange={(e) => setFormData(f => ({ ...f, good_limit: parseInt(e.target.value) || 0 }))}
          />
          <p className="text-xs text-muted-foreground">At/above = 8 pts</p>
        </div>
        <div className="space-y-2">
          <Label>Excellent Limit</Label>
          <Input
            type="number"
            placeholder="250000"
            value={formData.excellent_limit || ''}
            onChange={(e) => setFormData(f => ({ ...f, excellent_limit: parseInt(e.target.value) || 0 }))}
          />
          <p className="text-xs text-muted-foreground">At/above = 10 pts</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Limit Parse Mode</Label>
        <Select
          value={formData.limit_parse_mode}
          onValueChange={(v: any) => setFormData(f => ({ ...f, limit_parse_mode: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARSE_MODES.map(mode => (
              <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          How to parse limits like "100/300/50"
        </p>
      </div>
    </div>
  );
}
