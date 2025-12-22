/**
 * Commercial Crime / Fidelity Policy Details Component
 *
 * Displays extracted crime policy data with tabs for:
 * - Overview (policy type, form, aggregate)
 * - Coverages (insuring agreements A-G)
 * - ERISA Plans (if applicable)
 * - Conditions
 * - Endorsements
 * - Premium
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Shield, CheckCircle, XCircle, FileText } from 'lucide-react';
import {
  useCrimeDetails,
  useCrimeCoverages,
  useCrimeERISAPlans,
  useCrimeConditions,
  useCrimeEndorsements,
  getCoverageLabel,
  getIncludedCoverages,
} from '@/hooks/useCrimeExtraction';

interface Props {
  policyId: string;
}

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

const formatDate = (date: string | undefined | null): string => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString();
};

export function CrimePolicyDetails({ policyId }: Props) {
  const { data: details, isLoading } = useCrimeDetails(policyId);
  const { data: coverages = [] } = useCrimeCoverages(policyId);
  const { data: erisaPlans = [] } = useCrimeERISAPlans(policyId);
  const { data: conditions } = useCrimeConditions(policyId);
  const { data: endorsements = [] } = useCrimeEndorsements(policyId);

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading Crime details...</div>;
  }

  if (!details?.extracted_data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Commercial Crime Coverage
          </CardTitle>
          <CardDescription>No crime/fidelity details extracted yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const data = details.extracted_data;
  const highImpactEndorsements = endorsements.filter(e => e.high_impact);
  const includedCoverages = getIncludedCoverages(coverages);
  const hasERISA = erisaPlans.length > 0;

  // Check for low social engineering sublimit (common issue)
  const seCoverage = coverages.find(c => c.coverage_type === 'social_engineering');
  const edCoverage = coverages.find(c => c.coverage_type === 'employee_dishonesty');
  const lowSEWarning = seCoverage?.included && seCoverage.limit && edCoverage?.limit &&
    seCoverage.limit < edCoverage.limit * 0.1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Commercial Crime Coverage
            </CardTitle>
            <CardDescription>
              {data.policy_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} •
              {data.form_type === 'discovery_form' ? ' Discovery Form' : ' Loss Sustained Form'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {lowSEWarning && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low SE Sublimit
              </Badge>
            )}
            {highImpactEndorsements.length > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {highImpactEndorsements.length} High-Impact
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className={`grid w-full ${hasERISA ? 'grid-cols-6' : 'grid-cols-5'}`}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="coverages">Coverages ({includedCoverages.length})</TabsTrigger>
            {hasERISA && <TabsTrigger value="erisa">ERISA</TabsTrigger>}
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="endorsements">Endorse.</TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Policy Type</div>
                <div className="text-lg font-medium capitalize">
                  {data.policy_type?.replace(/_/g, ' ') || '-'}
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Form Type</div>
                <div className="text-lg font-medium capitalize">
                  {data.form_type?.replace(/_/g, ' ') || '-'}
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Policy Aggregate</div>
                <div className="text-2xl font-bold">{formatCurrency(data.policy_aggregate)}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Coverages Included</div>
                <div className="text-2xl font-bold">{includedCoverages.length}</div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Included Coverages</div>
              <div className="flex flex-wrap gap-2">
                {includedCoverages.map((cov, idx) => (
                  <Badge key={idx} variant="default">
                    {getCoverageLabel(cov.coverage_type)}
                  </Badge>
                ))}
                {includedCoverages.length === 0 && (
                  <span className="text-muted-foreground">No coverages found</span>
                )}
              </div>
            </div>
          </TabsContent>

          {/* COVERAGES TAB */}
          <TabsContent value="coverages">
            {coverages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No coverages found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Limit</TableHead>
                    <TableHead className="text-right">Deductible</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverages.map((cov, idx) => (
                    <TableRow key={idx} className={!cov.included ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{getCoverageLabel(cov.coverage_type)}</TableCell>
                      <TableCell>
                        {cov.included ? (
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                            <CheckCircle className="h-3 w-3" /> Included
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <XCircle className="h-3 w-3" /> Not Included
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(cov.limit)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cov.deductible)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cov.coverage_form && (
                            <Badge variant="outline" className="text-xs">{cov.coverage_form}</Badge>
                          )}
                          {cov.includes_leased_employees && (
                            <Badge variant="outline" className="text-xs">Leased Employees</Badge>
                          )}
                          {cov.direct_loss_only && (
                            <Badge variant="secondary" className="text-xs">Direct Loss Only</Badge>
                          )}
                          {cov.callback_verification_required && (
                            <Badge variant="secondary" className="text-xs">Callback Required</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ERISA TAB */}
          {hasERISA && (
            <TabsContent value="erisa">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan Name</TableHead>
                    <TableHead className="text-right">Plan Assets</TableHead>
                    <TableHead className="text-right">Required Bond</TableHead>
                    <TableHead className="text-right">Actual Bond</TableHead>
                    <TableHead>DOL Compliant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {erisaPlans.map((plan, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="font-medium">{plan.plan_name}</div>
                        {plan.plan_number && (
                          <div className="text-xs text-muted-foreground">#{plan.plan_number}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(plan.plan_assets)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(plan.required_bond_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(plan.actual_bond_amount)}</TableCell>
                      <TableCell>
                        {plan.meets_dol_requirements === true && (
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                            <CheckCircle className="h-3 w-3" /> Compliant
                          </Badge>
                        )}
                        {plan.meets_dol_requirements === false && (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <AlertTriangle className="h-3 w-3" /> Below DOL
                          </Badge>
                        )}
                        {plan.meets_dol_requirements === undefined && (
                          <Badge variant="secondary">Unknown</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-4">
                DOL requires ERISA bonds to be 10% of plan assets handled, minimum $1,000, maximum $500,000.
              </p>
            </TabsContent>
          )}

          {/* CONDITIONS TAB */}
          <TabsContent value="conditions">
            {conditions ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {conditions.discovery_period_days && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Discovery Period</div>
                    <div className="text-lg font-medium">{conditions.discovery_period_days} days after policy</div>
                  </div>
                )}
                {conditions.loss_sustained_retroactive_date && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Loss Sustained Retro Date</div>
                    <div className="text-lg font-medium">{formatDate(conditions.loss_sustained_retroactive_date)}</div>
                  </div>
                )}
                {conditions.territory && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Territory</div>
                    <div className="text-lg font-medium capitalize">{conditions.territory.replace(/_/g, ' ')}</div>
                  </div>
                )}
                {conditions.acquisition_automatic_days && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Acquisition Auto Coverage</div>
                    <div className="text-lg font-medium">{conditions.acquisition_automatic_days} days</div>
                  </div>
                )}
                {conditions.other_insurance && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Other Insurance</div>
                    <div className="text-lg font-medium capitalize">{conditions.other_insurance}</div>
                  </div>
                )}
                {conditions.joint_insured_provision !== undefined && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Joint Insured Provision</div>
                    <div className="text-lg font-medium">{conditions.joint_insured_provision ? 'Yes' : 'No'}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">Policy conditions not extracted.</div>
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
                      <div className="flex items-center gap-2">
                        {end.high_impact && <AlertTriangle className="h-4 w-4 text-destructive" />}
                        <span className="font-medium">{end.endorsement_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {end.applies_to_coverage && (
                          <Badge variant="outline" className="text-xs">{getCoverageLabel(end.applies_to_coverage)}</Badge>
                        )}
                        <Badge variant={end.endorsement_type === 'exclusion' ? 'destructive' : 'secondary'}>
                          {end.endorsement_type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                    {end.impact_description && (
                      <p className="text-sm text-muted-foreground mt-2">{end.impact_description}</p>
                    )}
                    {(end.new_limit || end.new_deductible) && (
                      <div className="flex gap-4 mt-2 text-sm">
                        {end.new_limit && <span>New Limit: {formatCurrency(end.new_limit)}</span>}
                        {end.new_deductible && <span>New Ded: {formatCurrency(end.new_deductible)}</span>}
                      </div>
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
              {data.premium?.minimum_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Minimum Premium</div>
                  <div className="text-xl font-medium">{formatCurrency(data.premium.minimum_premium)}</div>
                </div>
              )}
              {data.premium?.deposit_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Deposit Premium</div>
                  <div className="text-xl font-medium">{formatCurrency(data.premium.deposit_premium)}</div>
                </div>
              )}
            </div>

            {data.premium?.coverage_premiums && data.premium.coverage_premiums.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Premium by Coverage</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Coverage</TableHead>
                      <TableHead className="text-right">Premium</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.premium.coverage_premiums.map((cp, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{getCoverageLabel(cp.coverage)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cp.premium)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default CrimePolicyDetails;
