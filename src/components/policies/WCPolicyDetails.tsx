/**
 * Workers' Compensation Policy Details Component
 *
 * Comprehensive tabbed view for WC policy data including:
 * - Overview (identity, dates, status)
 * - Coverage (states, limits, deductibles)
 * - Classifications (class codes, payroll, rates)
 * - Experience Mod (X-Mod, schedule rating)
 * - Premium (breakdown, fees, assessments)
 * - Officers (inclusions/exclusions)
 *
 * UPGRADED: Now supports evidence highlighting via click-to-highlight.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Shield,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Users,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Eye,
  FileSearch,
} from 'lucide-react';
import type {
  WCPolicyDetails,
  WCClassification,
  WCOfficerElection,
  WCPolicyTab,
  WC_POLICY_TABS,
  WC_POLICY_STATUS_LABELS,
  WC_POLICY_TYPE_LABELS,
  MONOPOLISTIC_STATES,
  COMMON_CLASS_CODES,
} from '@/types/workers-comp';
import type { WCEvidenceCatalog, EvidenceEntry, BoundingBox } from '@/hooks/useWCExtraction';

interface WCPolicyDetailsProps {
  policyId: string;
  wcDetails: WCPolicyDetails | null;
  onUpdate?: (details: Partial<WCPolicyDetails>) => void;
  isEditing?: boolean;
  /** Evidence catalog for click-to-highlight */
  evidenceCatalog?: WCEvidenceCatalog | null;
  /** Field-level evidence mapping */
  fieldEvidence?: Record<string, string[]>;
  /** Callback when evidence is clicked */
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}

const formatCurrency = (amount: number | undefined | null): string => {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercent = (value: number | undefined | null): string => {
  if (value == null) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
};

const formatExperienceMod = (mod: number | undefined | null): string => {
  if (mod == null) return 'N/A';
  return mod.toFixed(3);
};

// =============================================================================
// EVIDENCE INDICATOR COMPONENT
// =============================================================================

function EvidenceIndicator({
  fieldName,
  evidenceCatalog,
  fieldEvidence,
  onEvidenceClick,
}: {
  fieldName: string;
  evidenceCatalog?: WCEvidenceCatalog | null;
  fieldEvidence?: Record<string, string[]>;
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}) {
  if (!evidenceCatalog || !fieldEvidence || !onEvidenceClick) {
    return null;
  }

  const evidenceIds = fieldEvidence[fieldName] || [];
  if (evidenceIds.length === 0) {
    return null;
  }

  // Get bounding boxes for click-to-highlight
  const boundingBoxes: Record<string, BoundingBox> = {};
  for (const id of evidenceIds) {
    const entry = evidenceCatalog.entries[id];
    if (entry?.boundingBox) {
      boundingBoxes[id] = entry.boundingBox;
    }
  }

  // Get confidence from first evidence entry
  const firstEntry = evidenceCatalog.entries[evidenceIds[0]];
  const confidence = firstEntry?.confidence || 0;

  const handleClick = () => {
    onEvidenceClick(evidenceIds, boundingBoxes);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={`inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
              confidence >= 0.95
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : confidence >= 0.80
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : confidence >= 0.70
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            <FileSearch className="h-3 w-3" />
            {evidenceIds.length > 1 && <span>{evidenceIds.length}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-medium">Click to view source</p>
            <p className="text-muted-foreground">
              {evidenceIds.length} evidence {evidenceIds.length === 1 ? 'entry' : 'entries'} • {Math.round(confidence * 100)}% confidence
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function WCPolicyDetailsView({
  policyId,
  wcDetails,
  onUpdate,
  isEditing = false,
  evidenceCatalog,
  fieldEvidence,
  onEvidenceClick,
}: WCPolicyDetailsProps) {
  const [activeTab, setActiveTab] = useState<WCPolicyTab>('overview');

  if (!wcDetails || Object.keys(wcDetails).length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">No Workers' Comp details available.</p>
          <p className="text-sm text-muted-foreground">
            Upload a policy document to automatically extract WC details.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Workers' Compensation Details
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Comprehensive policy information and coverage details
              {wcDetails.extraction_source && (
                <Badge variant="outline" className="text-xs">
                  {wcDetails.extraction_source === 'azure_di_claude' ? (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      AI Extracted
                    </>
                  ) : wcDetails.extraction_source === 'ai_extracted' ? (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      AI Extracted
                    </>
                  ) : (
                    'Manual Entry'
                  )}
                </Badge>
              )}
              {evidenceCatalog && (
                <Badge variant="secondary" className="text-xs">
                  {evidenceCatalog.stats.totalEntries} evidence entries
                </Badge>
              )}
            </CardDescription>
          </div>
          {wcDetails.experience_rating?.experience_mod && (
            <ExperienceModBadge mod={wcDetails.experience_rating.experience_mod} />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as WCPolicyTab)}>
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="coverage">Coverage</TabsTrigger>
            <TabsTrigger value="classifications">Class Codes</TabsTrigger>
            <TabsTrigger value="experience">X-Mod</TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
            <TabsTrigger value="officers">Officers</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <OverviewTab details={wcDetails} />
          </TabsContent>

          {/* COVERAGE TAB */}
          <TabsContent value="coverage" className="space-y-6">
            <CoverageTab details={wcDetails} />
          </TabsContent>

          {/* CLASSIFICATIONS TAB */}
          <TabsContent value="classifications" className="space-y-6">
            <ClassificationsTab classifications={wcDetails.classifications} />
          </TabsContent>

          {/* EXPERIENCE MOD TAB */}
          <TabsContent value="experience" className="space-y-6">
            <ExperienceTab details={wcDetails} />
          </TabsContent>

          {/* PREMIUM TAB */}
          <TabsContent value="premium" className="space-y-6">
            <PremiumTab details={wcDetails} />
          </TabsContent>

          {/* OFFICERS TAB */}
          <TabsContent value="officers" className="space-y-6">
            <OfficersTab elections={wcDetails.ownership_elections} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// EXPERIENCE MOD BADGE
// =============================================================================

function ExperienceModBadge({ mod }: { mod: number }) {
  const isCredit = mod < 1;
  const isDebit = mod > 1;
  const percent = Math.abs((mod - 1) * 100).toFixed(0);

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
      isCredit ? 'bg-green-100 text-green-800' :
      isDebit ? 'bg-red-100 text-red-800' :
      'bg-gray-100 text-gray-800'
    }`}>
      {isCredit ? <TrendingDown className="h-4 w-4" /> :
       isDebit ? <TrendingUp className="h-4 w-4" /> :
       <Minus className="h-4 w-4" />}
      <div>
        <div className="text-xs font-medium">Experience Mod</div>
        <div className="text-lg font-bold">{mod.toFixed(3)}</div>
      </div>
      <Badge variant={isCredit ? 'default' : isDebit ? 'destructive' : 'secondary'}>
        {isCredit ? `${percent}% Credit` : isDebit ? `${percent}% Debit` : 'Unity'}
      </Badge>
    </div>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ details }: { details: WCPolicyDetails }) {
  const { identity, dates, employer_info } = details;

  return (
    <>
      {/* Policy Identity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoField label="Carrier" value={identity.carrier_name} icon={Building2} />
        <InfoField label="NAIC" value={identity.carrier_naic || 'N/A'} />
        <InfoField label="Policy Number" value={identity.policy_number} mono />
        <InfoField
          label="Status"
          value={
            <Badge variant={identity.status === 'issued' || identity.status === 'bound' ? 'default' : 'secondary'}>
              {identity.status?.toUpperCase()}
            </Badge>
          }
        />
      </div>

      <Separator />

      {/* Named Insured */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Named Insured
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Legal Name" value={identity.named_insured} />
          <InfoField label="DBA" value={identity.dba || 'N/A'} />
          <InfoField label="FEIN" value={identity.fein || 'N/A'} mono />
          <InfoField label="Producer" value={identity.producer || 'N/A'} />
        </div>
      </div>

      <Separator />

      {/* Addresses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h4 className="font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Mailing Address
          </h4>
          <AddressDisplay address={identity.mailing_address} />
        </div>
        {identity.primary_location_address && (
          <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Primary Location
            </h4>
            <AddressDisplay address={identity.primary_location_address} />
          </div>
        )}
      </div>

      <Separator />

      {/* Dates */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Policy Period
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoField label="Effective Date" value={formatDate(dates.effective_date)} />
          <InfoField label="Expiration Date" value={formatDate(dates.expiration_date)} />
          <InfoField label="Issue Date" value={formatDate(dates.issue_date)} />
          <InfoField label="Term" value={dates.policy_term || '12 months'} />
        </div>
      </div>

      {/* Employer Info */}
      {employer_info && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Business Information
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoField label="Years in Business" value={employer_info.years_in_business?.toString() || 'N/A'} />
              <InfoField label="Employees" value={employer_info.number_of_employees?.toString() || 'N/A'} />
              <InfoField label="Annual Payroll" value={formatCurrency(employer_info.annual_payroll)} />
            </div>
            {employer_info.business_description && (
              <div className="p-3 bg-muted rounded-lg">
                <Label className="text-xs text-muted-foreground">Business Description</Label>
                <p className="text-sm mt-1">{employer_info.business_description}</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// COVERAGE TAB
// =============================================================================

function CoverageTab({ details }: { details: WCPolicyDetails }) {
  const { coverage } = details;
  const monopolisticStates = coverage.covered_states.filter(s => s.is_monopolistic);

  return (
    <>
      {/* Policy Type */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <InfoField
          label="Policy Type"
          value={coverage.policy_type?.replace('_', ' ').toUpperCase() || 'STANDARD'}
        />
        <InfoField label="Part One (WC)" value="Statutory" />
        <InfoField label="Rating Bureau" value={details.experience_rating?.rating_bureau || 'NCCI'} />
      </div>

      <Separator />

      {/* Employers Liability Limits */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Part Two - Employers Liability Limits
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-blue-50">
            <div className="text-xs text-muted-foreground mb-1">Each Accident</div>
            <div className="text-xl font-bold text-blue-700">
              {formatCurrency(coverage.part_two_employers_liability?.each_accident)}
            </div>
          </Card>
          <Card className="p-4 bg-blue-50">
            <div className="text-xs text-muted-foreground mb-1">Disease - Each Employee</div>
            <div className="text-xl font-bold text-blue-700">
              {formatCurrency(coverage.part_two_employers_liability?.disease_each_employee)}
            </div>
          </Card>
          <Card className="p-4 bg-blue-50">
            <div className="text-xs text-muted-foreground mb-1">Disease - Policy Limit</div>
            <div className="text-xl font-bold text-blue-700">
              {formatCurrency(coverage.part_two_employers_liability?.disease_policy_limit)}
            </div>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Covered States */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Covered States
        </h4>
        <div className="grid grid-cols-2 gap-6">
          {/* Item 3.A States */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Item 3.A - States of Operation</Label>
            <div className="flex flex-wrap gap-2">
              {coverage.covered_states
                .filter(s => s.type === 'item_3a')
                .map(s => (
                  <Badge key={s.state} variant="default" className="text-sm">
                    {s.state}
                  </Badge>
                ))}
              {coverage.covered_states.filter(s => s.type === 'item_3a').length === 0 && (
                <span className="text-sm text-muted-foreground">None specified</span>
              )}
            </div>
          </div>

          {/* Item 3.C States */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Item 3.C - Other States Insurance</Label>
            <div className="flex flex-wrap gap-2">
              {coverage.covered_states
                .filter(s => s.type === 'item_3c')
                .map(s => (
                  <Badge key={s.state} variant="secondary" className="text-sm">
                    {s.state}
                  </Badge>
                ))}
              {coverage.covered_states.filter(s => s.type === 'item_3c').length === 0 && (
                <span className="text-sm text-muted-foreground">None specified</span>
              )}
            </div>
          </div>
        </div>

        {/* Monopolistic State Warning */}
        {monopolisticStates.length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Monopolistic State(s) Detected</p>
              <p className="text-xs text-amber-700 mt-1">
                {monopolisticStates.map(s => s.state).join(', ')} - These states require coverage through state funds.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Deductible */}
      {coverage.deductible && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Deductible Program</h4>
            <div className="grid grid-cols-3 gap-4">
              <InfoField label="Type" value={coverage.deductible.type?.replace('_', ' ')} />
              <InfoField label="Amount" value={formatCurrency(coverage.deductible.amount)} />
              <InfoField label="Applies To" value={coverage.deductible.applies_to} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// CLASSIFICATIONS TAB
// =============================================================================

function ClassificationsTab({ classifications }: { classifications: WCClassification[] }) {
  const totalPayroll = classifications.reduce((sum, c) => sum + (c.estimated_payroll || 0), 0);
  const totalPremium = classifications.reduce((sum, c) => sum + (c.premium || 0), 0);
  const governingClass = classifications.find(c => c.is_governing_class);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Classes</div>
          <div className="text-2xl font-bold">{classifications.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Payroll</div>
          <div className="text-2xl font-bold">{formatCurrency(totalPayroll)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Premium</div>
          <div className="text-2xl font-bold">{formatCurrency(totalPremium)}</div>
        </Card>
        {governingClass && (
          <Card className="p-4 bg-blue-50">
            <div className="text-xs text-muted-foreground">Governing Class</div>
            <div className="text-xl font-bold text-blue-700">{governingClass.class_code}</div>
            <div className="text-xs text-blue-600 truncate">{governingClass.description}</div>
          </Card>
        )}
      </div>

      <Separator />

      {/* Classifications Table */}
      {classifications.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">State</TableHead>
                <TableHead className="w-[80px]">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Payroll</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="w-[80px]">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classifications.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{c.state}</TableCell>
                  <TableCell className="font-mono font-medium">{c.class_code}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={c.description}>
                    {c.description}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(c.estimated_payroll)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {c.rate?.toFixed(4) || 'N/A'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(c.premium)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {c.is_governing_class && (
                        <Badge variant="default" className="text-xs">GOV</Badge>
                      )}
                      {c.is_standard_exception && (
                        <Badge variant="outline" className="text-xs">EXC</Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No classifications found</p>
        </div>
      )}
    </>
  );
}

// =============================================================================
// EXPERIENCE MOD TAB
// =============================================================================

function ExperienceTab({ details }: { details: WCPolicyDetails }) {
  const { experience_rating } = details;

  return (
    <>
      {/* Main X-Mod Display */}
      <div className="flex justify-center mb-6">
        {experience_rating?.experience_mod ? (
          <ExperienceModBadge mod={experience_rating.experience_mod} />
        ) : (
          <div className="text-center p-6 bg-muted rounded-lg">
            <Info className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">No experience mod on file</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Rating Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoField
          label="Experience Mod"
          value={formatExperienceMod(experience_rating?.experience_mod)}
        />
        <InfoField
          label="Effective Date"
          value={formatDate(experience_rating?.experience_mod_effective_date)}
        />
        <InfoField
          label="Rating Bureau"
          value={experience_rating?.rating_bureau || 'NCCI'}
        />
        <InfoField
          label="Premium Discount"
          value={experience_rating?.premium_discount ? `${experience_rating.premium_discount}%` : 'N/A'}
        />
      </div>

      {/* Schedule/Merit Rating */}
      {(experience_rating?.schedule_rating || experience_rating?.merit_rating) && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Rating Modifications</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {experience_rating.schedule_rating && (
                <Card className={`p-4 ${experience_rating.schedule_rating.type === 'credit' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Schedule Rating</div>
                      <div className="text-lg font-bold">
                        {experience_rating.schedule_rating.type === 'credit' ? '-' : '+'}
                        {experience_rating.schedule_rating.percent}%
                      </div>
                    </div>
                    <Badge variant={experience_rating.schedule_rating.type === 'credit' ? 'default' : 'destructive'}>
                      {experience_rating.schedule_rating.type.toUpperCase()}
                    </Badge>
                  </div>
                </Card>
              )}
              {experience_rating.merit_rating && (
                <Card className={`p-4 ${experience_rating.merit_rating.type === 'credit' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Merit Rating</div>
                      <div className="text-lg font-bold">
                        {experience_rating.merit_rating.type === 'credit' ? '-' : '+'}
                        {experience_rating.merit_rating.percent}%
                      </div>
                    </div>
                    <Badge variant={experience_rating.merit_rating.type === 'credit' ? 'default' : 'destructive'}>
                      {experience_rating.merit_rating.type.toUpperCase()}
                    </Badge>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// PREMIUM TAB
// =============================================================================

function PremiumTab({ details }: { details: WCPolicyDetails }) {
  const { premium } = details;

  return (
    <>
      {/* Total Premium Display */}
      <div className="flex justify-center mb-6">
        <Card className="p-6 bg-primary/5 text-center">
          <div className="text-sm text-muted-foreground mb-1">Estimated Annual Premium</div>
          <div className="text-4xl font-bold text-primary">
            {formatCurrency(premium.estimated_annual_premium)}
          </div>
          {premium.payment_plan && (
            <Badge variant="outline" className="mt-2">
              {premium.payment_plan.replace('_', ' ').toUpperCase()}
            </Badge>
          )}
        </Card>
      </div>

      <Separator />

      {/* Premium Breakdown */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Premium Breakdown
        </h4>
        <div className="rounded-md border">
          <Table>
            <TableBody>
              {premium.wc_premium_subtotal && (
                <TableRow>
                  <TableCell>WC Premium Subtotal</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.wc_premium_subtotal)}
                  </TableCell>
                </TableRow>
              )}
              {premium.expense_constant && (
                <TableRow>
                  <TableCell>Expense Constant</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.expense_constant)}
                  </TableCell>
                </TableRow>
              )}
              {premium.taxes_and_assessments?.state_assessments && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground">State Assessments</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.taxes_and_assessments.state_assessments)}
                  </TableCell>
                </TableRow>
              )}
              {premium.taxes_and_assessments?.terrorism_charge && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground">Terrorism Charge</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.taxes_and_assessments.terrorism_charge)}
                  </TableCell>
                </TableRow>
              )}
              {premium.taxes_and_assessments?.other_carrier_fees && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground">Other Carrier Fees</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.taxes_and_assessments.other_carrier_fees)}
                  </TableCell>
                </TableRow>
              )}
              {premium.taxes_and_assessments?.total && (
                <TableRow className="bg-muted/50">
                  <TableCell className="font-medium">Total Taxes & Assessments</TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(premium.taxes_and_assessments.total)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="bg-primary/5">
                <TableCell className="font-bold">Total Premium</TableCell>
                <TableCell className="text-right font-mono font-bold text-lg">
                  {formatCurrency(premium.estimated_annual_premium)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Premium by State */}
      {premium.premium_by_state && premium.premium_by_state.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Premium by State</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {premium.premium_by_state.map((s) => (
                <Card key={s.state} className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{s.state}</Badge>
                    <span className="font-mono font-medium">{formatCurrency(s.premium)}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Deposit Premium */}
      {premium.deposit_premium && (
        <>
          <Separator />
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span>Deposit Premium</span>
              <span className="font-mono font-bold">{formatCurrency(premium.deposit_premium)}</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// OFFICERS TAB
// =============================================================================

function OfficersTab({ elections }: { elections: WCPolicyDetails['ownership_elections'] }) {
  const allOfficers = [
    ...(elections?.officers || []),
    ...(elections?.partners || []),
    ...(elections?.llc_members || []),
  ];

  const includedCount = allOfficers.filter(o => o.included).length;
  const excludedCount = allOfficers.filter(o => !o.included).length;

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Officers/Owners</div>
          <div className="text-2xl font-bold">{allOfficers.length}</div>
        </Card>
        <Card className="p-4 bg-green-50">
          <div className="text-xs text-muted-foreground">Included</div>
          <div className="text-2xl font-bold text-green-700">{includedCount}</div>
        </Card>
        <Card className="p-4 bg-red-50">
          <div className="text-xs text-muted-foreground">Excluded</div>
          <div className="text-2xl font-bold text-red-700">{excludedCount}</div>
        </Card>
      </div>

      {/* Sole Proprietor */}
      {elections?.sole_proprietor && (
        <>
          <Separator />
          <div className="p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Sole Proprietor</div>
                <div className="font-medium">{elections.sole_proprietor.name}</div>
              </div>
              <Badge variant={elections.sole_proprietor.included ? 'default' : 'destructive'}>
                {elections.sole_proprietor.included ? (
                  <><CheckCircle className="h-3 w-3 mr-1" /> Included</>
                ) : (
                  <><XCircle className="h-3 w-3 mr-1" /> Excluded</>
                )}
              </Badge>
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Officers Table */}
      {allOfficers.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Ownership %</TableHead>
                <TableHead className="text-right">Remuneration</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allOfficers.map((officer, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{officer.name}</TableCell>
                  <TableCell>{officer.title || 'N/A'}</TableCell>
                  <TableCell className="text-right">
                    {officer.ownership_percent ? `${officer.ownership_percent}%` : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(officer.annual_remuneration)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={officer.included ? 'default' : 'destructive'}>
                      {officer.included ? 'Included' : 'Excluded'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No officer elections found</p>
        </div>
      )}

      {/* Independent Contractors Note */}
      {elections?.independent_contractors_notes && (
        <>
          <Separator />
          <div className="p-4 bg-amber-50 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Independent Contractors</p>
                <p className="text-sm text-amber-700 mt-1">{elections.independent_contractors_notes}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function InfoField({
  label,
  value,
  icon: Icon,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  mono?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      <div className={`mt-1 ${mono ? 'font-mono' : ''}`}>{value || 'N/A'}</div>
    </div>
  );
}

function AddressDisplay({ address }: { address: { street: string; city: string; state: string; zip: string } }) {
  if (!address?.street) return <span className="text-muted-foreground">Not provided</span>;
  return (
    <div className="text-sm">
      <p>{address.street}</p>
      <p>{address.city}, {address.state} {address.zip}</p>
    </div>
  );
}

function formatDate(date: string | undefined | null): string {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}

export default WCPolicyDetailsView;
