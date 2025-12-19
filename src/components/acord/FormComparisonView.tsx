// ============================================
// Year-Over-Year Form Comparison View
// Compares ACORD forms between periods to highlight changes
// ============================================

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowUp,
  ArrowDown,
  Minus,
  Plus,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Calendar,
} from 'lucide-react';
import type { FormComparison } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface FormComparisonData {
  priorForm: ComparisonForm;
  currentForm: ComparisonForm;
  comparisons: FormComparison[];
  summary: ComparisonSummary;
}

export interface ComparisonForm {
  id: string;
  formNumber: string;
  formName: string;
  effectiveDate: string;
  fieldValues: Record<string, any>;
  completionPercentage: number;
}

export interface ComparisonSummary {
  totalFields: number;
  unchangedCount: number;
  increasedCount: number;
  decreasedCount: number;
  addedCount: number;
  removedCount: number;
  criticalChanges: number;
  attentionChanges: number;
}

export interface FormComparisonViewProps {
  accountId: string;
  forms: ComparisonForm[];
  onFormSelect?: (priorId: string, currentId: string) => void;
}

// ============================================
// COMPARISON LOGIC
// ============================================

export function compareFormValues(
  priorValues: Record<string, any>,
  currentValues: Record<string, any>,
  fieldLabels: Record<string, string>
): { comparisons: FormComparison[]; summary: ComparisonSummary } {
  const comparisons: FormComparison[] = [];
  const summary: ComparisonSummary = {
    totalFields: 0,
    unchangedCount: 0,
    increasedCount: 0,
    decreasedCount: 0,
    addedCount: 0,
    removedCount: 0,
    criticalChanges: 0,
    attentionChanges: 0,
  };

  const allFields = new Set([
    ...Object.keys(priorValues),
    ...Object.keys(currentValues),
  ]);

  for (const fieldName of allFields) {
    summary.totalFields++;
    const priorValue = priorValues[fieldName];
    const currentValue = currentValues[fieldName];
    const label = fieldLabels[fieldName] || fieldName;

    let changeType: FormComparison['change_type'] = 'unchanged';
    let significance: FormComparison['significance'] = 'normal';

    // Determine change type
    if (priorValue === undefined && currentValue !== undefined) {
      changeType = 'added';
      summary.addedCount++;
    } else if (priorValue !== undefined && currentValue === undefined) {
      changeType = 'removed';
      summary.removedCount++;
      significance = 'attention';
      summary.attentionChanges++;
    } else if (priorValue !== currentValue) {
      // Check if numeric comparison
      const priorNum = parseFloat(priorValue);
      const currentNum = parseFloat(currentValue);

      if (!isNaN(priorNum) && !isNaN(currentNum)) {
        if (currentNum > priorNum) {
          changeType = 'increased';
          summary.increasedCount++;

          // Determine significance for numeric changes
          const percentChange = Math.abs((currentNum - priorNum) / priorNum) * 100;
          if (percentChange > 50) {
            significance = 'critical';
            summary.criticalChanges++;
          } else if (percentChange > 20) {
            significance = 'attention';
            summary.attentionChanges++;
          }
        } else {
          changeType = 'decreased';
          summary.decreasedCount++;

          const percentChange = Math.abs((priorNum - currentNum) / priorNum) * 100;
          if (percentChange > 50) {
            significance = 'critical';
            summary.criticalChanges++;
          } else if (percentChange > 20) {
            significance = 'attention';
            summary.attentionChanges++;
          }
        }
      } else {
        changeType = 'modified';
      }
    } else {
      summary.unchangedCount++;
    }

    // Check for critical field patterns
    const criticalPatterns = [
      'claims', 'losses', 'payroll', 'revenue', 'employees', 'drivers',
      'vehicles', 'locations', 'coverage', 'limit', 'premium', 'deductible',
    ];
    if (
      criticalPatterns.some(p => fieldName.toLowerCase().includes(p)) &&
      changeType !== 'unchanged'
    ) {
      if (significance !== 'critical') {
        significance = 'attention';
        if (!summary.attentionChanges) summary.attentionChanges++;
      }
    }

    comparisons.push({
      field_name: fieldName,
      field_label: label,
      prior_value: priorValue,
      current_value: currentValue,
      change_type: changeType,
      significance,
    });
  }

  return { comparisons, summary };
}

// ============================================
// COMPONENT
// ============================================

export function FormComparisonView({
  accountId,
  forms,
  onFormSelect,
}: FormComparisonViewProps) {
  const [priorFormId, setPriorFormId] = useState<string>(forms[1]?.id || '');
  const [currentFormId, setCurrentFormId] = useState<string>(forms[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'all' | 'changes' | 'critical'>('changes');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['critical']));

  const priorForm = forms.find(f => f.id === priorFormId);
  const currentForm = forms.find(f => f.id === currentFormId);

  // Generate field labels from form number (in real implementation, from template)
  const fieldLabels: Record<string, string> = useMemo(() => {
    const labels: Record<string, string> = {};
    if (currentForm) {
      Object.keys(currentForm.fieldValues).forEach(key => {
        // Convert field name to readable label
        labels[key] = key
          .replace(/_/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .replace(/^\w/, c => c.toUpperCase())
          .trim();
      });
    }
    return labels;
  }, [currentForm]);

  // Compute comparison
  const comparisonData = useMemo(() => {
    if (!priorForm || !currentForm) return null;

    const { comparisons, summary } = compareFormValues(
      priorForm.fieldValues,
      currentForm.fieldValues,
      fieldLabels
    );

    return {
      priorForm,
      currentForm,
      comparisons,
      summary,
    };
  }, [priorForm, currentForm, fieldLabels]);

  // Filter comparisons based on active tab
  const filteredComparisons = useMemo(() => {
    if (!comparisonData) return [];

    switch (activeTab) {
      case 'changes':
        return comparisonData.comparisons.filter(c => c.change_type !== 'unchanged');
      case 'critical':
        return comparisonData.comparisons.filter(
          c => c.significance === 'critical' || c.significance === 'attention'
        );
      default:
        return comparisonData.comparisons;
    }
  }, [comparisonData, activeTab]);

  // Group comparisons by section (first part of field name)
  const groupedComparisons = useMemo(() => {
    const groups: Record<string, FormComparison[]> = {};

    filteredComparisons.forEach(comp => {
      // Try to extract section from field name
      const parts = comp.field_name.split(/[_\.]/);
      const section = parts.length > 1 ? parts[0] : 'General';

      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(comp);
    });

    return groups;
  }, [filteredComparisons]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleFormSelection = (type: 'prior' | 'current', formId: string) => {
    if (type === 'prior') {
      setPriorFormId(formId);
    } else {
      setCurrentFormId(formId);
    }
    if (onFormSelect) {
      onFormSelect(
        type === 'prior' ? formId : priorFormId,
        type === 'current' ? formId : currentFormId
      );
    }
  };

  if (forms.length < 2) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            At least two forms are needed for comparison.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Year-Over-Year Comparison</CardTitle>
            <CardDescription>
              Compare form values between periods to identify changes
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Prior:</span>
              <Select value={priorFormId} onValueChange={(v) => handleFormSelection('prior', v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {forms.filter(f => f.id !== currentFormId).map(form => (
                    <SelectItem key={form.id} value={form.id}>
                      {new Date(form.effectiveDate).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Current:</span>
              <Select value={currentFormId} onValueChange={(v) => handleFormSelection('current', v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {forms.filter(f => f.id !== priorFormId).map(form => (
                    <SelectItem key={form.id} value={form.id}>
                      {new Date(form.effectiveDate).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {comparisonData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-6 gap-4 mb-6">
              <SummaryCard
                label="Total Fields"
                value={comparisonData.summary.totalFields}
                icon={<FileText className="h-4 w-4" />}
              />
              <SummaryCard
                label="Unchanged"
                value={comparisonData.summary.unchangedCount}
                icon={<Check className="h-4 w-4 text-green-500" />}
                variant="success"
              />
              <SummaryCard
                label="Increased"
                value={comparisonData.summary.increasedCount}
                icon={<ArrowUp className="h-4 w-4 text-blue-500" />}
                variant="info"
              />
              <SummaryCard
                label="Decreased"
                value={comparisonData.summary.decreasedCount}
                icon={<ArrowDown className="h-4 w-4 text-orange-500" />}
                variant="warning"
              />
              <SummaryCard
                label="Critical"
                value={comparisonData.summary.criticalChanges}
                icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                variant="danger"
              />
              <SummaryCard
                label="Attention"
                value={comparisonData.summary.attentionChanges}
                icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
                variant="warning"
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="mb-4">
                <TabsTrigger value="changes">
                  Changes Only ({comparisonData.comparisons.filter(c => c.change_type !== 'unchanged').length})
                </TabsTrigger>
                <TabsTrigger value="critical">
                  Critical & Attention ({comparisonData.summary.criticalChanges + comparisonData.summary.attentionChanges})
                </TabsTrigger>
                <TabsTrigger value="all">
                  All Fields ({comparisonData.summary.totalFields})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab}>
                <ScrollArea className="h-[500px]">
                  {Object.keys(groupedComparisons).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No fields to display for this filter.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(groupedComparisons).map(([section, fields]) => (
                        <div key={section} className="border rounded-lg">
                          <button
                            className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
                            onClick={() => toggleSection(section)}
                          >
                            <div className="flex items-center gap-2">
                              {expandedSections.has(section) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <span className="font-medium capitalize">{section}</span>
                              <Badge variant="secondary">{fields.length} fields</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {fields.some(f => f.significance === 'critical') && (
                                <Badge variant="destructive">Critical</Badge>
                              )}
                              {fields.some(f => f.significance === 'attention') && (
                                <Badge className="bg-yellow-500">Attention</Badge>
                              )}
                            </div>
                          </button>

                          {expandedSections.has(section) && (
                            <div className="border-t">
                              {fields.map((comparison, idx) => (
                                <ComparisonRow key={comparison.field_name} comparison={comparison} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function SummaryCard({
  label,
  value,
  icon,
  variant = 'default',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const bgColors = {
    default: 'bg-muted',
    success: 'bg-green-50 dark:bg-green-950',
    warning: 'bg-yellow-50 dark:bg-yellow-950',
    danger: 'bg-red-50 dark:bg-red-950',
    info: 'bg-blue-50 dark:bg-blue-950',
  };

  return (
    <div className={`p-4 rounded-lg ${bgColors[variant]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function ComparisonRow({ comparison }: { comparison: FormComparison }) {
  const getChangeIcon = () => {
    switch (comparison.change_type) {
      case 'increased':
        return <ArrowUp className="h-4 w-4 text-blue-500" />;
      case 'decreased':
        return <ArrowDown className="h-4 w-4 text-orange-500" />;
      case 'added':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />;
      case 'modified':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Check className="h-4 w-4 text-gray-400" />;
    }
  };

  const getSignificanceBadge = () => {
    if (comparison.significance === 'critical') {
      return <Badge variant="destructive">Critical</Badge>;
    }
    if (comparison.significance === 'attention') {
      return <Badge className="bg-yellow-500">Attention</Badge>;
    }
    return null;
  };

  return (
    <div className="flex items-center p-3 border-b last:border-b-0 hover:bg-muted/30">
      <div className="w-8">{getChangeIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{comparison.field_label}</div>
        <div className="text-xs text-muted-foreground truncate">
          {comparison.field_name}
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="w-32 text-right">
          <span className="text-muted-foreground">Prior: </span>
          <span className={comparison.change_type !== 'unchanged' ? 'line-through opacity-50' : ''}>
            {formatValue(comparison.prior_value)}
          </span>
        </div>
        <div className="w-32 text-right font-medium">
          <span className="text-muted-foreground">Current: </span>
          <span>{formatValue(comparison.current_value)}</span>
        </div>
        <div className="w-24">{getSignificanceBadge()}</div>
      </div>
    </div>
  );
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    // Format as currency if looks like money
    if (value >= 1000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    }
    return value.toLocaleString();
  }
  return String(value);
}

export default FormComparisonView;
