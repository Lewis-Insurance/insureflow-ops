/**
 * Module Editor Dialog
 * 
 * Admin-only dialog to create or edit custom AI modules.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCreateModule, useUpdateModule, AIModule } from '@/integrations/supabase/hooks/useAIModules';

// Available icons
const ICON_OPTIONS = [
  { value: 'Scale', label: 'Scale' },
  { value: 'Search', label: 'Search' },
  { value: 'FileCheck', label: 'File Check' },
  { value: 'FileSearch', label: 'File Search' },
  { value: 'FileText', label: 'File Text' },
  { value: 'FileDigit', label: 'File Digit' },
  { value: 'Brain', label: 'Brain' },
  { value: 'Sparkles', label: 'Sparkles' },
];

// Available colors
const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'green', label: 'Green' },
  { value: 'orange', label: 'Orange' },
  { value: 'teal', label: 'Teal' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'slate', label: 'Slate' },
  { value: 'red', label: 'Red' },
];

// Categories
const CATEGORY_OPTIONS = [
  { value: 'analysis', label: 'Analysis' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'generation', label: 'Generation' },
  { value: 'review', label: 'Review' },
];

// Output formats
const FORMAT_OPTIONS = [
  { value: 'structured', label: 'Structured JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'chat', label: 'Chat/Conversational' },
  { value: 'html', label: 'HTML' },
];

interface ModuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module?: AIModule | null; // null = create new
}

export function ModuleEditorDialog({
  open,
  onOpenChange,
  module,
}: ModuleEditorDialogProps) {
  const createModule = useCreateModule();
  const updateModule = useUpdateModule();
  const isEditing = !!module;

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('FileText');
  const [color, setColor] = useState('blue');
  const [category, setCategory] = useState('analysis');
  const [systemPrompt, setSystemPrompt] = useState('');
  
  // Input config
  const [minDocuments, setMinDocuments] = useState(1);
  const [maxDocuments, setMaxDocuments] = useState(5);
  const [documentLabels, setDocumentLabels] = useState<string[]>([]);
  const [allowTextInput, setAllowTextInput] = useState(true);
  const [inputPlaceholder, setInputPlaceholder] = useState('');
  
  // Output config
  const [outputFormat, setOutputFormat] = useState('structured');
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [showDownloadReport, setShowDownloadReport] = useState(false);
  
  // Access
  const [requiredRole, setRequiredRole] = useState('staff');
  const [isActive, setIsActive] = useState(true);

  // Reset form when module changes
  useEffect(() => {
    if (module) {
      setName(module.name);
      setSlug(module.slug);
      setDescription(module.description || '');
      setIcon(module.icon);
      setColor(module.color);
      setCategory(module.category);
      setSystemPrompt(module.system_prompt);
      
      const inputConfig = module.input_config || {};
      setMinDocuments(inputConfig.min_documents || 1);
      setMaxDocuments(inputConfig.max_documents || 5);
      setDocumentLabels(inputConfig.document_labels || []);
      setAllowTextInput(inputConfig.allow_text_input !== false);
      setInputPlaceholder(inputConfig.input_placeholder || '');
      
      const outputConfig = module.output_config || {};
      setOutputFormat(outputConfig.format || 'structured');
      setShowEmailDraft(outputConfig.show_email_draft || false);
      setShowDownloadReport(outputConfig.show_download_report || false);
      
      setRequiredRole(module.required_role);
      setIsActive(module.is_active);
    } else {
      // Reset to defaults
      setName('');
      setSlug('');
      setDescription('');
      setIcon('FileText');
      setColor('blue');
      setCategory('analysis');
      setSystemPrompt('');
      setMinDocuments(1);
      setMaxDocuments(5);
      setDocumentLabels([]);
      setAllowTextInput(true);
      setInputPlaceholder('');
      setOutputFormat('structured');
      setShowEmailDraft(false);
      setShowDownloadReport(false);
      setRequiredRole('staff');
      setIsActive(true);
    }
  }, [module, open]);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEditing) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  // Add document label
  const addDocumentLabel = () => {
    setDocumentLabels([...documentLabels, `Document ${documentLabels.length + 1}`]);
  };

  // Remove document label
  const removeDocumentLabel = (index: number) => {
    setDocumentLabels(documentLabels.filter((_, i) => i !== index));
  };

  // Update document label
  const updateDocumentLabel = (index: number, value: string) => {
    const updated = [...documentLabels];
    updated[index] = value;
    setDocumentLabels(updated);
  };

  const handleSubmit = async () => {
    const moduleData = {
      name,
      slug,
      description,
      icon,
      color,
      category,
      system_prompt: systemPrompt,
      input_config: {
        min_documents: minDocuments,
        max_documents: maxDocuments,
        document_labels: documentLabels.length > 0 ? documentLabels : undefined,
        allow_text_input: allowTextInput,
        input_placeholder: inputPlaceholder || undefined,
      },
      output_config: {
        format: outputFormat,
        show_email_draft: showEmailDraft,
        show_download_report: showDownloadReport,
      },
      required_role: requiredRole,
      is_active: isActive,
    };

    if (isEditing && module) {
      await updateModule.mutateAsync({ id: module.id, ...moduleData });
    } else {
      await createModule.mutateAsync(moduleData);
    }

    onOpenChange(false);
  };

  const isPending = createModule.isPending || updateModule.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {isEditing ? 'Edit AI Module' : 'Create Custom AI Module'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Modify the module configuration below.'
              : 'Build your own AI-powered tool with custom prompts and configuration.'
            }
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="prompt">AI Prompt</TabsTrigger>
            <TabsTrigger value="input">Input</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Loss Run Analysis"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="loss-run-analysis"
                  disabled={isEditing}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Analyze loss run reports and identify trends..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* AI Prompt Tab */}
          <TabsContent value="prompt" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">System Prompt *</Label>
              <p className="text-sm text-muted-foreground">
                Instructions for the AI. Be specific about what analysis to perform and how to format the output.
              </p>
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are an insurance document analyst. When given a document, analyze and provide..."
                rows={12}
                className="font-mono text-sm"
              />
            </div>
          </TabsContent>

          {/* Input Configuration Tab */}
          <TabsContent value="input" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Documents</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={minDocuments}
                  onChange={(e) => setMinDocuments(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Documents</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={maxDocuments}
                  onChange={(e) => setMaxDocuments(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Document Labels</Label>
                <Button variant="outline" size="sm" onClick={addDocumentLabel}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Label
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Optional labels for each document slot (e.g., "Current Policy", "Quote Option")
              </p>
              {documentLabels.map((label, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={label}
                    onChange={(e) => updateDocumentLabel(index, e.target.value)}
                    placeholder={`Document ${index + 1} label`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDocumentLabel(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow Text Input</Label>
                <p className="text-sm text-muted-foreground">
                  Let users enter additional context or questions
                </p>
              </div>
              <Switch
                checked={allowTextInput}
                onCheckedChange={setAllowTextInput}
              />
            </div>

            {allowTextInput && (
              <div className="space-y-2">
                <Label>Input Placeholder</Label>
                <Input
                  value={inputPlaceholder}
                  onChange={(e) => setInputPlaceholder(e.target.value)}
                  placeholder="Enter any additional context..."
                />
              </div>
            )}
          </TabsContent>

          {/* Output Configuration Tab */}
          <TabsContent value="output" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Output Format</Label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Email Draft</Label>
                <p className="text-sm text-muted-foreground">
                  Generate a draft email based on the analysis
                </p>
              </div>
              <Switch
                checked={showEmailDraft}
                onCheckedChange={setShowEmailDraft}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Download Report</Label>
                <p className="text-sm text-muted-foreground">
                  Allow downloading results as an HTML report
                </p>
              </div>
              <Switch
                checked={showDownloadReport}
                onCheckedChange={setShowDownloadReport}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Required Role</Label>
                <Select value={requiredRole} onValueChange={setRequiredRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label>Active</Label>
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || !slug || !systemPrompt || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              isEditing ? 'Save Changes' : 'Create Module'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModuleEditorDialog;

