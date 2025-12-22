/**
 * Commercial Umbrella / Excess Liability Policy Details Component
 *
 * Comprehensive tabbed view for Umbrella/Excess policy data including:
 * - Overview (identity, dates, policy type, form basis)
 * - Limits (per occurrence, aggregate, retention/SIR)
 * - Underlying (scheduled underlying policies with limits)
 * - Compliance (term alignment, limit sufficiency issues)
 * - Endorsements (high-impact exclusions and limitations)
 * - Premium (breakdown)
 *
 * Supports evidence highlighting via click-to-highlight.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
  Umbrella,
  Building2,
  Calendar,
  DollarSign,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  FileSearch,
  Shield,
  Layers,
  Car,
  HardHat,
  Briefcase,
  AlertCircle,
  Clock,
  ArrowDownUp,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Scale,
} from 'lucide-react';
import type {
  UmbrellaPolicyDetails,
  UmbrellaPolicyTab,
  UnderlyingPolicy,
  UnderlyingRequirements,
  UmbrellaAdditionalInsured,
  UmbrellaEndorsement,
  UnderlyingComplianceFlags,
  UnderlyingComplianceIssue,
  UnderlyingPolicyType,
} from '@/types/commercial-umbrella';
import type { UmbrellaEvidenceCatalog, BoundingBox } from '@/hooks/useUmbrellaExtraction';
import {
  formatUmbrellaLimit,
  getUnderlyingTypeLabel,
  getEndorsementCategoryLabel,
  UNDERLYING_TYPE_LABELS,
} from '@/hooks/useUmbrellaExtraction';

interface UmbrellaPolicyDetailsProps {
  policyId: string;
  umbrellaDetails: UmbrellaPolicyDetails | null;
  underlyingPolicies?: UnderlyingPolicy[];
  requirements?: UnderlyingRequirements | null;
  additionalInsureds?: UmbrellaAdditionalInsured[];
  endorsements?: UmbrellaEndorsement[];
  complianceFlags?: UnderlyingComplianceFlags | null;
  onUpdate?: (details: Partial<UmbrellaPolicyDetails>) => void;
  isEditing?: boolean;
  /** Evidence catalog for click-to-highlight */
  evidenceCatalog?: UmbrellaEvidenceCatalog | null;
  /** Field-level evidence mapping */
  fieldEvidence?: Record<string, string[]>;
  /** Callback when evidence is clicked */
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  umbrella: 'Umbrella',
  excess: 'Excess',
  unknown: 'Unknown',
};

const FORM_BASIS_LABELS: Record<string, string> = {
  follow_form: 'Follow Form',
  stand_alone: 'Stand-Alone',
  unknown: 'Unknown',
};

const TERRITORY_LABELS: Record<string, string> = {
  us_canada: 'United States & Canada',
  worldwide: 'Worldwide',
  us_only: 'United States Only',
  other: 'Other',
};

const formatCurrency = (amount: number | undefined | null): string => {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: string | undefined | null): string => {
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
  evidenceCatalog?: UmbrellaEvidenceCatalog | null;
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

  const boundingBoxes: Record<string, BoundingBox> = {};
  for (const id of evidenceIds) {
    const entry = evidenceCatalog.entries[id];
    if (entry?.boundingBox) {
      boundingBoxes[id] = entry.boundingBox;
    }
  }

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
                : confidence >= 0.8
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : confidence >= 0.7
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
              {evidenceIds.length} evidence {evidenceIds.length === 1 ? 'entry' : 'entries'} •{' '}
              {Math.round(confidence * 100)}% confidence
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function UmbrellaPolicyDetailsView({
  policyId,
  umbrellaDetails,
  underlyingPolicies = [],
  requirements,
  additionalInsureds = [],
  endorsements = [],
  complianceFlags,
  onUpdate,
  isEditing = false,
  evidenceCatalog,
  fieldEvidence,
  onEvidenceClick,
}: UmbrellaPolicyDetailsProps) {
  const [activeTab, setActiveTab] = useState<UmbrellaPolicyTab>('overview');

  if (!umbrellaDetails) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Umbrella className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">No Commercial Umbrella/Excess details available.</p>
          <p className="text-sm text-muted-foreground">
            Upload a policy document to automatically extract Umbrella/Excess details.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate compliance summary
  const complianceIssueCount = complianceFlags?.issues.length || 0;
  const hasHighSeverityIssues = complianceFlags?.issues.some((i) => i.severity === 'high') || false;
  const limitationsCount = endorsements.filter((e) => e.is_limitation).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Umbrella className="h-5 w-5" />
              Commercial Umbrella / Excess Details
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Umbrella/Excess liability policy information
              {umbrellaDetails.extraction_source && (
                <Badge variant="outline" className="text-xs">
                  {umbrellaDetails.extraction_source === 'azure_di_claude' ? (
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
          <div className="flex items-center gap-2">
            {/* Policy Type Badge */}
            <Badge
              variant={umbrellaDetails.policy_type === 'umbrella' ? 'default' : 'secondary'}
              className="text-sm"
            >
              {umbrellaDetails.policy_type === 'umbrella' ? (
                <>
                  <Umbrella className="h-3.5 w-3.5 mr-1" />
                  Umbrella
                </>
              ) : (
                <>
                  <Layers className="h-3.5 w-3.5 mr-1" />
                  Excess
                </>
              )}
            </Badge>
            {/* Per Occurrence Limit */}
            {umbrellaDetails.limits.per_occurrence && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                <Shield className="h-4 w-4 text-blue-600" />
                <div>
                  <div className="text-xs text-muted-foreground">Per Occurrence</div>
                  <div className="text-lg font-bold text-blue-700">
                    {formatUmbrellaLimit(umbrellaDetails.limits.per_occurrence)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UmbrellaPolicyTab)}>
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
            <TabsTrigger value="underlying">
              Underlying {underlyingPolicies.length > 0 && `(${underlyingPolicies.length})`}
            </TabsTrigger>
            <TabsTrigger value="compliance" className="relative">
              Compliance
              {complianceIssueCount > 0 && (
                <Badge
                  variant={hasHighSeverityIssues ? 'destructive' : 'secondary'}
                  className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {complianceIssueCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="endorsements">
              Endorsements
              {limitationsCount > 0 && (
                <Badge variant="outline" className="ml-1 text-xs text-amber-600">
                  {limitationsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab details={umbrellaDetails} additionalInsureds={additionalInsureds} />
          </TabsContent>

          <TabsContent value="limits" className="space-y-6">
            <LimitsTab details={umbrellaDetails} requirements={requirements} />
          </TabsContent>

          <TabsContent value="underlying" className="space-y-6">
            <UnderlyingTab
              underlyingPolicies={underlyingPolicies}
              requirements={requirements}
              umbrellaDetails={umbrellaDetails}
            />
          </TabsContent>

          <TabsContent value="compliance" className="space-y-6">
            <ComplianceTab
              complianceFlags={complianceFlags}
              underlyingPolicies={underlyingPolicies}
              requirements={requirements}
              umbrellaDetails={umbrellaDetails}
            />
          </TabsContent>

          <TabsContent value="endorsements" className="space-y-6">
            <EndorsementsTab endorsements={endorsements} />
          </TabsContent>

          <TabsContent value="premium" className="space-y-6">
            <PremiumTab details={umbrellaDetails} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({
  details,
  additionalInsureds,
}: {
  details: UmbrellaPolicyDetails;
  additionalInsureds: UmbrellaAdditionalInsured[];
}) {
  const { identity, dates, policy_type, form_basis, drop_down } = details;

  return (
    <>
      {/* Policy Identity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoField label="Carrier" value={identity.carrier_name} icon={Building2} />
        <InfoField label="NAIC" value={identity.carrier_naic || 'N/A'} />
        <InfoField label="Policy Number" value={identity.policy_number} mono />
        <InfoField
          label="Transaction Type"
          value={
            <Badge variant="secondary">
              {identity.transaction_type?.toUpperCase() || 'N/A'}
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
        </div>
        {identity.mailing_address && <AddressDisplay address={identity.mailing_address} />}
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
          <InfoField label="Policy Term" value={dates.policy_term || 'Annual'} />
        </div>
      </div>

      <Separator />

      {/* Policy Type & Form Basis */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Policy Type & Form
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Coverage Type</div>
            <div className="font-medium">
              <Badge variant={policy_type === 'umbrella' ? 'default' : 'secondary'}>
                {policy_type === 'umbrella' ? (
                  <><Umbrella className="h-3 w-3 mr-1" /> Umbrella</>
                ) : (
                  <><Layers className="h-3 w-3 mr-1" /> Excess</>
                )}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {policy_type === 'umbrella'
                ? 'Provides broader coverage and drops down'
                : 'Follows form of underlying policies'}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Form Basis</div>
            <div className="font-medium">
              <Badge variant={form_basis === 'follow_form' ? 'secondary' : 'outline'}>
                {FORM_BASIS_LABELS[form_basis] || form_basis}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {form_basis === 'follow_form'
                ? 'Coverage follows underlying policies'
                : 'Has own coverage terms'}
            </div>
          </Card>
          {drop_down && (
            <Card className={`p-4 ${drop_down.is_available ? 'bg-green-50' : 'bg-amber-50'}`}>
              <div className="text-xs text-muted-foreground mb-1">Drop-Down Coverage</div>
              <div className="font-medium flex items-center gap-2">
                {drop_down.is_available ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-green-700">Available</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-700">Not Available</span>
                  </>
                )}
              </div>
              {drop_down.conditions && (
                <div className="text-xs text-muted-foreground mt-1">{drop_down.conditions}</div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Additional Insureds Summary */}
      {additionalInsureds.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Additional Insureds ({additionalInsureds.length})
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>P&NC</TableHead>
                    <TableHead>WOS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {additionalInsureds.slice(0, 5).map((ai, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{ai.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {ai.ai_type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {ai.primary_noncontributory ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {ai.waiver_of_subrogation ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {additionalInsureds.length > 5 && (
              <p className="text-xs text-muted-foreground">
                And {additionalInsureds.length - 5} more...
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// LIMITS TAB
// =============================================================================

function LimitsTab({
  details,
  requirements,
}: {
  details: UmbrellaPolicyDetails;
  requirements?: UnderlyingRequirements | null;
}) {
  const { limits, retention } = details;

  return (
    <>
      {/* Primary Limits */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-blue-50">
          <div className="text-xs text-muted-foreground mb-1">Per Occurrence Limit</div>
          <div className="text-3xl font-bold text-blue-700">
            {formatUmbrellaLimit(limits.per_occurrence)}
          </div>
        </Card>
        <Card className="p-4 bg-blue-50">
          <div className="text-xs text-muted-foreground mb-1">Aggregate Limit</div>
          <div className="text-3xl font-bold text-blue-700">
            {formatUmbrellaLimit(limits.aggregate || limits.per_occurrence)}
          </div>
          {limits.aggregate === limits.per_occurrence && (
            <div className="text-xs text-muted-foreground">Same as Occurrence</div>
          )}
        </Card>
        {limits.products_completed_ops_aggregate && (
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Products/Completed Ops Agg</div>
            <div className="text-2xl font-bold">
              {formatUmbrellaLimit(limits.products_completed_ops_aggregate)}
            </div>
          </Card>
        )}
      </div>

      <Separator />

      {/* Defense Costs & Territory */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Coverage Parameters
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className={`p-4 ${limits.defense_costs === 'outside_limits' ? 'bg-green-50' : 'bg-amber-50'}`}>
            <div className="text-xs text-muted-foreground mb-1">Defense Costs</div>
            <div className="font-bold flex items-center gap-2">
              {limits.defense_costs === 'outside_limits' ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  <span className="text-green-700">Outside Limits</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-700">Inside Limits</span>
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {limits.defense_costs === 'outside_limits'
                ? 'Defense costs do not erode limits'
                : 'Defense costs reduce available limits'}
            </div>
          </Card>
          {limits.territory && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Territory</div>
              <div className="font-bold">{TERRITORY_LABELS[limits.territory] || limits.territory}</div>
              {limits.territory_description && (
                <div className="text-xs text-muted-foreground mt-1">
                  {limits.territory_description}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <Separator />

      {/* Retention / SIR */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4" />
          Retention / Self-Insured Retention (SIR)
        </h4>
        {retention ? (
          <Card className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Retention Amount</div>
                <div className="text-2xl font-bold">{formatCurrency(retention.amount)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Applies When</div>
                <Badge variant="outline" className="capitalize">
                  {retention.applicability.replace(/_/g, ' ')}
                </Badge>
              </div>
              {retention.notes && (
                <div className="col-span-full">
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm">{retention.notes}</div>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
            No retention/SIR specified - covered underlying limits apply
          </div>
        )}
      </div>

      {/* Required Underlying Minimums */}
      {requirements && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Required Underlying Minimums
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coverage</TableHead>
                    <TableHead className="text-right">Required Limit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requirements.gl_each_occurrence && (
                    <TableRow>
                      <TableCell>General Liability (Each Occurrence)</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatUmbrellaLimit(requirements.gl_each_occurrence)}
                      </TableCell>
                    </TableRow>
                  )}
                  {requirements.gl_general_aggregate && (
                    <TableRow>
                      <TableCell>General Liability (General Aggregate)</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatUmbrellaLimit(requirements.gl_general_aggregate)}
                      </TableCell>
                    </TableRow>
                  )}
                  {requirements.auto_liability && (
                    <TableRow>
                      <TableCell>Commercial Auto Liability</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatUmbrellaLimit(requirements.auto_liability)}
                      </TableCell>
                    </TableRow>
                  )}
                  {requirements.el_per_accident && (
                    <TableRow>
                      <TableCell>Employer's Liability (Per Accident)</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatUmbrellaLimit(requirements.el_per_accident)}
                      </TableCell>
                    </TableRow>
                  )}
                  {requirements.el_disease_policy && (
                    <TableRow>
                      <TableCell>Employer's Liability (Disease Policy)</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatUmbrellaLimit(requirements.el_disease_policy)}
                      </TableCell>
                    </TableRow>
                  )}
                  {requirements.el_disease_employee && (
                    <TableRow>
                      <TableCell>Employer's Liability (Disease Employee)</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatUmbrellaLimit(requirements.el_disease_employee)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {requirements.other_requirements && requirements.other_requirements.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-xs font-semibold mb-2">Other Requirements</div>
                <ul className="text-sm list-disc list-inside space-y-1">
                  {requirements.other_requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// UNDERLYING TAB
// =============================================================================

function UnderlyingTab({
  underlyingPolicies,
  requirements,
  umbrellaDetails,
}: {
  underlyingPolicies: UnderlyingPolicy[];
  requirements?: UnderlyingRequirements | null;
  umbrellaDetails: UmbrellaPolicyDetails;
}) {
  const getUnderlyingIcon = (type: UnderlyingPolicyType) => {
    switch (type) {
      case 'general_liability':
        return <Shield className="h-4 w-4" />;
      case 'commercial_auto':
        return <Car className="h-4 w-4" />;
      case 'employers_liability':
      case 'workers_compensation':
        return <HardHat className="h-4 w-4" />;
      case 'professional_liability':
        return <Briefcase className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const checkLimitCompliance = (underlying: UnderlyingPolicy): boolean => {
    if (!requirements) return true;

    switch (underlying.type) {
      case 'general_liability':
        if (
          requirements.gl_each_occurrence &&
          underlying.limits.each_occurrence &&
          underlying.limits.each_occurrence < requirements.gl_each_occurrence
        ) {
          return false;
        }
        break;
      case 'commercial_auto':
        if (
          requirements.auto_liability &&
          underlying.limits.auto_csl &&
          underlying.limits.auto_csl < requirements.auto_liability
        ) {
          return false;
        }
        break;
      case 'employers_liability':
        if (
          requirements.el_per_accident &&
          underlying.limits.el_per_accident &&
          underlying.limits.el_per_accident < requirements.el_per_accident
        ) {
          return false;
        }
        break;
    }
    return true;
  };

  const checkTermAlignment = (underlying: UnderlyingPolicy): boolean => {
    if (!underlying.expiration_date || !umbrellaDetails.dates.expiration_date) return true;
    return new Date(underlying.expiration_date) >= new Date(umbrellaDetails.dates.expiration_date);
  };

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Scheduled Underlying</div>
          <div className="text-2xl font-bold">{underlyingPolicies.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">GL Coverage</div>
          <div className="text-xl font-bold">
            {underlyingPolicies.some((p) => p.type === 'general_liability') ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Auto Coverage</div>
          <div className="text-xl font-bold">
            {underlyingPolicies.some((p) => p.type === 'commercial_auto') ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">EL/WC Coverage</div>
          <div className="text-xl font-bold">
            {underlyingPolicies.some(
              (p) => p.type === 'employers_liability' || p.type === 'workers_compensation'
            ) ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
          </div>
        </Card>
      </div>

      <Separator />

      {/* Underlying Policies Table */}
      {underlyingPolicies.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead className="text-right">Key Limit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {underlyingPolicies.map((underlying, i) => {
                const limitOk = checkLimitCompliance(underlying);
                const termOk = checkTermAlignment(underlying);
                const allOk = limitOk && termOk;

                // Get the primary limit to display
                let primaryLimit: number | undefined;
                switch (underlying.type) {
                  case 'general_liability':
                    primaryLimit = underlying.limits.each_occurrence;
                    break;
                  case 'commercial_auto':
                    primaryLimit = underlying.limits.auto_csl;
                    break;
                  case 'employers_liability':
                  case 'workers_compensation':
                    primaryLimit = underlying.limits.el_per_accident;
                    break;
                  default:
                    primaryLimit = underlying.limits.limit;
                }

                return (
                  <TableRow key={i} className={!allOk ? 'bg-amber-50' : ''}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getUnderlyingIcon(underlying.type)}
                        <span className="ml-1">{getUnderlyingTypeLabel(underlying.type)}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{underlying.carrier}</TableCell>
                    <TableCell className="font-mono text-xs">{underlying.policy_number}</TableCell>
                    <TableCell>{formatDate(underlying.effective_date)}</TableCell>
                    <TableCell>
                      <span className={!termOk ? 'text-red-600 font-medium' : ''}>
                        {formatDate(underlying.expiration_date)}
                        {!termOk && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      <span className={!limitOk ? 'text-red-600' : ''}>
                        {formatUmbrellaLimit(primaryLimit)}
                        {!limitOk && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ExtractionStatusBadge status={underlying.extraction_status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No underlying policies scheduled</p>
        </div>
      )}

      {/* Underlying Policy Detail Cards */}
      {underlyingPolicies.length > 0 && (
        <>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {underlyingPolicies.map((underlying, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline">
                    {getUnderlyingIcon(underlying.type)}
                    <span className="ml-1">{getUnderlyingTypeLabel(underlying.type)}</span>
                  </Badge>
                  <span className="text-xs text-muted-foreground">{underlying.carrier}</span>
                </div>
                <div className="space-y-2 text-sm">
                  {underlying.type === 'general_liability' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Each Occurrence</span>
                        <span className="font-mono">
                          {formatUmbrellaLimit(underlying.limits.each_occurrence)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">General Aggregate</span>
                        <span className="font-mono">
                          {formatUmbrellaLimit(underlying.limits.general_aggregate)}
                        </span>
                      </div>
                    </>
                  )}
                  {underlying.type === 'commercial_auto' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Combined Single Limit</span>
                        <span className="font-mono">
                          {formatUmbrellaLimit(underlying.limits.auto_csl)}
                        </span>
                      </div>
                      {underlying.limits.auto_bi_per_person && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">BI Per Person</span>
                          <span className="font-mono">
                            {formatUmbrellaLimit(underlying.limits.auto_bi_per_person)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {(underlying.type === 'employers_liability' ||
                    underlying.type === 'workers_compensation') && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Per Accident</span>
                        <span className="font-mono">
                          {formatUmbrellaLimit(underlying.limits.el_per_accident)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Disease - Policy</span>
                        <span className="font-mono">
                          {formatUmbrellaLimit(underlying.limits.el_disease_policy)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Disease - Employee</span>
                        <span className="font-mono">
                          {formatUmbrellaLimit(underlying.limits.el_disease_employee)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {underlying.notes && (
                  <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                    {underlying.notes}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// COMPLIANCE TAB
// =============================================================================

function ComplianceTab({
  complianceFlags,
  underlyingPolicies,
  requirements,
  umbrellaDetails,
}: {
  complianceFlags: UnderlyingComplianceFlags | null | undefined;
  underlyingPolicies: UnderlyingPolicy[];
  requirements?: UnderlyingRequirements | null;
  umbrellaDetails: UmbrellaPolicyDetails;
}) {
  if (!complianceFlags) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No compliance analysis available</p>
        <p className="text-xs mt-1">Extract underlying policies to analyze compliance</p>
      </div>
    );
  }

  const highIssues = complianceFlags.issues.filter((i) => i.severity === 'high');
  const mediumIssues = complianceFlags.issues.filter((i) => i.severity === 'medium');
  const lowIssues = complianceFlags.issues.filter((i) => i.severity === 'low');

  return (
    <>
      {/* Compliance Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={`p-4 ${complianceFlags.all_underlying_scheduled ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="text-xs text-muted-foreground mb-1">All Underlying Scheduled</div>
          <div className="text-xl font-bold flex items-center gap-2">
            {complianceFlags.all_underlying_scheduled ? (
              <>
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <span className="text-green-700">Yes</span>
              </>
            ) : (
              <>
                <ShieldX className="h-5 w-5 text-red-600" />
                <span className="text-red-700">No</span>
              </>
            )}
          </div>
        </Card>
        <Card className={`p-4 ${complianceFlags.terms_aligned ? 'bg-green-50' : 'bg-amber-50'}`}>
          <div className="text-xs text-muted-foreground mb-1">Terms Aligned</div>
          <div className="text-xl font-bold flex items-center gap-2">
            {complianceFlags.terms_aligned ? (
              <>
                <Clock className="h-5 w-5 text-green-600" />
                <span className="text-green-700">Yes</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="text-amber-700">Mismatch</span>
              </>
            )}
          </div>
        </Card>
        <Card className={`p-4 ${complianceFlags.limits_sufficient ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="text-xs text-muted-foreground mb-1">Limits Sufficient</div>
          <div className="text-xl font-bold flex items-center gap-2">
            {complianceFlags.limits_sufficient ? (
              <>
                <DollarSign className="h-5 w-5 text-green-600" />
                <span className="text-green-700">Yes</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-5 w-5 text-red-600" />
                <span className="text-red-700">Below Minimum</span>
              </>
            )}
          </div>
        </Card>
        <Card className={`p-4 ${complianceFlags.has_coverage_gaps ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className="text-xs text-muted-foreground mb-1">Coverage Gaps</div>
          <div className="text-xl font-bold flex items-center gap-2">
            {complianceFlags.has_coverage_gaps ? (
              <>
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-red-700">{complianceFlags.issues.length} Issues</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-700">None</span>
              </>
            )}
          </div>
        </Card>
      </div>

      <Separator />

      {/* Issues List */}
      {complianceFlags.issues.length > 0 ? (
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Compliance Issues ({complianceFlags.issues.length})
          </h4>

          {/* High Severity */}
          {highIssues.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-red-700 flex items-center gap-2">
                <Badge variant="destructive">High</Badge>
                Critical Issues
              </div>
              <div className="space-y-2">
                {highIssues.map((issue, i) => (
                  <ComplianceIssueCard key={i} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Medium Severity */}
          {mediumIssues.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-amber-700 flex items-center gap-2">
                <Badge variant="outline" className="text-amber-600 border-amber-600">
                  Medium
                </Badge>
                Warnings
              </div>
              <div className="space-y-2">
                {mediumIssues.map((issue, i) => (
                  <ComplianceIssueCard key={i} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Low Severity */}
          {lowIssues.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Badge variant="secondary">Low</Badge>
                Minor Issues
              </div>
              <div className="space-y-2">
                {lowIssues.map((issue, i) => (
                  <ComplianceIssueCard key={i} issue={issue} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 bg-green-50 rounded-lg">
          <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-green-600" />
          <p className="text-green-700 font-medium">All Compliance Checks Passed</p>
          <p className="text-sm text-green-600">
            All underlying policies are scheduled, aligned, and meet minimum requirements.
          </p>
        </div>
      )}
    </>
  );
}

function ComplianceIssueCard({ issue }: { issue: UnderlyingComplianceIssue }) {
  const severityColors = {
    high: 'border-red-200 bg-red-50',
    medium: 'border-amber-200 bg-amber-50',
    low: 'border-gray-200 bg-gray-50',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    missing_underlying: <ShieldX className="h-4 w-4 text-red-600" />,
    term_mismatch: <Clock className="h-4 w-4 text-amber-600" />,
    limit_insufficient: <AlertTriangle className="h-4 w-4 text-red-600" />,
    carrier_missing: <Building2 className="h-4 w-4 text-amber-600" />,
    policy_number_missing: <FileText className="h-4 w-4 text-amber-600" />,
  };

  return (
    <Card className={`p-3 border ${severityColors[issue.severity]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{typeIcons[issue.type] || <AlertCircle className="h-4 w-4" />}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs capitalize">
              {getUnderlyingTypeLabel(issue.underlying_type)}
            </Badge>
            <Badge variant="secondary" className="text-xs capitalize">
              {issue.type.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-sm mt-1">{issue.message}</p>
        </div>
      </div>
    </Card>
  );
}

// =============================================================================
// ENDORSEMENTS TAB
// =============================================================================

function EndorsementsTab({ endorsements }: { endorsements: UmbrellaEndorsement[] }) {
  const limitations = endorsements.filter((e) => e.is_limitation);
  const enhancements = endorsements.filter((e) => e.is_enhancement && !e.is_limitation);
  const others = endorsements.filter((e) => !e.is_limitation && !e.is_enhancement);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Endorsements</div>
          <div className="text-2xl font-bold">{endorsements.length}</div>
        </Card>
        <Card className="p-4 bg-red-50">
          <div className="text-xs text-muted-foreground">Limitations/Exclusions</div>
          <div className="text-2xl font-bold text-red-700">{limitations.length}</div>
        </Card>
        <Card className="p-4 bg-green-50">
          <div className="text-xs text-muted-foreground">Enhancements</div>
          <div className="text-2xl font-bold text-green-700">{enhancements.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Other</div>
          <div className="text-2xl font-bold">{others.length}</div>
        </Card>
      </div>

      <Separator />

      {/* Limitations (Most Important) */}
      {limitations.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2 text-red-700">
            <ShieldX className="h-4 w-4" />
            Limitations & Exclusions ({limitations.length})
          </h4>
          <div className="space-y-2">
            {limitations.map((end, i) => (
              <EndorsementCard key={i} endorsement={end} />
            ))}
          </div>
        </div>
      )}

      {/* All Endorsements Table */}
      {endorsements.length > 0 ? (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              All Endorsements
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Form #</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Edition</TableHead>
                    <TableHead className="text-center">Limitation</TableHead>
                    <TableHead className="text-center">Enhancement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endorsements.map((end, i) => (
                    <TableRow key={i} className={end.is_limitation ? 'bg-red-50' : ''}>
                      <TableCell className="font-mono">{end.form_number}</TableCell>
                      <TableCell>
                        <div>{end.title}</div>
                        {end.impact_description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {end.impact_description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {end.category ? (
                          <Badge
                            variant={end.is_limitation ? 'destructive' : 'outline'}
                            className="text-xs"
                          >
                            {getEndorsementCategoryLabel(end.category)}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{end.edition_date || '-'}</TableCell>
                      <TableCell className="text-center">
                        {end.is_limitation ? (
                          <AlertTriangle className="h-4 w-4 text-red-600 mx-auto" />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {end.is_enhancement ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No endorsements found</p>
        </div>
      )}
    </>
  );
}

function EndorsementCard({ endorsement }: { endorsement: UmbrellaEndorsement }) {
  return (
    <Card className={`p-4 ${endorsement.is_limitation ? 'bg-red-50 border-red-200' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {endorsement.is_limitation ? (
            <ShieldX className="h-5 w-5 text-red-600 mt-0.5" />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{endorsement.form_number}</span>
              {endorsement.category && (
                <Badge variant={endorsement.is_limitation ? 'destructive' : 'outline'} className="text-xs">
                  {getEndorsementCategoryLabel(endorsement.category)}
                </Badge>
              )}
            </div>
            <div className="text-sm font-medium mt-1">{endorsement.title}</div>
            {endorsement.impact_description && (
              <div className="text-sm text-muted-foreground mt-1">
                {endorsement.impact_description}
              </div>
            )}
          </div>
        </div>
        {endorsement.premium_impact && endorsement.premium_impact !== 0 && (
          <Badge variant="secondary">
            {endorsement.premium_impact > 0 ? '+' : ''}
            {formatCurrency(endorsement.premium_impact)}
          </Badge>
        )}
      </div>
    </Card>
  );
}

// =============================================================================
// PREMIUM TAB
// =============================================================================

function PremiumTab({ details }: { details: UmbrellaPolicyDetails }) {
  const { premium } = details;

  return (
    <>
      {/* Total Premium Display */}
      <div className="flex justify-center mb-6">
        <Card className="p-6 bg-primary/5 text-center">
          <div className="text-sm text-muted-foreground mb-1">Total Premium</div>
          <div className="text-4xl font-bold text-primary">
            {formatCurrency(premium.total_premium)}
          </div>
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
              {premium.base_premium && (
                <TableRow>
                  <TableCell>Base Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.base_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.policy_fee && (
                <TableRow>
                  <TableCell>Policy Fee</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.policy_fee)}
                  </TableCell>
                </TableRow>
              )}
              {premium.terrorism_premium && !premium.terrorism_rejected && (
                <TableRow>
                  <TableCell>Terrorism Premium (TRIA)</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.terrorism_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.terrorism_rejected && (
                <TableRow>
                  <TableCell className="text-muted-foreground">Terrorism Coverage</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">Rejected</Badge>
                  </TableCell>
                </TableRow>
              )}
              {premium.state_taxes && (
                <TableRow>
                  <TableCell>State Taxes</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.state_taxes)}
                  </TableCell>
                </TableRow>
              )}
              {premium.stamping_fee && (
                <TableRow>
                  <TableCell>Stamping Fee (Surplus Lines)</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.stamping_fee)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="bg-primary/5">
                <TableCell className="font-bold">Total Premium</TableCell>
                <TableCell className="text-right font-mono font-bold text-lg">
                  {formatCurrency(premium.total_premium)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

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

      {/* Rating Basis */}
      {(premium.rating_basis || premium.exposure_base) && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Rating Information</h4>
            <div className="grid grid-cols-2 gap-4">
              {premium.rating_basis && (
                <InfoField label="Rating Basis" value={premium.rating_basis} />
              )}
              {premium.exposure_base && (
                <InfoField
                  label="Exposure Base"
                  value={premium.exposure_base.toLocaleString()}
                  mono
                />
              )}
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

function AddressDisplay({
  address,
}: {
  address: { street: string; city: string; state: string; zip: string } | undefined;
}) {
  if (!address?.street) return <span className="text-muted-foreground">Not provided</span>;
  return (
    <div className="text-sm">
      <p>{address.street}</p>
      <p>
        {address.city}, {address.state} {address.zip}
      </p>
    </div>
  );
}

function ExtractionStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null;

  const variants: Record<
    string,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
  > = {
    AUTO_APPLIED: { variant: 'default', label: 'Auto' },
    NEEDS_REVIEW: { variant: 'secondary', label: 'Review' },
    LOW_CONFIDENCE: { variant: 'outline', label: 'Low' },
    NOT_FOUND: { variant: 'outline', label: 'N/F' },
    CONFLICT: { variant: 'destructive', label: 'Conflict' },
    MANUAL: { variant: 'secondary', label: 'Manual' },
  };

  const config = variants[status] || { variant: 'outline' as const, label: status };

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}

export default UmbrellaPolicyDetailsView;
