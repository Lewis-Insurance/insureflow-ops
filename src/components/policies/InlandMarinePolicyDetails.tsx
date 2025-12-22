/**
 * Inland Marine Policy Details Component
 *
 * Displays extracted IM policy data with tabs for:
 * - Overview (subtypes, valuation, territory)
 * - Scheduled Items (equipment schedule with serial numbers)
 * - Blanket Coverages
 * - Locations
 * - Deductibles
 * - Loss Payees / Additional Interests
 * - Endorsements
 * - Premium
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, MapPin, Shield, DollarSign, Users, FileText, Truck } from 'lucide-react';
import {
  useInlandMarineDetails,
  useIMScheduledItems,
  useIMBlanketCoverages,
  useIMLocations,
  useIMAdditionalInterests,
  useIMEndorsements,
  calculateTotalScheduledValue,
} from '@/hooks/useInlandMarineExtraction';
import {
  INLAND_MARINE_SUBTYPE_LABELS,
  VALUATION_BASIS_LABELS,
} from '@/types/commercial-inland-marine';

interface Props {
  policyId: string;
}

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

export function InlandMarinePolicyDetails({ policyId }: Props) {
  const { data: details, isLoading: detailsLoading } = useInlandMarineDetails(policyId);
  const { data: scheduledItems = [] } = useIMScheduledItems(policyId);
  const { data: blanketCoverages = [] } = useIMBlanketCoverages(policyId);
  const { data: locations = [] } = useIMLocations(policyId);
  const { data: additionalInterests = [] } = useIMAdditionalInterests(policyId);
  const { data: endorsements = [] } = useIMEndorsements(policyId);

  if (detailsLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading Inland Marine details...</div>;
  }

  if (!details?.extracted_data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Inland Marine Coverage
          </CardTitle>
          <CardDescription>No inland marine details extracted yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const data = details.extracted_data;
  const highImpactEndorsements = endorsements.filter(e => e.high_impact);
  const totalScheduledValue = calculateTotalScheduledValue(scheduledItems);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Inland Marine Coverage
            </CardTitle>
            <CardDescription>
              {data.subtypes?.map(st => INLAND_MARINE_SUBTYPE_LABELS[st] || st).join(', ')}
            </CardDescription>
          </div>
          {highImpactEndorsements.length > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {highImpactEndorsements.length} High-Impact
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="items">Items ({scheduledItems.length})</TabsTrigger>
            <TabsTrigger value="blanket">Blanket</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="deductibles">Deductibles</TabsTrigger>
            <TabsTrigger value="interests">Interests</TabsTrigger>
            <TabsTrigger value="endorsements">Endorse.</TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Primary Subtype</div>
                <div className="font-medium">
                  {data.primary_subtype ? INLAND_MARINE_SUBTYPE_LABELS[data.primary_subtype] : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Valuation Basis</div>
                <div className="font-medium">
                  {data.valuation_basis ? VALUATION_BASIS_LABELS[data.valuation_basis] : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Territory</div>
                <div className="font-medium">
                  {data.coverage_territory?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '-'}
                  {data.radius_miles && ` (${data.radius_miles} mi radius)`}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Scheduled Value</div>
                <div className="font-medium text-lg">{formatCurrency(totalScheduledValue || data.total_scheduled_value)}</div>
              </div>
            </div>

            {data.subtypes && data.subtypes.length > 1 && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">All Coverage Types</div>
                <div className="flex flex-wrap gap-2">
                  {data.subtypes.map((st, idx) => (
                    <Badge key={idx} variant="secondary">
                      {INLAND_MARINE_SUBTYPE_LABELS[st] || st}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* SCHEDULED ITEMS TAB */}
          <TabsContent value="items">
            {scheduledItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No scheduled items found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Serial/VIN</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Deductible</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="font-medium">{item.description}</div>
                        {item.manufacturer && (
                          <div className="text-xs text-muted-foreground">
                            {item.manufacturer} {item.model}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {item.serial_number || item.vin || '-'}
                      </TableCell>
                      <TableCell>{item.year || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.scheduled_value)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.deductible)}</TableCell>
                      <TableCell>{item.primary_location || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* BLANKET COVERAGES TAB */}
          <TabsContent value="blanket">
            {blanketCoverages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No blanket coverages found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Valuation</TableHead>
                    <TableHead className="text-right">Blanket Limit</TableHead>
                    <TableHead className="text-right">Per Item Max</TableHead>
                    <TableHead className="text-right">Deductible</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blanketCoverages.map((cov, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{cov.category}</TableCell>
                      <TableCell>{VALUATION_BASIS_LABELS[cov.valuation_basis] || cov.valuation_basis}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cov.blanket_limit)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cov.per_item_limit)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cov.deductible)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* LOCATIONS TAB */}
          <TabsContent value="locations">
            {locations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No covered locations found.</div>
            ) : (
              <div className="space-y-4">
                {locations.map((loc, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{loc.name}</span>
                            <Badge variant="outline">{loc.location_type}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {loc.address?.street}, {loc.address?.city}, {loc.address?.state} {loc.address?.zip}
                          </div>
                        </div>
                        <div className="text-right">
                          {loc.location_limit && (
                            <div className="text-sm">Limit: {formatCurrency(loc.location_limit)}</div>
                          )}
                          {loc.deductible && (
                            <div className="text-sm text-muted-foreground">Ded: {formatCurrency(loc.deductible)}</div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* DEDUCTIBLES TAB */}
          <TabsContent value="deductibles">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Standard Deductible</div>
                <div className="text-xl font-medium">{formatCurrency(data.deductibles?.standard_deductible)}</div>
              </div>
              {data.deductibles?.theft_deductible && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Theft Deductible</div>
                  <div className="text-xl font-medium">{formatCurrency(data.deductibles.theft_deductible)}</div>
                </div>
              )}
              {data.deductibles?.catastrophe_deductible && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Catastrophe Deductible</div>
                  <div className="text-xl font-medium">{formatCurrency(data.deductibles.catastrophe_deductible)}</div>
                </div>
              )}
              {data.deductibles?.earthquake_deductible && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Earthquake Deductible</div>
                  <div className="text-xl font-medium">{formatCurrency(data.deductibles.earthquake_deductible)}</div>
                </div>
              )}
              {data.deductibles?.flood_deductible && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Flood Deductible</div>
                  <div className="text-xl font-medium">{formatCurrency(data.deductibles.flood_deductible)}</div>
                </div>
              )}
              {data.deductibles?.named_storm_deductible && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Named Storm Deductible</div>
                  <div className="text-xl font-medium">{formatCurrency(data.deductibles.named_storm_deductible)}</div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ADDITIONAL INTERESTS TAB */}
          <TabsContent value="interests">
            {additionalInterests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No additional interests found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {additionalInterests.map((int, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="font-medium">{int.name}</div>
                        {int.address && (
                          <div className="text-xs text-muted-foreground">
                            {int.address.city}, {int.address.state}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {int.interest_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Badge>
                      </TableCell>
                      <TableCell>{int.applies_to === 'all' ? 'All Items' : 'Specific Items'}</TableCell>
                      <TableCell>{int.loan_number || int.lease_number || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ENDORSEMENTS TAB */}
          <TabsContent value="endorsements">
            {endorsements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No endorsements found.</div>
            ) : (
              <div className="space-y-2">
                {endorsements.map((end, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border rounded-lg ${end.high_impact ? 'border-destructive bg-destructive/5' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          {end.high_impact && <AlertTriangle className="h-4 w-4 text-destructive" />}
                          <span className="font-medium">{end.endorsement_name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {end.endorsement_number} {end.form_number && `• ${end.form_number}`}
                        </div>
                      </div>
                      <Badge variant={end.endorsement_type === 'exclusion' ? 'destructive' : 'secondary'}>
                        {end.endorsement_type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    {end.impact_description && (
                      <p className="text-sm text-muted-foreground mt-2">{end.impact_description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* PREMIUM TAB */}
          <TabsContent value="premium">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Total Annual Premium</div>
                <div className="text-2xl font-bold">{formatCurrency(data.premium?.total_annual_premium)}</div>
              </div>
              {data.premium?.scheduled_equipment_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Scheduled Equipment</div>
                  <div className="text-xl font-medium">{formatCurrency(data.premium.scheduled_equipment_premium)}</div>
                </div>
              )}
              {data.premium?.blanket_coverage_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Blanket Coverage</div>
                  <div className="text-xl font-medium">{formatCurrency(data.premium.blanket_coverage_premium)}</div>
                </div>
              )}
              {data.premium?.minimum_earned_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Minimum Earned</div>
                  <div className="text-xl font-medium">{formatCurrency(data.premium.minimum_earned_premium)}</div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default InlandMarinePolicyDetails;
