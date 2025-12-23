/**
 * Coverage Matrix Component
 * 
 * Displays a professional coverage-by-coverage comparison matrix
 * with concern levels, evidence links, and visual indicators.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  ExternalLink,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CoverageMatrixRow {
  coverageKey: string;
  displayName: string;
  category: string;
  
  // Document A (Current Policy)
  currentStatus: 'INCLUDED' | 'EXCLUDED' | 'NOT_FOUND' | 'CONFLICT';
  currentTerms?: {
    limit?: string;
    deductible?: string;
    basis?: string;
  };
  currentEvidenceIds?: string[];
  currentConfidence?: number;
  
  // Document B (Quote)
  quoteStatus: 'INCLUDED' | 'EXCLUDED' | 'NOT_FOUND' | 'CONFLICT';
  quoteTerms?: {
    limit?: string;
    deductible?: string;
    basis?: string;
  };
  quoteEvidenceIds?: string[];
  quoteConfidence?: number;
  
  // Comparison
  changeType: 'unchanged' | 'added' | 'removed' | 'increased' | 'decreased' | 'modified';
  concernLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  concernReason?: string;
  
  // Flags
  requiresVerification?: boolean;
}

interface CoverageMatrixProps {
  rows: CoverageMatrixRow[];
  documentALabel?: string;
  documentBLabel?: string;
  onEvidenceClick?: (evidenceIds: string[], docRole: 'A' | 'B') => void;
}

const STATUS_CONFIG = {
  INCLUDED: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30', label: 'Included' },
  EXCLUDED: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30', label: 'Excluded' },
  NOT_FOUND: { icon: HelpCircle, color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-950/30', label: 'Not Found' },
  CONFLICT: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'Conflict' },
};

const CONCERN_CONFIG = {
  LOW: { color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', label: 'Low' },
  MEDIUM: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', label: 'Medium' },
  HIGH: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', label: 'High' },
  CRITICAL: { color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', label: 'Critical' },
};

const CHANGE_ICONS = {
  unchanged: { icon: Minus, color: 'text-gray-400' },
  added: { icon: CheckCircle2, color: 'text-green-600' },
  removed: { icon: XCircle, color: 'text-red-600' },
  increased: { icon: ArrowUp, color: 'text-green-600' },
  decreased: { icon: ArrowDown, color: 'text-red-600' },
  modified: { icon: AlertTriangle, color: 'text-amber-600' },
};

function StatusCell({ 
  status, 
  terms, 
  evidenceIds, 
  confidence,
  onEvidenceClick 
}: { 
  status: CoverageMatrixRow['currentStatus'];
  terms?: CoverageMatrixRow['currentTerms'];
  evidenceIds?: string[];
  confidence?: number;
  onEvidenceClick?: () => void;
}) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  
  return (
    <div className={cn('p-3 rounded-lg', config.bg)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-4 w-4', config.color)} />
        <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
        {confidence !== undefined && confidence < 0.8 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs px-1 py-0">
                  {Math.round(confidence * 100)}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Extraction confidence: {Math.round(confidence * 100)}%</p>
                <p className="text-xs text-muted-foreground">May need verification</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      {terms && (status === 'INCLUDED' || status === 'CONFLICT') && (
        <div className="text-xs space-y-0.5 text-muted-foreground">
          {terms.limit && <p>Limit: <span className="font-medium text-foreground">{terms.limit}</span></p>}
          {terms.deductible && <p>Ded: <span className="font-medium text-foreground">{terms.deductible}</span></p>}
          {terms.basis && <p>Basis: <span className="font-medium text-foreground">{terms.basis}</span></p>}
        </div>
      )}
      
      {evidenceIds && evidenceIds.length > 0 && onEvidenceClick && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 mt-1 text-xs"
          onClick={onEvidenceClick}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          View Source
        </Button>
      )}
    </div>
  );
}

export function CoverageMatrix({ 
  rows, 
  documentALabel = 'Current Policy',
  documentBLabel = 'Quote',
  onEvidenceClick 
}: CoverageMatrixProps) {
  // Group rows by category
  const groupedRows = rows.reduce((acc, row) => {
    const category = row.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(row);
    return acc;
  }, {} as Record<string, CoverageMatrixRow[]>);

  // Sort categories
  const categoryOrder = ['limits', 'deductibles', 'identifiers', 'dates', 'premium', 'forms', 'other'];
  const sortedCategories = Object.keys(groupedRows).sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a.toLowerCase());
    const bIdx = categoryOrder.indexOf(b.toLowerCase());
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  // Count concerns
  const criticalCount = rows.filter(r => r.concernLevel === 'CRITICAL').length;
  const highCount = rows.filter(r => r.concernLevel === 'HIGH').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Coverage Comparison Matrix
          </CardTitle>
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive">{criticalCount} Critical</Badge>
            )}
            {highCount > 0 && (
              <Badge className="bg-orange-500">{highCount} High</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2">
                <th className="text-left py-3 px-4 font-semibold w-1/4">Coverage</th>
                <th className="text-left py-3 px-4 font-semibold w-1/4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">A</Badge>
                    {documentALabel}
                  </div>
                </th>
                <th className="text-left py-3 px-4 font-semibold w-1/4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700">B</Badge>
                    {documentBLabel}
                  </div>
                </th>
                <th className="text-center py-3 px-4 font-semibold w-24">Change</th>
                <th className="text-center py-3 px-4 font-semibold w-28">Concern</th>
              </tr>
            </thead>
            <tbody>
              {sortedCategories.map((category) => (
                <React.Fragment key={category}>
                  <tr className="bg-muted/50">
                    <td colSpan={5} className="py-2 px-4 font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                      {category}
                    </td>
                  </tr>
                  {groupedRows[category].map((row) => {
                    const ChangeIcon = CHANGE_ICONS[row.changeType].icon;
                    const changeColor = CHANGE_ICONS[row.changeType].color;
                    const concernConfig = CONCERN_CONFIG[row.concernLevel];
                    
                    return (
                      <tr 
                        key={row.coverageKey} 
                        className={cn(
                          'border-b hover:bg-muted/30 transition-colors',
                          row.concernLevel === 'CRITICAL' && 'bg-red-50/50 dark:bg-red-950/10',
                          row.concernLevel === 'HIGH' && 'bg-orange-50/50 dark:bg-orange-950/10'
                        )}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{row.displayName}</span>
                            {row.requiresVerification && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Requires verification</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusCell
                            status={row.currentStatus}
                            terms={row.currentTerms}
                            evidenceIds={row.currentEvidenceIds}
                            confidence={row.currentConfidence}
                            onEvidenceClick={
                              row.currentEvidenceIds?.length && onEvidenceClick
                                ? () => onEvidenceClick(row.currentEvidenceIds!, 'A')
                                : undefined
                            }
                          />
                        </td>
                        <td className="py-3 px-4">
                          <StatusCell
                            status={row.quoteStatus}
                            terms={row.quoteTerms}
                            evidenceIds={row.quoteEvidenceIds}
                            confidence={row.quoteConfidence}
                            onEvidenceClick={
                              row.quoteEvidenceIds?.length && onEvidenceClick
                                ? () => onEvidenceClick(row.quoteEvidenceIds!, 'B')
                                : undefined
                            }
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <ChangeIcon className={cn('h-5 w-5 mx-auto', changeColor)} />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="capitalize">{row.changeType}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge className={concernConfig.color}>
                                  {concernConfig.label}
                                </Badge>
                              </TooltipTrigger>
                              {row.concernReason && (
                                <TooltipContent className="max-w-xs">
                                  <p>{row.concernReason}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default CoverageMatrix;


