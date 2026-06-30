// ============================================
// ACORD Validation Panel Component
// Displays validation errors, warnings, and completion status
// ============================================

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ValidationResult, ValidationError, SectionDefinition } from '@/types/acord';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  FileCheck,
  ArrowRight,
  XCircle,
  Info,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface AcordValidationPanelProps {
  validationResult: ValidationResult;
  sectionDefinitions: SectionDefinition[];
  fieldValues: Record<string, any>;
  onRevalidate?: () => Promise<void>;
  onFieldFocus?: (fieldName: string) => void;
  isValidating?: boolean;
  carrierName?: string;
}

interface GroupedErrors {
  [section: string]: {
    errors: ValidationError[];
    warnings: ValidationError[];
  };
}

// ============================================
// COMPONENT
// ============================================

export function AcordValidationPanel({
  validationResult,
  sectionDefinitions,
  fieldValues,
  onRevalidate,
  onFieldFocus,
  isValidating = false,
  carrierName,
}: AcordValidationPanelProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // Group errors by section
  const groupedErrors = useMemo(() => {
    const grouped: GroupedErrors = {};

    // Create default groups for each section
    sectionDefinitions.forEach(section => {
      grouped[section.sectionName] = { errors: [], warnings: [] };
    });

    // Add ungrouped section
    grouped['Other'] = { errors: [], warnings: [] };

    // Group errors
    validationResult.errors.forEach(error => {
      // Find which section this field belongs to
      let sectionName = 'Other';
      for (const section of sectionDefinitions) {
        if (section.fields?.includes(error.field)) {
          sectionName = section.sectionName;
          break;
        }
      }

      if (!grouped[sectionName]) {
        grouped[sectionName] = { errors: [], warnings: [] };
      }
      grouped[sectionName].errors.push(error);
    });

    // Group warnings
    validationResult.warnings.forEach(warning => {
      let sectionName = 'Other';
      for (const section of sectionDefinitions) {
        if (section.fields?.includes(warning.field)) {
          sectionName = section.sectionName;
          break;
        }
      }

      if (!grouped[sectionName]) {
        grouped[sectionName] = { errors: [], warnings: [] };
      }
      grouped[sectionName].warnings.push(warning);
    });

    // Remove empty sections
    Object.keys(grouped).forEach(key => {
      if (grouped[key].errors.length === 0 && grouped[key].warnings.length === 0) {
        delete grouped[key];
      }
    });

    return grouped;
  }, [validationResult, sectionDefinitions]);

  // Calculate section completion
  const sectionCompletion = useMemo(() => {
    const completion: Record<string, { total: number; filled: number; percentage: number }> = {};

    sectionDefinitions.forEach(section => {
      const total = section.fields?.length || 0;
      const filled = section.fields?.filter(field => {
        const value = fieldValues[field];
        return value !== null && value !== undefined && value !== '';
      }).length || 0;

      completion[section.sectionName] = {
        total,
        filled,
        percentage: total > 0 ? Math.round((filled / total) * 100) : 100,
      };
    });

    return completion;
  }, [sectionDefinitions, fieldValues]);

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionName)
        ? prev.filter(s => s !== sectionName)
        : [...prev, sectionName]
    );
  };

  const getStatusIcon = () => {
    if (validationResult.errors.length > 0) {
      return <XCircle className="h-5 w-5 text-destructive" />;
    }
    if (validationResult.warnings.length > 0) {
      return <AlertTriangle className="h-5 w-5 text-warning" />;
    }
    if (validationResult.completionPercentage < 100) {
      return <Info className="h-5 w-5 text-info" />;
    }
    return <CheckCircle className="h-5 w-5 text-success" />;
  };

  const getStatusMessage = () => {
    if (validationResult.errors.length > 0) {
      return `${validationResult.errors.length} error${validationResult.errors.length > 1 ? 's' : ''} found`;
    }
    if (validationResult.warnings.length > 0) {
      return `${validationResult.warnings.length} warning${validationResult.warnings.length > 1 ? 's' : ''}`;
    }
    if (validationResult.completionPercentage < 100) {
      return `${validationResult.completionPercentage}% complete`;
    }
    return 'Ready for submission';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-lg">Validation Status</CardTitle>
              <CardDescription>{getStatusMessage()}</CardDescription>
            </div>
          </div>
          {onRevalidate && (
            <Button variant="outline" size="sm" onClick={onRevalidate} disabled={isValidating}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
              Revalidate
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Completion Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Form Completion</span>
            <span>{validationResult.completionPercentage}%</span>
          </div>
          <Progress value={validationResult.completionPercentage} className="h-2" />
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-destructive">
              {validationResult.errors.length}
            </div>
            <div className="text-xs text-muted-foreground">Errors</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-warning">
              {validationResult.warnings.length}
            </div>
            <div className="text-xs text-muted-foreground">Warnings</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-success">
              {validationResult.valid ? (
                <CheckCircle className="h-6 w-6 mx-auto" />
              ) : (
                <XCircle className="h-6 w-6 mx-auto" />
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {validationResult.valid ? 'Valid' : 'Invalid'}
            </div>
          </div>
        </div>

        {/* Carrier Requirements */}
        {carrierName && (
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileCheck className="h-4 w-4" />
              Validating for: {carrierName}
            </div>
          </div>
        )}

        {/* Grouped Errors and Warnings */}
        {Object.keys(groupedErrors).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Issues by Section</h4>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-4">
                {Object.entries(groupedErrors).map(([sectionName, { errors, warnings }]) => (
                  <Collapsible
                    key={sectionName}
                    open={expandedSections.includes(sectionName)}
                    onOpenChange={() => toggleSection(sectionName)}
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        {expandedSections.includes(sectionName) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="font-medium">{sectionName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {errors.length > 0 && (
                          <Badge variant="destructive" className="h-5">
                            {errors.length} error{errors.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {warnings.length > 0 && (
                          <Badge variant="outline" className="h-5 border-warning text-warning">
                            {warnings.length} warning{warnings.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 pb-1">
                      <div className="ml-6 space-y-2">
                        {errors.map((error, idx) => (
                          <div
                            key={`error-${idx}`}
                            className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm"
                          >
                            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <span className="font-mono text-xs text-muted-foreground">
                                {error.field}
                              </span>
                              <p className="text-destructive">{error.message}</p>
                            </div>
                            {onFieldFocus && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => onFieldFocus(error.field)}
                              >
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                        {warnings.map((warning, idx) => (
                          <div
                            key={`warning-${idx}`}
                            className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-sm"
                          >
                            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <span className="font-mono text-xs text-muted-foreground">
                                {warning.field}
                              </span>
                              <p className="text-warning">
                                {warning.message}
                              </p>
                            </div>
                            {onFieldFocus && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => onFieldFocus(warning.field)}
                              >
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Section Completion */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Section Completion</h4>
          <div className="space-y-2">
            {sectionDefinitions
              .sort((a, b) => a.sectionNumber - b.sectionNumber)
              .map(section => {
                const completion = sectionCompletion[section.sectionName];
                if (!completion) return null;

                return (
                  <div key={section.sectionNumber} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate">
                        {section.sectionNumber}. {section.sectionName}
                      </span>
                      <span className="text-muted-foreground">
                        {completion.filled}/{completion.total}
                      </span>
                    </div>
                    <Progress value={completion.percentage} className="h-1.5" />
                  </div>
                );
              })}
          </div>
        </div>

        {/* All Valid Message */}
        {validationResult.valid && validationResult.completionPercentage === 100 && (
          <div className="flex items-center gap-3 rounded-lg bg-success/10 p-4">
            <CheckCircle className="h-6 w-6 text-success" />
            <div>
              <p className="font-medium text-success">
                Form is complete and valid
              </p>
              <p className="text-sm text-success">
                Ready for PDF generation and submission
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AcordValidationPanel;
