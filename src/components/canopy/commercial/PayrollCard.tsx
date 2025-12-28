// ============================================================================
// PAYROLL CARD
// ============================================================================
// Display component for workers compensation class code information including
// payroll, employee counts, and rates.
// ============================================================================

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  HardHat,
  Users,
  DollarSign,
  Percent,
  AlertTriangle,
  FileText,
  MapPin,
} from 'lucide-react';

interface PayrollClassCode {
  id: string;
  class_code: string;
  class_description?: string;
  state?: string;
  // Employee & Payroll
  employee_count?: number;
  annual_payroll?: number;
  // Rating
  rate_per_100?: number;
  estimated_premium?: number;
  // Experience Mod
  experience_mod?: number;
  // Governing Class
  is_governing_class?: boolean;
  // Officers
  includes_officers?: boolean;
  officer_payroll?: number;
  // If-Any Employees
  if_any_employee_count?: number;
  if_any_payroll?: number;
  // Raw data
  raw_data?: Record<string, unknown>;
}

interface PayrollCardProps {
  classCode: PayrollClassCode;
  showPremium?: boolean;
}

// Common high-hazard class codes
const HIGH_HAZARD_CODES = [
  '5213', // Concrete Construction
  '5221', // Concrete Work
  '5403', // Carpentry - Residential
  '5437', // Carpentry - Commercial
  '5474', // Painting - Exterior
  '5551', // Roofing
  '7219', // Trucking - Long Distance
  '7222', // Trucking - Local
  '7232', // Dump Trucking
  '8742', // Outside Sales
  '9014', // Building Operations
  '9015', // Building Janitorial
];

export function PayrollCard({ classCode, showPremium = true }: PayrollCardProps) {
  const isHighHazard = HIGH_HAZARD_CODES.includes(classCode.class_code);
  const isGoverning = classCode.is_governing_class;

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(2)}M`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const formatRate = (rate?: number) => {
    if (!rate) return 'N/A';
    return `$${rate.toFixed(2)}`;
  };

  const getExperienceModBadge = (mod?: number) => {
    if (!mod) return null;
    if (mod < 0.9) {
      return (
        <Badge className="bg-green-100 text-green-700">
          E-Mod: {mod.toFixed(2)} (Credit)
        </Badge>
      );
    }
    if (mod > 1.1) {
      return (
        <Badge className="bg-red-100 text-red-700">
          E-Mod: {mod.toFixed(2)} (Debit)
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100 text-gray-700">E-Mod: {mod.toFixed(2)} (Unity)</Badge>
    );
  };

  return (
    <Card className={isGoverning ? 'border-blue-300 bg-blue-50/30' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isHighHazard ? 'bg-amber-100' : 'bg-muted'}`}>
              <HardHat className={`w-5 h-5 ${isHighHazard ? 'text-amber-600' : ''}`} />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="font-mono">{classCode.class_code}</span>
                {isGoverning && (
                  <Badge className="bg-blue-100 text-blue-700">Governing</Badge>
                )}
                {isHighHazard && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    High Hazard
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{classCode.class_description || 'Class Description'}</CardDescription>
            </div>
          </div>
          {classCode.state && (
            <Badge variant="outline" className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {classCode.state}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Employees"
            value={classCode.employee_count?.toString() || '0'}
          />
          <StatCard
            icon={DollarSign}
            label="Annual Payroll"
            value={formatCurrency(classCode.annual_payroll)}
          />
          <StatCard
            icon={Percent}
            label="Rate / $100"
            value={formatRate(classCode.rate_per_100)}
          />
          {showPremium && (
            <StatCard
              icon={FileText}
              label="Est. Premium"
              value={formatCurrency(classCode.estimated_premium)}
              highlight
            />
          )}
        </div>

        {/* Experience Mod */}
        {classCode.experience_mod && (
          <div className="flex items-center gap-2">
            {getExperienceModBadge(classCode.experience_mod)}
          </div>
        )}

        {/* Officers Section */}
        {classCode.includes_officers && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Officers Included</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Officer Payroll</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(classCode.officer_payroll)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Officer payroll is typically subject to minimum/maximum limits per state
              </p>
            </div>
          </>
        )}

        {/* If-Any Employees */}
        {(classCode.if_any_employee_count || classCode.if_any_payroll) && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                If-Any Employees
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <p className="text-xs text-muted-foreground">If-Any Count</p>
                  <p className="text-sm font-medium">
                    {classCode.if_any_employee_count || 0}
                  </p>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg">
                  <p className="text-xs text-muted-foreground">If-Any Payroll</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(classCode.if_any_payroll)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                "If-Any" classification for employees who may occasionally perform this type of work
              </p>
            </div>
          </>
        )}

        {/* Premium Calculation Note */}
        {showPremium && classCode.rate_per_100 && classCode.annual_payroll && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            <p>
              Premium = (Payroll / 100) × Rate{' '}
              {classCode.experience_mod && `× E-Mod (${classCode.experience_mod})`}
            </p>
            <p className="font-mono mt-1">
              = ({formatCurrency(classCode.annual_payroll)} / 100) × {formatRate(classCode.rate_per_100)}
              {classCode.experience_mod && ` × ${classCode.experience_mod}`}
              = {formatCurrency(classCode.estimated_premium)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-blue-50' : 'bg-muted/50'}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${highlight ? 'text-blue-600' : 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-semibold mt-1 ${highlight ? 'text-blue-700' : ''}`}>
        {value}
      </p>
    </div>
  );
}

// Export a PayrollTable component for displaying multiple class codes
export function PayrollTable({ classCodes }: { classCodes: PayrollClassCode[] }) {
  if (classCodes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <HardHat className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No Payroll Data</p>
          <p className="text-sm mt-1">No workers compensation class codes found</p>
        </CardContent>
      </Card>
    );
  }

  const totalPayroll = classCodes.reduce((sum, cc) => sum + (cc.annual_payroll || 0), 0);
  const totalEmployees = classCodes.reduce((sum, cc) => sum + (cc.employee_count || 0), 0);
  const totalPremium = classCodes.reduce((sum, cc) => sum + (cc.estimated_premium || 0), 0);
  const governingClass = classCodes.find((cc) => cc.is_governing_class);

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HardHat className="w-5 h-5" />
            Workers Compensation Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Total Employees</p>
              <p className="text-lg font-semibold">{totalEmployees}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Total Payroll</p>
              <p className="text-lg font-semibold">
                {totalPayroll >= 1000000
                  ? `$${(totalPayroll / 1000000).toFixed(2)}M`
                  : `$${totalPayroll.toLocaleString()}`}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Class Codes</p>
              <p className="text-lg font-semibold">{classCodes.length}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-muted-foreground">Est. Total Premium</p>
              <p className="text-lg font-semibold text-blue-700">
                {totalPremium >= 1000000
                  ? `$${(totalPremium / 1000000).toFixed(2)}M`
                  : `$${totalPremium.toLocaleString()}`}
              </p>
            </div>
          </div>
          {governingClass && (
            <div className="mt-4 p-2 bg-blue-50 rounded-lg text-sm">
              <span className="font-medium">Governing Class:</span>{' '}
              <span className="font-mono">{governingClass.class_code}</span> -{' '}
              {governingClass.class_description}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Class Codes */}
      <div className="space-y-3">
        {classCodes.map((cc) => (
          <PayrollCard key={cc.id} classCode={cc} />
        ))}
      </div>
    </div>
  );
}

export default PayrollCard;
