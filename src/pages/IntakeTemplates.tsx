// ============================================
// Intake Templates Page
// List and manage intake form templates
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import { useIntakeTemplates } from '@/hooks/useIntakeTemplates';
import type { IntakeTemplate, IntakeType } from '@/types/intake';
import {
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Edit,
  Copy,
  Archive,
  Trash2,
  Eye,
  Globe,
  GlobeLock,
  RefreshCw,
  Filter,
  Link2,
  ExternalLink,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

// ============================================
// CONSTANTS
// ============================================

const INTAKE_TYPE_LABELS: Record<IntakeType, { label: string; color: string }> = {
  acord: { label: 'ACORD', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  general: { label: 'General', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  fnol: { label: 'FNOL', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' },
  survey: { label: 'Survey', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  renewal: { label: 'Renewal', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  endorsement: { label: 'Endorsement', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
};

// ============================================
// COMPONENT
// ============================================

export function IntakeTemplates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    templates,
    loading,
    fetchTemplates,
    duplicateTemplate,
    deleteTemplate,
    archiveTemplate,
    publishTemplate,
    unpublishTemplate,
  } = useIntakeTemplates();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<IntakeType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load templates on mount
  useEffect(() => {
    fetchTemplates({ includeArchived: showArchived });
  }, [showArchived]);

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !template.name.toLowerCase().includes(query) &&
        !template.description?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Type filter
    if (filterType !== 'all' && template.intake_type !== filterType) {
      return false;
    }

    // Status filter
    if (filterStatus === 'published' && !template.is_published) return false;
    if (filterStatus === 'draft' && template.is_published) return false;

    return true;
  });

  // Handle actions
  const handleDuplicate = async (id: string) => {
    const result = await duplicateTemplate(id);
    if (result) {
      navigate(`/intake-builder/${result.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    setDeleteConfirm(null);
  };

  const handleArchive = async (id: string) => {
    await archiveTemplate(id);
  };

  const handleTogglePublish = async (template: IntakeTemplate) => {
    if (template.is_published) {
      await unpublishTemplate(template.id);
    } else {
      await publishTemplate(template.id);
    }
  };

  const copyIntakeLink = (template: IntakeTemplate) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/intake/${template.id}`;
    navigator.clipboard.writeText(link);
    toast({
      title: 'Link copied',
      description: 'Intake form link copied to clipboard',
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Intake Templates</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage client intake forms
          </p>
        </div>
        <Button onClick={() => navigate('/intake-builder')}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={filterType}
                onValueChange={(value: IntakeType | 'all') => setFilterType(value)}
              >
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="acord">ACORD</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="fnol">FNOL</SelectItem>
                  <SelectItem value="survey">Survey</SelectItem>
                  <SelectItem value="renewal">Renewal</SelectItem>
                  <SelectItem value="endorsement">Endorsement</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterStatus}
                onValueChange={(value: 'all' | 'published' | 'draft') =>
                  setFilterStatus(value)
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredTemplates.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="group hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {template.description || 'No description'}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/intake-builder/${template.id}`)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(template.id)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      {template.is_published && (
                        <>
                          <DropdownMenuItem onClick={() => copyIntakeLink(template)}>
                            <Link2 className="mr-2 h-4 w-4" />
                            Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(`/intake/${template.id}`, '_blank')
                            }
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open Form
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleTogglePublish(template)}>
                        {template.is_published ? (
                          <>
                            <GlobeLock className="mr-2 h-4 w-4" />
                            Unpublish
                          </>
                        ) : (
                          <>
                            <Globe className="mr-2 h-4 w-4" />
                            Publish
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(template.id)}>
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteConfirm(template.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className={INTAKE_TYPE_LABELS[template.intake_type].color}>
                    {INTAKE_TYPE_LABELS[template.intake_type].label}
                  </Badge>
                  {template.is_published ? (
                    <Badge variant="secondary" className="gap-1">
                      <Globe className="h-3 w-3" />
                      Published
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <GlobeLock className="h-3 w-3" />
                      Draft
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {template.questions?.length || 0} questions
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDate(template.updated_at)}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => navigate(`/intake-builder/${template.id}`)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Template
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No templates found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || filterType !== 'all' || filterStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first intake template to get started'}
            </p>
            {!searchQuery && filterType === 'all' && filterStatus === 'all' && (
              <Button onClick={() => navigate('/intake-builder')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All associated data including mappings
              and submissions will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </AppLayout>
  );
}

export default IntakeTemplates;
