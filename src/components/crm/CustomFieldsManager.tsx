import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Settings, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'currency' | 'percentage' | 'phone' | 'email';

interface CustomField {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // For select/multiselect
  defaultValue?: any;
  helpText?: string;
  entityTypes: ('lead' | 'policy' | 'account' | 'renewal')[];
  category?: string;
}

// Insurance-specific field templates
const INSURANCE_FIELD_TEMPLATES: Partial<CustomField>[] = [
  {
    name: 'deductible',
    label: 'Deductible Amount',
    type: 'currency',
    category: 'Policy Details',
    entityTypes: ['policy', 'renewal'],
  },
  {
    name: 'coverage_type',
    label: 'Coverage Type',
    type: 'multiselect',
    options: ['Liability', 'Collision', 'Comprehensive', 'Uninsured Motorist', 'Medical Payments', 'Personal Injury Protection'],
    category: 'Coverage',
    entityTypes: ['policy', 'renewal'],
  },
  {
    name: 'named_insured',
    label: 'Named Insured',
    type: 'text',
    category: 'Policy Details',
    entityTypes: ['policy'],
  },
  {
    name: 'effective_date',
    label: 'Policy Effective Date',
    type: 'date',
    category: 'Policy Details',
    entityTypes: ['policy', 'renewal'],
    required: true,
  },
  {
    name: 'expiration_date',
    label: 'Policy Expiration Date',
    type: 'date',
    category: 'Policy Details',
    entityTypes: ['policy', 'renewal'],
    required: true,
  },
  {
    name: 'claims_free_years',
    label: 'Claims-Free Years',
    type: 'number',
    category: 'Underwriting',
    entityTypes: ['lead', 'policy'],
  },
  {
    name: 'payment_plan',
    label: 'Payment Plan',
    type: 'select',
    options: ['Annual', 'Semi-Annual', 'Quarterly', 'Monthly', 'Pay-in-Full'],
    category: 'Billing',
    entityTypes: ['policy', 'renewal'],
  },
  {
    name: 'autopay_enrolled',
    label: 'AutoPay Enrolled',
    type: 'boolean',
    category: 'Billing',
    entityTypes: ['policy', 'renewal'],
  },
  {
    name: 'credit_score',
    label: 'Credit Score',
    type: 'number',
    category: 'Underwriting',
    entityTypes: ['lead', 'account'],
  },
  {
    name: 'prior_carrier',
    label: 'Prior Carrier',
    type: 'text',
    category: 'History',
    entityTypes: ['lead', 'policy'],
  },
  {
    name: 'lapse_in_coverage',
    label: 'Had Coverage Lapse',
    type: 'boolean',
    category: 'History',
    entityTypes: ['lead'],
  },
  {
    name: 'bundled_policies',
    label: 'Bundled Policies',
    type: 'multiselect',
    options: ['Auto', 'Home', 'Life', 'Umbrella', 'Renters', 'Boat', 'RV'],
    category: 'Cross-Sell',
    entityTypes: ['account', 'policy'],
  },
  {
    name: 'referral_source',
    label: 'Referral Source',
    type: 'text',
    category: 'Marketing',
    entityTypes: ['lead', 'account'],
  },
  {
    name: 'renewal_incentive',
    label: 'Renewal Incentive Applied',
    type: 'select',
    options: ['None', 'Discount', 'Gift Card', 'Premium Reduction', 'Enhanced Coverage'],
    category: 'Retention',
    entityTypes: ['renewal'],
  },
];

interface CustomFieldsManagerProps {
  entityType: 'lead' | 'policy' | 'account' | 'renewal';
  fields?: CustomField[];
  onFieldsChange?: (fields: CustomField[]) => void;
}

export function CustomFieldsManager({ 
  entityType,
  fields = [],
  onFieldsChange 
}: CustomFieldsManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [newField, setNewField] = useState<Partial<CustomField>>({
    entityTypes: [entityType],
    required: false,
  });

  const relevantTemplates = INSURANCE_FIELD_TEMPLATES.filter(
    t => t.entityTypes?.includes(entityType)
  );

  const handleSaveField = () => {
    if (!newField.name || !newField.label || !newField.type) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in name, label, and type',
        variant: 'destructive',
      });
      return;
    }

    const field: CustomField = {
      id: editingField?.id || `field-${Date.now()}`,
      name: newField.name!,
      label: newField.label!,
      type: newField.type!,
      required: newField.required || false,
      options: newField.options,
      defaultValue: newField.defaultValue,
      helpText: newField.helpText,
      entityTypes: newField.entityTypes || [entityType],
      category: newField.category,
    };

    const updatedFields = editingField
      ? fields.map(f => f.id === editingField.id ? field : f)
      : [...fields, field];

    onFieldsChange?.(updatedFields);
    setIsDialogOpen(false);
    setNewField({ entityTypes: [entityType], required: false });
    setEditingField(null);

    toast({
      title: editingField ? 'Field updated' : 'Field added',
      description: `Custom field "${field.label}" has been saved`,
    });
  };

  const handleDeleteField = (fieldId: string) => {
    const updatedFields = fields.filter(f => f.id !== fieldId);
    onFieldsChange?.(updatedFields);
    toast({
      title: 'Field deleted',
      description: 'Custom field has been removed',
    });
  };

  const handleApplyTemplate = (template: Partial<CustomField>) => {
    setNewField({
      ...template,
      entityTypes: [entityType],
    });
  };

  const groupedFields = fields.reduce((acc, field) => {
    const category = field.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(field);
    return acc;
  }, {} as Record<string, CustomField[]>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Custom Fields</CardTitle>
            <CardDescription>
              Add insurance-specific fields to capture specialized data
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Field
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingField ? 'Edit Custom Field' : 'Add Custom Field'}
                </DialogTitle>
                <DialogDescription>
                  Create a custom field for {entityType}s
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Quick Templates */}
                {!editingField && relevantTemplates.length > 0 && (
                  <div className="space-y-2">
                    <Label>Quick Templates (Insurance)</Label>
                    <div className="flex flex-wrap gap-2">
                      {relevantTemplates.map((template, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          onClick={() => handleApplyTemplate(template)}
                        >
                          {template.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Field Configuration */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Field Name (API)</Label>
                    <Input
                      placeholder="field_name"
                      value={newField.name || ''}
                      onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Display Label</Label>
                    <Input
                      placeholder="Field Label"
                      value={newField.label || ''}
                      onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Field Type</Label>
                    <Select
                      value={newField.type}
                      onValueChange={(value: FieldType) => setNewField({ ...newField, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="currency">Currency</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="select">Select (Dropdown)</SelectItem>
                        <SelectItem value="multiselect">Multi-Select</SelectItem>
                        <SelectItem value="boolean">Yes/No</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      placeholder="e.g., Policy Details"
                      value={newField.category || ''}
                      onChange={(e) => setNewField({ ...newField, category: e.target.value })}
                    />
                  </div>
                </div>

                {(newField.type === 'select' || newField.type === 'multiselect') && (
                  <div className="space-y-2">
                    <Label>Options (one per line)</Label>
                    <Textarea
                      placeholder="Option 1&#10;Option 2&#10;Option 3"
                      value={newField.options?.join('\n') || ''}
                      onChange={(e) => setNewField({ 
                        ...newField, 
                        options: e.target.value.split('\n').filter(o => o.trim()) 
                      })}
                      rows={4}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Help Text (optional)</Label>
                  <Input
                    placeholder="Additional guidance for users"
                    value={newField.helpText || ''}
                    onChange={(e) => setNewField({ ...newField, helpText: e.target.value })}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={newField.required}
                    onCheckedChange={(checked) => setNewField({ ...newField, required: checked })}
                  />
                  <Label>Required Field</Label>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleSaveField} className="flex-1">
                    {editingField ? 'Update Field' : 'Add Field'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsDialogOpen(false);
                      setNewField({ entityTypes: [entityType], required: false });
                      setEditingField(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No custom fields defined yet</p>
            <p className="text-sm">Add insurance-specific fields to capture specialized data</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedFields).map(([category, categoryFields]) => (
              <div key={category} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">{category}</h3>
                <div className="space-y-2">
                  {categoryFields.map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{field.label}</span>
                          {field.required && (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">{field.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {field.name}
                          {field.helpText && ` • ${field.helpText}`}
                        </p>
                        {field.options && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {field.options.slice(0, 3).map((opt, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {opt}
                              </Badge>
                            ))}
                            {field.options.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{field.options.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingField(field);
                            setNewField(field);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteField(field.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
