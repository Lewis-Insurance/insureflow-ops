// ============================================
// NHTSA VIN Decoder
// FREE vehicle data enrichment via NHTSA vPIC API
// https://vpic.nhtsa.dot.gov/api/
// ============================================

import type { VinDecoderResult } from '@/types/intake';

// ============================================
// TYPES
// ============================================

interface NHTSAResponse {
  Count: number;
  Message: string;
  SearchCriteria: string;
  Results: NHTSAResult[];
}

interface NHTSAResult {
  Value: string | null;
  ValueId: string | null;
  Variable: string;
  VariableId: number;
}

// ============================================
// CONSTANTS
// ============================================

const NHTSA_BASE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';

// Fields we want to extract from NHTSA response
const FIELD_MAPPINGS: Record<string, keyof VinDecoderResult> = {
  'Make': 'make',
  'Model': 'model',
  'Model Year': 'year',
  'Vehicle Type': 'vehicleType',
  'Body Class': 'bodyClass',
  'Drive Type': 'driveType',
  'Engine Number of Cylinders': 'engineCylinders',
  'Displacement (L)': 'engineSize',
  'Fuel Type - Primary': 'fuelType',
  'GVWR': 'gvwr',
  'Manufacturer Name': 'manufacturer',
  'Plant Country': 'plantCountry',
  'Error Code': 'errorCode',
  'Error Text': 'errorText',
};

// ============================================
// VIN VALIDATION
// ============================================

/**
 * Validate VIN format (17 characters, no I, O, or Q)
 */
export function validateVin(vin: string): { valid: boolean; error?: string } {
  if (!vin) {
    return { valid: false, error: 'VIN is required' };
  }

  const cleanVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (cleanVin.length !== 17) {
    return { valid: false, error: 'VIN must be exactly 17 characters' };
  }

  if (/[IOQ]/.test(cleanVin)) {
    return { valid: false, error: 'VIN cannot contain I, O, or Q' };
  }

  // Check for valid characters (alphanumeric only)
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
    return { valid: false, error: 'VIN contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Calculate VIN check digit (position 9)
 * Returns true if the check digit is valid
 */
export function validateVinCheckDigit(vin: string): boolean {
  const transliteration: Record<string, number> = {
    'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
    'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9,
    'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
  };

  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const cleanVin = vin.toUpperCase();

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const char = cleanVin[i];
    const value = /\d/.test(char) ? parseInt(char) : transliteration[char];
    if (value === undefined) return false;
    sum += value * weights[i];
  }

  const remainder = sum % 11;
  const checkDigit = remainder === 10 ? 'X' : String(remainder);

  return cleanVin[8] === checkDigit;
}

// ============================================
// NHTSA API
// ============================================

/**
 * Decode VIN using NHTSA vPIC API (FREE, no API key required)
 */
export async function decodeVin(vin: string): Promise<VinDecoderResult> {
  const validation = validateVin(vin);
  if (!validation.valid) {
    return {
      vin,
      make: '',
      model: '',
      year: 0,
      vehicleType: '',
      errorCode: 'INVALID_VIN',
      errorText: validation.error,
    };
  }

  const cleanVin = vin.toUpperCase().trim();

  try {
    const response = await fetch(
      `${NHTSA_BASE_URL}/DecodeVinValues/${cleanVin}?format=json`
    );

    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status}`);
    }

    const data: NHTSAResponse = await response.json();

    if (!data.Results || data.Results.length === 0) {
      return {
        vin: cleanVin,
        make: '',
        model: '',
        year: 0,
        vehicleType: '',
        errorCode: 'NO_RESULTS',
        errorText: 'No results returned from NHTSA',
      };
    }

    // NHTSA DecodeVinValues returns a single object with all fields
    // Results is actually an array with one object containing all the values
    const result = data.Results[0] as Record<string, string>;

    const decoded: VinDecoderResult = {
      vin: cleanVin,
      make: result.Make || '',
      model: result.Model || '',
      year: parseInt(result.ModelYear) || 0,
      vehicleType: result.VehicleType || '',
      bodyClass: result.BodyClass || undefined,
      driveType: result.DriveType || undefined,
      engineCylinders: result.EngineCylinders ? parseInt(result.EngineCylinders) : undefined,
      engineSize: result.DisplacementL ? `${result.DisplacementL}L` : undefined,
      fuelType: result.FuelTypePrimary || undefined,
      gvwr: result.GVWR || undefined,
      manufacturer: result.Manufacturer || undefined,
      plantCountry: result.PlantCountry || undefined,
      errorCode: result.ErrorCode !== '0' ? result.ErrorCode : undefined,
      errorText: result.ErrorText && result.ErrorText !== '0' ? result.ErrorText : undefined,
    };

    return decoded;
  } catch (error) {
    console.error('VIN decode error:', error);
    return {
      vin: cleanVin,
      make: '',
      model: '',
      year: 0,
      vehicleType: '',
      errorCode: 'API_ERROR',
      errorText: error instanceof Error ? error.message : 'Failed to decode VIN',
    };
  }
}

/**
 * Decode multiple VINs in batch
 */
export async function decodeVinBatch(vins: string[]): Promise<VinDecoderResult[]> {
  // NHTSA has a batch decode endpoint, but it requires POST with specific format
  // For simplicity, we'll decode sequentially with a small delay to avoid rate limiting
  const results: VinDecoderResult[] = [];

  for (const vin of vins) {
    const result = await decodeVin(vin);
    results.push(result);

    // Small delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Get vehicle makes for a given year
 */
export async function getVehicleMakes(year: number): Promise<string[]> {
  try {
    const response = await fetch(
      `${NHTSA_BASE_URL}/GetMakesForVehicleType/car?format=json`
    );

    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status}`);
    }

    const data: NHTSAResponse = await response.json();

    return data.Results
      .map((r: any) => r.MakeName)
      .filter(Boolean)
      .sort();
  } catch (error) {
    console.error('Failed to fetch vehicle makes:', error);
    return [];
  }
}

/**
 * Get models for a given make and year
 */
export async function getVehicleModels(make: string, year: number): Promise<string[]> {
  try {
    const response = await fetch(
      `${NHTSA_BASE_URL}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
    );

    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status}`);
    }

    const data: NHTSAResponse = await response.json();

    return data.Results
      .map((r: any) => r.Model_Name)
      .filter(Boolean)
      .sort();
  } catch (error) {
    console.error('Failed to fetch vehicle models:', error);
    return [];
  }
}

// ============================================
// VEHICLE TYPE HELPERS
// ============================================

const COMMERCIAL_VEHICLE_TYPES = [
  'TRUCK',
  'BUS',
  'TRAILER',
  'MULTIPURPOSE PASSENGER VEHICLE (MPV)',
  'LOW SPEED VEHICLE (LSV)',
  'INCOMPLETE VEHICLE',
];

/**
 * Determine if vehicle is commercial based on NHTSA classification
 */
export function isCommercialVehicle(result: VinDecoderResult): boolean {
  if (!result.vehicleType) return false;

  const upperType = result.vehicleType.toUpperCase();

  // Check vehicle type
  if (COMMERCIAL_VEHICLE_TYPES.some(t => upperType.includes(t))) {
    return true;
  }

  // Check GVWR (over 10,000 lbs is typically commercial)
  if (result.gvwr) {
    const gvwrLbs = parseGvwr(result.gvwr);
    if (gvwrLbs && gvwrLbs > 10000) {
      return true;
    }
  }

  return false;
}

/**
 * Parse GVWR string to pounds
 */
function parseGvwr(gvwr: string): number | null {
  // GVWR can be in format like "Class 1A: 3,000 lb or less" or "6,001 - 7,000 lb"
  const match = gvwr.match(/(\d[\d,]*)\s*(?:lb|lbs)/i);
  if (match) {
    return parseInt(match[1].replace(/,/g, ''));
  }
  return null;
}

/**
 * Get vehicle classification for insurance
 */
export function getVehicleClassification(result: VinDecoderResult): {
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  notes: string[];
} {
  const notes: string[] = [];
  let category = 'Personal Auto';
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  if (isCommercialVehicle(result)) {
    category = 'Commercial Auto';
    riskLevel = 'medium';
    notes.push('Commercial vehicle classification');
  }

  if (result.bodyClass?.toUpperCase().includes('MOTORCYCLE')) {
    category = 'Motorcycle';
    riskLevel = 'high';
    notes.push('Motorcycle - higher risk category');
  }

  if (result.vehicleType?.toUpperCase().includes('TRAILER')) {
    category = 'Trailer';
    riskLevel = 'low';
  }

  // High performance vehicles
  if (result.engineCylinders && result.engineCylinders >= 8) {
    riskLevel = 'medium';
    notes.push('High-cylinder engine');
  }

  return { category, riskLevel, notes };
}

// ============================================
// EXPORTS
// ============================================

export type { NHTSAResponse, NHTSAResult };
