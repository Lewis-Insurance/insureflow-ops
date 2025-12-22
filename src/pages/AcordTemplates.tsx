import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useAcordTemplates } from '@/hooks/useAcordTemplates';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Trash2,
  Eye,
  Download,
  Star,
  Archive,
  RefreshCw,
  Search,
  Filter,
  Info,
} from 'lucide-react';
import { ACORD_FORMS } from '@/types/acord';

export default function AcordTemplates() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    templates = [],
    currentTemplates = [],
    loading,
    uploadTemplate,
    setCurrentVersion,
    archiveTemplate,
    deleteTemplate,
    validatePdf,
  } = useAcordTemplates();

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [uploadForm, setUploadForm] = useState({
    formNumber: '',
    formName: '',
    version: '',
    licenseNotes: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'current' | 'archived'>('current');

  // Filter templates with defensive checks
  const filteredTemplates = (templates || []).filter(t => {
    if (!t || !t.form_number || !t.form_name) return false;
    
    const matchesSearch =
      t.form_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.form_name.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterType === 'current') return matchesSearch && t.is_current;
    if (filterType === 'archived') return matchesSearch && !t.is_current;
    return matchesSearch;
  });

  // Group templates by form number
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    if (!template || !template.form_number) return acc;
    const key = template.form_number;
    if (!acc[key]) acc[key] = [];
    acc[key].push(template);
    return acc;
  }, {} as Record<string, typeof templates>);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setValidationResult(null);

    // Validate the PDF
    const result = await validatePdf(file);
    setValidationResult(result);

    if (!result.valid) {
      toast({
        title: 'Invalid PDF',
        description: result.errors.join(', '),
        variant: 'destructive',
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.formNumber || !uploadForm.version) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in form number and version',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const formName = uploadForm.formName || 
        (ACORD_FORMS && uploadForm.formNumber ? ACORD_FORMS[uploadForm.formNumber as keyof typeof ACORD_FORMS]?.name : null) || 
        `ACORD ${uploadForm.formNumber}`;
      
      const result = await uploadTemplate(selectedFile, {
        formNumber: uploadForm.formNumber,
        formName,
        version: uploadForm.version,
        templateSource: 'acord_portal',
        licenseNotes: uploadForm.licenseNotes,
      });

      if (result) {
        setIsUploadDialogOpen(false);
        setSelectedFile(null);
        setValidationResult(null);
        setUploadForm({ formNumber: '', formName: '', version: '', licenseNotes: '' });
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = (template: any) => {
    setSelectedTemplate(template);
    setIsPreviewDialogOpen(true);
  };

  const handleSetCurrent = async (templateId: string) => {
    await setCurrentVersion(templateId);
  };

  const handleArchive = async (templateId: string) => {
    await archiveTemplate(templateId);
  };

  const handleDelete = async (templateId: string) => {
    if (window.confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      await deleteTemplate(templateId);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">ACORD Templates</h1>
            <p className="text-muted-foreground">
              Manage your ACORD form templates for PDF generation
            </p>
          </div>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Upload ACORD Template</DialogTitle>
                <DialogDescription>
                  Upload a fillable PDF ACORD form. Only AcroForm PDFs are supported (XFA forms are not supported).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* File Input */}
                <div className="space-y-2">
                  <Label>PDF File</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                  />
                  {validationResult && (
                    <div className={`flex items-center gap-2 text-sm ${validationResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {validationResult.valid ? (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          PDF is valid and ready for upload
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4" />
                          {validationResult.errors[0]}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Form Number */}
                <div className="space-y-2">
                  <Label>Form Number *</Label>
                  <Select
                    value={uploadForm.formNumber}
                    onValueChange={(value) => {
                      setUploadForm(prev => ({
                        ...prev,
                        formNumber: value,
                        formName: ACORD_FORMS[value as keyof typeof ACORD_FORMS]?.name || '',
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select ACORD form" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACORD_FORMS).map(([number, info]) => (
                        <SelectItem key={number} value={number}>
                          ACORD {number} - {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Form Name */}
                <div className="space-y-2">
                  <Label>Form Name</Label>
                  <Input
                    value={uploadForm.formName}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, formName: e.target.value }))}
                    placeholder="Commercial Insurance Application"
                  />
                </div>

                {/* Version */}
                <div className="space-y-2">
                  <Label>Version *</Label>
                  <Input
                    value={uploadForm.version}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, version: e.target.value }))}
                    placeholder="2023-04"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the ACORD form revision date (e.g., 2023-04)
                  </p>
                </div>

                {/* License Notes */}
                <div className="space-y-2">
                  <Label>License Notes</Label>
                  <Input
                    value={uploadForm.licenseNotes}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, licenseNotes: e.target.value }))}
                    placeholder="Downloaded from ACORD portal"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || !validationResult?.valid || uploading}
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{templates.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Versions</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currentTemplates.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Form Types</CardTitle>
              <Info className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.keys(groupedTemplates).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Fields</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currentTemplates.reduce((sum, t) => sum + (t.field_inventory?.length || 0), 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Only</SelectItem>
              <SelectItem value="all">All Versions</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Templates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            <CardDescription>
              Manage ACORD form templates and versions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No templates found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? 'Try adjusting your search' : 'Upload your first ACORD template to get started'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setIsUploadDialogOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Template
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">
                        ACORD {template.form_number}
                      </TableCell>
                      <TableCell>{template.form_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{template.version}</Badge>
                      </TableCell>
                      <TableCell>
                        {template.is_current ? (
                          <Badge className="bg-green-100 text-green-800">
                            <Star className="mr-1 h-3 w-3" />
                            Current
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Archive className="mr-1 h-3 w-3" />
                            Archived
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{template.field_inventory?.length || 0}</TableCell>
                      <TableCell className="capitalize">{template.template_source?.replace('_', ' ')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePreview(template)}
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(template.pdf_template_url, '_blank')}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {!template.is_current && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSetCurrent(template.id)}
                              title="Set as Current"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          {template.is_current && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchive(template.id)}
                              title="Archive"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(template.id)}
                            title="Delete"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Preview Dialog */}
        <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                ACORD {selectedTemplate?.form_number} - {selectedTemplate?.form_name}
              </DialogTitle>
              <DialogDescription>
                Version {selectedTemplate?.version}
              </DialogDescription>
            </DialogHeader>
            {selectedTemplate && (
              <Tabs defaultValue="fields" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="fields">Fields ({selectedTemplate.field_inventory?.length || 0})</TabsTrigger>
                  <TabsTrigger value="sections">Sections</TabsTrigger>
                  <TabsTrigger value="info">Info</TabsTrigger>
                </TabsList>
                <TabsContent value="fields" className="space-y-4 mt-4">
                  <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Page</TableHead>
                          <TableHead>Required</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTemplate.field_inventory?.map((field: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-sm">{field.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{field.type}</Badge>
                            </TableCell>
                            <TableCell>{field.page}</TableCell>
                            <TableCell>
                              {field.required ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                <TabsContent value="sections" className="space-y-4 mt-4">
                  {selectedTemplate.section_definitions?.length > 0 ? (
                    <div className="space-y-3">
                      {selectedTemplate.section_definitions.map((section: any, index: number) => (
                        <Card key={index}>
                          <CardHeader className="py-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">
                                Section {section.sectionNumber}: {section.sectionName}
                              </CardTitle>
                              <Badge variant={section.requiredForSubmission ? 'default' : 'secondary'}>
                                {section.requiredForSubmission ? 'Required' : 'Optional'}
                              </Badge>
                            </div>
                            <CardDescription>{section.description}</CardDescription>
                          </CardHeader>
                          <CardContent className="py-2">
                            <p className="text-sm text-muted-foreground">
                              {section.fields?.length || 0} fields • ~{section.estimatedMinutes} min
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No sections defined</p>
                  )}
                </TabsContent>
                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid gap-4">
                    <div>
                      <Label className="text-muted-foreground">PDF Type</Label>
                      <p className="font-medium capitalize">{selectedTemplate.pdf_type}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Template Source</Label>
                      <p className="font-medium capitalize">{selectedTemplate.template_source?.replace('_', ' ')}</p>
                    </div>
                    {selectedTemplate.license_notes && (
                      <div>
                        <Label className="text-muted-foreground">License Notes</Label>
                        <p className="font-medium">{selectedTemplate.license_notes}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Signature Anchors</Label>
                      <p className="font-medium">{selectedTemplate.signature_anchors?.length || 0}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Repeater Configs</Label>
                      <p className="font-medium">{selectedTemplate.repeater_configs?.length || 0}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Created</Label>
                      <p className="font-medium">
                        {new Date(selectedTemplate.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
