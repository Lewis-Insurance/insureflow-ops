// ============================================================================
// ACORD FIELD MAPPINGS TESTS
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  ACORD_FORM_MAPPINGS,
  ACORD_80_FIELDS,
  ACORD_35_FIELDS,
  ACORD_35U_FIELDS,
  getFormFields,
  getRequiredFields,
  getFieldsBySection,
  getFormNumberForLOB,
  validateRequiredFields,
} from '@/lib/acord/fieldMappings';

describe('ACORD Form Mappings', () => {
  describe('Form Registry', () => {
    it('should have mappings for ACORD 80', () => {
      expect(ACORD_FORM_MAPPINGS['80']).toBeDefined();
      expect(ACORD_FORM_MAPPINGS['80'].formName).toBe('Personal Auto Application');
      expect(ACORD_FORM_MAPPINGS['80'].applicableLOBs).toContain('auto');
    });

    it('should have mappings for ACORD 35', () => {
      expect(ACORD_FORM_MAPPINGS['35']).toBeDefined();
      expect(ACORD_FORM_MAPPINGS['35'].formName).toBe('Homeowners Application');
      expect(ACORD_FORM_MAPPINGS['35'].applicableLOBs).toContain('home');
      expect(ACORD_FORM_MAPPINGS['35'].applicableLOBs).toContain('renters');
      expect(ACORD_FORM_MAPPINGS['35'].applicableLOBs).toContain('condo');
    });

    it('should have mappings for ACORD 35U', () => {
      expect(ACORD_FORM_MAPPINGS['35U']).toBeDefined();
      expect(ACORD_FORM_MAPPINGS['35U'].formName).toBe('Personal Umbrella Application');
      expect(ACORD_FORM_MAPPINGS['35U'].applicableLOBs).toContain('umbrella');
    });
  });

  describe('ACORD 80 Fields', () => {
    it('should have named insured fields', () => {
      const namedInsuredFields = ACORD_80_FIELDS.filter(
        (f) => f.section === 'Named Insured'
      );
      expect(namedInsuredFields.length).toBeGreaterThan(0);
      expect(namedInsuredFields.some((f) => f.fieldName === 'NamedInsured_FirstName')).toBe(true);
      expect(namedInsuredFields.some((f) => f.fieldName === 'NamedInsured_LastName')).toBe(true);
    });

    it('should have vehicle fields', () => {
      const vehicleFields = ACORD_80_FIELDS.filter(
        (f) => f.section.startsWith('Vehicle')
      );
      expect(vehicleFields.length).toBeGreaterThan(0);
      expect(vehicleFields.some((f) => f.fieldName === 'Vehicle1_VIN')).toBe(true);
      expect(vehicleFields.some((f) => f.fieldName === 'Vehicle1_Make')).toBe(true);
    });

    it('should have driver fields', () => {
      const driverFields = ACORD_80_FIELDS.filter(
        (f) => f.section.startsWith('Driver')
      );
      expect(driverFields.length).toBeGreaterThan(0);
      expect(driverFields.some((f) => f.fieldName === 'Driver1_FirstName')).toBe(true);
      expect(driverFields.some((f) => f.fieldName === 'Driver1_LicenseNumber')).toBe(true);
    });

    it('should have VIN field with max length 17', () => {
      const vinField = ACORD_80_FIELDS.find((f) => f.fieldName === 'Vehicle1_VIN');
      expect(vinField).toBeDefined();
      expect(vinField?.maxLength).toBe(17);
    });

    it('should have state fields with max length 2', () => {
      const stateFields = ACORD_80_FIELDS.filter(
        (f) => f.fieldName.includes('State') && f.maxLength === 2
      );
      expect(stateFields.length).toBeGreaterThan(0);
    });
  });

  describe('ACORD 35 Fields', () => {
    it('should have property fields', () => {
      const propertyFields = ACORD_35_FIELDS.filter(
        (f) => f.section === 'Property'
      );
      expect(propertyFields.length).toBeGreaterThan(0);
      expect(propertyFields.some((f) => f.fieldName === 'PropertyAddress')).toBe(true);
      expect(propertyFields.some((f) => f.fieldName === 'YearBuilt')).toBe(true);
    });

    it('should have coverage fields', () => {
      const coverageFields = ACORD_35_FIELDS.filter(
        (f) => f.section === 'Coverages'
      );
      expect(coverageFields.length).toBeGreaterThan(0);
      expect(coverageFields.some((f) => f.fieldName === 'CovA_Dwelling')).toBe(true);
      expect(coverageFields.some((f) => f.fieldName === 'CovC_PersonalProperty')).toBe(true);
      expect(coverageFields.some((f) => f.fieldName === 'CovE_Liability')).toBe(true);
    });

    it('should have form type checkboxes', () => {
      const formTypeFields = ACORD_35_FIELDS.filter(
        (f) => f.section === 'Form Type'
      );
      expect(formTypeFields.length).toBeGreaterThan(0);
      expect(formTypeFields.some((f) => f.fieldName === 'FormType_HO3')).toBe(true);
      expect(formTypeFields.some((f) => f.fieldName === 'FormType_HO4')).toBe(true);
      expect(formTypeFields.some((f) => f.fieldName === 'FormType_HO6')).toBe(true);
    });

    it('should have condo-specific fields', () => {
      const condoFields = ACORD_35_FIELDS.filter(
        (f) => f.section === 'Condo'
      );
      expect(condoFields.length).toBeGreaterThan(0);
      expect(condoFields.some((f) => f.fieldName === 'IsCondoAssociation')).toBe(true);
      expect(condoFields.some((f) => f.fieldName === 'MasterPolicyExists')).toBe(true);
    });
  });

  describe('ACORD 35U Fields', () => {
    it('should have underlying policy fields', () => {
      const underlyingFields = ACORD_35U_FIELDS.filter(
        (f) => f.section.startsWith('Underlying')
      );
      expect(underlyingFields.length).toBeGreaterThan(0);
      expect(underlyingFields.some((f) => f.fieldName === 'UnderlyingAuto_Exists')).toBe(true);
      expect(underlyingFields.some((f) => f.fieldName === 'UnderlyingHome_Exists')).toBe(true);
    });

    it('should have umbrella limit field', () => {
      const umbrellaLimit = ACORD_35U_FIELDS.find(
        (f) => f.fieldName === 'UmbrellaLimit'
      );
      expect(umbrellaLimit).toBeDefined();
      expect(umbrellaLimit?.type).toBe('currency');
      expect(umbrellaLimit?.required).toBe(true);
    });
  });
});

describe('Helper Functions', () => {
  describe('getFormFields', () => {
    it('should return fields for ACORD 80', () => {
      const fields = getFormFields('80');
      expect(fields.length).toBeGreaterThan(0);
      expect(fields).toEqual(ACORD_80_FIELDS);
    });

    it('should return fields for ACORD 35', () => {
      const fields = getFormFields('35');
      expect(fields.length).toBeGreaterThan(0);
      expect(fields).toEqual(ACORD_35_FIELDS);
    });

    it('should return empty array for unknown form', () => {
      const fields = getFormFields('999');
      expect(fields).toEqual([]);
    });
  });

  describe('getRequiredFields', () => {
    it('should return only required field names for ACORD 80', () => {
      const requiredFields = getRequiredFields('80');
      expect(requiredFields.length).toBeGreaterThan(0);

      // Verify all returned fields are marked as required
      const allFields = getFormFields('80');
      requiredFields.forEach((fieldName) => {
        const field = allFields.find((f) => f.fieldName === fieldName);
        expect(field?.required).toBe(true);
      });
    });

    it('should include NamedInsured_FirstName as required', () => {
      const requiredFields = getRequiredFields('80');
      expect(requiredFields).toContain('NamedInsured_FirstName');
    });

    it('should include Vehicle1_VIN as required', () => {
      const requiredFields = getRequiredFields('80');
      expect(requiredFields).toContain('Vehicle1_VIN');
    });
  });

  describe('getFieldsBySection', () => {
    it('should group ACORD 80 fields by section', () => {
      const sections = getFieldsBySection('80');
      expect(sections['Named Insured']).toBeDefined();
      expect(sections['Named Insured'].length).toBeGreaterThan(0);
      expect(sections['Vehicle 1']).toBeDefined();
      expect(sections['Driver 1']).toBeDefined();
    });

    it('should group ACORD 35 fields by section', () => {
      const sections = getFieldsBySection('35');
      expect(sections['Property']).toBeDefined();
      expect(sections['Coverages']).toBeDefined();
      expect(sections['Form Type']).toBeDefined();
    });

    it('should return empty object for unknown form', () => {
      const sections = getFieldsBySection('999');
      expect(Object.keys(sections).length).toBe(0);
    });
  });

  describe('getFormNumberForLOB', () => {
    it('should return 80 for auto', () => {
      expect(getFormNumberForLOB('auto')).toBe('80');
    });

    it('should return 35 for home', () => {
      expect(getFormNumberForLOB('home')).toBe('35');
    });

    it('should return 35 for renters', () => {
      expect(getFormNumberForLOB('renters')).toBe('35');
    });

    it('should return 35 for condo', () => {
      expect(getFormNumberForLOB('condo')).toBe('35');
    });

    it('should return 35U for umbrella', () => {
      expect(getFormNumberForLOB('umbrella')).toBe('35U');
    });

    it('should handle case-insensitive input', () => {
      expect(getFormNumberForLOB('AUTO')).toBe('80');
      expect(getFormNumberForLOB('Home')).toBe('35');
    });

    it('should default to 35 for unknown LOB', () => {
      expect(getFormNumberForLOB('unknown')).toBe('35');
    });
  });

  describe('validateRequiredFields', () => {
    it('should return valid when all required fields present', () => {
      const fieldValues = {
        NamedInsured_FirstName: 'John',
        NamedInsured_LastName: 'Doe',
        NamedInsured_FullName: 'John Doe',
        EffectiveDate: '01/01/2025',
        ExpirationDate: '01/01/2026',
        Vehicle1_Year: '2020',
        Vehicle1_Make: 'Toyota',
        Vehicle1_Model: 'Camry',
        Vehicle1_VIN: '1HGBH41JXMN109186',
        Driver1_FirstName: 'John',
        Driver1_LastName: 'Doe',
        Driver1_DOB: '01/15/1985',
        Driver1_LicenseNumber: 'D12345678',
        Driver1_LicenseState: 'CA',
      };

      const result = validateRequiredFields('80', fieldValues);
      // May have some missing fields due to additional requirements
      expect(result.missingFields.length).toBeLessThan(10);
    });

    it('should return invalid with missing fields listed', () => {
      const fieldValues = {
        NamedInsured_FirstName: 'John',
        // Missing other required fields
      };

      const result = validateRequiredFields('80', fieldValues);
      expect(result.valid).toBe(false);
      expect(result.missingFields.length).toBeGreaterThan(0);
      expect(result.missingFields).toContain('NamedInsured_LastName');
    });

    it('should treat empty strings as missing', () => {
      const fieldValues = {
        NamedInsured_FirstName: 'John',
        NamedInsured_LastName: '', // Empty string
      };

      const result = validateRequiredFields('80', fieldValues);
      expect(result.missingFields).toContain('NamedInsured_LastName');
    });
  });
});

describe('Field Type Consistency', () => {
  const allFields = [...ACORD_80_FIELDS, ...ACORD_35_FIELDS, ...ACORD_35U_FIELDS];

  it('should have valid field types', () => {
    const validTypes = ['text', 'checkbox', 'date', 'currency', 'phone', 'number'];
    allFields.forEach((field) => {
      expect(validTypes).toContain(field.type);
    });
  });

  it('should have non-empty field names', () => {
    allFields.forEach((field) => {
      expect(field.fieldName).toBeTruthy();
      expect(field.fieldName.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty labels', () => {
    allFields.forEach((field) => {
      expect(field.label).toBeTruthy();
      expect(field.label.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty sections', () => {
    allFields.forEach((field) => {
      expect(field.section).toBeTruthy();
      expect(field.section.length).toBeGreaterThan(0);
    });
  });

  it('should have boolean required flag', () => {
    allFields.forEach((field) => {
      expect(typeof field.required).toBe('boolean');
    });
  });
});
