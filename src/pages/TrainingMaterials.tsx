import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  GraduationCap,
  CheckCircle2,
  Clock,
  Star,
  Filter,
  BookOpen,
  LayoutGrid,
  List,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useTrainingMaterials,
  useTrainingCategoriesFromMaterials,
  useTrainingUserStats,
} from '@/hooks/useTrainingMaterials';
import { TrainingMaterialCard } from '@/components/training/TrainingMaterialCard';
import { TrainingMaterialViewer } from '@/components/training/TrainingMaterialViewer';
import { AddTrainingMaterialDialog } from '@/components/training/AddTrainingMaterialDialog';
import type { TrainingMaterialWithProgress, TrainingFilters, TrainingStatus, TrainingDifficulty } from '@/types/training';
import { cn } from '@/lib/utils';

const DEFAULT_CATEGORIES = [
  'All',
  'Onboarding',
  'Product Knowledge',
  'Sales Techniques',
  'Carrier Training',
  'Compliance',
  'Technology',
];

export default function TrainingMaterials() {
  const { profile } = useAuth();
  const isStaff = profile?.is_staff || profile?.role === 'admin';

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<TrainingDifficulty | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<TrainingStatus | 'all'>('all');
  const [showRequired, setShowRequired] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [viewerMaterial, setViewerMaterial] = useState<TrainingMaterialWithProgress | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Build filters
  const filters: TrainingFilters = useMemo(() => ({
    search: search || undefined,
    category: selectedCategory !== 'All' ? selectedCategory : undefined,
    difficulty: selectedDifficulty !== 'all' ? selectedDifficulty : undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    isRequired: showRequired ? true : undefined,
  }), [search, selectedCategory, selectedDifficulty, selectedStatus, showRequired]);

  // Fetch data
  const { data: materials = [], isLoading } = useTrainingMaterials(filters);
  const { data: existingCategories = [] } = useTrainingCategoriesFromMaterials();
  const { data: userStats } = useTrainingUserStats();

  // Combine categories
  const allCategories = useMemo(() => {
    const combined = [...new Set([...DEFAULT_CATEGORIES, ...existingCategories])];
    return combined.includes('All') ? combined : ['All', ...combined.filter(c => c !== 'All')];
  }, [existingCategories]);

  // Handle view material
  const handleViewMaterial = (material: TrainingMaterialWithProgress) => {
    setViewerMaterial(material);
    setViewerOpen(true);
  };

  // Stats calculations
  const stats = useMemo(() => {
    const total = materials.length;
    const completed = materials.filter(m => m.user_status === 'completed').length;
    const inProgress = materials.filter(m => m.user_status === 'in_progress').length;
    const required = materials.filter(m => m.is_required).length;
    const requiredCompleted = materials.filter(m => m.is_required && m.user_status === 'completed').length;

    return { total, completed, inProgress, required, requiredCompleted };
  }, [materials]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="h-8 w-8" />
            Training Materials
          </h1>
          <p className="text-muted-foreground mt-1">
            Learn and grow with our training resources
          </p>
        </div>
        {isStaff && (
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Training
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Required</p>
                <p className="text-2xl font-bold text-amber-600">
                  {stats.requiredCompleted}/{stats.required}
                </p>
              </div>
              <Star className="h-8 w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search training materials..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Difficulty Filter */}
            <Select
              value={selectedDifficulty}
              onValueChange={(v) => setSelectedDifficulty(v as TrainingDifficulty | 'all')}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select
              value={selectedStatus}
              onValueChange={(v) => setSelectedStatus(v as TrainingStatus | 'all')}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            {/* Required Toggle */}
            <Button
              variant={showRequired ? 'default' : 'outline'}
              onClick={() => setShowRequired(!showRequired)}
              className="gap-2"
            >
              <Star className={cn('h-4 w-4', showRequired && 'fill-current')} />
              Required
            </Button>

            {/* View Mode Toggle */}
            <div className="flex border rounded-lg">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="mt-4 overflow-x-auto">
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList className="inline-flex h-10 items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground">
                {allCategories.map((category) => (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className="px-4"
                  >
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Materials Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : materials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GraduationCap className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No training materials found</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {search || selectedCategory !== 'All' || selectedDifficulty !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your filters to find what you\'re looking for.'
                : 'Get started by adding your first training material.'}
            </p>
            {isStaff && !search && selectedCategory === 'All' && (
              <Button onClick={() => setAddDialogOpen(true)} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Add Training Material
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'flex flex-col gap-3'
          )}
        >
          {materials.map((material) => (
            <TrainingMaterialCard
              key={material.id}
              material={material}
              onView={handleViewMaterial}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {!isLoading && materials.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {materials.length} training material{materials.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Add Training Dialog */}
      <AddTrainingMaterialDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      {/* Material Viewer */}
      <TrainingMaterialViewer
        material={viewerMaterial}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />
    </div>
  );
}
