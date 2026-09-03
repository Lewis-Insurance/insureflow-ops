/**
 * Intake line configuration.
 *
 * The New Lead page grows downward as lines are chosen, and what each line asks for
 * lives here rather than in the page. That is deliberate: the "needed to quote" list
 * per line is settled with Kelli in the first pilot week, and a Florida specific field
 * (wind mitigation date, four point inspection, flood zone) has to be a one line
 * change, not a page rewrite.
 *
 * Every field must pass one test before it goes in: would the producer have to call
 * the client back without it. If not, it does not belong on the intake form.
 *
 * Storage
 *   home        -> lead_home_insurance      (the rich table that already exists)
 *   auto        -> lead_auto_vehicles + lead_auto_drivers
 *   commercial  -> lead_commercial_insurance
 *   everything else -> lead_line_details, one row per lead and line, answers in jsonb
 */

export type LineKey =
  | 'home'
  | 'auto'
  | 'recreation'
  | 'commercial'
  | 'renters'
  | 'condo'
  | 'flood'
  | 'umbrella'
  | 'life';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'year'
  | 'date'
  | 'select'
  | 'checkbox';

export interface LineField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Carriers will not quote without it. Drives the "still needed to quote" list. */
  neededToQuote?: boolean;
  /** Filled in from the Who section when the section opens. */
  prefillFrom?: 'addressLine' | 'city' | 'state' | 'zip';
  /** Half width on wide screens. */
  half?: boolean;
}

export interface RepeatableGroup {
  key: string;
  label: string;
  addLabel: string;
  itemLabel: string;
  fields: LineField[];
}

export interface LineConfig {
  key: LineKey;
  label: string;
  /** Sits behind Show more rather than in the first row of chips. */
  secondary?: boolean;
  storage: 'lead_home_insurance' | 'lead_auto' | 'lead_commercial_insurance' | 'lead_line_details';
  fields: LineField[];
  groups?: RepeatableGroup[];
}

const CONSTRUCTION_OPTIONS = [
  { value: 'frame', label: 'Frame' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'masonry_veneer', label: 'Masonry veneer' },
  { value: 'concrete_block', label: 'Concrete block' },
  { value: 'other', label: 'Other' },
];

const STATE_HINT = 'FL';

export const LINE_CONFIGS: Record<LineKey, LineConfig> = {
  home: {
    key: 'home',
    label: 'Home',
    storage: 'lead_home_insurance',
    fields: [
      { key: 'property_address', label: 'Property address', type: 'text', neededToQuote: true, prefillFrom: 'addressLine' },
      { key: 'year_built', label: 'Year built', type: 'year', neededToQuote: true, half: true },
      { key: 'roof_year', label: 'Roof year', type: 'year', neededToQuote: true, half: true },
      { key: 'construction_type', label: 'Construction', type: 'select', options: CONSTRUCTION_OPTIONS, neededToQuote: true, half: true },
      { key: 'square_footage', label: 'Square footage', type: 'number', half: true },
      { key: 'dwelling_coverage', label: 'Dwelling amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'current_carrier', label: 'Current carrier', type: 'text', half: true },
      { key: 'claims_last_5_years', label: 'Claims in the last 5 years', type: 'number', neededToQuote: true, half: true },
      { key: 'claim_details', label: 'Claim details', type: 'textarea' },
    ],
  },

  auto: {
    key: 'auto',
    label: 'Auto',
    storage: 'lead_auto',
    fields: [
      { key: 'current_carrier', label: 'Current carrier', type: 'text', half: true },
      { key: 'current_premium', label: 'Current premium', type: 'currency', half: true },
    ],
    groups: [
      {
        key: 'vehicles',
        label: 'Vehicles',
        addLabel: 'Add vehicle',
        itemLabel: 'Vehicle',
        fields: [
          { key: 'year', label: 'Year', type: 'year', neededToQuote: true, half: true },
          { key: 'make', label: 'Make', type: 'text', neededToQuote: true, half: true },
          { key: 'model', label: 'Model', type: 'text', neededToQuote: true, half: true },
          { key: 'vin', label: 'VIN', type: 'text', half: true },
        ],
      },
      {
        key: 'drivers',
        label: 'Drivers',
        addLabel: 'Add driver',
        itemLabel: 'Driver',
        fields: [
          { key: 'first_name', label: 'First name', type: 'text', neededToQuote: true, half: true },
          { key: 'last_name', label: 'Last name', type: 'text', neededToQuote: true, half: true },
          { key: 'date_of_birth', label: 'Date of birth', type: 'date', neededToQuote: true, half: true },
          { key: 'license_state', label: 'Licence state', type: 'text', placeholder: STATE_HINT, neededToQuote: true, half: true },
        ],
      },
    ],
  },

  recreation: {
    key: 'recreation',
    label: 'Recreation',
    storage: 'lead_line_details',
    fields: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        neededToQuote: true,
        half: true,
        options: [
          { value: 'boat', label: 'Boat' },
          { value: 'motorcycle', label: 'Motorcycle' },
          { value: 'rv', label: 'RV or motorhome' },
          { value: 'trailer', label: 'Trailer' },
          { value: 'golf_cart', label: 'Golf cart' },
          { value: 'other', label: 'Other' },
        ],
      },
      { key: 'year', label: 'Year', type: 'year', neededToQuote: true, half: true },
      { key: 'make', label: 'Make', type: 'text', neededToQuote: true, half: true },
      { key: 'model', label: 'Model', type: 'text', neededToQuote: true, half: true },
      { key: 'value', label: 'Value', type: 'currency', neededToQuote: true, half: true },
      { key: 'stored_at', label: 'Where it is kept', type: 'text', neededToQuote: true, half: true },
      { key: 'operator_dob', label: 'Operator date of birth', type: 'date', neededToQuote: true, half: true },
    ],
  },

  commercial: {
    key: 'commercial',
    label: 'Commercial',
    storage: 'lead_commercial_insurance',
    fields: [
      { key: 'business_type', label: 'Business type', type: 'text', neededToQuote: true, half: true },
      { key: 'years_in_business', label: 'Years in business', type: 'number', neededToQuote: true, half: true },
      { key: 'number_of_employees', label: 'Employees', type: 'number', neededToQuote: true, half: true },
      { key: 'payroll_amount', label: 'Annual payroll', type: 'currency', neededToQuote: true, half: true },
      { key: 'annual_revenue', label: 'Annual revenue', type: 'currency', neededToQuote: true, half: true },
      { key: 'current_carrier', label: 'Current carrier', type: 'text', half: true },
      { key: 'general_liability', label: 'General liability', type: 'checkbox', half: true },
      { key: 'property_coverage', label: 'Property', type: 'checkbox', half: true },
      { key: 'workers_comp', label: 'Workers comp', type: 'checkbox', half: true },
      { key: 'commercial_auto', label: 'Commercial auto', type: 'checkbox', half: true },
      { key: 'business_description', label: 'What the business does', type: 'textarea' },
    ],
  },

  renters: {
    key: 'renters',
    label: 'Renters',
    secondary: true,
    storage: 'lead_line_details',
    fields: [
      { key: 'address', label: 'Address', type: 'text', neededToQuote: true, prefillFrom: 'addressLine' },
      { key: 'personal_property', label: 'Personal property amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'liability', label: 'Liability amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'building_type', label: 'Building type', type: 'text', half: true },
      { key: 'current_carrier', label: 'Current carrier', type: 'text', half: true },
    ],
  },

  condo: {
    key: 'condo',
    label: 'Condo',
    secondary: true,
    storage: 'lead_line_details',
    fields: [
      { key: 'address', label: 'Unit address', type: 'text', neededToQuote: true, prefillFrom: 'addressLine' },
      { key: 'year_built', label: 'Year built', type: 'year', neededToQuote: true, half: true },
      { key: 'unit_floor', label: 'Floor', type: 'number', half: true },
      { key: 'interior_coverage', label: 'Interior coverage amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'personal_property', label: 'Personal property amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'association_name', label: 'Association', type: 'text', half: true },
      { key: 'current_carrier', label: 'Current carrier', type: 'text', half: true },
    ],
  },

  flood: {
    key: 'flood',
    label: 'Flood',
    secondary: true,
    storage: 'lead_line_details',
    fields: [
      { key: 'address', label: 'Property address', type: 'text', neededToQuote: true, prefillFrom: 'addressLine' },
      { key: 'flood_zone', label: 'Flood zone', type: 'text', neededToQuote: true, half: true },
      { key: 'elevation_certificate', label: 'Elevation certificate on file', type: 'checkbox', half: true },
      { key: 'building_coverage', label: 'Building coverage amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'contents_coverage', label: 'Contents coverage amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'prior_flood_claims', label: 'Prior flood claims', type: 'number', half: true },
      { key: 'current_carrier', label: 'Current carrier', type: 'text', half: true },
    ],
  },

  umbrella: {
    key: 'umbrella',
    label: 'Umbrella',
    secondary: true,
    storage: 'lead_line_details',
    fields: [
      { key: 'limit_wanted', label: 'Limit wanted', type: 'currency', neededToQuote: true, half: true },
      { key: 'underlying_auto_limit', label: 'Underlying auto limit', type: 'currency', neededToQuote: true, half: true },
      { key: 'underlying_home_limit', label: 'Underlying home liability limit', type: 'currency', neededToQuote: true, half: true },
      { key: 'household_drivers', label: 'Drivers in the household', type: 'number', neededToQuote: true, half: true },
      { key: 'rental_properties', label: 'Rental properties owned', type: 'number', half: true },
      { key: 'current_carrier', label: 'Current carrier', type: 'text', half: true },
    ],
  },

  life: {
    key: 'life',
    label: 'Life',
    secondary: true,
    storage: 'lead_line_details',
    fields: [
      {
        key: 'product',
        label: 'Product',
        type: 'select',
        neededToQuote: true,
        half: true,
        options: [
          { value: 'term', label: 'Term' },
          { value: 'whole', label: 'Whole life' },
          { value: 'universal', label: 'Universal' },
          { value: 'final_expense', label: 'Final expense' },
        ],
      },
      { key: 'face_amount', label: 'Face amount', type: 'currency', neededToQuote: true, half: true },
      { key: 'term_years', label: 'Term length in years', type: 'number', half: true },
      { key: 'date_of_birth', label: 'Date of birth', type: 'date', neededToQuote: true, half: true },
      { key: 'tobacco', label: 'Uses tobacco', type: 'checkbox', half: true },
      { key: 'health_notes', label: 'Health notes', type: 'textarea' },
    ],
  },
};

/** The four chips shown up front. */
export const PRIMARY_LINES: LineKey[] = ['home', 'auto', 'recreation', 'commercial'];

/**
 * The five behind Show more. Report 12.10 leaves the exact five to Landen; this is the
 * proposal the build ships with and it is flagged in the build log.
 */
export const SECONDARY_LINES: LineKey[] = ['renters', 'condo', 'flood', 'umbrella', 'life'];

export const ALL_LINES: LineKey[] = [...PRIMARY_LINES, ...SECONDARY_LINES];

export function lineLabel(key: string): string {
  return LINE_CONFIGS[key as LineKey]?.label ?? key;
}

/** Fields a carrier will want that are still blank, so whoever picks this up knows what to ask. */
export function stillNeededToQuote(
  line: LineKey,
  values: Record<string, unknown>,
  groups: Record<string, Record<string, unknown>[]> = {},
): string[] {
  const config = LINE_CONFIGS[line];
  if (!config) return [];

  const missing: string[] = [];

  for (const field of config.fields) {
    if (!field.neededToQuote) continue;
    if (field.type === 'checkbox') continue;
    const value = values[field.key];
    if (value === undefined || value === null || value === '') missing.push(field.label);
  }

  for (const group of config.groups ?? []) {
    const rows = groups[group.key] ?? [];
    if (rows.length === 0) {
      missing.push(`At least one ${group.itemLabel.toLowerCase()}`);
      continue;
    }
    for (const field of group.fields) {
      if (!field.neededToQuote) continue;
      const anyBlank = rows.some((row) => {
        const value = row[field.key];
        return value === undefined || value === null || value === '';
      });
      if (anyBlank) missing.push(`${group.itemLabel} ${field.label.toLowerCase()}`);
    }
  }

  return missing;
}
