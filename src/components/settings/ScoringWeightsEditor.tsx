/**
 * Scoring Weights Editor
 *
 * Allows agency admins to create and manage scoring weight profiles.
 * Weights must sum to 100 and determine the relative importance of each dimension.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Edit2,
  Trash2,
  Star,
  Check,
  AlertCircle,
  DollarSign,
  Shield,
  Trophy,
  Wrench,
  TrendingUp,
  Building2,
  RefreshCw,
} from 'lucide-react';
import {
  useAgencyScoringProfiles,
  useCreateScoringProfile,
  useUpdateScoringProfile,
  useDeleteScoringProfile,
  useSetDefaultProfile,
  validateWeightsSum,
  getWeightDimensionLabel,
  getWeightDimensionColor,
  DEFAULT_WEIGHTS,
  type ScoringWeightProfile,
  type CreateScoringWeightProfileInput,
} from '@/hooks/useScoringWeightProfiles';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';

interface WeightFormData {
  name: string;
  price_weight: number;
  coverage_weight: number;
  carrier_weight: number;
  deductible_weight: number;
  value_weight: number;
}

const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  price_weight: <DollarSign className="h-4 w-4 text-green-600" />,
  coverage_weight: <Shield className="h-4 w-4 text-blue-600" />,
  carrier_weight: <Trophy className="h-4 w-4 text-yellow-600" />,
  deductible_weight: <Wrench className="h-4 w-4 text-purple-600" />,
  value_weight: <TrendingUp className="h-4 w-4 text-orange-600" />,
};

export function ScoringWeightsEditor() {
  const { agency } = useActiveAgency();
  const { data: profiles, isLoading, refetch } = useAgencyScoringProfiles();
  const createProfile = useCreateScoringProfile();
  const updateProfile = useUpdateScoringProfile();
  const deleteProfile = useDeleteScoringProfile();
  const setDefaultProfile = useSetDefaultProfile();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ScoringWeightProfile | null>(null);

  const [formData, setFormData] = useState<WeightFormData>({
    name: '',
    price_weight: DEFAULT_WEIGHTS.price_weight,
    coverage_weight: DEFAULT_WEIGHTS.coverage_weight,
    carrier_weight: DEFAULT_WEIGHTS.carrier_weight,
    deductible_weight: DEFAULT_WEIGHTS.deductible_weight,
    value_weight: DEFAULT_WEIGHTS.value_weight,
  });

  const weightsValidation = validateWeightsSum({
    price_weight: formData.price_weight,
    coverage_weight: formData.coverage_weight,
    carrier_weight: formData.carrier_weight,
    deductible_weight: formData.deductible_weight,
    value_weight: formData.value_weight,
  });

  const handleCreate = async () => {
    if (!weightsValidation.valid) return;
    await createProfile.mutateAsync(formData as CreateScoringWeightProfileInput);
    setIsCreateOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingProfile || !weightsValidation.valid) return;
    await updateProfile.mutateAsync({
      id: editingProfile.id,
      name: formData.name,
      price_weight: formData.price_weight,
      coverage_weight: formData.coverage_weight,
      carrier_weight: formData.carrier_weight,
      deductible_weight: formData.deductible_weight,
      value_weight: formData.value_weight,
    });
    setEditingProfile(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scoring profile? Quotes using this profile will fall back to agency default.')) return;
    await deleteProfile.mutateAsync(id);
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultProfile.mutateAsync(id);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price_weight: DEFAULT_WEIGHTS.price_weight,
      coverage_weight: DEFAULT_WEIGHTS.coverage_weight,
      carrier_weight: DEFAULT_WEIGHTS.carrier_weight,
      deductible_weight: DEFAULT_WEIGHTS.deductible_weight,
      value_weight: DEFAULT_WEIGHTS.value_weight,
    });
  };

  const startEdit = (profile: ScoringWeightProfile) => {
    setEditingProfile(profile);
    setFormData({
      name: profile.name,
      price_weight: profile.price_weight,
      coverage_weight: profile.coverage_weight,
      carrier_weight: profile.carrier_weight,
      deductible_weight: profile.deductible_weight,
      value_weight: profile.value_weight,
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
              Scoring Weight Profiles
              {agency && (
                <Badge variant="outline" className="font-normal">
                  <Building2 className="h-3 w-3 mr-1" />
                  {agency.name}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Customize how quote dimensions are weighted in the overall score.
              Weights must sum to 100.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Scoring Profile</DialogTitle>
                  <DialogDescription>
                    Define custom weights for quote scoring dimensions.
                  </DialogDescription>
                </DialogHeader>
                <WeightForm
                  formData={formData}
                  setFormData={setFormData}
                  validation={weightsValidation}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!weightsValidation.valid || createProfile.isPending}
                  >
                    {createProfile.isPending ? 'Creating...' : 'Create Profile'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!profiles || profiles.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <p className="mb-4">No scoring profiles yet. Create one to customize quote ranking.</p>
            <p className="text-sm">System defaults: Price 30%, Coverage 25%, Carrier 20%, Deductible 15%, Value 10%</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile Name</TableHead>
                <TableHead>Weight Distribution</TableHead>
                <TableHead className="text-center">Default</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map(profile => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.name}</TableCell>
                  <TableCell>
                    <WeightDistributionBar profile={profile} />
                  </TableCell>
                  <TableCell className="text-center">
                    {profile.is_default ? (
                      <Badge variant="default" className="gap-1">
                        <Star className="h-3 w-3" />
                        Default
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(profile.id)}
                        disabled={setDefaultProfile.isPending}
                      >
                        Set as Default
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(profile)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(profile.id)}
                        disabled={deleteProfile.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingProfile} onOpenChange={(open) => !open && setEditingProfile(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Scoring Profile</DialogTitle>
              <DialogDescription>
                Update the weights for "{editingProfile?.name}".
              </DialogDescription>
            </DialogHeader>
            <WeightForm
              formData={formData}
              setFormData={setFormData}
              validation={weightsValidation}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingProfile(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={!weightsValidation.valid || updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Weight distribution visualization bar
function WeightDistributionBar({ profile }: { profile: ScoringWeightProfile }) {
  const dimensions = [
    { key: 'price_weight', value: profile.price_weight, color: 'bg-green-500' },
    { key: 'coverage_weight', value: profile.coverage_weight, color: 'bg-blue-500' },
    { key: 'carrier_weight', value: profile.carrier_weight, color: 'bg-yellow-500' },
    { key: 'deductible_weight', value: profile.deductible_weight, color: 'bg-purple-500' },
    { key: 'value_weight', value: profile.value_weight, color: 'bg-orange-500' },
  ];

  return (
    <div className="flex h-4 rounded-full overflow-hidden w-full max-w-xs">
      {dimensions.map(dim => (
        <div
          key={dim.key}
          className={`${dim.color} flex items-center justify-center text-[8px] text-white font-medium`}
          style={{ width: `${dim.value}%` }}
          title={`${getWeightDimensionLabel(dim.key)}: ${dim.value}%`}
        >
          {dim.value >= 15 && `${dim.value}%`}
        </div>
      ))}
    </div>
  );
}

// Form for editing weights with sliders
function WeightForm({
  formData,
  setFormData,
  validation,
}: {
  formData: WeightFormData;
  setFormData: React.Dispatch<React.SetStateAction<WeightFormData>>;
  validation: { valid: boolean; total: number; difference: number };
}) {
  const dimensions = ['price_weight', 'coverage_weight', 'carrier_weight', 'deductible_weight', 'value_weight'] as const;

  const adjustWeight = (dimension: keyof WeightFormData, newValue: number) => {
    if (dimension === 'name') return;
    setFormData(prev => ({ ...prev, [dimension]: newValue }));
  };

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-2">
        <Label>Profile Name</Label>
        <Input
          placeholder="e.g., Price-Focused, Coverage-First"
          value={formData.name}
          onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
        />
      </div>

      <div className="space-y-4">
        {dimensions.map(dim => (
          <div key={dim} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {DIMENSION_ICONS[dim]}
                <Label>{getWeightDimensionLabel(dim)}</Label>
              </div>
              <span className="text-sm font-medium w-12 text-right">
                {formData[dim]}%
              </span>
            </div>
            <Slider
              value={[formData[dim]]}
              onValueChange={([v]) => adjustWeight(dim, v)}
              min={0}
              max={100}
              step={5}
              className="cursor-pointer"
            />
          </div>
        ))}
      </div>

      <div className={`p-3 rounded-lg ${validation.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center gap-2">
          {validation.valid ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
          <span className={validation.valid ? 'text-green-700' : 'text-red-700'}>
            Total: {validation.total}%
            {!validation.valid && (
              <span className="ml-2">
                ({validation.difference > 0 ? `Need ${validation.difference} more` : `Remove ${Math.abs(validation.difference)}`})
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Visual preview */}
      <div className="space-y-2">
        <Label className="text-muted-foreground">Preview</Label>
        <WeightDistributionBar
          profile={{
            id: 'preview',
            agency_workspace_id: null,
            account_id: null,
            name: formData.name || 'Preview',
            price_weight: formData.price_weight,
            coverage_weight: formData.coverage_weight,
            carrier_weight: formData.carrier_weight,
            deductible_weight: formData.deductible_weight,
            value_weight: formData.value_weight,
            is_default: false,
            is_active: true,
            created_at: '',
          }}
        />
      </div>
    </div>
  );
}
