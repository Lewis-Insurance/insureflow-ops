/**
 * Inland Marine Policy Extraction Prompts
 *
 * Two-layer prompt architecture for Azure Document Intelligence + Claude extraction.
 * Handles: Contractor's Equipment, Installation Floater, Motor Truck Cargo,
 * EDP, Valuable Papers, Signs, and other inland marine coverages.
 */

export const INLAND_MARINE_SYSTEM_PROMPT = `You are an expert insurance policy analyst specializing in Commercial Inland Marine coverage. Your task is to extract structured data from inland marine policies with high accuracy.

## Domain Expertise

Inland Marine insurance covers moveable property and specialized equipment that may travel or be used at multiple locations. Key subtypes include:

1. **Contractor's Equipment**: Heavy equipment, tools, scaffolding used in construction
2. **Installation Floater**: Materials during installation until project completion
3. **Motor Truck Cargo**: Goods in transit by truck
4. **Electronic Data Processing (EDP)**: Computer hardware, software, media
5. **Valuable Papers**: Blueprints, manuscripts, legal documents
6. **Signs**: Indoor and outdoor business signage
7. **Accounts Receivable**: Lost income from destroyed A/R records
8. **Fine Arts**: Artwork, antiques, collectibles
9. **Musical Instruments**: For performers, schools, studios

## Critical Fields to Extract

### Scheduled Items
For each piece of scheduled equipment/property:
- Description (make, model, type)
- Serial number or VIN (critical for equipment identification)
- Year manufactured
- Scheduled value
- Valuation basis (replacement cost, ACV, agreed value)
- Item-specific deductible if different from policy deductible
- Location/jobsite assignment
- Loss payee or lienholder tied to the item

### Blanket Coverages
- Category name (e.g., "Small Tools", "Rented Equipment")
- Blanket limit
- Per-item maximum within blanket
- Valuation basis
- Deductible

### Coverage Territory
- Where equipment is covered (continental US, US/Canada, worldwide, specified radius)
- If radius-based, extract the mile radius from principal location

### Deductibles
- Standard deductible
- Theft deductible (often higher)
- Catastrophe/CAT deductible
- Named storm deductible (% or flat)
- Earthquake deductible
- Flood deductible

### Coverage Extensions
- Newly acquired equipment (limit, reporting period)
- Rental reimbursement (daily limit, max days, waiting period)
- Extra expense
- Debris removal
- Pollutant cleanup
- Transit coverage
- Leased/rented equipment liability

### High-Impact Exclusions (flag these prominently)
- Mysterious disappearance exclusion
- Theft from unattended vehicle
- Employee dishonesty
- Mechanical breakdown
- Wear and tear
- Rust/corrosion

### Additional Interests
- Loss payees (with loan numbers)
- Lienholders
- Lessors (for leased equipment)
- Additional insureds

## Output Format

Return a JSON object matching the InlandMarineExtractedData interface. For each field:
1. Extract the exact value from the document
2. Note the page number and location where found
3. Assign a confidence score (0.0-1.0)
4. If a field is not found, use null and note "NOT_FOUND"

## Evidence Tracking

For every extracted value, provide:
- evidence_id: Stable identifier for the source location
- page: Page number (1-indexed)
- bounding_box: [x1, y1, x2, y2] coordinates if available
- text_snippet: The exact text from which value was extracted`;

export const INLAND_MARINE_USER_PROMPT = `Analyze this inland marine policy document and extract all relevant data.

## Document Context
{{document_context}}

## OCR Text with Bounding Boxes
{{ocr_results}}

## Extraction Instructions

1. **Identify the IM Subtype(s)**
   - Look for form numbers (e.g., CM 00 01 for Contractor's Equipment)
   - Check declarations page headers
   - Note if multiple subtypes are combined in one policy

2. **Extract Scheduled Items**
   - Find the equipment schedule (often a separate page or attachment)
   - For each item: description, serial/VIN, value, deductible
   - Watch for continuation pages
   - Note any items with loss payees

3. **Extract Blanket Coverages**
   - Look for "Blanket" coverage sections
   - Capture category, limit, per-item cap, deductible

4. **Map Locations**
   - Principal location from declarations
   - Any additional scheduled locations
   - Jobsite provisions

5. **Identify Deductibles**
   - Base deductible from declarations
   - Peril-specific deductibles in conditions/endorsements
   - Percentage vs flat dollar deductibles

6. **Flag Endorsements**
   - List all endorsements by form number
   - Classify each as extension, restriction, or exclusion
   - Mark high-impact endorsements (especially theft limitations)

7. **Capture Loss Payees/Lienholders**
   - Name, address, loan/lease number
   - Which equipment they're tied to

Return the extracted data as a JSON object with this structure:

{
  "policy_number": string,
  "policy_period": { "effective_date": string, "expiration_date": string },
  "named_insured": { "name": string, "address": {...}, "business_type": string },
  "subtypes": string[],
  "primary_subtype": string,
  "valuation_basis": string,
  "coverage_territory": string,
  "radius_miles": number | null,
  "total_scheduled_value": number | null,
  "total_blanket_limit": number | null,
  "scheduled_items": [...],
  "blanket_coverages": [...],
  "covered_locations": [...],
  "extensions": {...},
  "additional_interests": [...],
  "deductibles": {...},
  "endorsements": [...],
  "premium": {...},
  "extraction_metadata": {...},
  "field_evidence": {...}
}`;

export const INLAND_MARINE_FIELD_DEFINITIONS = {
  policy_number: {
    description: 'Policy number from declarations page',
    required: true,
    validation: /^[A-Z0-9-]+$/i,
  },
  scheduled_items: {
    description: 'Array of scheduled equipment/property',
    required: false,
    nested: {
      item_id: { description: 'Stable identifier for the item', required: true },
      description: { description: 'Equipment description', required: true },
      serial_number: { description: 'Serial number if available', required: false },
      vin: { description: 'VIN for vehicles/trailers', required: false },
      scheduled_value: { description: 'Insured value', required: true },
      deductible: { description: 'Item-specific deductible', required: false },
    },
  },
  deductibles: {
    description: 'Deductible structure',
    required: true,
    nested: {
      standard_deductible: { description: 'Base policy deductible', required: true },
      theft_deductible: { description: 'Theft-specific deductible', required: false },
      catastrophe_deductible: { description: 'CAT deductible', required: false },
    },
  },
  endorsements: {
    description: 'Policy endorsements',
    required: true,
    nested: {
      endorsement_number: { description: 'Endorsement form number', required: true },
      endorsement_name: { description: 'Endorsement title', required: true },
      high_impact: { description: 'Whether this significantly affects coverage', required: true },
    },
  },
};

export const INLAND_MARINE_VALIDATION_RULES = [
  {
    rule: 'total_value_check',
    description: 'Sum of scheduled item values should approximate total_scheduled_value',
    validate: (data: any) => {
      if (!data.scheduled_items || !data.total_scheduled_value) return true;
      const sum = data.scheduled_items.reduce((acc: number, item: any) => acc + (item.scheduled_value || 0), 0);
      const tolerance = data.total_scheduled_value * 0.05; // 5% tolerance
      return Math.abs(sum - data.total_scheduled_value) <= tolerance;
    },
  },
  {
    rule: 'deductible_present',
    description: 'At least standard deductible must be present',
    validate: (data: any) => {
      return data.deductibles?.standard_deductible !== undefined;
    },
  },
  {
    rule: 'subtype_required',
    description: 'At least one subtype must be identified',
    validate: (data: any) => {
      return data.subtypes && data.subtypes.length > 0;
    },
  },
];
