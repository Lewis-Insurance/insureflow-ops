import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../client";
import { toast } from "sonner";

// Type definitions for each insurance type
export type AutoInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  vehicle_year?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_vin?: string;
  vehicle_usage?: string;
  annual_mileage?: number;
  current_liability_limits?: string;
  current_collision_deductible?: number;
  current_comprehensive_deductible?: number;
  uninsured_motorist?: boolean;
  rental_reimbursement?: boolean;
  roadside_assistance?: boolean;
  primary_driver_name?: string;
  primary_driver_dob?: string;
  primary_driver_license?: string;
  accidents_last_3_years?: number;
  violations_last_3_years?: number;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type HomeInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  current_carrier?: string;
  expiration_date?: string;
  property_address?: string;
  property_type?: string;
  year_built?: number;
  square_footage?: number;
  construction_type?: string;
  roof_type?: string;
  roof_age?: number;
  number_of_stories?: number;
  dwelling_coverage?: number;
  personal_property_coverage?: number;
  liability_coverage?: number;
  deductible?: number;
  alarm_system?: boolean;
  sprinkler_system?: boolean;
  swimming_pool?: boolean;
  trampoline?: boolean;
  dogs?: boolean;
  dog_breed?: string;
  claims_last_5_years?: number;
  claim_details?: string;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type CommercialInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  business_name?: string;
  business_type?: string;
  industry?: string;
  years_in_business?: number;
  annual_revenue?: number;
  number_of_employees?: number;
  general_liability?: boolean;
  property_coverage?: boolean;
  workers_comp?: boolean;
  commercial_auto?: boolean;
  professional_liability?: boolean;
  cyber_liability?: boolean;
  liability_limit?: number;
  property_value?: number;
  business_description?: string;
  payroll_amount?: number;
  number_of_vehicles?: number;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type LifeInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  insured_name?: string;
  insured_dob?: string;
  insured_age?: number;
  gender?: string;
  tobacco_use?: boolean;
  coverage_type?: string;
  coverage_amount?: number;
  term_length?: number;
  height_inches?: number;
  weight_lbs?: number;
  health_conditions?: string[];
  medications?: string[];
  family_history?: string;
  beneficiary_name?: string;
  beneficiary_relationship?: string;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type UmbrellaInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  desired_coverage_amount?: number;
  number_of_vehicles?: number;
  number_of_properties?: number;
  has_watercraft?: boolean;
  has_recreational_vehicles?: boolean;
  auto_liability_limits?: string;
  home_liability_limits?: string;
  owns_rental_property?: boolean;
  number_of_drivers?: number;
  teen_drivers?: boolean;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type RentersInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  current_carrier?: string;
  expiration_date?: string;
  rental_address?: string;
  property_type?: string;
  square_footage?: number;
  personal_property_coverage?: number;
  liability_coverage?: number;
  deductible?: number;
  loss_of_use_coverage?: number;
  alarm_system?: boolean;
  has_pets?: boolean;
  pet_type?: string;
  valuable_items?: boolean;
  valuable_items_description?: string;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type BoatInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  current_carrier?: string;
  expiration_date?: string;
  vessel_type?: string;
  year_built?: number;
  make?: string;
  model?: string;
  length_feet?: number;
  hull_id?: string;
  engine_type?: string;
  engine_horsepower?: number;
  number_of_engines?: number;
  vessel_value?: number;
  agreed_value?: boolean;
  primary_use?: string;
  navigation_area?: string;
  storage_location?: string;
  trailer_included?: boolean;
  operator_name?: string;
  operator_experience_years?: number;
  boating_safety_course?: boolean;
  claims_last_5_years?: number;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type MotorcycleInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  current_carrier?: string;
  expiration_date?: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  motorcycle_type?: string;
  engine_size_cc?: number;
  custom_parts_value?: number;
  anti_theft_device?: boolean;
  storage_location?: string;
  annual_mileage?: number;
  primary_use?: string;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type RVInsuranceDetails = {
  id?: string;
  lead_id: string;
  account_id?: string;
  current_carrier?: string;
  expiration_date?: string;
  rv_type?: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  length_feet?: number;
  rv_value?: number;
  agreed_value?: boolean;
  primary_use?: string;
  full_timer?: boolean;
  towing_vehicle?: string;
  storage_location?: string;
  total_mileage?: number;
  annual_mileage?: number;
  slide_outs?: number;
  awnings?: number;
  solar_panels?: boolean;
  satellite_dish?: boolean;
  claims_last_5_years?: number;
  uploaded_document_id?: string;
  document_url?: string;
  extracted_data?: Record<string, any>;
};

export type InsuranceType = 'auto' | 'home' | 'commercial' | 'life' | 'umbrella' | 'renters' | 'boat' | 'motorcycle' | 'rv';

const TABLE_MAP: Record<InsuranceType, string> = {
  auto: 'lead_auto_insurance',
  home: 'lead_home_insurance',
  commercial: 'lead_commercial_insurance',
  life: 'lead_life_insurance',
  umbrella: 'lead_umbrella_insurance',
  renters: 'lead_renters_insurance',
  boat: 'lead_boat_insurance',
  motorcycle: 'lead_motorcycle_insurance',
  rv: 'lead_rv_insurance',
};

// Hook to fetch insurance details for a lead
export const useLeadInsuranceDetails = (leadId: string, insuranceType: InsuranceType) => {
  return useQuery({
    queryKey: ['lead-insurance-details', leadId, insuranceType],
    queryFn: async () => {
      const tableName = TABLE_MAP[insuranceType];
      const { data, error } = await (supabase)
        .from(tableName)
        .select('*')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!leadId && !!insuranceType,
  });
};

// Hook to save/update insurance details
export const useSaveLeadInsuranceDetails = (insuranceType: InsuranceType) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (details: any) => {
      const tableName = TABLE_MAP[insuranceType];
      
      // Check if record exists
      const { data: existing } = await (supabase)
        .from(tableName)
        .select('id')
        .eq('lead_id', details.lead_id)
        .maybeSingle();

      let result;
      if (existing) {
        // Update existing record
        const { data, error } = await (supabase)
          .from(tableName)
          .update(details)
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      } else {
        // Insert new record
        const { data, error } = await (supabase)
          .from(tableName)
          .insert(details)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }

      return result;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['lead-insurance-details', variables.lead_id, insuranceType]
      });
      toast.success(`${insuranceType.charAt(0).toUpperCase() + insuranceType.slice(1)} insurance details saved successfully`);
    },
    onError: (error: any) => {
      console.error('Error saving insurance details:', error);
      toast.error(`Failed to save insurance details: ${error.message}`);
    },
  });
};

// Hook to upload document and extract data
export const useUploadInsuranceDocument = (leadId: string, insuranceType: InsuranceType) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      // Step 1: Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${leadId}-${insuranceType}-${Date.now()}.${fileExt}`;
      const filePath = `lead-documents/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Step 2: Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Step 3: Call ai-document-analysis edge function
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        'ai-document-analysis',
        {
          body: {
            type: 'insurance_extraction',
            documentType: insuranceType,
            extractionType: 'insurance_quote',
            documentPaths: [filePath],
          },
        }
      );

      if (analysisError) throw analysisError;

      const extracted = (analysisData)?.extracted ?? analysisData;
      return {
        documentUrl: publicUrl,
        documentPath: filePath,
        extractedData: extracted,
      };
    },
    onSuccess: (data, file) => {
      toast.success('Document uploaded and analyzed successfully');
      queryClient.invalidateQueries({
        queryKey: ['lead-insurance-details', leadId, insuranceType]
      });
    },
    onError: (error: any) => {
      console.error('Error uploading document:', error);
      toast.error(`Failed to upload document: ${error.message}`);
    },
  });
};

// Hook to auto-populate form from extracted data
export const useAutoPopulateFromDocument = (
  leadId: string,
  insuranceType: InsuranceType
) => {
  const saveDetails = useSaveLeadInsuranceDetails(insuranceType);

  return useMutation({
    mutationFn: async (extractedData: Record<string, any>) => {
      // Map extracted data to form fields based on insurance type
      const mappedData = mapExtractedDataToFields(extractedData, insuranceType, leadId);
      
      // Save to database
      return await saveDetails.mutateAsync(mappedData);
    },
    onSuccess: () => {
      toast.success('Form auto-populated from document');
    },
    onError: (error: any) => {
      console.error('Error auto-populating:', error);
      toast.error('Failed to auto-populate form');
    },
  });
};

// Helper function to map extracted data to database fields
function mapExtractedDataToFields(
  extractedData: Record<string, any>,
  insuranceType: InsuranceType,
  leadId: string
): any {
  const baseData = {
    lead_id: leadId,
    extracted_data: extractedData,
  };

  switch (insuranceType) {
    case 'auto':
      return {
        ...baseData,
        vehicle_year: extractedData.vehicle?.year,
        vehicle_make: extractedData.vehicle?.make,
        vehicle_model: extractedData.vehicle?.model,
        vehicle_vin: extractedData.vehicle?.vin,
        current_liability_limits: extractedData.coverage?.liability_limits,
        current_collision_deductible: extractedData.coverage?.collision_deductible,
        current_comprehensive_deductible: extractedData.coverage?.comprehensive_deductible,
        primary_driver_name: extractedData.driver?.name,
        primary_driver_dob: extractedData.driver?.dob,
      };

    case 'home':
      return {
        ...baseData,
        current_carrier: extractedData.carrier,
        expiration_date: extractedData.expiration_date,
        property_address: extractedData.property?.address,
        property_type: extractedData.property?.type,
        year_built: extractedData.property?.year_built,
        square_footage: extractedData.property?.square_footage,
        construction_type: extractedData.property?.construction_type,
        roof_type: extractedData.property?.roof_type,
        roof_age: extractedData.property?.roof_age,
        number_of_stories: extractedData.property?.stories,
        dwelling_coverage: extractedData.coverage?.dwelling,
        personal_property_coverage: extractedData.coverage?.personal_property,
        liability_coverage: extractedData.coverage?.liability,
        deductible: extractedData.coverage?.deductible,
        alarm_system: extractedData.features?.alarm_system || false,
        sprinkler_system: extractedData.features?.sprinkler_system || false,
        swimming_pool: extractedData.features?.swimming_pool || false,
        trampoline: extractedData.features?.trampoline || false,
        dogs: extractedData.features?.dogs || false,
        dog_breed: extractedData.features?.dog_breed || '',
        claims_last_5_years: extractedData.claims_last_5_years,
      };

    case 'commercial':
      return {
        ...baseData,
        business_name: extractedData.business?.name,
        business_type: extractedData.business?.type,
        industry: extractedData.business?.industry,
        annual_revenue: extractedData.business?.revenue,
        number_of_employees: extractedData.business?.employees,
      };

    case 'life':
      return {
        ...baseData,
        insured_name: extractedData.insured?.name,
        insured_dob: extractedData.insured?.dob,
        coverage_type: extractedData.coverage?.type,
        coverage_amount: extractedData.coverage?.amount,
        beneficiary_name: extractedData.beneficiary?.name,
      };

    case 'umbrella':
      return {
        ...baseData,
        desired_coverage_amount: extractedData.coverage?.amount,
        number_of_vehicles: extractedData.underlying?.vehicles,
        number_of_properties: extractedData.underlying?.properties,
      };

    case 'renters':
      return {
        ...baseData,
        current_carrier: extractedData.carrier,
        expiration_date: extractedData.expiration_date,
        rental_address: extractedData.property?.address,
        property_type: extractedData.property?.type,
        personal_property_coverage: extractedData.coverage?.personal_property,
        liability_coverage: extractedData.coverage?.liability,
        deductible: extractedData.coverage?.deductible,
      };

    case 'boat':
      return {
        ...baseData,
        current_carrier: extractedData.carrier,
        expiration_date: extractedData.expiration_date,
        vessel_type: extractedData.vessel?.type,
        year_built: extractedData.vessel?.year,
        make: extractedData.vessel?.make,
        model: extractedData.vessel?.model,
        length_feet: extractedData.vessel?.length_feet,
        hull_id: extractedData.vessel?.hull_id,
        engine_type: extractedData.vessel?.engine_type,
        engine_horsepower: extractedData.vessel?.horsepower,
        number_of_engines: extractedData.vessel?.number_of_engines,
        vessel_value: extractedData.vessel?.value,
        agreed_value: extractedData.vessel?.agreed_value,
        primary_use: extractedData.vessel?.primary_use,
        navigation_area: extractedData.vessel?.navigation_area,
        storage_location: extractedData.vessel?.storage_location,
        trailer_included: extractedData.vessel?.trailer_included,
        operator_name: extractedData.operator?.name,
        operator_experience_years: extractedData.operator?.experience_years,
        boating_safety_course: extractedData.operator?.safety_course,
      };

    case 'motorcycle':
      return {
        ...baseData,
        current_carrier: extractedData.carrier,
        expiration_date: extractedData.expiration_date,
        year: extractedData.motorcycle?.year,
        make: extractedData.motorcycle?.make,
        model: extractedData.motorcycle?.model,
        vin: extractedData.motorcycle?.vin,
        motorcycle_type: extractedData.motorcycle?.type,
        engine_size_cc: extractedData.motorcycle?.engine_size_cc,
        custom_parts_value: extractedData.motorcycle?.custom_parts_value,
        anti_theft_device: extractedData.motorcycle?.anti_theft_device,
        storage_location: extractedData.motorcycle?.storage_location,
        annual_mileage: extractedData.motorcycle?.annual_mileage,
        primary_use: extractedData.motorcycle?.primary_use,
      };

    case 'rv':
      return {
        ...baseData,
        current_carrier: extractedData.carrier,
        expiration_date: extractedData.expiration_date,
        rv_type: extractedData.rv?.type,
        year: extractedData.rv?.year,
        make: extractedData.rv?.make,
        model: extractedData.rv?.model,
        vin: extractedData.rv?.vin,
        length_feet: extractedData.rv?.length_feet,
        rv_value: extractedData.rv?.value,
        agreed_value: extractedData.rv?.agreed_value,
        primary_use: extractedData.rv?.primary_use,
        full_timer: extractedData.rv?.full_timer,
        towing_vehicle: extractedData.rv?.towing_vehicle,
        storage_location: extractedData.rv?.storage_location,
        total_mileage: extractedData.rv?.total_mileage,
        annual_mileage: extractedData.rv?.annual_mileage,
        slide_outs: extractedData.rv?.slide_outs,
        awnings: extractedData.rv?.awnings,
        solar_panels: extractedData.rv?.solar_panels,
        satellite_dish: extractedData.rv?.satellite_dish,
      };

    default:
      return baseData;
  }
}
