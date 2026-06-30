/**
 * Commercial General Liability (CGL) Policy Details Component
 *
 * Comprehensive tabbed view for CGL policy data including:
 * - Overview (identity, dates, coverage options)
 * - Limits (each occurrence, aggregates, P&AI, medical, fire damage)
 * - Locations (premises schedule)
 * - Classifications (exposures, rates, premiums)
 * - Additional Insureds (AI schedule with endorsements)
 * - Premium (breakdown by coverage)
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
  Shield,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  FileSearch,
  Scale,
  ClipboardList,
  UserPlus,
  Briefcase,
  Clock,
  AlertCircle,
} from 'lucide-react';
import type {
  CGLPolicyDetails,
  CGLLocation,
  CGLClassification,
  CGLAdditionalInsured,
  CGLEndorsement,
  CGLPolicyTab,
  ProfessionalLiabilityCoverage,
} from '@/types/commercial-gl';
import {
  hasProfessionalLiability,
  PROFESSIONAL_LIABILITY_TYPE_LABELS,
} from '@/types/commercial-gl';
import type { CGLEvidenceCatalog, BoundingBox } from '@/hooks/useCGLExtraction';

interface CGLPolicyDetailsProps {
  policyId: string;
  cglDetails: CGLPolicyDetails | null;
  locations?: CGLLocation[];
  classifications?: CGLClassification[];
  additionalInsureds?: CGLAdditionalInsured[];
  endorsements?: CGLEndorsement[];
  onUpdate?: (details: Partial<CGLPolicyDetails>) => void;
  isEditing?: boolean;
  /** Evidence catalog for click-to-highlight */
  evidenceCatalog?: CGLEvidenceCatalog | null;
  /** Field-level evidence mapping */
  fieldEvidence?: Record<string, string[]>;
  /** Callback when evidence is clicked */
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}

// AI Type Labels
const AI_LABELS: Record<string, string> = {
  ongoing_ops: 'Ongoing Operations',
  completed_ops: 'Completed Operations',
  both: 'Ongoing & Completed Ops',
  owners_lessees_contractors: 'Owners/Lessees/Contractors',
  managers_lessors: 'Managers/Lessors',
  vendors: 'Vendors',
  co_owner: 'Co-Owner',
  designated_person: 'Designated Person/Org',
  other: 'Other',
};

// Exposure Basis Labels
const EXPOSURE_LABELS: Record<string, string> = {
  sales: 'Gross Sales',
  payroll: 'Payroll',
  area: 'Square Feet',
  units: 'Units',
  admissions: 'Admissions',
  per_project: 'Per Project',
  flat: 'Flat Charge',
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
  evidenceCatalog?: CGLEvidenceCatalog | null;
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
                ? 'bg-success/10 text-success hover:bg-success/20'
                : confidence >= 0.8
                  ? 'bg-info/10 text-info hover:bg-info/20'
                  : confidence >= 0.7
                    ? 'bg-warning/10 text-warning hover:bg-warning/20'
                    : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
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

export function CGLPolicyDetailsView({
  policyId,
  cglDetails,
  locations = [],
  classifications = [],
  additionalInsureds = [],
  endorsements = [],
  onUpdate,
  isEditing = false,
  evidenceCatalog,
  fieldEvidence,
  onEvidenceClick,
}: CGLPolicyDetailsProps) {
  const [activeTab, setActiveTab] = useState<CGLPolicyTab>('overview');

  if (!cglDetails) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">No General Liability details available.</p>
          <p className="text-sm text-muted-foreground">
            Upload a policy document to automatically extract CGL details.
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
              Commercial General Liability Details
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              CGL policy information and coverage details
              {cglDetails.extraction_source && (
                <Badge variant="outline" className="text-xs">
                  {cglDetails.extraction_source === 'azure_di_claude' ? (
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
          {cglDetails.limits?.each_occurrence && (
            <div className="flex items-center gap-2 px-3 py-2 bg-info/10 rounded-lg">
              <Scale className="h-4 w-4 text-info" />
              <div>
                <div className="text-xs text-muted-foreground">Each Occurrence</div>
                <div className="text-lg font-bold text-info">
                  {formatCurrency(cglDetails.limits.each_occurrence)}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CGLPolicyTab)}>
          <TabsList className={`grid w-full mb-6 ${hasProfessionalLiability(cglDetails.coverage_options) ? 'grid-cols-7' : 'grid-cols-6'}`}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
            {hasProfessionalLiability(cglDetails.coverage_options) && (
              <TabsTrigger value="professional" className="text-xs">
                <Briefcase className="h-3 w-3 mr-1" />
                E&O/Prof
              </TabsTrigger>
            )}
            <TabsTrigger value="locations">
              Locations {locations.length > 0 && `(${locations.length})`}
            </TabsTrigger>
            <TabsTrigger value="classifications">
              Class {classifications.length > 0 && `(${classifications.length})`}
            </TabsTrigger>
            <TabsTrigger value="additional_insureds">
              AI's {additionalInsureds.length > 0 && `(${additionalInsureds.length})`}
            </TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab details={cglDetails} />
          </TabsContent>

          <TabsContent value="limits" className="space-y-6">
            <LimitsTab details={cglDetails} />
          </TabsContent>

          {hasProfessionalLiability(cglDetails.coverage_options) && (
            <TabsContent value="professional" className="space-y-6">
              <ProfessionalLiabilityTab
                coverage={cglDetails.coverage_options.additional_coverages?.professional_liability}
                expirationDate={cglDetails.dates.expiration_date}
              />
            </TabsContent>
          )}

          <TabsContent value="locations" className="space-y-6">
            <LocationsTab locations={locations} />
          </TabsContent>

          <TabsContent value="classifications" className="space-y-6">
            <ClassificationsTab classifications={classifications} />
          </TabsContent>

          <TabsContent value="additional_insureds" className="space-y-6">
            <AdditionalInsuredsTab
              additionalInsureds={additionalInsureds}
              endorsements={endorsements}
            />
          </TabsContent>

          <TabsContent value="premium" className="space-y-6">
            <PremiumTab details={cglDetails} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ details }: { details: CGLPolicyDetails }) {
  const { identity, dates, coverage_options } = details;

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
          <InfoField label="FEIN" value={identity.fein || 'N/A'} mono />
          <InfoField label="Producer" value={identity.producer || 'N/A'} />
        </div>
      </div>

      <Separator />

      {/* Address */}
      <div className="space-y-2">
        <h4 className="font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Mailing Address
        </h4>
        <AddressDisplay address={identity.mailing_address} />
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
        </div>
      </div>

      <Separator />

      {/* Coverage Options */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Coverage Options
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InfoField
            label="Policy Form"
            value={
              <Badge variant={coverage_options.policy_form === 'occurrence' ? 'default' : 'secondary'}>
                {coverage_options.policy_form === 'occurrence' ? 'OCCURRENCE' : 'CLAIMS-MADE'}
              </Badge>
            }
          />
          <InfoField
            label="Defense Costs"
            value={
              coverage_options.defense_costs === 'outside_limits'
                ? 'Outside Limits (Supplementary)'
                : 'Inside Limits (Eroding)'
            }
          />
          {coverage_options.policy_form === 'claims_made' &&
            coverage_options.claims_made_details?.retroactive_date && (
              <InfoField
                label="Retroactive Date"
                value={formatDate(coverage_options.claims_made_details.retroactive_date)}
              />
            )}
        </div>

        {/* Claims-Made Warning */}
        {coverage_options.policy_form === 'claims_made' && (
          <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Claims-Made Policy</p>
              <p className="text-xs text-warning mt-1">
                Coverage applies only to claims filed during the policy period for incidents
                occurring after the retroactive date.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// =============================================================================
// LIMITS TAB
// =============================================================================

function LimitsTab({ details }: { details: CGLPolicyDetails }) {
  const { limits, deductible } = details;

  return (
    <>
      {/* Standard CGL Limits */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Coverage Limits
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <LimitCard label="Each Occurrence" value={limits.each_occurrence} primary />
          <LimitCard label="General Aggregate" value={limits.general_aggregate} />
          <LimitCard
            label="Products/Completed Ops Aggregate"
            value={limits.products_completed_ops_aggregate}
          />
          <LimitCard
            label="Personal & Advertising Injury"
            value={limits.personal_advertising_injury}
          />
          <LimitCard
            label="Damage to Rented Premises"
            value={limits.damage_to_rented_premises}
            sublabel="(Fire Damage)"
          />
          <LimitCard
            label="Medical Expense"
            value={limits.medical_expense}
            sublabel="(Per Person)"
          />
        </div>
      </div>

      {/* Aggregate Applicability */}
      {limits.aggregate_applies_per && (
        <>
          <Separator />
          <div className="p-4 bg-info/10 rounded-lg">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-info">
                Aggregate Applies Per: {limits.aggregate_applies_per.toUpperCase()}
              </Badge>
              {limits.aggregate_applies_per === 'project' && (
                <span className="text-sm text-info">(CG 25 03)</span>
              )}
              {limits.aggregate_applies_per === 'location' && (
                <span className="text-sm text-info">(CG 25 04)</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Deductible/SIR */}
      {deductible && deductible.type !== 'none' && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">
              {deductible.type === 'sir' ? 'Self-Insured Retention (SIR)' : 'Deductible'}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Per Occurrence</div>
                <div className="text-xl font-bold">
                  {formatCurrency(deductible.per_occurrence)}
                </div>
              </Card>
              {deductible.property_damage && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Property Damage</div>
                  <div className="text-xl font-bold">
                    {formatCurrency(deductible.property_damage)}
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

function LimitCard({
  label,
  value,
  sublabel,
  primary = false,
}: {
  label: string;
  value: number | undefined;
  sublabel?: string;
  primary?: boolean;
}) {
  return (
    <Card className={`p-4 ${primary ? 'bg-info/10 border-info/30' : ''}`}>
      <div className="text-xs text-muted-foreground mb-1">
        {label}
        {sublabel && <span className="text-xs"> {sublabel}</span>}
      </div>
      <div className={`text-xl font-bold ${primary ? 'text-info' : ''}`}>
        {formatCurrency(value)}
      </div>
    </Card>
  );
}

// =============================================================================
// PROFESSIONAL LIABILITY / E&O TAB
// =============================================================================

function ProfessionalLiabilityTab({
  coverage,
  expirationDate,
}: {
  coverage: ProfessionalLiabilityCoverage | undefined;
  expirationDate: string;
}) {
  if (!coverage || !coverage.included) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No Professional Liability / E&O coverage included</p>
      </div>
    );
  }

  // Calculate ERP deadline if applicable
  const getERPDeadlineDisplay = () => {
    if (!coverage.supplemental_erp_available || !expirationDate) return null;
    const defaultDeadline = coverage.supplemental_erp_options?.[0]?.deadline_days || 60;
    const deadline = new Date(expirationDate);
    deadline.setDate(deadline.getDate() + defaultDeadline);
    return deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      {/* Coverage Type & Form */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-info/10">
          <div className="text-xs text-muted-foreground mb-1">Coverage Type</div>
          <div className="font-bold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-info" />
            <span className="text-info">
              {coverage.professional_type
                ? PROFESSIONAL_LIABILITY_TYPE_LABELS[coverage.professional_type]
                : 'E&O / Professional'}
            </span>
          </div>
        </Card>
        <Card className={`p-4 ${coverage.policy_form === 'claims_made' ? 'bg-warning/10' : 'bg-success/10'}`}>
          <div className="text-xs text-muted-foreground mb-1">Policy Form</div>
          <div className="font-bold">
            <Badge variant={coverage.policy_form === 'claims_made' ? 'secondary' : 'default'}>
              {coverage.policy_form === 'claims_made' ? 'CLAIMS-MADE' : 'OCCURRENCE'}
            </Badge>
          </div>
        </Card>
        {coverage.separate_policy && (
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Policy Status</div>
            <Badge variant="outline">Separate Policy</Badge>
          </Card>
        )}
      </div>

      <Separator />

      {/* Limits */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Scale className="h-4 w-4" />
          E&O / Professional Limits
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-info/10">
            <div className="text-xs text-muted-foreground mb-1">Per Claim Limit</div>
            <div className="text-2xl font-bold text-info">
              {formatCurrency(coverage.per_claim_limit)}
            </div>
          </Card>
          <Card className="p-4 bg-info/10">
            <div className="text-xs text-muted-foreground mb-1">Aggregate Limit</div>
            <div className="text-2xl font-bold text-info">
              {formatCurrency(coverage.aggregate_limit)}
            </div>
          </Card>
          <Card className={`p-4 ${coverage.defense_costs === 'outside_limits' ? 'bg-success/10' : 'bg-warning/10'}`}>
            <div className="text-xs text-muted-foreground mb-1">Defense Costs</div>
            <div className="font-medium">
              {coverage.defense_costs === 'outside_limits' ? (
                <span className="text-success">Outside Limits (Supplementary)</span>
              ) : (
                <span className="text-warning">Inside Limits (Eroding)</span>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Claims-Made Specifics (CRITICAL) */}
      {coverage.policy_form === 'claims_made' && (
        <>
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-warning">
              <Clock className="h-4 w-4" />
              Claims-Made Specifics
            </h4>
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning">Claims-Made Coverage</p>
                  <p className="text-xs text-warning">
                    Coverage applies only to claims first made during the policy period for wrongful
                    acts occurring after the retroactive date.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 border-warning/30">
                <div className="text-xs text-muted-foreground mb-1">Retroactive Date</div>
                <div className="font-bold text-lg">
                  {coverage.full_prior_acts ? (
                    <Badge variant="default" className="bg-success text-success-foreground">Full Prior Acts</Badge>
                  ) : coverage.retroactive_date ? (
                    formatDate(coverage.retroactive_date)
                  ) : (
                    <span className="text-warning">Check Policy</span>
                  )}
                </div>
              </Card>
              {coverage.continuity_date && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Continuity Date</div>
                  <div className="font-medium">{formatDate(coverage.continuity_date)}</div>
                </Card>
              )}
              {coverage.pending_prior_date && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Pending & Prior Date</div>
                  <div className="font-medium">{formatDate(coverage.pending_prior_date)}</div>
                </Card>
              )}
            </div>
          </div>

          <Separator />

          {/* Extended Reporting Period (ERP / Tail) */}
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Extended Reporting Period (ERP / Tail)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {coverage.basic_erp_days && (
                <Card className="p-4 bg-info/10">
                  <div className="text-xs text-muted-foreground mb-1">Basic ERP (Automatic)</div>
                  <div className="text-xl font-bold text-info">
                    {coverage.basic_erp_days} days
                  </div>
                  <div className="text-xs text-muted-foreground">Included at no charge</div>
                </Card>
              )}
              {coverage.supplemental_erp_available && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Supplemental ERP</div>
                  <div className="font-medium">
                    <Badge variant="outline" className="text-success">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Available
                    </Badge>
                  </div>
                  {getERPDeadlineDisplay() && (
                    <div className="text-xs text-warning mt-1">
                      Purchase by: {getERPDeadlineDisplay()}
                    </div>
                  )}
                </Card>
              )}
              {coverage.erp_purchased && (
                <Card className="p-4 bg-success/10">
                  <div className="text-xs text-muted-foreground mb-1">ERP Purchased</div>
                  <div className="text-xl font-bold text-success">
                    {coverage.erp_purchased_duration_months} months
                  </div>
                  {coverage.erp_purchased_premium && (
                    <div className="text-xs text-muted-foreground">
                      Premium: {formatCurrency(coverage.erp_purchased_premium)}
                    </div>
                  )}
                </Card>
              )}
            </div>

            {/* ERP Options Table */}
            {coverage.supplemental_erp_options && coverage.supplemental_erp_options.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Duration</TableHead>
                      <TableHead>Premium</TableHead>
                      <TableHead>Deadline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverage.supplemental_erp_options.map((opt, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {opt.duration_months >= 12
                            ? `${opt.duration_months / 12} Year${opt.duration_months > 12 ? 's' : ''}`
                            : `${opt.duration_months} Months`}
                        </TableCell>
                        <TableCell>
                          {opt.premium_percent
                            ? `${opt.premium_percent}% of annual premium`
                            : 'Contact carrier'}
                        </TableCell>
                        <TableCell>
                          {opt.deadline_days
                            ? `${opt.deadline_days} days after expiration`
                            : 'Per policy terms'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <Separator />
        </>
      )}

      {/* Deductible / SIR */}
      {coverage.deductible_type && coverage.deductible_type !== 'none' && (
        <>
          <div className="space-y-4">
            <h4 className="font-semibold">
              {coverage.deductible_type === 'sir' ? 'Self-Insured Retention (SIR)' : 'Deductible'}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Per Claim</div>
                <div className="text-xl font-bold">
                  {formatCurrency(coverage.deductible_per_claim)}
                </div>
              </Card>
              {coverage.deductible_aggregate && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Aggregate</div>
                  <div className="text-xl font-bold">
                    {formatCurrency(coverage.deductible_aggregate)}
                  </div>
                </Card>
              )}
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Applies to Defense?</div>
                <div className="font-medium">
                  {coverage.deductible_applies_to_defense ? (
                    <Badge variant="secondary">Yes - Defense Included</Badge>
                  ) : (
                    <Badge variant="outline">No - Indemnity Only</Badge>
                  )}
                </div>
              </Card>
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Covered Services */}
      {coverage.covered_services && coverage.covered_services.length > 0 && (
        <>
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Covered Professional Services
            </h4>
            <div className="flex flex-wrap gap-2">
              {coverage.covered_services.map((service, i) => (
                <Badge key={i} variant="outline">
                  {service}
                </Badge>
              ))}
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Key Exclusions */}
      {coverage.key_exclusions && coverage.key_exclusions.length > 0 && (
        <>
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Key Exclusions
            </h4>
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <ul className="list-disc list-inside space-y-1 text-sm text-destructive">
                {coverage.key_exclusions.map((exclusion, i) => (
                  <li key={i}>{exclusion}</li>
                ))}
              </ul>
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Endorsement Forms */}
      {coverage.endorsement_forms && coverage.endorsement_forms.length > 0 && (
        <>
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Endorsement Forms
            </h4>
            <div className="flex flex-wrap gap-2">
              {coverage.endorsement_forms.map((form, i) => (
                <Badge key={i} variant="secondary" className="font-mono">
                  {form}
                </Badge>
              ))}
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Premium */}
      {coverage.premium && (
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            E&O / Professional Premium
          </h4>
          <Card className="p-4 bg-primary/5 text-center max-w-xs mx-auto">
            <div className="text-sm text-muted-foreground mb-1">Premium</div>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(coverage.premium)}
            </div>
            {coverage.minimum_premium && (
              <div className="text-xs text-muted-foreground mt-1">
                Minimum: {formatCurrency(coverage.minimum_premium)}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

// =============================================================================
// LOCATIONS TAB
// =============================================================================

function LocationsTab({ locations }: { locations: CGLLocation[] }) {
  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Locations</div>
          <div className="text-2xl font-bold">{locations.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">States</div>
          <div className="flex gap-1 flex-wrap">
            {[...new Set(locations.map((l) => l.address?.state).filter(Boolean))].map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <Separator />

      {/* Locations Table */}
      {locations.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Loc #</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Building Type</TableHead>
                <TableHead className="text-right">Sq Ft</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{loc.location_number}</TableCell>
                  <TableCell>
                    {loc.address ? (
                      <div>
                        <div className="font-medium">{loc.address.street}</div>
                        <div className="text-xs text-muted-foreground">
                          {loc.address.city}, {loc.address.state} {loc.address.zip}
                        </div>
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell>{loc.description || 'N/A'}</TableCell>
                  <TableCell>
                    {loc.building_type ? (
                      <Badge variant="outline" className="capitalize">
                        {loc.building_type}
                      </Badge>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {loc.square_footage?.toLocaleString() || 'N/A'}
                  </TableCell>
                  <TableCell>
                    <ExtractionStatusBadge status={loc.extraction_status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No locations found</p>
        </div>
      )}
    </>
  );
}

// =============================================================================
// CLASSIFICATIONS TAB
// =============================================================================

function ClassificationsTab({ classifications }: { classifications: CGLClassification[] }) {
  const totalPremium = classifications.reduce((sum, c) => sum + (c.premium || 0), 0);
  const pcoClasses = classifications.filter((c) => c.is_products_completed_ops);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Classifications</div>
          <div className="text-2xl font-bold">{classifications.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Products/Completed Ops</div>
          <div className="text-2xl font-bold">{pcoClasses.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Premium</div>
          <div className="text-2xl font-bold">{formatCurrency(totalPremium)}</div>
        </Card>
      </div>

      <Separator />

      {/* Classifications Table */}
      {classifications.length > 0 ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Exposure Basis</TableHead>
                <TableHead className="text-right">Exposure</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classifications.map((cls, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{cls.class_code || 'N/A'}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={cls.description}>
                    {cls.description}
                  </TableCell>
                  <TableCell>
                    {cls.exposure_basis ? EXPOSURE_LABELS[cls.exposure_basis] || cls.exposure_basis : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {cls.exposure_amount?.toLocaleString() || 'N/A'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {cls.rate?.toFixed(4) || 'N/A'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(cls.premium)}
                  </TableCell>
                  <TableCell>
                    {cls.is_products_completed_ops ? (
                      <Badge variant="secondary" className="text-xs">
                        P&CO
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        P/O
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No classifications found</p>
        </div>
      )}
    </>
  );
}

// =============================================================================
// ADDITIONAL INSUREDS TAB
// =============================================================================

function AdditionalInsuredsTab({
  additionalInsureds,
  endorsements,
}: {
  additionalInsureds: CGLAdditionalInsured[];
  endorsements: CGLEndorsement[];
}) {
  const withPNC = additionalInsureds.filter((ai) => ai.primary_noncontributory);
  const withWOS = additionalInsureds.filter((ai) => ai.waiver_of_subrogation);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Additional Insureds</div>
          <div className="text-2xl font-bold">{additionalInsureds.length}</div>
        </Card>
        <Card className="p-4 bg-info/10">
          <div className="text-xs text-muted-foreground">Primary & Non-Contributory</div>
          <div className="text-2xl font-bold text-info">{withPNC.length}</div>
        </Card>
        <Card className="p-4 bg-success/10">
          <div className="text-xs text-muted-foreground">Waiver of Subrogation</div>
          <div className="text-2xl font-bold text-success">{withWOS.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Endorsements</div>
          <div className="text-2xl font-bold">{endorsements.length}</div>
        </Card>
      </div>

      <Separator />

      {/* Additional Insureds Table */}
      {additionalInsureds.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Endorsement</TableHead>
                <TableHead className="text-center">P&NC</TableHead>
                <TableHead className="text-center">WOS</TableHead>
                <TableHead>Project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {additionalInsureds.map((ai, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="font-medium">{ai.name}</div>
                    {ai.address && (
                      <div className="text-xs text-muted-foreground">
                        {ai.address.city}, {ai.address.state}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {AI_LABELS[ai.ai_type] || ai.ai_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ai.endorsement_form ? (
                      <Badge variant="secondary" className="text-xs font-mono">
                        {ai.endorsement_form}
                      </Badge>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {ai.primary_noncontributory ? (
                      <CheckCircle className="h-4 w-4 text-success mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-cc-text-faint mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {ai.waiver_of_subrogation ? (
                      <CheckCircle className="h-4 w-4 text-success mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-cc-text-faint mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {ai.project_name || 'All Projects'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No additional insureds found</p>
        </div>
      )}

      {/* Endorsements */}
      {endorsements.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Endorsements Schedule
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Form</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Edition</TableHead>
                    <TableHead className="text-right">Premium</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endorsements.map((end, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{end.form_number}</TableCell>
                      <TableCell>{end.description}</TableCell>
                      <TableCell>{end.edition_date || 'N/A'}</TableCell>
                      <TableCell className="text-right font-mono">
                        {end.premium_impact ? formatCurrency(end.premium_impact) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

function PremiumTab({ details }: { details: CGLPolicyDetails }) {
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
              {premium.premises_operations_premium && (
                <TableRow>
                  <TableCell>Premises/Operations Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.premises_operations_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.products_completed_ops_premium && (
                <TableRow>
                  <TableCell>Products/Completed Operations Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.products_completed_ops_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.personal_advertising_injury_premium && (
                <TableRow>
                  <TableCell>Personal & Advertising Injury Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.personal_advertising_injury_premium)}
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
                  <TableCell className="text-muted-foreground">
                    Terrorism Coverage
                  </TableCell>
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
    MANUAL: { variant: 'secondary', label: 'Manual' },
  };

  const config = variants[status] || { variant: 'outline' as const, label: status };

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}

export default CGLPolicyDetailsView;
