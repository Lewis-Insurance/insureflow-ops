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
import { Building, Eye, Banknote, Hammer } from 'lucide-react';
import type {
  PropertyPolicyDetails,
  PropertyLocation,
  PropertyBuilding,
  BuildingCoverageLimits,
  PropertyDeductible,
  PropertyInterest,
  PropertyEndorsement,
  PropertyPolicyTab,
} from '@/types/commercial-property';
import { hasBuildersRisk } from '@/types/commercial-property';
import type { PropertyEvidenceCatalog, BoundingBox } from '@/hooks/usePropertyExtraction';

// Import tab components from property subdirectory
import {
  formatCurrency,
  OverviewTab,
  BuildingsTab,
  BuildersRiskTab,
  DeductiblesTab,
  BIAndOLTab,
  InterestsTab,
  PremiumTab,
} from './property';

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

  if (!propertyDetails || Object.keys(propertyDetails).length === 0) {
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

export default PropertyPolicyDetailsView;
