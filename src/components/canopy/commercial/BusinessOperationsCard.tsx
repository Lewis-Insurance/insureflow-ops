// ============================================================================
// BUSINESS OPERATIONS CARD
// ============================================================================
// Display component for commercial policy business operations data including
// entity type, NAICS codes, revenue, employee counts, etc.
// ============================================================================

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Users,
  DollarSign,
  Calendar,
  MapPin,
  FileText,
  Briefcase,
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface BusinessOperations {
  // Business Entity Info
  business_name?: string;
  dba_name?: string;
  entity_type?: string; // LLC, Corporation, Partnership, Sole Proprietor
  fein?: string;
  years_in_business?: number;
  years_in_industry?: number;
  date_established?: string;

  // Industry Classification
  naics_code?: string;
  naics_description?: string;
  sic_code?: string;
  business_description?: string;
  primary_operations?: string;

  // Financial Info
  annual_revenue?: number;
  annual_payroll?: number;
  gross_receipts?: number;

  // Employee Info
  full_time_employees?: number;
  part_time_employees?: number;
  total_employees?: number;
  owner_count?: number;

  // Location
  physical_address?: string;
  physical_city?: string;
  physical_state?: string;
  physical_zip?: string;
  mailing_address?: string;
  mailing_city?: string;
  mailing_state?: string;
  mailing_zip?: string;
  location_count?: number;

  // Operations Details
  territory_description?: string;
  hours_of_operation?: string;
  seasonal_operations?: boolean;
  seasonal_months?: string[];

  // Risk Factors
  prior_losses?: number;
  prior_claims_count?: number;
  experience_mod?: number;

  // Coverage Info
  policy_number?: string;
  effective_date?: string;
  expiration_date?: string;
}

interface BusinessOperationsCardProps {
  business: BusinessOperations;
  showFinancials?: boolean;
  showRiskFactors?: boolean;
}

const ENTITY_TYPES: Record<string, { label: string; color: string }> = {
  llc: { label: 'LLC', color: 'bg-blue-100 text-blue-700' },
  corporation: { label: 'Corporation', color: 'bg-purple-100 text-purple-700' },
  s_corp: { label: 'S-Corp', color: 'bg-purple-100 text-purple-700' },
  c_corp: { label: 'C-Corp', color: 'bg-purple-100 text-purple-700' },
  partnership: { label: 'Partnership', color: 'bg-green-100 text-green-700' },
  sole_proprietor: { label: 'Sole Proprietor', color: 'bg-amber-100 text-amber-700' },
  nonprofit: { label: 'Non-Profit', color: 'bg-cyan-100 text-cyan-700' },
};

export function BusinessOperationsCard({
  business,
  showFinancials = true,
  showRiskFactors = true,
}: BusinessOperationsCardProps) {
  const entityConfig = ENTITY_TYPES[business.entity_type?.toLowerCase().replace(/[-\s]/g, '_') || 'llc'];

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (date?: string) => {
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

  const getTotalEmployees = () => {
    if (business.total_employees) return business.total_employees;
    return (business.full_time_employees || 0) + (business.part_time_employees || 0);
  };

  const getExperienceModBadge = (mod?: number) => {
    if (!mod) return null;
    if (mod < 0.9) {
      return (
        <Badge className="bg-green-100 text-green-700">
          <TrendingUp className="w-3 h-3 mr-1" />
          {mod.toFixed(2)} (Favorable)
        </Badge>
      );
    }
    if (mod > 1.1) {
      return (
        <Badge className="bg-red-100 text-red-700">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {mod.toFixed(2)} (Unfavorable)
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100 text-gray-700">
        {mod.toFixed(2)} (Standard)
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {business.business_name || 'Business Operations'}
              </CardTitle>
              <CardDescription>
                {business.dba_name && `DBA: ${business.dba_name} • `}
                {business.naics_description || business.primary_operations || 'Commercial Operations'}
              </CardDescription>
            </div>
          </div>
          {entityConfig && (
            <Badge className={entityConfig.color}>{entityConfig.label}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Business Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataItem
            icon={Calendar}
            label="Years in Business"
            value={business.years_in_business?.toString() || 'N/A'}
          />
          <DataItem
            icon={Briefcase}
            label="Years in Industry"
            value={business.years_in_industry?.toString() || 'N/A'}
          />
          <DataItem
            icon={Users}
            label="Total Employees"
            value={getTotalEmployees().toString()}
            subValue={
              business.full_time_employees || business.part_time_employees
                ? `${business.full_time_employees || 0} FT / ${business.part_time_employees || 0} PT`
                : undefined
            }
          />
          <DataItem
            icon={Building2}
            label="Locations"
            value={business.location_count?.toString() || '1'}
          />
        </div>

        {/* Industry Classification */}
        {(business.naics_code || business.sic_code) && (
          <div className="flex flex-wrap gap-2">
            {business.naics_code && (
              <Badge variant="outline" className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                NAICS: {business.naics_code}
              </Badge>
            )}
            {business.sic_code && (
              <Badge variant="outline" className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                SIC: {business.sic_code}
              </Badge>
            )}
            {business.fein && (
              <Badge variant="outline" className="text-xs">
                FEIN: {business.fein}
              </Badge>
            )}
          </div>
        )}

        {/* Location */}
        {(business.physical_address || business.physical_city) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>
              {[
                business.physical_address,
                business.physical_city,
                business.physical_state,
                business.physical_zip,
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        )}

        {/* Territory & Operations */}
        {(business.territory_description || business.hours_of_operation) && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {business.territory_description && (
              <div>
                <p className="text-xs text-muted-foreground">Territory</p>
                <p className="font-medium">{business.territory_description}</p>
              </div>
            )}
            {business.hours_of_operation && (
              <div>
                <p className="text-xs text-muted-foreground">Hours</p>
                <p className="font-medium">{business.hours_of_operation}</p>
              </div>
            )}
          </div>
        )}

        {/* Seasonal Operations */}
        {business.seasonal_operations && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700">
              Seasonal Operations
              {business.seasonal_months?.length ? `: ${business.seasonal_months.join(', ')}` : ''}
            </span>
          </div>
        )}

        {showFinancials && (
          <>
            <Separator />

            {/* Financial Info */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Financial Overview
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Annual Revenue</p>
                  <p className="text-lg font-semibold">{formatCurrency(business.annual_revenue)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Annual Payroll</p>
                  <p className="text-lg font-semibold">{formatCurrency(business.annual_payroll)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Gross Receipts</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(business.gross_receipts)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {showRiskFactors && (business.experience_mod || business.prior_claims_count !== undefined) && (
          <>
            <Separator />

            {/* Risk Factors */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Risk Profile
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {business.experience_mod && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Experience Mod</p>
                    {getExperienceModBadge(business.experience_mod)}
                  </div>
                )}
                {business.prior_claims_count !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Prior Claims (3yr)</p>
                    <p className="text-sm font-medium flex items-center gap-1">
                      {business.prior_claims_count === 0 ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          None
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          {business.prior_claims_count} claims
                        </>
                      )}
                    </p>
                  </div>
                )}
                {business.prior_losses !== undefined && business.prior_losses > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Prior Losses</p>
                    <p className="text-sm font-medium text-red-600">
                      {formatCurrency(business.prior_losses)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Policy Info */}
        {(business.policy_number || business.effective_date) && (
          <>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                {business.policy_number && (
                  <span className="text-muted-foreground">
                    Policy: <span className="text-foreground font-medium">{business.policy_number}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {formatDate(business.effective_date)} - {formatDate(business.expiration_date)}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Helper component for data items
function DataItem({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
      {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
    </div>
  );
}

export default BusinessOperationsCard;
