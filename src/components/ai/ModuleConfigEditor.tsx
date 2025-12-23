/**
 * ModuleConfigEditor
 * 
 * Allows users to manually edit the generated module configuration.
 * Provides form fields for all editable module properties.
 */

import { useState } from 'react';
import {
  FileText, FileSearch, FileBarChart, FileCheck, Scale, GitCompare,
  Columns, ClipboardList, TableProperties, ShieldCheck, AlertTriangle,
  FileEdit, PenTool, Mail, ChevronDown, ChevronUp
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ModuleConfig } from '@/integrations/supabase/hooks/useModuleBuilder';

// Icon options
const ICONS = [
  { name: 'FileText', icon: FileText },
  { name: 'FileSearch', icon: FileSearch },
  { name: 'FileBarChart', icon: FileBarChart },
  { name: 'FileCheck', icon: FileCheck },
  { name: 'Scale', icon: Scale },
  { name: 'GitCompare', icon: GitCompare },
  { name: 'Columns', icon: Columns },
  { name: 'ClipboardList', icon: ClipboardList },
  { name: 'TableProperties', icon: TableProperties },
  { name: 'ShieldCheck', icon: ShieldCheck },
  { name: 'AlertTriangle', icon: AlertTriangle },
  { name: 'FileEdit', icon: FileEdit },
  { name: 'PenTool', icon: PenTool },
  { name: 'Mail', icon: Mail },
];

const COLORS = [
  { name: 'blue', class: 'bg-blue-500' },
  { name: 'green', class: 'bg-green-500' },
  { name: 'purple', class: 'bg-purple-500' },
  { name: 'orange', class: 'bg-orange-500' },
  { name: 'teal', class: 'bg-teal-500' },
  { name: 'indigo', class: 'bg-indigo-500' },
  { name: 'rose', class: 'bg-rose-500' },
  { name: 'amber', class: 'bg-amber-500' },
  { name: 'slate', class: 'bg-slate-500' },
];

const CATEGORIES = [
  { value: 'analysis', label: 'Analysis' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'review', label: 'Review' },
  { value: 'generation', label: 'Generation' },
  { value: 'comparison', label: 'Comparison' },
];

const OUTPUT_FORMATS = [
  { value: 'structured', label: 'Structured (JSON)' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'chat', label: 'Chat/Conversational' },
  { value: 'html', label: 'HTML Report' },
];

interface ModuleConfigEditorProps {
  config: ModuleConfig;
  onChange: (config: ModuleConfig) => void;
}

export default function ModuleConfigEditor({ config, onChange }: ModuleConfigEditorProps) {
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const updateConfig = (updates: Partial<ModuleConfig>) => {
    onChange({ ...config, ...updates });
  };

  const updateInputConfig = (updates: Partial<ModuleConfig['input_config']>) => {
    onChange({
      ...config,
      input_config: { ...config.input_config, ...updates },
    });
  };

  const updateOutputConfig = (updates: Partial<ModuleConfig['output_config']>) => {
    onChange({
      ...config,
      output_config: { ...config.output_config, ...updates },
    });
  };

  const SelectedIcon = ICONS.find(i => i.name === config.icon)?.icon || FileText;

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Basic Info
        </h3>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={config.name}
              onChange={(e) => updateConfig({ name: e.target.value })}
              placeholder="Module name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={config.slug}
              onChange={(e) => updateConfig({ slug: e.target.value })}
              placeholder="module-slug"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">URL-friendly identifier</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={config.description}
              onChange={(e) => updateConfig({ description: e.target.value })}
              placeholder="What does this module do?"
              rows={2}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Appearance */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Appearance
        </h3>

        <div className="grid gap-4">
          {/* Icon */}
          <div className="grid gap-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => updateConfig({ icon: name })}
                  className={`p-2 rounded-md border transition-colors ${
                    config.icon === name
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(({ name, class: colorClass }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => updateConfig({ color: name })}
                  className={`w-8 h-8 rounded-full transition-all ${colorClass} ${
                    config.color === name
                      ? 'ring-2 ring-offset-2 ring-primary'
                      : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={config.category}
              onValueChange={(value) => updateConfig({ category: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Input Config */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Inputs
        </h3>

        <div className="grid gap-4">
          {/* Document count */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Min Documents</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={config.input_config.min_documents}
                onChange={(e) => updateInputConfig({ min_documents: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Max Documents</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={config.input_config.max_documents}
                onChange={(e) => updateInputConfig({ max_documents: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          {/* Document labels */}
          <div className="grid gap-2">
            <Label>Document Labels</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {config.input_config.document_labels?.map((label, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {label}
                  <button
                    type="button"
                    className="ml-1 hover:text-destructive"
                    onClick={() => {
                      const newLabels = [...config.input_config.document_labels];
                      newLabels.splice(idx, 1);
                      updateInputConfig({ document_labels: newLabels });
                    }}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              placeholder="Add label (press Enter)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (value) {
                    updateInputConfig({
                      document_labels: [...(config.input_config.document_labels || []), value],
                    });
                    (e.target as HTMLInputElement).value = '';
                  }
                }
              }}
            />
          </div>

          {/* Text input */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Text Input</Label>
              <p className="text-xs text-muted-foreground">
                Let users add additional instructions
              </p>
            </div>
            <Switch
              checked={config.input_config.allow_text_input}
              onCheckedChange={(checked) => updateInputConfig({ allow_text_input: checked })}
            />
          </div>

          {config.input_config.allow_text_input && (
            <div className="grid gap-2">
              <Label>Text Input Placeholder</Label>
              <Input
                value={config.input_config.input_placeholder || ''}
                onChange={(e) => updateInputConfig({ input_placeholder: e.target.value })}
                placeholder="Any specific questions?"
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Output Config */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Outputs
        </h3>

        <div className="grid gap-4">
          {/* Format */}
          <div className="grid gap-2">
            <Label>Output Format</Label>
            <Select
              value={config.output_config.format}
              onValueChange={(value) => updateOutputConfig({ format: value as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_FORMATS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Generate Email Draft</Label>
              <p className="text-xs text-muted-foreground">
                Include an email summary in the output
              </p>
            </div>
            <Switch
              checked={config.output_config.show_email_draft}
              onCheckedChange={(checked) => updateOutputConfig({ show_email_draft: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Report Download</Label>
              <p className="text-xs text-muted-foreground">
                Let users download results as PDF/HTML
              </p>
            </div>
            <Switch
              checked={config.output_config.show_download_report}
              onCheckedChange={(checked) => updateOutputConfig({ show_download_report: checked })}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* System Prompt */}
      <Collapsible open={showSystemPrompt} onOpenChange={setShowSystemPrompt}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="text-sm font-medium">System Prompt</span>
            {showSystemPrompt ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <div className="grid gap-2">
            <Label htmlFor="system_prompt">
              System Prompt
              <span className="text-xs text-muted-foreground ml-2">
                (Advanced - edit with care)
              </span>
            </Label>
            <Textarea
              id="system_prompt"
              value={config.system_prompt}
              onChange={(e) => updateConfig({ system_prompt: e.target.value })}
              placeholder="Instructions for the AI..."
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              This is the instruction given to the AI when this module runs.
              The AI receives this prompt along with the uploaded documents.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

