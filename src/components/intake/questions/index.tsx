// ============================================
// Intake Question Components
// Renders different question types for intake forms
// ============================================

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { IntakeQuestion, QuestionType, SelectOption } from '@/types/intake';
import {
  Calendar as CalendarIcon,
  Upload,
  X,
  Plus,
  Trash2,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface QuestionProps {
  question: IntakeQuestion;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
  showHelp?: boolean;
}

// ============================================
// MAIN QUESTION RENDERER
// ============================================

export function IntakeQuestionRenderer({
  question,
  value,
  onChange,
  error,
  disabled = false,
  showHelp = true,
}: QuestionProps) {
  // Render based on question type
  const renderQuestion = () => {
    switch (question.type) {
      case 'text':
        return <TextQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'textarea':
        return <TextareaQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'number':
        return <NumberQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'currency':
        return <CurrencyQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'date':
        return <DateQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'datetime':
        return <DateTimeQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'select':
        return <SelectQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'multi_select':
        return <MultiSelectQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'checkbox':
        return <CheckboxQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'radio':
        return <RadioQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'file':
        return <FileQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'address':
        return <AddressQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'phone':
        return <PhoneQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'email':
        return <EmailQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'ssn':
        return <SSNQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'ein':
        return <EINQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'vin':
        return <VINQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'repeater':
        return <RepeaterQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
      case 'section_header':
        return <SectionHeader question={question} />;
      case 'info_text':
        return <InfoText question={question} />;
      default:
        return <TextQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
    }
  };

  // Don't wrap section headers and info text
  if (question.type === 'section_header' || question.type === 'info_text') {
    return renderQuestion();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between">
        <Label htmlFor={question.id} className="text-sm font-medium">
          {question.label}
          {question.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {showHelp && question.helpText && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm">
              {question.helpText}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}

      {renderQuestion()}

      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================
// INDIVIDUAL QUESTION COMPONENTS
// ============================================

function TextQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <Input
      id={question.id}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder}
      disabled={disabled}
      maxLength={question.validation?.maxLength}
    />
  );
}

function TextareaQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <Textarea
      id={question.id}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder}
      disabled={disabled}
      maxLength={question.validation?.maxLength}
      rows={4}
    />
  );
}

function NumberQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <Input
      id={question.id}
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      placeholder={question.placeholder}
      disabled={disabled}
      min={question.validation?.min}
      max={question.validation?.max}
    />
  );
}

function CurrencyQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const [displayValue, setDisplayValue] = useState(
    value ? formatCurrency(value) : ''
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setDisplayValue(e.target.value);
    onChange(raw ? parseFloat(raw) : null);
  };

  const handleBlur = () => {
    if (value) {
      setDisplayValue(formatCurrency(value));
    }
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
      <Input
        id={question.id}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={question.placeholder || '0.00'}
        disabled={disabled}
        className="pl-7"
      />
    </div>
  );
}

function DateQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={question.id}
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : question.placeholder || 'Select date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? d.toISOString().split('T')[0] : null);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function DateTimeQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <Input
      id={question.id}
      type="datetime-local"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

function SelectQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={question.id}>
        <SelectValue placeholder={question.placeholder || 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        {question.options?.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
            {option.description && (
              <span className="text-muted-foreground ml-2">
                - {option.description}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const selected: string[] = value || [];

  const toggleOption = (optionValue: string) => {
    if (selected.includes(optionValue)) {
      onChange(selected.filter((v) => v !== optionValue));
    } else {
      onChange([...selected, optionValue]);
    }
  };

  return (
    <div className="space-y-2">
      {question.options?.map((option) => (
        <div key={option.value} className="flex items-center space-x-2">
          <Checkbox
            id={`${question.id}-${option.value}`}
            checked={selected.includes(option.value)}
            onCheckedChange={() => toggleOption(option.value)}
            disabled={disabled || option.disabled}
          />
          <Label
            htmlFor={`${question.id}-${option.value}`}
            className="text-sm font-normal"
          >
            {option.label}
          </Label>
        </div>
      ))}
    </div>
  );
}

function CheckboxQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={question.id}
        checked={!!value}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      <Label htmlFor={question.id} className="text-sm font-normal">
        {question.description || 'Yes'}
      </Label>
    </div>
  );
}

function RadioQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <RadioGroup value={value || ''} onValueChange={onChange} disabled={disabled}>
      {question.options?.map((option) => (
        <div key={option.value} className="flex items-center space-x-2">
          <RadioGroupItem value={option.value} id={`${question.id}-${option.value}`} />
          <Label htmlFor={`${question.id}-${option.value}`} className="text-sm font-normal">
            {option.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

function FileQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const files: File[] = value || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    onChange([...files, ...newFiles]);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          id={question.id}
          type="file"
          onChange={handleFileChange}
          disabled={disabled}
          accept={question.validation?.allowedFileTypes?.join(',')}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById(question.id)?.click()}
          disabled={disabled}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload File
        </Button>
        {question.validation?.allowedFileTypes && (
          <span className="text-xs text-muted-foreground">
            Allowed: {question.validation.allowedFileTypes.join(', ')}
          </span>
        )}
      </div>
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <span className="truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddressQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const address = value || {
    street: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
  };

  const updateField = (field: string, val: string) => {
    onChange({ ...address, [field]: val });
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Street Address"
        value={address.street}
        onChange={(e) => updateField('street', e.target.value)}
        disabled={disabled}
      />
      <Input
        placeholder="Apt, Suite, Unit (optional)"
        value={address.street2}
        onChange={(e) => updateField('street2', e.target.value)}
        disabled={disabled}
      />
      <div className="grid grid-cols-6 gap-2">
        <Input
          placeholder="City"
          value={address.city}
          onChange={(e) => updateField('city', e.target.value)}
          disabled={disabled}
          className="col-span-3"
        />
        <Input
          placeholder="State"
          value={address.state}
          onChange={(e) => updateField('state', e.target.value.toUpperCase())}
          disabled={disabled}
          maxLength={2}
          className="col-span-1"
        />
        <Input
          placeholder="ZIP"
          value={address.zip}
          onChange={(e) => updateField('zip', e.target.value)}
          disabled={disabled}
          maxLength={10}
          className="col-span-2"
        />
      </div>
    </div>
  );
}

function PhoneQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const formatPhone = (input: string) => {
    const digits = input.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  return (
    <Input
      id={question.id}
      type="tel"
      value={formatPhone(value || '')}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder={question.placeholder || '(555) 555-5555'}
      disabled={disabled}
      maxLength={14}
    />
  );
}

function EmailQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <Input
      id={question.id}
      type="email"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder || 'email@example.com'}
      disabled={disabled}
    />
  );
}

function SSNQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const [showSSN, setShowSSN] = useState(false);

  const formatSSN = (input: string) => {
    const digits = input.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
  };

  const maskedValue = value ? `***-**-${value.slice(-4)}` : '';

  return (
    <div className="relative">
      <Input
        id={question.id}
        type={showSSN ? 'text' : 'password'}
        value={showSSN ? formatSSN(value || '') : (value ? maskedValue : '')}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder="XXX-XX-XXXX"
        disabled={disabled}
        maxLength={11}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
        onClick={() => setShowSSN(!showSSN)}
      >
        {showSSN ? 'Hide' : 'Show'}
      </Button>
    </div>
  );
}

function EINQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const formatEIN = (input: string) => {
    const digits = input.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
  };

  return (
    <Input
      id={question.id}
      value={formatEIN(value || '')}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder="XX-XXXXXXX"
      disabled={disabled}
      maxLength={10}
    />
  );
}

function VINQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  return (
    <Input
      id={question.id}
      value={(value || '').toUpperCase()}
      onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))}
      placeholder="17-character VIN"
      disabled={disabled}
      maxLength={17}
      className="font-mono"
    />
  );
}

function RepeaterQuestion({ question, value, onChange, disabled }: Omit<QuestionProps, 'error'>) {
  const items: Record<string, any>[] = value || [];
  const config = question.repeaterConfig;

  const addItem = () => {
    if (config?.maxItems && items.length >= config.maxItems) return;
    onChange([...items, {}]);
  };

  const removeItem = (index: number) => {
    if (config?.minItems && items.length <= config.minItems) return;
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, fieldId: string, fieldValue: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [fieldId]: fieldValue };
    onChange(updated);
  };

  const getItemLabel = (index: number) => {
    if (config?.itemLabelTemplate) {
      return config.itemLabelTemplate.replace('{index}', String(index + 1));
    }
    return `${config?.itemLabel || 'Item'} ${index + 1}`;
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{getItemLabel(index)}</h4>
            {(!config?.minItems || items.length > config.minItems) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(index)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {config?.fields?.map((field) => (
              <IntakeQuestionRenderer
                key={field.id}
                question={field}
                value={item[field.id]}
                onChange={(val) => updateItem(index, field.id, val)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}

      {(!config?.maxItems || items.length < config.maxItems) && (
        <Button
          type="button"
          variant="outline"
          onClick={addItem}
          disabled={disabled}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          {config?.addButtonText || `Add ${config?.itemLabel || 'Item'}`}
        </Button>
      )}
    </div>
  );
}

function SectionHeader({ question }: { question: IntakeQuestion }) {
  return (
    <div className="pt-6 pb-2">
      <h3 className="text-lg font-semibold">{question.label}</h3>
      {question.description && (
        <p className="text-sm text-muted-foreground mt-1">{question.description}</p>
      )}
    </div>
  );
}

function InfoText({ question }: { question: IntakeQuestion }) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      {question.label && <h4 className="font-medium mb-1">{question.label}</h4>}
      <p className="text-sm text-muted-foreground">{question.description}</p>
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default IntakeQuestionRenderer;
