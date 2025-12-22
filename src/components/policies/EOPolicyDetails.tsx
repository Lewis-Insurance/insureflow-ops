/**
 * Professional Liability / Errors & Omissions (E&O) Policy Details Component
 *
 * Comprehensive tabbed view for E&O policy data including:
 * - Overview (identity, dates, professional type, limits)
 * - Claims-Made Details (retroactive date, ERP/Tail, continuity)
 * - Deductible/Retention
 * - Exclusions
 * - Endorsements
 * - Prior Acts/Claims History
 * - Premium
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Shield,
  Calendar,
  DollarSign,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Briefcase,
  Ban,
  FileCheck,
  Scale,
} from 'lucide-react';
import {
  useEOPolicyDetails,
  useEOExclusions,
  useEOEndorsements,
  useEOPriorActs,
  useUpdateEOPolicyDetails,
} from '@/hooks/useEOExtraction';
import type {
  EOPolicyDetails,
  EOExclusion,
  EOEndorsement,
  EOPriorAct,
  ProfessionalLiabilityType,
} from '@/types/professional-liability-eo';
import { PROFESSIONAL_LIABILITY_TYPE_LABELS } from '@/types/professional-liability-eo';

interface EOPolicyDetailsProps {
  policyId: string;
  onUpdate?: (details: Partial<EOPolicyDetails>) => void;
  isEditing?: boolean;
}

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

const getStatusBadge = (status: string | null | undefined) => {
  if (!status) return null;
  
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    AUTO_APPLIED: 'default',
    NEEDS_REVIEW: 'secondary',
    NEEDS_VERIFICATION: 'secondary',
    LOW_CONFIDENCE: 'destructive',
    NOT_FOUND: 'outline',
    CONFLICT: 'destructive',
    MANUAL: 'outline',
  };

  return (
    <Badge variant={variants[status] || 'outline'} className="text-xs">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
};

export function EOPolicyDetails({ policyId, onUpdate, isEditing = false }: EOPolicyDetailsProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');
  
  const { data: details, isLoading } = useEOPolicyDetails(policyId);
  const { data: exclusions = [] } = useEOExclusions(policyId);
  const { data: endorsements = [] } = useEOEndorsements(policyId);
  const { data: priorActs = [] } = useEOPriorActs(policyId);
  const updateMutation = useUpdateEOPolicyDetails(policyId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="text-muted-foreground">Loading E&O details...</div>
        </CardContent>
      </Card>
    );
  }

  if (!details) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">No E&O details available.</p>
          <p className="text-sm text-muted-foreground">
            Upload a policy document to automatically extract E&O details.
          </p>
        </CardContent>
      </Card>
    );
  }

  const highImpactExclusions = exclusions.filter((e) => e.is_high_impact);
  const limitationEndorsements = endorsements.filter((e) => e.is_limitation);
  const isClaimsMade = details.policy_form === 'claims_made';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Professional Liability / E&O Details
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              {details.professional_type
                ? PROFESSIONAL_LIABILITY_TYPE_LABELS[details.professional_type]
                : 'Professional Liability'}
              {isClaimsMade && ' • Claims-Made Form'}
              {details.full_prior_acts && ' • Full Prior Acts'}
              {!details.erp_available && (
                <Badge variant="destructive" className="ml-2">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  No ERP Available
                </Badge>
              )}
            </CardDescription>
          </div>
          {details.per_claim_limit && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
              <Scale className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-xs text-muted-foreground">Per Claim Limit</div>
                <div className="text-lg font-bold text-blue-700">
                  {formatCurrency(details.per_claim_limit)}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full mb-6 grid-cols-7">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="claims-made">
              Claims-Made {isClaimsMade && <CheckCircle className="h-3 w-3 ml-1" />}
            </TabsTrigger>
            <TabsTrigger value="deductible">Deductible</TabsTrigger>
            <TabsTrigger value="exclusions">
              Exclusions {highImpactExclusions.length > 0 && `(${highImpactExclusions.length})`}
            </TabsTrigger>
            <TabsTrigger value="endorsements">
              Endorse. {endorsements.length > 0 && `(${endorsements.length})`}
            </TabsTrigger>
            <TabsTrigger value="prior-acts">Prior Acts</TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Per Claim Limit</div>
                <div className="text-2xl font-bold">{formatCurrency(details.per_claim_limit)}</div>
                {details.extraction_status && (
                  <div className="mt-1">{getStatusBadge(details.extraction_status)}</div>
                )}
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Aggregate Limit</div>
                <div className="text-2xl font-bold">{formatCurrency(details.aggregate_limit)}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Defense Costs</div>
                <div className="text-lg font-medium">
                  {details.defense_costs === 'outside_limits' ? (
                    <Badge variant="default">Outside Limits</Badge>
                  ) : details.defense_costs === 'inside_limits' ? (
                    <Badge variant="secondary">Inside Limits</Badge>
                  ) : (
                    'N/A'
                  )}
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Policy Form</div>
                <div className="text-lg font-medium capitalize">
                  {details.policy_form?.replace(/_/g, ' ') || 'N/A'}
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Policy Identity</Label>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Carrier: </span>
                    {details.carrier_name || 'N/A'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Policy Number: </span>
                    {details.policy_number || 'N/A'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Named Insured: </span>
                    {details.named_insured}
                  </div>
                  {details.dba && (
                    <div>
                      <span className="text-muted-foreground">DBA: </span>
                      {details.dba}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Policy Dates</Label>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Effective: </span>
                    {formatDate(details.effective_date)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expiration: </span>
                    {formatDate(details.expiration_date)}
                  </div>
                  {details.issue_date && (
                    <div>
                      <span className="text-muted-foreground">Issue Date: </span>
                      {formatDate(details.issue_date)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {details.covered_services && details.covered_services.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Covered Services</Label>
                  <div className="flex flex-wrap gap-2">
                    {details.covered_services.map((service, idx) => (
                      <Badge key={idx} variant="outline">
                        {service}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* CLAIMS-MADE TAB */}
          <TabsContent value="claims-made" className="space-y-4">
            {!isClaimsMade ? (
              <div className="p-4 border rounded-lg text-center text-muted-foreground">
                This policy is not claims-made. E&O policies are almost always claims-made.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Label>Retroactive Date</Label>
                    </div>
                    {details.full_prior_acts ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Full Prior Acts (Unlimited)</span>
                      </div>
                    ) : details.retroactive_date ? (
                      <div className="text-lg font-medium">{formatDate(details.retroactive_date)}</div>
                    ) : (
                      <div className="text-muted-foreground">Not specified</div>
                    )}
                    {details.extraction_status && (
                      <div className="mt-2">{getStatusBadge(details.extraction_status)}</div>
                    )}
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Label>Continuity Date</Label>
                    </div>
                    <div className="text-lg font-medium">
                      {formatDate(details.continuity_date) || 'N/A'}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ERP / TAIL COVERAGE */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg">Extended Reporting Period (ERP / Tail)</Label>
                    {details.erp_available ? (
                      <Badge variant="default">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Available
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Available
                      </Badge>
                    )}
                  </div>

                  {details.erp_available && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {details.basic_erp_days && (
                        <div className="p-4 border rounded-lg">
                          <div className="text-sm text-muted-foreground">Basic ERP</div>
                          <div className="text-lg font-medium">{details.basic_erp_days} days</div>
                          <div className="text-xs text-muted-foreground mt-1">Automatic after expiration</div>
                        </div>
                      )}

                      {details.supplemental_erp_available && (
                        <div className="p-4 border rounded-lg">
                          <div className="text-sm text-muted-foreground">Supplemental ERP</div>
                          <div className="text-lg font-medium">Available</div>
                          {details.supplemental_erp_options &&
                            details.supplemental_erp_options.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {details.supplemental_erp_options.map((option: any, idx: number) => (
                                  <div key={idx} className="text-xs">
                                    {option.duration_months} months -{' '}
                                    {option.premium_percent ? `${option.premium_percent}%` : 'Premium TBD'}
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}

                      {details.erp_purchased && (
                        <div className="p-4 border rounded-lg bg-green-50">
                          <div className="text-sm text-muted-foreground">ERP Purchased</div>
                          <div className="text-lg font-medium">
                            {details.erp_purchased_duration_months} months
                          </div>
                          {details.erp_purchased_premium && (
                            <div className="text-sm mt-1">
                              Premium: {formatCurrency(details.erp_purchased_premium)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!details.erp_available && (
                    <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-medium">No ERP Available</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        This is a critical limitation. Client will have no coverage for claims made
                        after expiration if they don't renew.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* DEDUCTIBLE TAB */}
          <TabsContent value="deductible" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Deductible Type</div>
                <div className="text-lg font-medium capitalize">
                  {details.deductible_type?.replace(/_/g, ' ') || 'N/A'}
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Per Claim</div>
                <div className="text-2xl font-bold">
                  {formatCurrency(details.deductible_per_claim)}
                </div>
              </div>

              {details.deductible_aggregate && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-2">Aggregate</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(details.deductible_aggregate)}
                  </div>
                </div>
              )}

              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Applies to Defense Costs</div>
                <div className="text-lg font-medium">
                  {details.deductible_applies_to_defense ? (
                    <Badge variant="destructive">Yes</Badge>
                  ) : (
                    <Badge variant="default">No</Badge>
                  )}
                </div>
                {details.deductible_applies_to_defense && (
                  <p className="text-xs text-muted-foreground mt-2">
                    This reduces coverage value as defense costs count against limits.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* EXCLUSIONS TAB */}
          <TabsContent value="exclusions" className="space-y-4">
            {exclusions.length === 0 ? (
              <div className="p-4 border rounded-lg text-center text-muted-foreground">
                No exclusions recorded.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exclusions.map((exclusion) => (
                    <TableRow key={exclusion.id}>
                      <TableCell className="font-medium">{exclusion.exclusion_type}</TableCell>
                      <TableCell>{exclusion.description}</TableCell>
                      <TableCell>{exclusion.form_number || '-'}</TableCell>
                      <TableCell>
                        {exclusion.is_high_impact ? (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            High Impact
                          </Badge>
                        ) : (
                          <Badge variant="outline">Standard</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ENDORSEMENTS TAB */}
          <TabsContent value="endorsements" className="space-y-4">
            {endorsements.length === 0 ? (
              <div className="p-4 border rounded-lg text-center text-muted-foreground">
                No endorsements recorded.
              </div>
            ) : (
              <div className="space-y-3">
                {endorsements.map((endorsement) => (
                  <div
                    key={endorsement.id}
                    className={`p-4 border rounded-lg ${
                      endorsement.is_limitation ? 'border-destructive bg-destructive/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{endorsement.title}</span>
                          {endorsement.form_number && (
                            <Badge variant="outline">{endorsement.form_number}</Badge>
                          )}
                          {endorsement.is_limitation && (
                            <Badge variant="destructive">
                              <Ban className="h-3 w-3 mr-1" />
                              Limitation
                            </Badge>
                          )}
                          {endorsement.is_enhancement && (
                            <Badge variant="default">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Enhancement
                            </Badge>
                          )}
                        </div>
                        {endorsement.description && (
                          <p className="text-sm text-muted-foreground">{endorsement.description}</p>
                        )}
                        {endorsement.edition_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Edition: {formatDate(endorsement.edition_date)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* PRIOR ACTS TAB */}
          <TabsContent value="prior-acts" className="space-y-4">
            {priorActs.length === 0 ? (
              <div className="p-4 border rounded-lg text-center text-muted-foreground">
                No prior acts recorded.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Act Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Claim Made</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priorActs.map((act) => (
                    <TableRow key={act.id}>
                      <TableCell>{formatDate(act.act_date)}</TableCell>
                      <TableCell>{act.description || '-'}</TableCell>
                      <TableCell>{formatDate(act.claim_made_date)}</TableCell>
                      <TableCell>{formatCurrency(act.claim_amount)}</TableCell>
                      <TableCell>
                        {act.claim_status ? (
                          <Badge variant="outline">{act.claim_status}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* PREMIUM TAB */}
          <TabsContent value="premium" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Total Premium</div>
                <div className="text-2xl font-bold">{formatCurrency(details.total_premium)}</div>
              </div>
              {details.minimum_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Minimum Premium</div>
                  <div className="text-xl font-medium">{formatCurrency(details.minimum_premium)}</div>
                </div>
              )}
              {details.policy_fee && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Policy Fee</div>
                  <div className="text-xl font-medium">{formatCurrency(details.policy_fee)}</div>
                </div>
              )}
              {details.state_taxes && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">State Taxes</div>
                  <div className="text-xl font-medium">{formatCurrency(details.state_taxes)}</div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

