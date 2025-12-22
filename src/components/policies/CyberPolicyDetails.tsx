/**
 * Cyber Liability Policy Details Component
 *
 * Displays extracted cyber policy data with tabs for:
 * - Overview (limits, deductibles, policy form)
 * - First-Party (breach response, extortion, BI, data restoration, social engineering)
 * - Third-Party (network security, privacy, media, tech E&O)
 * - Claims-Made (retro date, ERP, continuity)
 * - Incident Response Panel
 * - Endorsements
 * - Premium
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Clock, Phone, Users, FileText, DollarSign } from 'lucide-react';
import {
  useCyberDetails,
  useCyberFirstPartyCoverages,
  useCyberThirdPartyCoverages,
  useCyberClaimsMade,
  useCyberIncidentResponse,
  useCyberEndorsements,
} from '@/hooks/useCyberExtraction';

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

const CoverageRow = ({ label, included, limit, deductible, extra }: {
  label: string;
  included?: boolean;
  limit?: number;
  deductible?: number;
  extra?: React.ReactNode;
}) => (
  <div className={`p-3 border rounded-lg ${included ? '' : 'opacity-50'}`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Badge variant={included ? 'default' : 'secondary'}>{included ? 'Included' : 'Not Included'}</Badge>
        <span className="font-medium">{label}</span>
      </div>
      <div className="text-right">
        {limit !== undefined && <div className="font-medium">{formatCurrency(limit)}</div>}
        {deductible !== undefined && <div className="text-xs text-muted-foreground">Ded: {formatCurrency(deductible)}</div>}
      </div>
    </div>
    {extra && <div className="mt-2 text-sm text-muted-foreground">{extra}</div>}
  </div>
);

export function CyberPolicyDetails({ policyId }: Props) {
  const { data: details, isLoading } = useCyberDetails(policyId);
  const { data: firstParty } = useCyberFirstPartyCoverages(policyId);
  const { data: thirdParty } = useCyberThirdPartyCoverages(policyId);
  const { data: claimsMade } = useCyberClaimsMade(policyId);
  const { data: incidentResponse } = useCyberIncidentResponse(policyId);
  const { data: endorsements = [] } = useCyberEndorsements(policyId);

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading Cyber details...</div>;
  }

  if (!details?.extracted_data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Cyber Liability Coverage
          </CardTitle>
          <CardDescription>No cyber liability details extracted yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const data = details.extracted_data;
  const highImpactEndorsements = endorsements.filter(e => e.high_impact);
  const isClaimsMade = data.policy_form === 'claims_made';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Cyber Liability Coverage
            </CardTitle>
            <CardDescription>
              {isClaimsMade ? 'Claims-Made Form' : 'Occurrence Form'}
              {claimsMade?.retroactive_date && ` • Retro: ${formatDate(claimsMade.retroactive_date)}`}
              {claimsMade?.full_prior_acts && ' • Full Prior Acts'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
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
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="first-party">First-Party</TabsTrigger>
            <TabsTrigger value="third-party">Third-Party</TabsTrigger>
            <TabsTrigger value="claims-made">Claims-Made</TabsTrigger>
            <TabsTrigger value="ir-panel">IR Panel</TabsTrigger>
            <TabsTrigger value="endorsements">Endorse.</TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Policy Aggregate</div>
                <div className="text-2xl font-bold">{formatCurrency(data.limits?.policy_aggregate)}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Per Claim Limit</div>
                <div className="text-xl font-medium">{formatCurrency(data.limits?.per_claim_limit || data.limits?.per_occurrence_limit)}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Deductible</div>
                <div className="text-xl font-medium">{formatCurrency(data.deductibles?.per_claim_deductible)}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Defense Costs</div>
                <div className="text-xl font-medium">
                  {data.limits?.defense_costs_position === 'outside_limits' ? 'Outside Limits' : 'Inside Limits'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">BI Waiting Period</div>
                <div className="text-lg font-medium">{data.deductibles?.bi_waiting_period_hours || '-'} hours</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Carrier Type</div>
                <div className="text-lg font-medium capitalize">{data.carrier_type?.replace(/_/g, ' ') || '-'}</div>
              </div>
            </div>
          </TabsContent>

          {/* FIRST-PARTY TAB */}
          <TabsContent value="first-party" className="space-y-3">
            {firstParty ? (
              <>
                <CoverageRow
                  label="Data Breach Response"
                  included={firstParty.data_breach_response?.included}
                  limit={firstParty.data_breach_response?.limit}
                  extra={
                    firstParty.data_breach_response?.breach_coach?.included && (
                      <Badge variant="outline">Breach Coach Required</Badge>
                    )
                  }
                />
                <CoverageRow
                  label="Cyber Extortion / Ransomware"
                  included={firstParty.cyber_extortion?.included}
                  limit={firstParty.cyber_extortion?.limit}
                  extra={
                    firstParty.cyber_extortion?.ransom_payment?.included && (
                      <div className="flex gap-2">
                        <Badge variant="outline">Ransom Payment: {formatCurrency(firstParty.cyber_extortion.ransom_payment.limit)}</Badge>
                        {firstParty.cyber_extortion.ransom_payment.cryptocurrency_allowed && (
                          <Badge variant="outline">Crypto OK</Badge>
                        )}
                      </div>
                    )
                  }
                />
                <CoverageRow
                  label="Business Interruption"
                  included={firstParty.business_interruption?.included}
                  limit={firstParty.business_interruption?.limit}
                  extra={
                    <div className="flex gap-2 flex-wrap">
                      {firstParty.business_interruption?.waiting_period_hours && (
                        <Badge variant="outline">{firstParty.business_interruption.waiting_period_hours}hr wait</Badge>
                      )}
                      {firstParty.business_interruption?.system_failure?.included && (
                        <Badge variant="default">System Failure Included</Badge>
                      )}
                      {firstParty.business_interruption?.contingent_bi?.included && (
                        <Badge variant="outline">Contingent BI</Badge>
                      )}
                    </div>
                  }
                />
                <CoverageRow
                  label="Data Restoration"
                  included={firstParty.data_restoration?.included}
                  limit={firstParty.data_restoration?.limit}
                  extra={
                    firstParty.data_restoration?.bricking_coverage?.included && (
                      <Badge variant="outline">Bricking: {formatCurrency(firstParty.data_restoration.bricking_coverage.limit)}</Badge>
                    )
                  }
                />
                <CoverageRow
                  label="Social Engineering"
                  included={firstParty.social_engineering?.included}
                  limit={firstParty.social_engineering?.limit}
                  extra={
                    firstParty.social_engineering?.callback_verification_required && (
                      <Badge variant="secondary">Callback Verification Required</Badge>
                    )
                  }
                />
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">First-party coverage details not available.</div>
            )}
          </TabsContent>

          {/* THIRD-PARTY TAB */}
          <TabsContent value="third-party" className="space-y-3">
            {thirdParty ? (
              <>
                <CoverageRow
                  label="Network Security Liability"
                  included={thirdParty.network_security_liability?.included}
                  limit={thirdParty.network_security_liability?.limit}
                  extra={
                    <Badge variant="outline">
                      Defense: {thirdParty.network_security_liability?.defense_costs === 'outside_limits' ? 'Outside' : 'Inside'} Limits
                    </Badge>
                  }
                />
                <CoverageRow
                  label="Privacy Liability"
                  included={thirdParty.privacy_liability?.included}
                  limit={thirdParty.privacy_liability?.limit}
                  extra={
                    <div className="flex gap-2 flex-wrap">
                      {thirdParty.privacy_liability?.regulatory_defense?.included && (
                        <Badge variant="outline">Regulatory Defense: {formatCurrency(thirdParty.privacy_liability.regulatory_defense.limit)}</Badge>
                      )}
                      {thirdParty.privacy_liability?.regulatory_fines?.included && (
                        <Badge variant="default">Regulatory Fines</Badge>
                      )}
                      {thirdParty.privacy_liability?.pci_dss_fines?.included && (
                        <Badge variant="outline">PCI-DSS Fines</Badge>
                      )}
                    </div>
                  }
                />
                {thirdParty.media_liability && (
                  <CoverageRow
                    label="Media Liability"
                    included={thirdParty.media_liability.included}
                    limit={thirdParty.media_liability.limit}
                    extra={
                      thirdParty.media_liability.digital_only && (
                        <Badge variant="secondary">Digital Only</Badge>
                      )
                    }
                  />
                )}
                {thirdParty.technology_eo && (
                  <CoverageRow
                    label="Technology E&O"
                    included={thirdParty.technology_eo.included}
                    limit={thirdParty.technology_eo.limit}
                  />
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">Third-party coverage details not available.</div>
            )}
          </TabsContent>

          {/* CLAIMS-MADE TAB */}
          <TabsContent value="claims-made" className="space-y-4">
            {claimsMade ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Retroactive Date</div>
                  <div className="text-lg font-medium">
                    {claimsMade.full_prior_acts ? 'Full Prior Acts' : formatDate(claimsMade.retroactive_date)}
                  </div>
                </div>
                {claimsMade.continuity_date && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Continuity Date</div>
                    <div className="text-lg font-medium">{formatDate(claimsMade.continuity_date)}</div>
                  </div>
                )}
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">ERP Available</div>
                  <div className="text-lg font-medium flex items-center gap-2">
                    {claimsMade.erp_available ? (
                      <>
                        <Badge variant="default">Yes</Badge>
                        {claimsMade.basic_erp_days && <span className="text-sm text-muted-foreground">{claimsMade.basic_erp_days} days basic</span>}
                      </>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </div>
                </div>
                {claimsMade.supplemental_erp_options && claimsMade.supplemental_erp_options.length > 0 && (
                  <div className="col-span-full p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground mb-2">Supplemental ERP Options</div>
                    <div className="flex gap-2 flex-wrap">
                      {claimsMade.supplemental_erp_options.map((opt, idx) => (
                        <Badge key={idx} variant="outline">
                          {opt.duration_months}mo @ {opt.premium_percent}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {isClaimsMade ? 'Claims-made provisions not extracted.' : 'This is an occurrence-form policy.'}
              </div>
            )}
          </TabsContent>

          {/* INCIDENT RESPONSE PANEL TAB */}
          <TabsContent value="ir-panel" className="space-y-4">
            {incidentResponse ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Badge variant={incidentResponse.breach_coach_required ? 'default' : 'secondary'}>
                    {incidentResponse.breach_coach_required ? 'Breach Coach Required' : 'Breach Coach Optional'}
                  </Badge>
                  {incidentResponse.pre_approval_required && (
                    <Badge variant="outline">
                      Pre-Approval Required: {formatCurrency(incidentResponse.pre_approval_threshold)}
                    </Badge>
                  )}
                </div>

                {(incidentResponse.claims_hotline || incidentResponse.incident_hotline) && (
                  <div className="flex gap-4">
                    {incidentResponse.claims_hotline && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="text-sm">Claims: {incidentResponse.claims_hotline}</span>
                      </div>
                    )}
                    {incidentResponse.incident_hotline && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="text-sm">Incident: {incidentResponse.incident_hotline}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {incidentResponse.breach_coach_firms && incidentResponse.breach_coach_firms.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">Breach Coach Firms</div>
                      <div className="space-y-1">
                        {incidentResponse.breach_coach_firms.map((firm, idx) => (
                          <div key={idx} className="text-sm text-muted-foreground">{firm}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {incidentResponse.forensic_vendors && incidentResponse.forensic_vendors.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">Forensic Vendors</div>
                      <div className="space-y-1">
                        {incidentResponse.forensic_vendors.map((vendor, idx) => (
                          <div key={idx} className="text-sm text-muted-foreground">{vendor}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {incidentResponse.legal_firms && incidentResponse.legal_firms.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">Legal Firms</div>
                      <div className="space-y-1">
                        {incidentResponse.legal_firms.map((firm, idx) => (
                          <div key={idx} className="text-sm text-muted-foreground">{firm}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">Incident response panel not extracted.</div>
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
              {data.premium?.first_party_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">First-Party Premium</div>
                  <div className="text-xl font-medium">{formatCurrency(data.premium.first_party_premium)}</div>
                </div>
              )}
              {data.premium?.third_party_premium && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Third-Party Premium</div>
                  <div className="text-xl font-medium">{formatCurrency(data.premium.third_party_premium)}</div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default CyberPolicyDetails;
