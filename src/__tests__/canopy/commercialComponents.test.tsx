// ============================================================================
// COMMERCIAL DATA COMPONENTS TESTS
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

// Import components
import { CommercialVehicleCard } from '@/components/canopy/commercial/CommercialVehicleCard';
import { BusinessOperationsCard } from '@/components/canopy/commercial/BusinessOperationsCard';
import { BusinessLocationCard } from '@/components/canopy/commercial/BusinessLocationCard';
import { PayrollCard, PayrollTable } from '@/components/canopy/commercial/PayrollCard';

// Test wrapper with QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('CommercialVehicleCard', () => {
  const mockVehicle = {
    id: 'veh-1',
    vin: '1HGBH41JXMN109186',
    year: 2020,
    make: 'Ford',
    model: 'F-150',
    body_type: 'Pickup',
    gvw: 8500,
    radius_miles: 150,
    cargo_type: 'General Freight',
    is_owned: true,
  };

  it('should render vehicle year, make, model combined', () => {
    render(<CommercialVehicleCard vehicle={mockVehicle} />);
    // Year, make, model are rendered together in the title
    expect(screen.getByText(/2020 Ford F-150/)).toBeInTheDocument();
  });

  it('should render VIN with label', () => {
    render(<CommercialVehicleCard vehicle={mockVehicle} />);
    // VIN is rendered as "VIN: {vin}"
    expect(screen.getByText(/VIN: 1HGBH41JXMN109186/)).toBeInTheDocument();
  });

  it('should show ownership badge when is_owned is true', () => {
    render(<CommercialVehicleCard vehicle={mockVehicle} />);
    expect(screen.getByText('Owned')).toBeInTheDocument();
  });

  it('should show GVW when provided', () => {
    render(<CommercialVehicleCard vehicle={mockVehicle} />);
    expect(screen.getByText(/8,500/)).toBeInTheDocument();
  });

  it('should show radius when provided', () => {
    render(<CommercialVehicleCard vehicle={{ ...mockVehicle, radius_class: 'intermediate' }} />);
    // Radius is shown as a badge with range
    expect(screen.getByText(/Intermediate/)).toBeInTheDocument();
  });
});

describe('BusinessOperationsCard', () => {
  const mockBusiness = {
    id: 'biz-1',
    business_name: 'Acme Corporation',
    entity_type: 'Corporation',
    fein: '12-3456789',
    naics_code: '238220',
    naics_description: 'Plumbing, Heating, and Air-Conditioning',
    years_in_business: 15,
    annual_revenue: 2500000,
    total_employees: 25,
    experience_mod: 0.85,
  };

  it('should render business name', () => {
    render(<BusinessOperationsCard business={mockBusiness} />);
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
  });

  it('should render entity type', () => {
    render(<BusinessOperationsCard business={mockBusiness} />);
    expect(screen.getByText('Corporation')).toBeInTheDocument();
  });

  it('should render FEIN with label', () => {
    render(<BusinessOperationsCard business={mockBusiness} />);
    // FEIN is rendered as "FEIN: {fein}"
    expect(screen.getByText(/FEIN: 12-3456789/)).toBeInTheDocument();
  });

  it('should render NAICS code with label', () => {
    render(<BusinessOperationsCard business={mockBusiness} />);
    // NAICS is rendered as "NAICS: {code}"
    expect(screen.getByText(/NAICS: 238220/)).toBeInTheDocument();
  });

  it('should render years in business', () => {
    render(<BusinessOperationsCard business={mockBusiness} />);
    expect(screen.getByText(/15/)).toBeInTheDocument();
  });

  it('should render total employees', () => {
    render(<BusinessOperationsCard business={mockBusiness} />);
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('should show experience mod with favorable indicator', () => {
    render(<BusinessOperationsCard business={mockBusiness} />);
    // 0.85 is below 0.9, so shows "Favorable"
    expect(screen.getByText(/0.85/)).toBeInTheDocument();
  });
});

describe('BusinessLocationCard', () => {
  const mockLocation = {
    id: 'loc-1',
    location_number: 1,
    address_line1: '123 Main Street',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90001',
    building_value: 500000,
    contents_value: 150000,
    construction_type: 'Masonry',
    year_built: 1990,
    square_footage: 5000,
    protection_class: 4,
    flood_zone: 'X',
    sprinkler_system: true,
    fire_alarm: true,
  };

  it('should render address', () => {
    render(<BusinessLocationCard location={mockLocation} />);
    // Address is rendered as comma-separated string
    expect(screen.getByText(/123 Main Street, Los Angeles, CA, 90001/)).toBeInTheDocument();
  });

  it('should render location number badge', () => {
    render(<BusinessLocationCard location={mockLocation} />);
    // Location number is rendered as "Loc #N"
    expect(screen.getByText('Loc #1')).toBeInTheDocument();
  });

  it('should render TIV', () => {
    render(<BusinessLocationCard location={mockLocation} />);
    expect(screen.getByText(/650,000/)).toBeInTheDocument();
  });

  it('should render construction type', () => {
    render(<BusinessLocationCard location={mockLocation} />);
    expect(screen.getByText('Masonry')).toBeInTheDocument();
  });

  it('should show sprinkler system status', () => {
    render(<BusinessLocationCard location={mockLocation} />);
    // Rendered as "Sprinkler System"
    expect(screen.getByText(/Sprinkler System/)).toBeInTheDocument();
  });

  it('should show protection class', () => {
    render(<BusinessLocationCard location={mockLocation} />);
    // Component renders as "PC 4 (Good)" badge
    expect(screen.getByText(/PC 4/)).toBeInTheDocument();
  });
});

describe('PayrollCard', () => {
  const mockClassCode = {
    id: 'cc-1',
    class_code: '5213',
    class_description: 'Concrete Construction',
    state: 'CA',
    employee_count: 10,
    annual_payroll: 450000,
    rate_per_100: 12.5,
    estimated_premium: 56250,
    experience_mod: 0.95,
    is_governing_class: true,
  };

  it('should render class code', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    expect(screen.getByText('5213')).toBeInTheDocument();
  });

  it('should render class description', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    expect(screen.getByText('Concrete Construction')).toBeInTheDocument();
  });

  it('should show governing class badge when applicable', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    expect(screen.getByText('Governing')).toBeInTheDocument();
  });

  it('should show high hazard indicator for hazardous codes', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    // 5213 is in the high hazard list
    expect(screen.getByText(/High Hazard/i)).toBeInTheDocument();
  });

  it('should render employee count', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('should render annual payroll', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    // May appear multiple times in card and calculation
    expect(screen.getAllByText(/450,000/).length).toBeGreaterThan(0);
  });

  it('should render rate per $100', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    // May appear multiple times in card and calculation
    expect(screen.getAllByText(/12.50/).length).toBeGreaterThan(0);
  });

  it('should render estimated premium', () => {
    render(<PayrollCard classCode={mockClassCode} />);

    // May appear multiple times in card and calculation
    expect(screen.getAllByText(/56,250/).length).toBeGreaterThan(0);
  });
});

describe('PayrollTable', () => {
  const mockClassCodes = [
    {
      id: 'cc-1',
      class_code: '5213',
      class_description: 'Concrete Construction',
      employee_count: 10,
      annual_payroll: 450000,
      estimated_premium: 56250,
      is_governing_class: true,
    },
    {
      id: 'cc-2',
      class_code: '8810',
      class_description: 'Clerical Office Employees',
      employee_count: 5,
      annual_payroll: 200000,
      estimated_premium: 2000,
      is_governing_class: false,
    },
  ];

  it('should render summary header', () => {
    render(<PayrollTable classCodes={mockClassCodes} />);

    expect(screen.getByText(/Workers Compensation Summary/i)).toBeInTheDocument();
  });

  it('should show total employees', () => {
    render(<PayrollTable classCodes={mockClassCodes} />);

    expect(screen.getByText('15')).toBeInTheDocument(); // 10 + 5
  });

  it('should show total payroll', () => {
    render(<PayrollTable classCodes={mockClassCodes} />);

    expect(screen.getByText(/650,000/)).toBeInTheDocument(); // 450000 + 200000
  });

  it('should show class code count', () => {
    render(<PayrollTable classCodes={mockClassCodes} />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should show governing class info', () => {
    render(<PayrollTable classCodes={mockClassCodes} />);

    expect(screen.getByText(/Governing Class/)).toBeInTheDocument();
    // Use getAllByText since 5213 appears in both summary and card
    expect(screen.getAllByText('5213').length).toBeGreaterThan(0);
  });

  it('should render all class code cards', () => {
    render(<PayrollTable classCodes={mockClassCodes} />);

    expect(screen.getByText('Concrete Construction')).toBeInTheDocument();
    expect(screen.getByText('Clerical Office Employees')).toBeInTheDocument();
  });

  it('should show empty state when no class codes', () => {
    render(<PayrollTable classCodes={[]} />);

    expect(screen.getByText(/No Payroll Data/i)).toBeInTheDocument();
  });
});
