/**
 * Property Policy - Premium Tab
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import { DollarSign } from 'lucide-react';
import type { PropertyPolicyDetails } from '@/types/commercial-property';
import { formatCurrency } from './shared';

interface PremiumTabProps {
  details: PropertyPolicyDetails;
}

export function PremiumTab({ details }: PremiumTabProps) {
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
