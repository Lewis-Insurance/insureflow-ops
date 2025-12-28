/**
 * Property Policy - Builders Risk Tab
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Hammer,
  MapPin,
  Calendar,
  Banknote,
  Clock,
  Users,
  AlertTriangle,
  DollarSign,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { BuildersRiskCoverage } from '@/types/commercial-property';
import { BUILDERS_RISK_PROJECT_TYPE_LABELS } from '@/types/commercial-property';
import { formatCurrency, formatDate, AddressDisplay } from './shared';

interface BuildersRiskTabProps {
  coverage: BuildersRiskCoverage | undefined;
}

export function BuildersRiskTab({ coverage }: BuildersRiskTabProps) {
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
