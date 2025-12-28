/**
 * Property Policy - Deductibles Tab
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
import { Shield, Wind, Droplet, Mountain, Flame } from 'lucide-react';
import type { PropertyDeductible } from '@/types/commercial-property';
import { formatDeductible, getPerilLabel } from '@/hooks/usePropertyExtraction';
import { ExtractionStatusBadge } from './shared';

interface DeductiblesTabProps {
  deductibles: PropertyDeductible[];
}

function getPerilIcon(peril: string) {
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
}

function DeductibleCard({ ded }: { ded: PropertyDeductible }) {
  return (
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
}

export function DeductiblesTab({ deductibles }: DeductiblesTabProps) {
  // Group by peril type
  const aopDeds = deductibles.filter((d) => d.peril === 'aop');
  const windDeds = deductibles.filter((d) => ['wind_hail', 'named_storm', 'hurricane'].includes(d.peril));
  const floodDeds = deductibles.filter((d) => d.peril === 'flood');
  const eqDeds = deductibles.filter((d) => d.peril === 'earthquake');
  const otherDeds = deductibles.filter(
    (d) => !['aop', 'wind_hail', 'named_storm', 'hurricane', 'flood', 'earthquake'].includes(d.peril)
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
