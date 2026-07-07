/**
 * Commercial Auto / Business Auto Policy Details Component
 *
 * Comprehensive tabbed view for BAP policy data including:
 * - Overview (identity, dates, risk context)
 * - Coverage (symbols, liability, physical damage, UM/UIM)
 * - Vehicles (vehicle schedule with VINs)
 * - Drivers (driver schedule with MVR status)
 * - Interests (additional insureds, loss payees, lienholders)
 * - Premium (breakdown by coverage)
 *
 * Supports evidence highlighting via click-to-highlight.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Car,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Users,
  FileText,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  FileSearch,
  Truck,
  User,
  Banknote,
  ClipboardList,
} from 'lucide-react';
import type {
  BAPPolicyDetails,
  BAPVehicle,
  BAPDriver,
  BAPAdditionalInsured,
  BAPPolicyTab,
  CoverageSymbol,
  COVERAGE_SYMBOL_LABELS,
} from '@/types/commercial-auto';
import type { BAPEvidenceCatalog, EvidenceEntry, BoundingBox } from '@/hooks/useBAPExtraction';

interface BAPPolicyDetailsProps {
  policyId: string;
  bapDetails: BAPPolicyDetails | null;
  vehicles?: BAPVehicle[];
  drivers?: BAPDriver[];
  interests?: BAPAdditionalInsured[];
  onUpdate?: (details: Partial<BAPPolicyDetails>) => void;
  isEditing?: boolean;
  /** Evidence catalog for click-to-highlight */
  evidenceCatalog?: BAPEvidenceCatalog | null;
  /** Field-level evidence mapping */
  fieldEvidence?: Record<string, string[]>;
  /** Callback when evidence is clicked */
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}

// Coverage symbol labels
const SYMBOL_LABELS: Record<string, string> = {
  '1': 'Any Auto',
  '2': 'Owned Autos Only',
  '3': 'Owned Private Passenger',
  '4': 'Owned Other Than PPT',
  '5': 'Owned No-Fault',
  '6': 'Owned Compulsory UM',
  '7': 'Specifically Described',
  '8': 'Hired Autos Only',
  '9': 'Non-Owned Autos Only',
  '19': 'Mobile Equipment',
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
  evidenceCatalog?: BAPEvidenceCatalog | null;
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

export function BAPPolicyDetailsView({
  policyId,
  bapDetails,
  vehicles = [],
  drivers = [],
  interests = [],
  onUpdate,
  isEditing = false,
  evidenceCatalog,
  fieldEvidence,
  onEvidenceClick,
}: BAPPolicyDetailsProps) {
  const [activeTab, setActiveTab] = useState<BAPPolicyTab>('overview');

  if (!bapDetails || Object.keys(bapDetails).length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Car className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">No Commercial Auto details available.</p>
          <p className="text-sm text-muted-foreground">
            Upload a policy document to automatically extract BAP details.
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
              <Car className="h-5 w-5" />
              Commercial Auto Details
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Business Auto Policy information and coverage details
              {bapDetails.extraction_source && (
                <Badge variant="outline" className="text-xs">
                  {bapDetails.extraction_source === 'azure_di_claude' ? (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      AI Extracted
                    </>
                  ) : bapDetails.extraction_source === 'ai_extracted' ? (
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
          {vehicles.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
              <Truck className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-xs text-muted-foreground">Fleet Size</div>
                <div className="text-lg font-bold text-blue-700">{vehicles.length}</div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as BAPPolicyTab)}>
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="coverage">Coverage</TabsTrigger>
            <TabsTrigger value="vehicles">
              Vehicles {vehicles.length > 0 && `(${vehicles.length})`}
            </TabsTrigger>
            <TabsTrigger value="drivers">
              Drivers {drivers.length > 0 && `(${drivers.length})`}
            </TabsTrigger>
            <TabsTrigger value="interests">Interests</TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <OverviewTab details={bapDetails} />
          </TabsContent>

          {/* COVERAGE TAB */}
          <TabsContent value="coverage" className="space-y-6">
            <CoverageTab details={bapDetails} />
          </TabsContent>

          {/* VEHICLES TAB */}
          <TabsContent value="vehicles" className="space-y-6">
            <VehiclesTab
              vehicles={vehicles}
              evidenceCatalog={evidenceCatalog}
              onEvidenceClick={onEvidenceClick}
            />
          </TabsContent>

          {/* DRIVERS TAB */}
          <TabsContent value="drivers" className="space-y-6">
            <DriversTab
              drivers={drivers}
              evidenceCatalog={evidenceCatalog}
              onEvidenceClick={onEvidenceClick}
            />
          </TabsContent>

          {/* INTERESTS TAB */}
          <TabsContent value="interests" className="space-y-6">
            <InterestsTab
              interests={interests}
              vehicles={vehicles}
              evidenceCatalog={evidenceCatalog}
              onEvidenceClick={onEvidenceClick}
            />
          </TabsContent>

          {/* PREMIUM TAB */}
          <TabsContent value="premium" className="space-y-6">
            <PremiumTab details={bapDetails} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ details }: { details: BAPPolicyDetails }) {
  const { identity, dates, risk_context } = details;

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
            <Badge
              variant={
                identity.transaction_type === 'issued' || identity.transaction_type === 'bound'
                  ? 'default'
                  : 'secondary'
              }
            >
              {identity.transaction_type?.toUpperCase()}
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
        {identity.primary_garaging_address && (
          <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Primary Garaging
            </h4>
            <AddressDisplay address={identity.primary_garaging_address} />
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

      {/* Risk Context */}
      {risk_context && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Risk / Operations
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoField
                label="Radius of Operations"
                value={risk_context.radius_of_operations?.replace('_', ' ').toUpperCase() || 'N/A'}
              />
              <InfoField
                label="Fleet"
                value={risk_context.is_fleet ? `Yes (${risk_context.fleet_size || '?'} units)` : 'No'}
              />
              <InfoField
                label="Garaging States"
                value={
                  <div className="flex flex-wrap gap-1">
                    {risk_context.garaging_states?.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">
                        {s}
                      </Badge>
                    )) || 'N/A'}
                  </div>
                }
              />
            </div>
            {risk_context.business_description && (
              <div className="p-3 bg-muted rounded-lg">
                <Label className="text-xs text-muted-foreground">Business Description</Label>
                <p className="text-sm mt-1">{risk_context.business_description}</p>
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

function CoverageTab({ details }: { details: BAPPolicyDetails }) {
  const { coverage } = details;

  return (
    <>
      {/* Liability */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Liability Coverage
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coverage.liability.limit_type === 'csl' ? (
            <Card className="p-4 bg-blue-50">
              <div className="text-xs text-muted-foreground mb-1">Combined Single Limit</div>
              <div className="text-2xl font-bold text-blue-700">
                {formatCurrency(coverage.liability.csl_limit)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Symbols: {formatSymbols(coverage.liability.symbols)}
              </div>
            </Card>
          ) : (
            <>
              <Card className="p-4 bg-blue-50">
                <div className="text-xs text-muted-foreground mb-1">BI Per Person</div>
                <div className="text-xl font-bold text-blue-700">
                  {formatCurrency(coverage.liability.bodily_injury_per_person)}
                </div>
              </Card>
              <Card className="p-4 bg-blue-50">
                <div className="text-xs text-muted-foreground mb-1">BI Per Accident</div>
                <div className="text-xl font-bold text-blue-700">
                  {formatCurrency(coverage.liability.bodily_injury_per_accident)}
                </div>
              </Card>
              <Card className="p-4 bg-blue-50">
                <div className="text-xs text-muted-foreground mb-1">Property Damage</div>
                <div className="text-xl font-bold text-blue-700">
                  {formatCurrency(coverage.liability.property_damage)}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Physical Damage */}
      <div className="space-y-4">
        <h4 className="font-semibold flex items-center gap-2">
          <Car className="h-4 w-4" />
          Physical Damage
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Comprehensive Deductible</div>
            <div className="text-xl font-bold">
              {formatCurrency(coverage.physical_damage.comprehensive.deductible)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {coverage.physical_damage.comprehensive.valuation?.replace('_', ' ') || 'ACV'}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Collision Deductible</div>
            <div className="text-xl font-bold">
              {formatCurrency(coverage.physical_damage.collision.deductible)}
            </div>
          </Card>
          {coverage.physical_damage.special_equipment && (
            <Card className="p-4 bg-amber-50">
              <div className="text-xs text-muted-foreground mb-1">Special Equipment</div>
              <div className="text-xl font-bold text-amber-700">
                {formatCurrency(coverage.physical_damage.special_equipment.limit)}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* UM/UIM */}
      {coverage.um_uim && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              UM/UIM Coverage
            </h4>
            {coverage.um_uim.is_rejected ? (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-amber-800">
                  UM/UIM Rejected on {formatDate(coverage.um_uim.rejection_date)}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Uninsured Motorist</div>
                  <div className="text-xl font-bold">{formatCurrency(coverage.um_uim.um_limit)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Underinsured Motorist</div>
                  <div className="text-xl font-bold">
                    {formatCurrency(coverage.um_uim.uim_limit)}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </>
      )}

      {/* Hired & Non-Owned */}
      {coverage.hired_non_owned && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Car className="h-4 w-4" />
              Hired & Non-Owned Auto
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    Symbol 8
                  </Badge>
                  <span className="text-xs text-muted-foreground">Hired Auto</span>
                </div>
                <div className="text-xl font-bold">
                  {formatCurrency(coverage.hired_non_owned.hired_auto_liability.limit)}
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    Symbol 9
                  </Badge>
                  <span className="text-xs text-muted-foreground">Non-Owned Auto</span>
                </div>
                <div className="text-xl font-bold">
                  {formatCurrency(coverage.hired_non_owned.non_owned_auto_liability.limit)}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Additional Coverages */}
      {coverage.additional_coverages && coverage.additional_coverages.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Additional Coverages
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Symbols</TableHead>
                    <TableHead className="text-right">Limit</TableHead>
                    <TableHead className="text-right">Deductible</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.additional_coverages.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.coverage_name}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {c.symbols.map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(c.limit)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(c.deductible) || '-'}
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
// VEHICLES TAB
// =============================================================================

function VehiclesTab({
  vehicles,
  evidenceCatalog,
  onEvidenceClick,
}: {
  vehicles: BAPVehicle[];
  evidenceCatalog?: BAPEvidenceCatalog | null;
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}) {
  const totalValue = vehicles.reduce((sum, v) => sum + (v.stated_amount || v.cost_new || 0), 0);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Vehicles</div>
          <div className="text-2xl font-bold">{vehicles.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Value</div>
          <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">States</div>
          <div className="flex gap-1 flex-wrap">
            {[...new Set(vehicles.map((v) => v.garaging_state))].map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <Separator />

      {/* Vehicle Table */}
      {vehicles.length > 0 ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Unit</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead className="w-[180px]">VIN</TableHead>
                <TableHead>Garaging</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Comp Ded</TableHead>
                <TableHead className="text-right">Coll Ded</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v, i) => (
                <TableRow key={v.vin || i}>
                  <TableCell className="font-mono">{v.unit_number || i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {v.year} {v.make} {v.model}
                    </div>
                    {v.body_type && (
                      <div className="text-xs text-muted-foreground">{v.body_type}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{v.vin || 'N/A'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {v.garaging_state}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{v.garaging_zip}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(v.stated_amount || v.cost_new || v.actual_cash_value)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(v.comprehensive_deductible)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(v.collision_deductible)}
                  </TableCell>
                  <TableCell>
                    <ExtractionStatusBadge status={v.extraction_status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No vehicles found</p>
        </div>
      )}
    </>
  );
}

// =============================================================================
// DRIVERS TAB
// =============================================================================

function DriversTab({
  drivers,
  evidenceCatalog,
  onEvidenceClick,
}: {
  drivers: BAPDriver[];
  evidenceCatalog?: BAPEvidenceCatalog | null;
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}) {
  const ratedCount = drivers.filter((d) => d.driver_type === 'rated').length;
  const excludedCount = drivers.filter((d) => d.driver_type === 'excluded').length;

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Drivers</div>
          <div className="text-2xl font-bold">{drivers.length}</div>
        </Card>
        <Card className="p-4 bg-green-50">
          <div className="text-xs text-muted-foreground">Rated</div>
          <div className="text-2xl font-bold text-green-700">{ratedCount}</div>
        </Card>
        <Card className="p-4 bg-red-50">
          <div className="text-xs text-muted-foreground">Excluded</div>
          <div className="text-2xl font-bold text-red-700">{excludedCount}</div>
        </Card>
      </div>

      <Separator />

      {/* Driver Table */}
      {drivers.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>License State</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>MVR Status</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{formatDate(d.date_of_birth)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{d.license_state || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{d.relationship || 'N/A'}</TableCell>
                  <TableCell>
                    <MVRStatusBadge status={d.mvr_status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.driver_type === 'excluded' ? 'destructive' : 'default'}>
                      {d.driver_type?.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ExtractionStatusBadge status={d.extraction_status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No drivers found</p>
        </div>
      )}
    </>
  );
}

// =============================================================================
// INTERESTS TAB
// =============================================================================

function InterestsTab({
  interests,
  vehicles,
  evidenceCatalog,
  onEvidenceClick,
}: {
  interests: BAPAdditionalInsured[];
  vehicles: BAPVehicle[];
  evidenceCatalog?: BAPEvidenceCatalog | null;
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}) {
  const byType = interests.reduce(
    (acc, i) => {
      const type = i.coverage_type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(i);
      return acc;
    },
    {} as Record<string, BAPAdditionalInsured[]>
  );

  return (
    <>
      {/* Summary by Type */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Interests</div>
          <div className="text-2xl font-bold">{interests.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Additional Insureds</div>
          <div className="text-xl font-bold">{byType['additional_insured']?.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Loss Payees</div>
          <div className="text-xl font-bold">{byType['loss_payee']?.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Lienholders</div>
          <div className="text-xl font-bold">{byType['lienholder']?.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Lessors</div>
          <div className="text-xl font-bold">{byType['lessor']?.length || 0}</div>
        </Card>
      </div>

      <Separator />

      {/* Interests Table */}
      {interests.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Linked Vehicles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interests.map((interest, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{interest.name}</TableCell>
                  <TableCell>
                    <InterestTypeBadge type={interest.coverage_type} />
                  </TableCell>
                  <TableCell>
                    {interest.address ? (
                      <span className="text-sm">
                        {interest.address.city}, {interest.address.state}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {interest.vehicle_vins && interest.vehicle_vins.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {interest.vehicle_vins.map((vin) => {
                          const vehicle = vehicles.find((v) => v.vin === vin);
                          return (
                            <Badge key={vin} variant="outline" className="text-xs">
                              {vehicle
                                ? `${vehicle.year} ${vehicle.make}`
                                : vin.slice(-6)}
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">All vehicles</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No additional interests found</p>
        </div>
      )}
    </>
  );
}

// =============================================================================
// PREMIUM TAB
// =============================================================================

function PremiumTab({ details }: { details: BAPPolicyDetails }) {
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
              {premium.liability_premium && (
                <TableRow>
                  <TableCell>Liability Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.liability_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.physical_damage_premium && (
                <TableRow>
                  <TableCell>Physical Damage Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.physical_damage_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.comprehensive_premium && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground">Comprehensive</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.comprehensive_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.collision_premium && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground">Collision</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.collision_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.um_uim_premium && (
                <TableRow>
                  <TableCell>UM/UIM Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.um_uim_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.pip_premium && (
                <TableRow>
                  <TableCell>PIP Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.pip_premium)}
                  </TableCell>
                </TableRow>
              )}
              {premium.hired_non_owned_premium && (
                <TableRow>
                  <TableCell>Hired/Non-Owned Premium</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(premium.hired_non_owned_premium)}
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

      {/* Premium by Vehicle */}
      {premium.premium_by_vehicle && premium.premium_by_vehicle.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold">Premium by Vehicle</h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>VIN</TableHead>
                    <TableHead className="text-right">Premium</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {premium.premium_by_vehicle.map((v) => (
                    <TableRow key={v.vin}>
                      <TableCell className="font-mono text-xs">{v.vin}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(v.premium)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

function formatSymbols(symbols: CoverageSymbol[] | undefined): string {
  if (!symbols || symbols.length === 0) return 'None';
  return symbols.map((s) => `${s} (${SYMBOL_LABELS[s] || s})`).join(', ');
}

function ExtractionStatusBadge({
  status,
}: {
  status: string | undefined;
}) {
  if (!status) return null;

  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
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

function MVRStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="text-muted-foreground text-sm">N/A</span>;

  const variants: Record<string, { className: string; icon: React.ReactNode }> = {
    clean: {
      className: 'bg-green-100 text-green-700',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    minor: {
      className: 'bg-amber-100 text-amber-700',
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    major: {
      className: 'bg-red-100 text-red-700',
      icon: <XCircle className="h-3 w-3" />,
    },
  };

  const config = variants[status] || { className: 'bg-gray-100', icon: null };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
      {config.icon}
      {status.toUpperCase()}
    </span>
  );
}

function InterestTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    additional_insured: 'Add\'l Insured',
    loss_payee: 'Loss Payee',
    lienholder: 'Lienholder',
    lessor: 'Lessor',
    additional_interest: 'Add\'l Interest',
  };

  return (
    <Badge variant="outline" className="text-xs">
      {labels[type] || type}
    </Badge>
  );
}

export default BAPPolicyDetailsView;
