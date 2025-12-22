/**
 * Commercial Property Policy Details Component
 *
 * Comprehensive tabbed view for Commercial Property policy data including:
 * - Overview (identity, dates, form type, valuation)
 * - Buildings (locations, buildings, coverages by building)
 * - Deductibles (AOP, Wind/Hail, Named Storm, Flood, Earthquake)
 * - BI/O&L (Business Income, Ordinance or Law)
 * - Interests (Mortgagees, Loss Payees)
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
  Building,
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
  Shield,
  Banknote,
  Wind,
  Droplet,
  Mountain,
  Flame,
  Clock,
  Hammer,
  Landmark,
} from 'lucide-react';
import type {
  PropertyPolicyDetails,
  PropertyLocation,
  PropertyBuilding,
  BuildingCoverageLimits,
  PropertyDeductible,
  PropertyInterest,
  PropertyEndorsement,
  PropertyPolicyTab,
  BuildersRiskCoverage,
} from '@/types/commercial-property';
import {
  hasBuildersRisk,
  BUILDERS_RISK_PROJECT_TYPE_LABELS,
} from '@/types/commercial-property';
import type { PropertyEvidenceCatalog, BoundingBox } from '@/hooks/usePropertyExtraction';
import {
  formatLimit,
  formatDeductible,
  getPerilLabel,
  getConstructionClassLabel,
  getInterestTypeLabel,
  PERIL_LABELS,
} from '@/hooks/usePropertyExtraction';

interface PropertyPolicyDetailsProps {
  policyId: string;
  propertyDetails: PropertyPolicyDetails | null;
  locations?: PropertyLocation[];
  buildings?: PropertyBuilding[];
  buildingCoverages?: BuildingCoverageLimits[];
  deductibles?: PropertyDeductible[];
  interests?: PropertyInterest[];
  endorsements?: PropertyEndorsement[];
  onUpdate?: (details: Partial<PropertyPolicyDetails>) => void;
  isEditing?: boolean;
  /** Evidence catalog for click-to-highlight */
  evidenceCatalog?: PropertyEvidenceCatalog | null;
  /** Field-level evidence mapping */
  fieldEvidence?: Record<string, string[]>;
  /** Callback when evidence is clicked */
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  special: 'Special Form (CP 10 30)',
  broad: 'Broad Form (CP 10 20)',
  basic: 'Basic Form (CP 10 10)',
};

const VALUATION_LABELS: Record<string, string> = {
  replacement_cost: 'Replacement Cost (RCV)',
  actual_cash_value: 'Actual Cash Value (ACV)',
  functional_replacement: 'Functional Replacement (FRV)',
  stated_amount: 'Stated Amount',
  agreed_value: 'Agreed Value',
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
  evidenceCatalog?: PropertyEvidenceCatalog | null;
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

export function PropertyPolicyDetailsView({
  policyId,
  propertyDetails,
  locations = [],
  buildings = [],
  buildingCoverages = [],
  deductibles = [],
  interests = [],
  endorsements = [],
  onUpdate,
  isEditing = false,
  evidenceCatalog,
  fieldEvidence,
  onEvidenceClick,
}: PropertyPolicyDetailsProps) {
  const [activeTab, setActiveTab] = useState<PropertyPolicyTab>('overview');

  if (!propertyDetails) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Building className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">No Commercial Property details available.</p>
          <p className="text-sm text-muted-foreground">
            Upload a policy document to automatically extract Property details.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate TIV
  const totalBuildingValue = buildingCoverages.reduce((sum, c) => sum + (c.building_limit || 0), 0);
  const totalBPPValue = buildingCoverages.reduce((sum, c) => sum + (c.bpp_limit || 0), 0);
  const tiv = propertyDetails.valuation?.total_insured_value || totalBuildingValue + totalBPPValue;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Commercial Property Details
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Property policy information and coverage details
              {propertyDetails.extraction_source && (
                <Badge variant="outline" className="text-xs">
                  {propertyDetails.extraction_source === 'azure_di_claude' ? (
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
          {tiv > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
              <Banknote className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-xs text-muted-foreground">Total Insured Value</div>
                <div className="text-lg font-bold text-blue-700">
                  {formatCurrency(tiv)}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PropertyPolicyTab)}>
          <TabsList className={`grid w-full mb-6 ${hasBuildersRisk(propertyDetails.additional_coverages) ? 'grid-cols-7' : 'grid-cols-6'}`}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="buildings">
              Buildings {buildings.length > 0 && `(${buildings.length})`}
            </TabsTrigger>
            {hasBuildersRisk(propertyDetails.additional_coverages) && (
              <TabsTrigger value="builders_risk" className="text-xs">
                <Hammer className="h-3 w-3 mr-1" />
                Builders Risk
              </TabsTrigger>
            )}
            <TabsTrigger value="deductibles">
              Deductibles {deductibles.length > 0 && `(${deductibles.length})`}
            </TabsTrigger>
            <TabsTrigger value="bi_ol">BI/O&L</TabsTrigger>
            <TabsTrigger value="interests">
              Interests {interests.length > 0 && `(${interests.length})`}
            </TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab details={propertyDetails} />
          </TabsContent>

          <TabsContent value="buildings" className="space-y-6">
            <BuildingsTab
              locations={locations}
              buildings={buildings}
              buildingCoverages={buildingCoverages}
            />
          </TabsContent>

          {hasBuildersRisk(propertyDetails.additional_coverages) && (
            <TabsContent value="builders_risk" className="space-y-6">
              <BuildersRiskTab
                coverage={propertyDetails.additional_coverages?.builders_risk}
              />
            </TabsContent>
          )}

          <TabsContent value="deductibles" className="space-y-6">
            <DeductiblesTab deductibles={deductibles} />
          </TabsContent>

          <TabsContent value="bi_ol" className="space-y-6">
            <BIAndOLTab details={propertyDetails} />
          </TabsContent>

          <TabsContent value="interests" className="space-y-6">
            <InterestsTab interests={interests} endorsements={endorsements} />
          </TabsContent>

          <TabsContent value="premium" className="space-y-6">
            <PremiumTab details={propertyDetails} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ details }: { details: PropertyPolicyDetails }) {
  const { identity, dates, form, valuation } = details;

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
        {identity.mailing_address && (
          <AddressDisplay address={identity.mailing_address} />
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
        </div>
      </div>

      <Separator />

      {/* Form & Valuation */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Form & Valuation
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Policy Form</div>
            <div className="font-medium">
              <Badge variant={form.form_type === 'special' ? 'default' : 'secondary'}>
                {FORM_TYPE_LABELS[form.form_type] || form.form_type}
              </Badge>
            </div>
          </Card>
          {valuation && (
            <>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Valuation Basis</div>
                <div className="font-medium">
                  {valuation.is_blanket && (
                    <Badge variant="outline" className="mr-1">Blanket</Badge>
                  )}
                  {valuation.is_agreed_value && (
                    <Badge variant="outline" className="mr-1">Agreed</Badge>
                  )}
                </div>
              </Card>
              {valuation.coinsurance_percent && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Coinsurance</div>
                  <div className="text-xl font-bold">{valuation.coinsurance_percent}%</div>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Blanket Coverage Info */}
        {valuation?.is_blanket && valuation.blanket_limit && (
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-blue-700">
                Blanket Limit: {formatCurrency(valuation.blanket_limit)}
              </Badge>
              {valuation.margin_clause_percent && (
                <span className="text-sm text-blue-600">
                  Margin Clause: {valuation.margin_clause_percent}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// =============================================================================
// BUILDINGS TAB
// =============================================================================

function BuildingsTab({
  locations,
  buildings,
  buildingCoverages,
}: {
  locations: PropertyLocation[];
  buildings: PropertyBuilding[];
  buildingCoverages: BuildingCoverageLimits[];
}) {
  // Calculate totals
  const totalBuildingValue = buildingCoverages.reduce((sum, c) => sum + (c.building_limit || 0), 0);
  const totalBPP = buildingCoverages.reduce((sum, c) => sum + (c.bpp_limit || 0), 0);
  const totalSqFt = buildings.reduce((sum, b) => sum + (b.square_footage || 0), 0);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Locations</div>
          <div className="text-2xl font-bold">{locations.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Buildings</div>
          <div className="text-2xl font-bold">{buildings.length}</div>
        </Card>
        <Card className="p-4 bg-blue-50">
          <div className="text-xs text-muted-foreground">Total Building Value</div>
          <div className="text-xl font-bold text-blue-700">{formatCurrency(totalBuildingValue)}</div>
        </Card>
        <Card className="p-4 bg-green-50">
          <div className="text-xs text-muted-foreground">Total BPP Value</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(totalBPP)}</div>
        </Card>
      </div>

      <Separator />

      {/* Locations */}
      {locations.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Locations
          </h4>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Loc #</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Protection Class</TableHead>
                  <TableHead>Occupancy</TableHead>
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
                    <TableCell>{loc.county || 'N/A'}</TableCell>
                    <TableCell>
                      {loc.protection_class ? (
                        <Badge variant="outline">{loc.protection_class}</Badge>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>{loc.occupancy || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Separator />

      {/* Buildings with Coverages */}
      {buildings.length > 0 ? (
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <Building className="h-4 w-4" />
            Buildings Schedule
          </h4>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Loc/Bldg</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Construction</TableHead>
                  <TableHead className="text-right">Sq Ft</TableHead>
                  <TableHead className="text-right">Building Limit</TableHead>
                  <TableHead className="text-right">BPP Limit</TableHead>
                  <TableHead>Valuation</TableHead>
                  <TableHead>Coins</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildings.map((bldg, i) => {
                  const coverage = buildingCoverages.find(
                    (c) =>
                      c.building_number === bldg.building_number &&
                      c.location_number === bldg.location_number
                  );
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono">
                        {bldg.location_number}/{bldg.building_number}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={bldg.description || ''}>
                        {bldg.description || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {bldg.construction_class && (
                            <Badge variant="outline" className="text-xs w-fit">
                              Class {bldg.construction_class}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground capitalize">
                            {bldg.construction_type?.replace(/_/g, ' ') || 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {bldg.square_footage?.toLocaleString() || 'N/A'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(coverage?.building_limit)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(coverage?.bpp_limit)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {bldg.valuation_basis?.replace(/_/g, ' ') || 'RCV'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {bldg.coinsurance_percent ? `${bldg.coinsurance_percent}%` : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Building className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No buildings found</p>
        </div>
      )}

      {/* Building Details Expansion */}
      {buildings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {buildings.slice(0, 4).map((bldg, i) => (
            <Card key={i} className="p-4">
              <div className="font-medium mb-2">
                Loc {bldg.location_number} / Bldg {bldg.building_number}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Year Built:</span>{' '}
                  {bldg.year_built || 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">Stories:</span>{' '}
                  {bldg.stories || 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">Roof Type:</span>{' '}
                  {bldg.roof_type || 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">Roof Age:</span>{' '}
                  {bldg.roof_age ? `${bldg.roof_age} yrs` : 'N/A'}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Sprinklers:</span>
                  {bldg.has_sprinklers === true ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : bldg.has_sprinklers === false ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    'N/A'
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Fire Alarm:</span>
                  {bldg.has_fire_alarm === true ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : bldg.has_fire_alarm === false ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    'N/A'
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// =============================================================================
// BUILDERS RISK TAB
// =============================================================================

function BuildersRiskTab({
  coverage,
}: {
  coverage: BuildersRiskCoverage | undefined;
}) {
  if (!coverage || !coverage.included) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Hammer className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No Builders Risk coverage included</p>
      </div>
    );
  }

  return (
    <>
      {/* Project Information */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Hammer className="h-4 w-4" />
          Project Information
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-orange-50">
            <div className="text-xs text-muted-foreground mb-1">Project Type</div>
            <div className="font-bold text-orange-700">
              {BUILDERS_RISK_PROJECT_TYPE_LABELS[coverage.project_type] || coverage.project_type}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Project Name</div>
            <div className="font-medium">{coverage.project_name}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Insured Interest</div>
            <Badge variant="outline" className="capitalize">
              {coverage.insured_interest.replace(/_/g, ' ')}
            </Badge>
          </Card>
          {coverage.separate_policy && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Policy Status</div>
              <Badge variant="secondary">Separate Policy</Badge>
            </Card>
          )}
        </div>
      </div>

      {/* Project Address */}
      {coverage.project_address && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Project Address
            </h4>
            <AddressDisplay address={coverage.project_address} />
          </div>
        </>
      )}

      <Separator />

      {/* Project Timeline */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Project Timeline
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {coverage.project_start_date && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Start Date</div>
              <div className="font-medium">{formatDate(coverage.project_start_date)}</div>
            </Card>
          )}
          <Card className="p-4 bg-amber-50">
            <div className="text-xs text-muted-foreground mb-1">Est. Completion</div>
            <div className="font-bold text-amber-700">{formatDate(coverage.estimated_completion_date)}</div>
          </Card>
          {coverage.max_construction_period_months && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Max Construction Period</div>
              <div className="font-medium">{coverage.max_construction_period_months} months</div>
            </Card>
          )}
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Policy Ends</div>
            <Badge variant="outline" className="capitalize">
              {coverage.policy_end_trigger.replace(/_/g, ' ')}
            </Badge>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Coverage Values */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Banknote className="h-4 w-4" />
          Coverage Values
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-blue-50">
            <div className="text-xs text-muted-foreground mb-1">Completed Value</div>
            <div className="text-2xl font-bold text-blue-700">{formatCurrency(coverage.completed_value)}</div>
          </Card>
          {coverage.hard_costs_limit && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Hard Costs</div>
              <div className="text-xl font-bold">{formatCurrency(coverage.hard_costs_limit)}</div>
            </Card>
          )}
          {coverage.soft_costs_limit && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Soft Costs</div>
              <div className="text-xl font-bold">{formatCurrency(coverage.soft_costs_limit)}</div>
            </Card>
          )}
        </div>

        {/* Additional Limits */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {coverage.materials_off_site_limit && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Materials Off-Site</div>
              <div className="font-bold">{formatCurrency(coverage.materials_off_site_limit)}</div>
            </Card>
          )}
          {coverage.materials_in_transit_limit && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Materials In Transit</div>
              <div className="font-bold">{formatCurrency(coverage.materials_in_transit_limit)}</div>
            </Card>
          )}
          {coverage.temporary_structures_limit && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Temporary Structures</div>
              <div className="font-bold">{formatCurrency(coverage.temporary_structures_limit)}</div>
            </Card>
          )}
        </div>
      </div>

      {/* Delay in Opening */}
      {coverage.delay_in_opening?.included && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Delay in Opening / Soft Costs
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Limit</div>
                <div className="text-xl font-bold">{formatCurrency(coverage.delay_in_opening.limit)}</div>
              </Card>
              {coverage.delay_in_opening.waiting_period_days && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Waiting Period</div>
                  <div className="font-bold">{coverage.delay_in_opening.waiting_period_days} days</div>
                </Card>
              )}
              {coverage.delay_in_opening.max_indemnity_period_days && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Max Indemnity Period</div>
                  <div className="font-bold">{coverage.delay_in_opening.max_indemnity_period_days} days</div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* Testing Coverage */}
      {coverage.testing_coverage?.included && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Testing Coverage</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Testing Period</div>
                <div className="font-bold">{coverage.testing_coverage.testing_period_days || 30} days</div>
              </Card>
              <Card className={`p-4 ${coverage.testing_coverage.hot_testing_included ? 'bg-green-50' : 'bg-amber-50'}`}>
                <div className="text-xs text-muted-foreground mb-1">Hot Testing</div>
                <div className="font-bold flex items-center gap-2">
                  {coverage.testing_coverage.hot_testing_included ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-700">Included</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-700">Not Included</span>
                    </>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Deductibles */}
      {(coverage.deductible || coverage.wind_hail_deductible || coverage.named_storm_deductible) && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Builders Risk Deductibles</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {coverage.deductible && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">AOP Deductible</div>
                  <div className="text-xl font-bold">
                    {coverage.deductible_type === 'percentage'
                      ? `${coverage.deductible}%`
                      : formatCurrency(coverage.deductible)}
                  </div>
                </Card>
              )}
              {coverage.wind_hail_deductible && (
                <Card className="p-4 bg-amber-50">
                  <div className="text-xs text-muted-foreground mb-1">Wind/Hail Deductible</div>
                  <div className="text-xl font-bold text-amber-700">
                    {coverage.wind_hail_deductible_type === 'percentage'
                      ? `${coverage.wind_hail_deductible}%`
                      : formatCurrency(coverage.wind_hail_deductible)}
                  </div>
                </Card>
              )}
              {coverage.named_storm_deductible && (
                <Card className="p-4 bg-red-50">
                  <div className="text-xs text-muted-foreground mb-1">Named Storm Deductible</div>
                  <div className="text-xl font-bold text-red-700">
                    {coverage.named_storm_deductible_type === 'percentage'
                      ? `${coverage.named_storm_deductible}%`
                      : formatCurrency(coverage.named_storm_deductible)}
                  </div>
                </Card>
              )}
              {coverage.flood_deductible && (
                <Card className="p-4 bg-blue-50">
                  <div className="text-xs text-muted-foreground mb-1">Flood Deductible</div>
                  <div className="text-xl font-bold text-blue-700">{formatCurrency(coverage.flood_deductible)}</div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* Key Parties */}
      {(coverage.general_contractor || coverage.owner_developer || coverage.lender) && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Key Parties
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {coverage.general_contractor && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">General Contractor</div>
                  <div className="font-medium">{coverage.general_contractor.name}</div>
                  {coverage.general_contractor.address && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {coverage.general_contractor.address.city}, {coverage.general_contractor.address.state}
                    </div>
                  )}
                </Card>
              )}
              {coverage.owner_developer && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Owner/Developer</div>
                  <div className="font-medium">{coverage.owner_developer.name}</div>
                </Card>
              )}
              {coverage.lender && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Lender</div>
                  <div className="font-medium">{coverage.lender.name}</div>
                  {coverage.lender.loan_number && (
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      Loan #: {coverage.lender.loan_number}
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* Exclusions & Forms */}
      {coverage.key_exclusions && coverage.key_exclusions.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Key Exclusions
            </h4>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                {coverage.key_exclusions.map((exclusion, i) => (
                  <li key={i}>{exclusion}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      {/* Premium */}
      {coverage.premium && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Builders Risk Premium
            </h4>
            <Card className="p-4 bg-primary/5 text-center max-w-xs mx-auto">
              <div className="text-sm text-muted-foreground mb-1">Premium</div>
              <div className="text-2xl font-bold text-primary">{formatCurrency(coverage.premium)}</div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// DEDUCTIBLES TAB
// =============================================================================

function DeductiblesTab({ deductibles }: { deductibles: PropertyDeductible[] }) {
  // Group by peril type
  const aopDeds = deductibles.filter((d) => d.peril === 'aop');
  const windDeds = deductibles.filter((d) => ['wind_hail', 'named_storm', 'hurricane'].includes(d.peril));
  const floodDeds = deductibles.filter((d) => d.peril === 'flood');
  const eqDeds = deductibles.filter((d) => d.peril === 'earthquake');
  const otherDeds = deductibles.filter(
    (d) => !['aop', 'wind_hail', 'named_storm', 'hurricane', 'flood', 'earthquake'].includes(d.peril)
  );

  const getPerilIcon = (peril: string) => {
    switch (peril) {
      case 'wind_hail':
      case 'named_storm':
      case 'hurricane':
        return <Wind className="h-4 w-4" />;
      case 'flood':
        return <Droplet className="h-4 w-4" />;
      case 'earthquake':
        return <Mountain className="h-4 w-4" />;
      case 'fire':
        return <Flame className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const DeductibleCard = ({ ded }: { ded: PropertyDeductible }) => (
    <Card className={`p-4 ${ded.peril === 'aop' ? 'bg-primary/5' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        {getPerilIcon(ded.peril)}
        <div className="text-xs text-muted-foreground">{getPerilLabel(ded.peril)}</div>
      </div>
      <div className="text-xl font-bold">{formatDeductible(ded)}</div>
      {ded.applies_to && ded.applies_to !== 'per_occurrence' && (
        <div className="text-xs text-muted-foreground mt-1 capitalize">
          {ded.applies_to.replace(/_/g, ' ')}
        </div>
      )}
      {ded.state_conditions && ded.state_conditions.length > 0 && (
        <div className="text-xs text-amber-600 mt-1">
          Applies in: {ded.state_conditions.join(', ')}
        </div>
      )}
    </Card>
  );

  return (
    <>
      {/* AOP Deductible - Primary */}
      {aopDeds.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" />
            All Other Perils (AOP)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aopDeds.map((ded, i) => (
              <DeductibleCard key={i} ded={ded} />
            ))}
          </div>
        </div>
      )}

      {/* Wind/Hail Deductibles */}
      {windDeds.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-blue-700">
              <Wind className="h-4 w-4" />
              Wind / Hail / Named Storm
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {windDeds.map((ded, i) => (
                <DeductibleCard key={i} ded={ded} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Flood Deductibles */}
      {floodDeds.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-cyan-700">
              <Droplet className="h-4 w-4" />
              Flood
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {floodDeds.map((ded, i) => (
                <DeductibleCard key={i} ded={ded} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Earthquake Deductibles */}
      {eqDeds.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2 text-amber-700">
              <Mountain className="h-4 w-4" />
              Earthquake
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {eqDeds.map((ded, i) => (
                <DeductibleCard key={i} ded={ded} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Other Deductibles */}
      {otherDeds.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Other Deductibles</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {otherDeds.map((ded, i) => (
                <DeductibleCard key={i} ded={ded} />
              ))}
            </div>
          </div>
        </>
      )}

      {deductibles.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No deductibles found</p>
        </div>
      )}

      {/* Deductibles Table */}
      {deductibles.length > 0 && (
        <>
          <Separator />
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peril</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Applies To</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deductibles.map((ded, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {getPerilLabel(ded.peril)}
                      </Badge>
                    </TableCell>
                    <TableCell>{ded.name}</TableCell>
                    <TableCell className="capitalize">
                      {ded.deductible_type.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatDeductible(ded)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {ded.applies_to?.replace(/_/g, ' ') || 'Per Occurrence'}
                    </TableCell>
                    <TableCell>
                      <ExtractionStatusBadge status={ded.extraction_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// BUSINESS INCOME & ORDINANCE OR LAW TAB
// =============================================================================

function BIAndOLTab({ details }: { details: PropertyPolicyDetails }) {
  const { business_income, ordinance_or_law } = details;

  return (
    <>
      {/* Business Income */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Business Income & Extra Expense
        </h4>
        {business_income ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 bg-blue-50">
              <div className="text-xs text-muted-foreground mb-1">Limit Type</div>
              <div className="text-lg font-bold">
                {business_income.limit_type === 'actual_loss_sustained' ? (
                  <Badge variant="default">Actual Loss Sustained</Badge>
                ) : (
                  <>
                    {formatCurrency(business_income.limit)}
                    <Badge variant="outline" className="ml-2">Specific Limit</Badge>
                  </>
                )}
              </div>
            </Card>
            {business_income.waiting_period_hours && (
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Waiting Period</div>
                <div className="text-xl font-bold">{business_income.waiting_period_hours} hours</div>
              </Card>
            )}
            {business_income.monthly_limit && (
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Monthly Limit</div>
                <div className="text-xl font-bold">{formatCurrency(business_income.monthly_limit)}</div>
              </Card>
            )}
            {business_income.coinsurance_days && (
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Coinsurance Days</div>
                <div className="text-xl font-bold">{business_income.coinsurance_days} days</div>
              </Card>
            )}
            {business_income.extended_period_days && (
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Extended Period</div>
                <div className="text-xl font-bold">{business_income.extended_period_days} days</div>
              </Card>
            )}
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Extra Expense</div>
              <div className="text-xl font-bold">
                {business_income.extra_expense_included ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
            </Card>
          </div>
        ) : (
          <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
            Business Income coverage not found or not included
          </div>
        )}
      </div>

      <Separator />

      {/* Ordinance or Law */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Hammer className="h-4 w-4" />
          Ordinance or Law Coverage
        </h4>
        {ordinance_or_law ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Coverage A</div>
              <div className="text-sm font-medium">Undamaged Portion</div>
              <div className="text-xl font-bold text-blue-700">
                {ordinance_or_law.coverage_a_limit
                  ? formatCurrency(ordinance_or_law.coverage_a_limit)
                  : ordinance_or_law.coverage_a_included
                    ? 'Included'
                    : 'N/A'}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Coverage B</div>
              <div className="text-sm font-medium">Demolition</div>
              <div className="text-xl font-bold text-blue-700">
                {ordinance_or_law.coverage_b_limit
                  ? formatCurrency(ordinance_or_law.coverage_b_limit)
                  : ordinance_or_law.coverage_b_included
                    ? 'Included'
                    : 'N/A'}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Coverage C</div>
              <div className="text-sm font-medium">Increased Cost</div>
              <div className="text-xl font-bold text-blue-700">
                {ordinance_or_law.coverage_c_limit
                  ? formatCurrency(ordinance_or_law.coverage_c_limit)
                  : ordinance_or_law.coverage_c_included
                    ? 'Included'
                    : 'N/A'}
              </div>
            </Card>
            {ordinance_or_law.combined_limit && (
              <Card className="p-4 bg-blue-50">
                <div className="text-xs text-muted-foreground mb-1">Combined Limit</div>
                <div className="text-sm font-medium">A + B + C</div>
                <div className="text-xl font-bold text-blue-700">
                  {formatCurrency(ordinance_or_law.combined_limit)}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
            Ordinance or Law coverage not found or not included
          </div>
        )}
      </div>
    </>
  );
}

// =============================================================================
// INTERESTS TAB
// =============================================================================

function InterestsTab({
  interests,
  endorsements,
}: {
  interests: PropertyInterest[];
  endorsements: PropertyEndorsement[];
}) {
  const mortgagees = interests.filter((i) => ['mortgagee', 'lenders_loss_payable'].includes(i.interest_type));
  const lossPayees = interests.filter((i) => i.interest_type === 'loss_payee');
  const others = interests.filter(
    (i) => !['mortgagee', 'lenders_loss_payable', 'loss_payee'].includes(i.interest_type)
  );

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Interests</div>
          <div className="text-2xl font-bold">{interests.length}</div>
        </Card>
        <Card className="p-4 bg-blue-50">
          <div className="text-xs text-muted-foreground">Mortgagees</div>
          <div className="text-2xl font-bold text-blue-700">{mortgagees.length}</div>
        </Card>
        <Card className="p-4 bg-green-50">
          <div className="text-xs text-muted-foreground">Loss Payees</div>
          <div className="text-2xl font-bold text-green-700">{lossPayees.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Endorsements</div>
          <div className="text-2xl font-bold">{endorsements.length}</div>
        </Card>
      </div>

      <Separator />

      {/* Interests Table */}
      {interests.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Loan #</TableHead>
                <TableHead>Location/Bldg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interests.map((interest, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge
                      variant={
                        interest.interest_type === 'mortgagee' ||
                        interest.interest_type === 'lenders_loss_payable'
                          ? 'default'
                          : 'outline'
                      }
                      className="text-xs"
                    >
                      <Landmark className="h-3 w-3 mr-1" />
                      {getInterestTypeLabel(interest.interest_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{interest.name}</TableCell>
                  <TableCell>
                    {interest.address ? (
                      <div className="text-xs">
                        <div>{interest.address.street}</div>
                        <div className="text-muted-foreground">
                          {interest.address.city}, {interest.address.state} {interest.address.zip}
                        </div>
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{interest.loan_number || 'N/A'}</TableCell>
                  <TableCell>
                    {interest.location_number ? (
                      <span className="font-mono">
                        {interest.location_number}
                        {interest.building_number ? `/${interest.building_number}` : ''}
                      </span>
                    ) : (
                      'All'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Landmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No mortgagees or loss payees found</p>
        </div>
      )}

      {/* Endorsements */}
      {endorsements.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Property Endorsements
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Form</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Edition</TableHead>
                    <TableHead className="text-center">Limitation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endorsements.map((end, i) => (
                    <TableRow key={i} className={end.is_limitation ? 'bg-amber-50' : ''}>
                      <TableCell className="font-mono">{end.form_number}</TableCell>
                      <TableCell>{end.title}</TableCell>
                      <TableCell>
                        {end.category ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {end.category.replace(/_/g, ' ')}
                          </Badge>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell>{end.edition_date || 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        {end.is_limitation ? (
                          <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />
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
      )}
    </>
  );
}

// =============================================================================
// PREMIUM TAB
// =============================================================================

function PremiumTab({ details }: { details: PropertyPolicyDetails }) {
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
              {premium.building_premium && (
                <TableRow>
                  <TableCell>Building Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.building_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.bpp_premium && (
                <TableRow>
                  <TableCell>Business Personal Property Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.bpp_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.business_income_premium && (
                <TableRow>
                  <TableCell>Business Income Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.business_income_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.ordinance_or_law_premium && (
                <TableRow>
                  <TableCell>Ordinance or Law Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.ordinance_or_law_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.equipment_breakdown_premium && (
                <TableRow>
                  <TableCell>Equipment Breakdown Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.equipment_breakdown_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.flood_premium && (
                <TableRow>
                  <TableCell>Flood Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.flood_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.earthquake_premium && (
                <TableRow>
                  <TableCell>Earthquake Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.earthquake_premium)}
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
              {premium.stamping_fee && (
                <TableRow>
                  <TableCell>Stamping Fee</TableCell>
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

export default PropertyPolicyDetailsView;
