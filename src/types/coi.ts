// Types for Certificate of Insurance metadata in tickets
export interface TicketCOIMetadata {
  coi_generated: boolean;
  coi_url: string;
  coi_number: string;
  coi_generated_at: string;
  coi_version?: number;
  coi_generated_by?: string | null;
  [key: string]: any; // Index signature for Supabase Json compatibility
}

export interface TicketWithCOI {
  id: string;
  metadata: TicketCOIMetadata;
  [key: string]: any;
}

// Progress tracking for COI generation
export interface GenerationProgress {
  step: 'generating' | 'uploading' | 'updating' | 'completed';
  percentage: number;
  message: string;
}

// Type guard to check if ticket has COI metadata
export function hasCoiMetadata(metadata: any): metadata is TicketCOIMetadata {
  return (
    metadata &&
    typeof metadata === 'object' &&
    'coi_generated' in metadata &&
    'coi_url' in metadata &&
    'coi_number' in metadata
  );
}
