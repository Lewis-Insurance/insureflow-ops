/**
 * Property Policy - Business Income & Ordinance or Law Tab
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Clock, Hammer, CheckCircle, XCircle } from 'lucide-react';
import type { PropertyPolicyDetails } from '@/types/commercial-property';
import { formatCurrency } from './shared';

interface BIAndOLTabProps {
  details: PropertyPolicyDetails;
}

export function BIAndOLTab({ details }: BIAndOLTabProps) {
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
