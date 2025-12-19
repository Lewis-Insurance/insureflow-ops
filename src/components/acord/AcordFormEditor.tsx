// ============================================
// ACORD Form Editor Component
// Provides a UI for editing ACORD form field values
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDebounce } from '@/hooks/use-debounce';
import type { FieldSchemaItem, FieldInventoryItem, SectionDefinition, ValidationResult } from '@/types/acord';
import { validateField, ValidationContext } from '@/lib/validation/validationEngine';
import {
  Save,
  AlertCircle,
  CheckCircle,
  Info,
  RefreshCw,
  Eye,
  EyeOff,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface AcordFormEditorProps {
  formId: string;
  formNumber: string;
  formName: string;
  fieldSchema: FieldSchemaItem[];
  fieldInventory: FieldInventoryItem[];
  sectionDefinitions: SectionDefinition[];
  fieldValues: Record<string, any>;
  validationRules?: any[];
  onFieldChange: (fieldName: string, value: any) => void;
  onSave: (fieldValues: Record<string, any>) => Promise<void>;
  onValidate?: () => Promise<ValidationResult>;
  readOnly?: boolean;
  showAllFields?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
}

interface FieldState {
  value: any;
  isDirty: boolean;
  error?: string;
  warning?: string;
}

// ============================================
// COMPONENT
// ============================================

export function AcordFormEditor({
  formId,
  formNumber,
  formName,
  fieldSchema,
  fieldInventory,
  sectionDefinitions,
  fieldValues,
  validationRules = [],
  onFieldChange,
  onSave,
  onValidate,
  readOnly = false,
  showAllFields = false,
  autoSave = true,
  autoSaveDelay = 2000,
}: AcordFormEditorProps) {
  const [localValues, setLocalValues] = useState<Record<string, any>>(fieldValues);
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({});
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyRequired, setShowOnlyRequired] = useState(false);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['section-1']);
  const [viewMode, setViewMode] = useState<'sections' | 'all'>('sections');

  // Debounced values for auto-save
  const debouncedValues = useDebounce(localValues, autoSaveDelay);

  // Create field lookup maps
  const fieldSchemaMap = useMemo(() => {
    const map = new Map<string, FieldSchemaItem>();
    fieldSchema.forEach(field => map.set(field.name, field));
    return map;
  }, [fieldSchema]);

  const fieldInventoryMap = useMemo(() => {
    const map = new Map<string, FieldInventoryItem>();
    fieldInventory.forEach(field => map.set(field.name, field));
    return map;
  }, [fieldInventory]);

  // Group fields by section
  const fieldsBySection = useMemo(() => {
    const grouped: Record<number, FieldSchemaItem[]> = {};

    fieldSchema.forEach(field => {
      const section = field.section || 1;
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(field);
    });

    return grouped;
  }, [fieldSchema]);

  // Filter fields based on search and filters
  const filteredFields = useMemo(() => {
    return fieldSchema.filter(field => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = field.name.toLowerCase().includes(query);
        const matchesLabel = field.label.toLowerCase().includes(query);
        if (!matchesName && !matchesLabel) return false;
      }

      // Required filter
      if (showOnlyRequired && !field.required) return false;

      // Errors filter
      if (showOnlyErrors && !fieldStates[field.name]?.error) return false;

      return true;
    });
  }, [fieldSchema, searchQuery, showOnlyRequired, showOnlyErrors, fieldStates]);

  // Sync local values with props
  useEffect(() => {
    setLocalValues(fieldValues);
  }, [fieldValues]);

  // Auto-save effect
  useEffect(() => {
    if (!autoSave || readOnly) return;

    const hasChanges = Object.keys(fieldStates).some(key => fieldStates[key]?.isDirty);
    if (!hasChanges) return;

    const saveChanges = async () => {
      setSaving(true);
      try {
        await onSave(debouncedValues);
        // Clear dirty flags
        setFieldStates(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            if (updated[key]) updated[key] = { ...updated[key], isDirty: false };
          });
          return updated;
        });
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setSaving(false);
      }
    };

    saveChanges();
  }, [debouncedValues, autoSave, readOnly, onSave, fieldStates]);

  // Handle field change
  const handleFieldChange = useCallback(
    (fieldName: string, value: any) => {
      setLocalValues(prev => ({ ...prev, [fieldName]: value }));

      // Validate field
      const context: ValidationContext = {
        fieldValues: { ...localValues, [fieldName]: value },
        fieldSchema,
        validationRules,
      };

      const validation = validateField(fieldName, value, context);

      setFieldStates(prev => ({
        ...prev,
        [fieldName]: {
          value,
          isDirty: true,
          error: validation.errors[0],
          warning: validation.warnings[0],
        },
      }));

      onFieldChange(fieldName, value);
    },
    [localValues, fieldSchema, validationRules, onFieldChange]
  );

  // Handle manual save
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localValues);
      setFieldStates(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (updated[key]) updated[key] = { ...updated[key], isDirty: false };
        });
        return updated;
      });
    } finally {
      setSaving(false);
    }
  };

  // Render field based on type
  const renderField = (field: FieldSchemaItem) => {
    const inventoryItem = fieldInventoryMap.get(field.name);
    const value = localValues[field.name] ?? '';
    const state = fieldStates[field.name];
    const hasError = !!state?.error;
    const hasWarning = !!state?.warning;

    const commonProps = {
      id: field.name,
      disabled: readOnly,
      className: hasError ? 'border-red-500' : hasWarning ? 'border-yellow-500' : '',
    };

    let fieldInput;

    switch (field.type.toLowerCase()) {
      case 'boolean':
        fieldInput = (
          <div className="flex items-center space-x-2">
            <Checkbox
              {...commonProps}
              checked={!!value}
              onCheckedChange={(checked) => handleFieldChange(field.name, checked)}
            />
            <Label htmlFor={field.name} className="text-sm font-normal">
              {field.label}
            </Label>
          </div>
        );
        break;

      case 'enum':
        const options = inventoryItem?.options || [];
        fieldInput = (
          <Select
            value={value || ''}
            onValueChange={(val) => handleFieldChange(field.name, val)}
            disabled={readOnly}
          >
            <SelectTrigger {...commonProps}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;

      case 'date':
        fieldInput = (
          <Input
            {...commonProps}
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
          />
        );
        break;

      case 'number':
      case 'currency':
        fieldInput = (
          <Input
            {...commonProps}
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            step={field.type === 'currency' ? '0.01' : '1'}
          />
        );
        break;

      default:
        // Check if it's a long text field
        const maxLength = inventoryItem?.maxLength || field.validation?.maxLength;
        if (maxLength && maxLength > 100) {
          fieldInput = (
            <Textarea
              {...commonProps}
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              maxLength={maxLength}
              rows={3}
            />
          );
        } else {
          fieldInput = (
            <Input
              {...commonProps}
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              maxLength={maxLength}
            />
          );
        }
    }

    return (
      <div key={field.name} className="space-y-2">
        {field.type !== 'boolean' && (
          <div className="flex items-center gap-2">
            <Label htmlFor={field.name} className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {state?.isDirty && (
              <Badge variant="outline" className="text-xs">
                Modified
              </Badge>
            )}
          </div>
        )}

        {fieldInput}

        {/* Validation messages */}
        {hasError && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {state.error}
          </p>
        )}
        {hasWarning && !hasError && (
          <p className="text-sm text-yellow-600 flex items-center gap-1">
            <Info className="h-3 w-3" />
            {state.warning}
          </p>
        )}

        {/* Character count for text fields */}
        {inventoryItem?.maxLength && typeof value === 'string' && (
          <p className="text-xs text-muted-foreground text-right">
            {value.length} / {inventoryItem.maxLength}
          </p>
        )}
      </div>
    );
  };

  // Render section
  const renderSection = (sectionDef: SectionDefinition) => {
    const sectionFields = (fieldsBySection[sectionDef.sectionNumber] || []).filter(f =>
      filteredFields.some(ff => ff.name === f.name)
    );

    if (sectionFields.length === 0) return null;

    const completedCount = sectionFields.filter(f => {
      const value = localValues[f.name];
      return value !== null && value !== undefined && value !== '';
    }).length;

    const errorCount = sectionFields.filter(f => fieldStates[f.name]?.error).length;

    return (
      <AccordionItem value={`section-${sectionDef.sectionNumber}`} key={sectionDef.sectionNumber}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <span className="font-medium">
                {sectionDef.sectionNumber}. {sectionDef.sectionName}
              </span>
              {errorCount > 0 && (
                <Badge variant="destructive" className="h-5">
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {completedCount}/{sectionFields.length}
              </span>
              {completedCount === sectionFields.length && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-4 pt-4 md:grid-cols-2">
            {sectionFields.map(field => renderField(field))}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // Calculate completion stats
  const stats = useMemo(() => {
    const total = fieldSchema.length;
    const filled = fieldSchema.filter(f => {
      const value = localValues[f.name];
      return value !== null && value !== undefined && value !== '';
    }).length;
    const required = fieldSchema.filter(f => f.required).length;
    const requiredFilled = fieldSchema.filter(f => {
      if (!f.required) return false;
      const value = localValues[f.name];
      return value !== null && value !== undefined && value !== '';
    }).length;
    const errors = Object.values(fieldStates).filter(s => s?.error).length;

    return {
      total,
      filled,
      required,
      requiredFilled,
      errors,
      percentage: Math.round((filled / total) * 100),
    };
  }, [fieldSchema, localValues, fieldStates]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">ACORD {formNumber}</h2>
          <p className="text-muted-foreground">{formName}</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving...
            </div>
          )}
          <Button onClick={handleSave} disabled={saving || readOnly}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{stats.percentage}%</span>
                <span className="text-sm text-muted-foreground">Complete</span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-sm">
                <span className="font-medium">{stats.filled}</span>
                <span className="text-muted-foreground">/{stats.total} fields</span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-sm">
                <span className="font-medium">{stats.requiredFilled}</span>
                <span className="text-muted-foreground">/{stats.required} required</span>
              </div>
              {stats.errors > 0 && (
                <>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-sm text-red-500">
                    <span className="font-medium">{stats.errors}</span> error
                    {stats.errors > 1 ? 's' : ''}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={showOnlyRequired ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOnlyRequired(!showOnlyRequired)}
        >
          Required Only
        </Button>
        <Button
          variant={showOnlyErrors ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOnlyErrors(!showOnlyErrors)}
        >
          <AlertCircle className="mr-2 h-4 w-4" />
          Errors Only
        </Button>
        <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
          <TabsList>
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="all">All Fields</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Form Content */}
      {viewMode === 'sections' ? (
        <Accordion
          type="multiple"
          value={expandedSections}
          onValueChange={setExpandedSections}
          className="space-y-2"
        >
          {sectionDefinitions
            .sort((a, b) => a.sectionNumber - b.sectionNumber)
            .map(section => renderSection(section))}
        </Accordion>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredFields.map(field => renderField(field))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {filteredFields.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No fields found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AcordFormEditor;
