/**
 * Improved type definitions to replace 'any' usage
 */

// Generic API Response Types
export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T = unknown> {
  data: T;
  error: null;
}

export interface ApiFailure {
  data: null;
  error: ApiError;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;

// Audit and Activity Types
export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  entity_type?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
  occurred_at: string;
}

// Form and Validation Types
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Import and Export Types
export interface ImportRow {
  id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  mapped_data?: Record<string, unknown>;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_errors: string[];
}

export interface ExportRequest {
  id: string;
  user_id: string;
  request_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  export_url?: string;
  created_at: string;
  completed_at?: string;
}

// Device and Session Types
export interface DeviceInfo {
  browser?: string;
  os?: string;
  device?: string;
  [key: string]: unknown;
}

export interface LocationData {
  country?: string;
  region?: string;
  city?: string;
  [key: string]: unknown;
}

// Enhanced error handling types
export interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Metadata types for flexible data storage
export interface EntityMetadata {
  [key: string]: string | number | boolean | null;
}

// Changed field tracking for audit logs
export interface FieldChange {
  old: unknown;
  new: unknown;
}

export interface ChangedFields {
  [fieldName: string]: FieldChange;
}