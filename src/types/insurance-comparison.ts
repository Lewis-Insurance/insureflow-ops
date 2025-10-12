export type DocumentType = 'quote' | 'policy' | 'declaration' | 'proposal';

export interface Coverage {
  type: string;
  limit: string;
  deductible?: string;
  premium?: number;
  notes?: string;
}

export interface Premium {
  type: string;
  amount: number;
  frequency: 'annual' | 'semi-annual' | 'quarterly' | 'monthly';
}

export interface Vehicle {
  year: number;
  make: string;
  model: string;
  vin?: string;
  use?: string;
}

export interface Property {
  address: string;
  type: string;
  value?: number;
  yearBuilt?: number;
}

export interface InsuranceDocument {
  id: string;
  type: DocumentType;
  carrier: string;
  policyNumber?: string;
  insuredName: string;
  effectiveDate: Date;
  expirationDate: Date;
  term: string;
  coverages: Coverage[];
  premiums: Premium[];
  vehicles?: Vehicle[];
  properties?: Property[];
  totalPremium?: number;
  rawData?: any;
}

export interface ComparisonResult {
  option1: InsuranceDocument;
  option2: InsuranceDocument;
  differences: {
    coverageDifferences: CoverageDifference[];
    premiumDifference: number;
    premiumPercentage: number;
    carrierComparison: string;
    termComparison: string;
    gaps?: Array<{
      coverageType: string;
      missingIn: 'option1' | 'option2';
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      recommendation: string;
    }>;
  };
  recommendation?: string;
  analysisDate: Date;
}

export interface CoverageDifference {
  coverageType: string;
  option1Value: string;
  option2Value: string;
  advantage: 'option1' | 'option2' | 'neutral';
  description: string;
}
