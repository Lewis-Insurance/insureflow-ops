import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSignedStorageUrl } from '@/lib/storageUrl';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';

// Types for parsed dec page data
export interface ParsedInsured {
  first_name: string;
  last_name: string;
  full_name?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export interface ParsedPolicy {
  policy_number?: string;
  policy_type: string;
  carrier?: string;
  effective_date?: string;
  expiration_date?: string;
  premium?: number;
  coverages?: ParsedCoverage[];
}

export interface ParsedCoverage {
  type: string;
  limit?: string;
  deductible?: string;
  premium?: number;
}

export interface DecPageParseResult {
  success: boolean;
  confidence: number;
  insured: ParsedInsured;
  policy: ParsedPolicy;
  vehicles?: ParsedVehicle[];
  drivers?: ParsedDriver[];
  property?: ParsedProperty;
  raw_text?: string;
  analysis_id?: string;
  document_url?: string;
  storage_path?: string;
  original_filename?: string;
}

export interface ParsedVehicle {
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
}

export interface ParsedDriver {
  name?: string;
  license_number?: string;
  date_of_birth?: string;
}

export interface ParsedProperty {
  address?: string;
  year_built?: number;
  square_feet?: number;
  construction_type?: string;
}

export interface CreateLeadFromDecPageInput {
  parseResult: DecPageParseResult;
  notes?: string;
  assignedTo?: string;
}

// Map policy type from analysis to lead insurance_types
function mapPolicyTypeToInsuranceType(policyType: string): string[] {
  const typeMap: Record<string, string[]> = {
    'auto': ['auto'],
    'auto_insurance': ['auto'],
    'homeowners': ['home'],
    'home': ['home'],
    'home_insurance': ['home'],
    'commercial': ['commercial'],
    'commercial_auto': ['commercial', 'auto'],
    'commercial_property': ['commercial'],
    'general_liability': ['commercial'],
    'workers_comp': ['commercial'],
    'life': ['life'],
    'life_insurance': ['life'],
    'health': ['health'],
    'umbrella': ['umbrella'],
    'renters': ['renters'],
    'boat': ['boat'],
    'motorcycle': ['motorcycle'],
    'rv': ['rv'],
  };

  const normalized = policyType.toLowerCase().replace(/[^a-z_]/g, '_');
  return typeMap[normalized] || ['other'];
}

export function useDecPageImport() {
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parseResult, setParseResult] = useState<DecPageParseResult | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeAgency } = useActiveAgency();

  // Upload and parse dec page
  const uploadAndParse = async (file: File): Promise<DecPageParseResult> => {
    if (!user?.id) throw new Error('Not authenticated');

    setIsUploading(true);
    setProgress(10);

    try {
      // 1. Upload file to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `dec-pages/${user.id}/${Date.now()}.${fileExt}`;

      setProgress(20);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        logger.error('[Dec Page Import] Upload error:', uploadError);
        throw new Error('Failed to upload file');
      }

      setProgress(40);
      setIsUploading(false);
      setIsParsing(true);

      // 2. Get signed URL for the document
      const documentUrl = await getSignedStorageUrl('documents', fileName);

      // 3. Create document record (using correct column names)
      const { data: docRecord, error: docError } = await supabase
        .from('documents')
        .insert({
          filename: file.name,
          storage_path: fileName,
          mime_type: file.type,
          file_size: file.size,
          kind: 'dec_page',
        })
        .select()
        .single();

      if (docError) {
        logger.error('[Dec Page Import] Document record error:', docError);
        console.error('[Dec Page Import] Doc insert error:', JSON.stringify(docError, null, 2));
        // Continue anyway - analysis is more important
      }

      setProgress(50);

      // 4. Call AI document analysis
      // Generate a UUID for tracking if document record wasn't created
      // (document_id column expects UUID format, not file path)
      const trackingId = docRecord?.id || crypto.randomUUID();

      logger.info('[Dec Page Import] Calling AI analysis with URL:', documentUrl);

      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        'ai-document-analysis-azure',
        {
          body: {
            document_url: documentUrl,
            document_id: trackingId,
            file_name: file.name,
            user_id: user.id,
            analysis_mode: 'parse',
          },
        }
      );

      setProgress(80);

      if (analysisError) {
        logger.error('[Dec Page Import] Analysis error:', analysisError);
        console.error('[Dec Page Import] Full error:', JSON.stringify(analysisError, null, 2));
        throw new Error(`Analysis failed: ${analysisError.message || analysisError.name || 'Unknown error'}`);
      }

      if (!analysisData?.success) {
        logger.error('[Dec Page Import] Analysis failed:', analysisData);
        console.error('[Dec Page Import] Full response:', JSON.stringify(analysisData, null, 2));
        throw new Error(analysisData?.error || analysisData?.message || 'Document analysis failed');
      }

      setProgress(90);

      // 5. Extract and normalize data from analysis
      const analysis = analysisData.analysis || analysisData.data || {};
      const extractedData = analysis.extracted_data || analysis;

      // Helper to extract address from various formats
      const extractAddress = () => {
        // Try property.address first (common in home policies)
        if (extractedData.property?.address) {
          const addr = extractedData.property.address;
          if (typeof addr === 'string') {
            // Parse "123 Main St, City, ST 12345" format
            const parts = addr.split(',').map((s: string) => s.trim());
            if (parts.length >= 3) {
              const stateZip = parts[parts.length - 1].split(' ');
              return {
                street: parts[0],
                city: parts[1],
                state: stateZip[0],
                zip: stateZip[1],
              };
            }
            return { street: addr, city: '', state: '', zip: '' };
          }
        }
        // Try explicit insured_address object
        if (extractedData.insured_address) {
          return {
            street: extractedData.insured_address.street || extractedData.insured_address.address,
            city: extractedData.insured_address.city,
            state: extractedData.insured_address.state,
            zip: extractedData.insured_address.zip || extractedData.insured_address.postal_code,
          };
        }
        // Try flat address fields
        return {
          street: extractedData.address || extractedData.street_address || extractedData.mailing_address,
          city: extractedData.city,
          state: extractedData.state,
          zip: extractedData.zip || extractedData.postal_code || extractedData.zip_code,
        };
      };

      // Helper to extract premium from various formats
      const extractPremium = (): number | undefined => {
        const raw = extractedData.total_premium || extractedData.premium;
        if (!raw) return undefined;
        // If it's already a number, return it
        if (typeof raw === 'number') return raw;
        // If it's an object with total, extract that
        if (typeof raw === 'object' && raw.total) {
          const total = raw.total;
          return typeof total === 'number' ? total : parseFloat(String(total).replace(/[^0-9.]/g, ''));
        }
        // If it's a string, parse it
        if (typeof raw === 'string') {
          return parseFloat(raw.replace(/[^0-9.]/g, ''));
        }
        return undefined;
      };

      // Parse insured information
      const insured: ParsedInsured = {
        first_name: extractedData.insured_first_name ||
                    extractedData.named_insured?.split(' ')[0] ||
                    extractedData.insured_name?.split(' ')[0] || '',
        last_name: extractedData.insured_last_name ||
                   extractedData.named_insured?.split(' ').slice(1).join(' ') ||
                   extractedData.insured_name?.split(' ').slice(1).join(' ') || '',
        full_name: extractedData.named_insured || extractedData.insured_name,
        email: extractedData.email || extractedData.insured_email,
        phone: extractedData.phone || extractedData.insured_phone,
        address: extractAddress(),
      };

      // Parse policy information
      const policy: ParsedPolicy = {
        policy_number: extractedData.policy_number,
        policy_type: extractedData.policy_type || extractedData.document_type || 'unknown',
        carrier: extractedData.carrier || extractedData.insurance_company,
        effective_date: extractedData.effective_date,
        expiration_date: extractedData.expiration_date,
        premium: extractPremium(),
        coverages: extractedData.coverages || [],
      };

      // Parse vehicles if auto policy
      const vehicles: ParsedVehicle[] = (extractedData.vehicles || []).map((v: any) => ({
        year: v.year,
        make: v.make,
        model: v.model,
        vin: v.vin,
      }));

      // Parse drivers
      const drivers: ParsedDriver[] = (extractedData.drivers || []).map((d: any) => ({
        name: d.name || `${d.first_name || ''} ${d.last_name || ''}`.trim(),
        license_number: d.license_number,
        date_of_birth: d.date_of_birth,
      }));

      // Parse property if home policy
      const property: ParsedProperty | undefined = extractedData.property ? {
        address: extractedData.property.address,
        year_built: extractedData.property.year_built,
        square_feet: extractedData.property.square_feet,
        construction_type: extractedData.property.construction_type,
      } : undefined;

      const result: DecPageParseResult = {
        success: true,
        confidence: analysisData.confidence_score || analysis.confidence || 75,
        insured,
        policy,
        vehicles: vehicles.length > 0 ? vehicles : undefined,
        drivers: drivers.length > 0 ? drivers : undefined,
        property,
        raw_text: analysis.raw_text,
        analysis_id: analysisData.analysis_id,
        document_url: documentUrl,
        storage_path: fileName,
        original_filename: file.name,
      };

      setProgress(100);
      setParseResult(result);
      setIsParsing(false);

      toast({
        title: 'Dec page parsed successfully',
        description: `Found: ${insured.full_name || `${insured.first_name} ${insured.last_name}`}`,
      });

      return result;
    } catch (error) {
      setIsUploading(false);
      setIsParsing(false);
      setProgress(0);

      const message = error instanceof Error ? error.message : 'Failed to process dec page';
      toast({
        title: 'Import failed',
        description: message,
        variant: 'destructive',
      });

      throw error;
    }
  };

  // Create lead from parsed data
  const createLeadFromDecPage = useMutation({
    mutationFn: async ({ parseResult, notes, assignedTo }: CreateLeadFromDecPageInput) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Get user's default account
      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const insuranceTypes = mapPolicyTypeToInsuranceType(parseResult.policy.policy_type);

      // Build notes with policy details
      const policyNotes = [
        notes || '',
        '',
        '--- Imported from Dec Page ---',
        parseResult.policy.carrier ? `Current Carrier: ${parseResult.policy.carrier}` : '',
        parseResult.policy.policy_number ? `Policy #: ${parseResult.policy.policy_number}` : '',
        parseResult.policy.effective_date ? `Effective: ${parseResult.policy.effective_date}` : '',
        parseResult.policy.expiration_date ? `Expires: ${parseResult.policy.expiration_date}` : '',
        parseResult.policy.premium ? `Current Premium: $${parseResult.policy.premium}` : '',
        parseResult.vehicles?.length ? `Vehicles: ${parseResult.vehicles.length}` : '',
        parseResult.drivers?.length ? `Drivers: ${parseResult.drivers.length}` : '',
        `Confidence: ${parseResult.confidence}%`,
      ].filter(Boolean).join('\n');

      // Create the lead
      const { data: lead, error } = await supabase
        .from('leads')
        .insert({
          first_name: parseResult.insured.first_name,
          last_name: parseResult.insured.last_name,
          email: parseResult.insured.email || null,
          phone: parseResult.insured.phone || null,
          address_line1: parseResult.insured.address?.street || null,
          city: parseResult.insured.address?.city || null,
          state: parseResult.insured.address?.state || null,
          zip_code: parseResult.insured.address?.zip || null,
          insurance_types: insuranceTypes,
          lead_score: Math.min(parseResult.confidence, 100),
          status: 'new',
          notes: policyNotes,
          assigned_to: assignedTo || null,
          account_id: membership?.account_id || null,
          agency_workspace_id: activeAgency?.agency_workspace_id,
        })
        .select()
        .single();

      if (error) {
        logger.error('[Dec Page Import] Lead creation error:', error);
        throw error;
      }

      // If auto policy with vehicles, create vehicle records
      if (parseResult.vehicles?.length && lead.id) {
        const vehicleInserts = parseResult.vehicles.map((v) => ({
          lead_id: lead.id,
          year: v.year,
          make: v.make,
          model: v.model,
          vin: v.vin,
        }));

        await supabase.from('lead_auto_vehicles').insert(vehicleInserts);
      }

      // If drivers present, create driver records
      if (parseResult.drivers?.length && lead.id) {
        const driverInserts = parseResult.drivers.map((d) => ({
          lead_id: lead.id,
          first_name: d.name?.split(' ')[0] || '',
          last_name: d.name?.split(' ').slice(1).join(' ') || '',
          license_number: d.license_number,
          date_of_birth: d.date_of_birth,
        }));

        await supabase.from('lead_auto_drivers').insert(driverInserts);
      }

      // Link the uploaded document to the lead
      if (parseResult.storage_path && lead.id) {
        // Try to update existing document record
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            related_entity_id: lead.id,
            related_entity_type: 'lead',
            document_type: 'dec_page',
          })
          .eq('storage_path', parseResult.storage_path);

        // If no existing record (RLS blocked original insert), create one with service role isn't available,
        // so we'll try an insert with the lead's account_id which should pass RLS
        if (updateError) {
          logger.info('[Dec Page Import] Creating new document link for lead');
          await supabase.from('documents').insert({
            filename: parseResult.original_filename || 'dec-page.pdf',
            storage_path: parseResult.storage_path,
            kind: 'dec_page',
            document_type: 'dec_page',
            related_entity_id: lead.id,
            related_entity_type: 'lead',
            account_id: membership?.account_id || null,
          });
        }
      }

      return lead;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({
        title: 'Lead created!',
        description: `${lead.first_name} ${lead.last_name} is ready for requoting.`,
      });
      // Reset state
      setParseResult(null);
      setProgress(0);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create lead',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const reset = () => {
    setParseResult(null);
    setProgress(0);
    setIsUploading(false);
    setIsParsing(false);
  };

  return {
    uploadAndParse,
    createLeadFromDecPage,
    parseResult,
    isUploading,
    isParsing,
    progress,
    reset,
  };
}
