// ============================================
// ACORD Template Management Page
// Upload, view, and manage ACORD PDF templates
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Eye,
  Download,
  RefreshCw,
  Plus,
  Search,
  Settings,
  History,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAcordTemplates } from '@/hooks/useAcordTemplates';
import { ACORD_FORMS } from '@/types/acord';
import type { AcordTemplate } from '@/types/acord';

// ============================================
// COMPONENT
// ============================================

export default function TemplateManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { templates, isLoading, error, refresh, uploadTemplate, deleteTemplate } = useAcordTemplates();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'current' | 'outdated'>('all');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AcordTemplate | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    formNumber: '',
    version: '',
    effectiveDate: '',
    file: null as File | null,
  });

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    const matchesSearch =
      t.form_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.form_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'current' && t.is_current) ||
      (filterStatus === 'outdated' && !t.is_current);

    return matchesSearch && matchesStatus;
  });

  // Group templates by form number
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.form_number]) {
      acc[template.form_number] = [];
    }
    acc[template.form_number].push(template);
    return acc;
  }, {} as Record<string, AcordTemplate[]>);

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a PDF file',
          variant: 'destructive',
        });
        return;
      }
      setUploadForm(prev => ({ ...prev, file }));
    }
  };

  // Submit upload
  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.formNumber || !uploadForm.version) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress for UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const formInfo = ACORD_FORMS[uploadForm.formNumber as keyof typeof ACORD_FORMS];

      const result = await uploadTemplate({
        file: uploadForm.file,
        formNumber: uploadForm.formNumber,
        formName: formInfo?.name || `ACORD ${uploadForm.formNumber}`,
        version: uploadForm.version,
        effectiveDate: uploadForm.effectiveDate || null,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (result) {
        toast({
          title: 'Template uploaded',
          description: `ACORD ${uploadForm.formNumber} v${uploadForm.version} uploaded successfully`,
        });
        setUploadDialogOpen(false);
        setUploadForm({ formNumber: '', version: '', effectiveDate: '', file: null });
        refresh();
      }
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Failed to upload template',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete template
  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    const success = await deleteTemplate(templateId);
    if (success) {
      toast({
        title: 'Template deleted',
        description: 'Template has been removed',
      });
      refresh();
    }
  };

  // View template details
  const handleViewDetails = (template: AcordTemplate) => {
    setSelectedTemplate(template);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ACORD Template Management</h1>
          <p className="text-muted-foreground">
            Upload and manage ACORD PDF templates for form generation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Upload Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Upload ACORD Template</DialogTitle>
                <DialogDescription>
                  Upload a fillable AcroForm PDF template. XFA forms are not supported.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="formNumber">Form Number *</Label>
                  <Select
                    value={uploadForm.formNumber}
                    onValueChange={(v) => setUploadForm(prev => ({ ...prev, formNumber: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select form number" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACORD_FORMS).map(([num, info]) => (
                        <SelectItem key={num} value={num}>
                          ACORD {num} - {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="version">Version *</Label>
                  <Input
                    id="version"
                    placeholder="e.g., 2016/03"
                    value={uploadForm.version}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, version: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="effectiveDate">Effective Date</Label>
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={uploadForm.effectiveDate}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file">PDF File *</Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    {uploadForm.file ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="h-8 w-8 text-primary" />
                        <div>
                          <p className="font-medium">{uploadForm.file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(uploadForm.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">PDF files only</p>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} />
                    <p className="text-sm text-center text-muted-foreground">
                      Uploading and analyzing template...
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload Template'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by form number or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Templates</SelectItem>
                <SelectItem value="current">Current Only</SelectItem>
                <SelectItem value="outdated">Outdated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Template List */}
      <div className="grid gap-4">
        {Object.entries(groupedTemplates).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No templates found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? 'No templates match your search criteria'
                  : 'Upload your first ACORD template to get started'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Template
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedTemplates).map(([formNumber, versions]) => (
            <Card key={formNumber}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      ACORD {formNumber}
                    </CardTitle>
                    <CardDescription>
                      {ACORD_FORMS[formNumber as keyof typeof ACORD_FORMS]?.name || 'Custom Form'}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {versions.length} version{versions.length > 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Fields</TableHead>
                      <TableHead>PDF Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions
                      .sort((a, b) => (b.is_current ? 1 : 0) - (a.is_current ? 1 : 0))
                      .map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.version}</TableCell>
                          <TableCell>
                            {template.effective_date
                              ? formatLocalDateDisplay(template.effective_date)
                              : '-'}
                          </TableCell>
                          <TableCell>{template.field_inventory?.length || 0}</TableCell>
                          <TableCell>
                            <Badge
                              variant={template.pdf_type === 'acroform' ? 'default' : 'secondary'}
                            >
                              {template.pdf_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {template.is_current ? (
                              <Badge className="bg-green-500">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Current
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <History className="h-3 w-3 mr-1" />
                                Archived
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(template)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(template.pdf_template_url, '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(template.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Template Details Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="sm:max-w-[700px]">
          {selectedTemplate && (
            <>
              <DialogHeader>
                <DialogTitle>
                  ACORD {selectedTemplate.form_number} - {selectedTemplate.version}
                </DialogTitle>
                <DialogDescription>{selectedTemplate.form_name}</DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="fields" className="w-full">
                <TabsList>
                  <TabsTrigger value="fields">Fields ({selectedTemplate.field_inventory?.length || 0})</TabsTrigger>
                  <TabsTrigger value="sections">Sections ({selectedTemplate.section_definitions?.length || 0})</TabsTrigger>
                  <TabsTrigger value="validation">Validation ({selectedTemplate.validation_rules?.length || 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="fields">
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Page</TableHead>
                          <TableHead>Required</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTemplate.field_inventory?.map((field, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{field.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{field.type}</Badge>
                            </TableCell>
                            <TableCell>{field.page}</TableCell>
                            <TableCell>
                              {field.required ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                '-'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="sections">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {selectedTemplate.section_definitions?.map((section, idx) => (
                        <Card key={idx}>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">
                                Section {section.sectionNumber}: {section.sectionName}
                              </h4>
                              {section.requiredForSubmission && (
                                <Badge variant="destructive">Required</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{section.description}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {section.fields.length} fields • ~{section.estimatedMinutes} min
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="validation">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {selectedTemplate.validation_rules?.map((rule, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 border rounded-lg"
                        >
                          {rule.severity === 'error' ? (
                            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium">{rule.field}</p>
                            <p className="text-sm text-muted-foreground">{rule.message}</p>
                            <Badge variant="outline" className="mt-1">
                              {rule.type}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
