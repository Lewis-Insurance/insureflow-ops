/**
 * Property Policy - Buildings Tab
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Building, MapPin, CheckCircle, XCircle } from 'lucide-react';
import type {
  PropertyLocation,
  PropertyBuilding,
  BuildingCoverageLimits,
} from '@/types/commercial-property';
import { formatCurrency } from './shared';

interface BuildingsTabProps {
  locations: PropertyLocation[];
  buildings: PropertyBuilding[];
  buildingCoverages: BuildingCoverageLimits[];
}

export function BuildingsTab({
  locations,
  buildings,
  buildingCoverages,
}: BuildingsTabProps) {
  // Calculate totals
  const totalBuildingValue = buildingCoverages.reduce((sum, c) => sum + (c.building_limit || 0), 0);
  const totalBPP = buildingCoverages.reduce((sum, c) => sum + (c.bpp_limit || 0), 0);

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
