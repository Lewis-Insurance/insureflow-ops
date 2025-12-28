// ============================================================================
// CANOPY PREFILL SELECTOR
// ============================================================================
// UI component to select a Canopy pull and apply prefill data to ACORD forms.
// Shows available LOBs from the pull and maps data to form fields.
// ============================================================================

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Car,
  Home,
  Key,
  Building2,
  Umbrella,
  Check,
  AlertTriangle,
  Download,
  Loader2,
  FileText,
  User,
  Calendar,
  DollarSign,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getCanopyAcordPrefill,
  getCanopyPrefillAllLOBs,
  type PersonalLinesLOB,
  type CanopyPrefillResult,
} from '@/services/canopy/CanopyAcordPrefillService';

// ============================================================================
// TYPES
// ============================================================================

interface CanopyPrefillSelectorProps {
  accountId?: string;
  customerId?: string;
  onPrefillSelect?: (result: CanopyPrefillResult) => void;
  onFieldValuesReady?: (fieldValues: Record<string, any>, formNumber: string) => void;
  selectedFormNumber?: string;
  compact?: boolean;
}

interface CanopyPullSummary {
  id: string;
  customer_name: string;
  email: string;
  created_at: string;
  status: string;
  policies: {
    id: string;
    policy_type: string;
    carrier_name: string;
    policy_number: string;
  }[];
}

// ============================================================================
// LOB ICON MAP
// ============================================================================

const LOB_ICONS: Record<PersonalLinesLOB, React.ComponentType<{ className?: string }>> = {
  auto: Car,
  home: Home,
  renters: Key,
  condo: Building2,
  umbrella: Umbrella,
};

const LOB_LABELS: Record<PersonalLinesLOB, string> = {
  auto: 'Personal Auto',
  home: 'Homeowners',
  renters: 'Renters',
  condo: 'Condo',
  umbrella: 'Personal Umbrella',
};

const LOB_ACORD_FORMS: Record<PersonalLinesLOB, { number: string; name: string }> = {
  auto: { number: '80', name: 'ACORD 80 - Personal Auto Application' },
  home: { number: '35', name: 'ACORD 35 - Homeowners Application (HO-3)' },
  renters: { number: '35', name: 'ACORD 35 - Renters Application (HO-4)' },
  condo: { number: '35', name: 'ACORD 35 - Condo Application (HO-6)' },
  umbrella: { number: '35U', name: 'Personal Umbrella Application' },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CanopyPrefillSelector({
  accountId,
  customerId,
  onPrefillSelect,
  onFieldValuesReady,
  selectedFormNumber,
  compact = false,
}: CanopyPrefillSelectorProps) {
  const [selectedPullId, setSelectedPullId] = useState<string>('');
  const [selectedLOB, setSelectedLOB] = useState<PersonalLinesLOB | ''>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [prefillResult, setPrefillResult] = useState<CanopyPrefillResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Fetch available Canopy pulls for this account/customer
  const { data: pulls, isLoading: pullsLoading } = useQuery({
    queryKey: ['canopy-pulls-for-prefill', accountId, customerId],
    queryFn: async () => {
      let query = supabase
        .from('canopy_pulls')
        .select(`
          id,
          first_name,
          last_name,
          email,
          created_at,
          status,
          canopy_policies (
            id,
            policy_type,
            carrier_name,
            policy_number
          )
        `)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(20);

      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching Canopy pulls:', error);
        return [];
      }

      return (data || []).map((pull: any) => ({
        id: pull.id,
        customer_name: `${pull.first_name || ''} ${pull.last_name || ''}`.trim() || 'Unknown',
        email: pull.email || '',
        created_at: pull.created_at,
        status: pull.status,
        policies: pull.canopy_policies || [],
      })) as CanopyPullSummary[];
    },
    enabled: !!accountId || !!customerId,
  });

  // Get available LOBs for selected pull
  const availableLOBs = useMemo(() => {
    if (!selectedPullId || !pulls) return [];

    const pull = pulls.find((p) => p.id === selectedPullId);
    if (!pull) return [];

    const lobs = new Set<PersonalLinesLOB>();
    pull.policies.forEach((policy) => {
      const lob = policy.policy_type?.toLowerCase() as PersonalLinesLOB;
      if (['auto', 'home', 'renters', 'condo', 'umbrella'].includes(lob)) {
        lobs.add(lob);
      }
    });

    return Array.from(lobs);
  }, [selectedPullId, pulls]);

  // Handle prefill request
  const handlePrefill = async () => {
    if (!selectedPullId || !selectedLOB) return;

    setIsProcessing(true);
    try {
      const result = await getCanopyAcordPrefill(selectedPullId, selectedLOB);
      setPrefillResult(result);

      if (result.success) {
        onPrefillSelect?.(result);
        onFieldValuesReady?.(result.fieldValues, result.acordFormNumber);
      }
    } catch (error) {
      console.error('Prefill error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (pullsLoading) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!pulls || pulls.length === 0) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Download className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No Canopy Data Available</p>
          <p className="text-sm mt-1">
            Connect to Canopy to import policy data for prefilling forms.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={compact ? 'border-0 shadow-none' : ''}>
      <CardHeader className={compact ? 'pb-2' : ''}>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="w-5 h-5" />
          Import from Canopy Connect
        </CardTitle>
        <CardDescription>
          Select a Canopy pull and line of business to prefill ACORD form fields
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: Select Pull */}
        <div className="space-y-2">
          <label className="text-sm font-medium">1. Select Canopy Pull</label>
          <Select value={selectedPullId} onValueChange={(value) => {
            setSelectedPullId(value);
            setSelectedLOB('');
            setPrefillResult(null);
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Select a Canopy data import..." />
            </SelectTrigger>
            <SelectContent>
              {pulls.map((pull) => (
                <SelectItem key={pull.id} value={pull.id}>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>{pull.customer_name}</span>
                    <span className="text-muted-foreground">
                      ({format(new Date(pull.created_at), 'MMM d, yyyy')})
                    </span>
                    <Badge variant="secondary" className="ml-2">
                      {pull.policies.length} policies
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Step 2: Select LOB */}
        {selectedPullId && (
          <div className="space-y-2">
            <label className="text-sm font-medium">2. Select Line of Business</label>
            {availableLOBs.length === 0 ? (
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  No personal lines policies found in this Canopy pull.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableLOBs.map((lob) => {
                  const Icon = LOB_ICONS[lob];
                  const isSelected = selectedLOB === lob;

                  return (
                    <Button
                      key={lob}
                      variant={isSelected ? 'default' : 'outline'}
                      className="justify-start h-auto py-3"
                      onClick={() => {
                        setSelectedLOB(lob);
                        setPrefillResult(null);
                      }}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      <div className="text-left">
                        <div className="text-sm font-medium">{LOB_LABELS[lob]}</div>
                        <div className="text-xs opacity-70">
                          {LOB_ACORD_FORMS[lob].number}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 ml-auto" />}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Generate Prefill */}
        {selectedPullId && selectedLOB && (
          <>
            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {LOB_ACORD_FORMS[selectedLOB].name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ready to extract field values from Canopy data
                </p>
              </div>
              <Button
                onClick={handlePrefill}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Prefill
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* Prefill Result */}
        {prefillResult && (
          <>
            <Separator />

            <div className="space-y-3">
              {prefillResult.success ? (
                <Alert className="bg-green-50 border-green-200">
                  <Check className="w-4 h-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    Successfully extracted {Object.keys(prefillResult.fieldValues).length} field values
                    {prefillResult.warnings.length > 0 && ` with ${prefillResult.warnings.length} warnings`}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    Failed to extract prefill data. Check warnings for details.
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {prefillResult.warnings.length > 0 && (
                <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  <p className="font-medium mb-1">Warnings:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {prefillResult.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Button */}
              <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <ChevronRight className="w-4 h-4 mr-2" />
                    Preview Field Values ({Object.keys(prefillResult.fieldValues).length})
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle>Prefill Field Values</DialogTitle>
                    <DialogDescription>
                      {LOB_ACORD_FORMS[prefillResult.lob].name}
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-2">
                      {Object.entries(prefillResult.fieldValues)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([field, value]) => (
                          <div
                            key={field}
                            className="flex justify-between items-start py-2 border-b"
                          >
                            <span className="text-sm font-mono text-muted-foreground">
                              {field}
                            </span>
                            <span className="text-sm text-right ml-4 max-w-[300px] break-words">
                              {value?.toString() || <span className="text-muted-foreground italic">empty</span>}
                            </span>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// QUICK PREFILL BUTTON (Inline version)
// ============================================================================

interface QuickPrefillButtonProps {
  pullId: string;
  lob: PersonalLinesLOB;
  onPrefillReady: (fieldValues: Record<string, any>) => void;
}

export function QuickPrefillButton({
  pullId,
  lob,
  onPrefillReady,
}: QuickPrefillButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const Icon = LOB_ICONS[lob];

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const result = await getCanopyAcordPrefill(pullId, lob);
      if (result.success) {
        onPrefillReady(result.fieldValues);
      }
    } catch (error) {
      console.error('Quick prefill error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <Icon className="w-4 h-4 mr-1" />
          Prefill from Canopy
        </>
      )}
    </Button>
  );
}

export default CanopyPrefillSelector;
