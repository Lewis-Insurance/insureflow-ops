/**
 * Environment Variable Validation
 *
 * This module validates that all required environment variables are present
 * at application startup to prevent runtime errors.
 */

interface EnvConfig {
  // Supabase (Required)
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseProjectId: string;

  // Feature Flags
  enableSignup: boolean;
  requireMFA: boolean;
  requirePhone: boolean;
  minPasswordLength: number;

  // Debug Settings
  debugMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config: EnvConfig | null;
}

/**
 * Validates required environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required variables
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const supabaseProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  if (!supabaseUrl) {
    errors.push('VITE_SUPABASE_URL is required');
  }
  if (!supabasePublishableKey) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is required');
  }
  if (!supabaseProjectId) {
    errors.push('VITE_SUPABASE_PROJECT_ID is required');
  }

  // Validate URL format
  if (supabaseUrl && !isValidUrl(supabaseUrl)) {
    errors.push('VITE_SUPABASE_URL must be a valid URL');
  }

  // Parse feature flags with safe defaults
  const enableSignup = parseBooleanEnv(import.meta.env.VITE_ENABLE_SIGNUP, false);
  const requireMFA = parseBooleanEnv(import.meta.env.VITE_REQUIRE_MFA, false);
  const requirePhone = parseBooleanEnv(import.meta.env.VITE_REQUIRE_PHONE, false);
  const minPasswordLength = parseIntEnv(import.meta.env.VITE_MIN_PW_LEN, 8);

  // Validate password length
  if (minPasswordLength < 6) {
    warnings.push('VITE_MIN_PW_LEN is less than 6, which is insecure. Defaulting to 8.');
  }
  if (minPasswordLength > 128) {
    warnings.push('VITE_MIN_PW_LEN is greater than 128, which may cause issues. Defaulting to 128.');
  }

  // Debug settings
  const debugMode = parseBooleanEnv(import.meta.env.VITE_DEBUG_MODE, false);
  const logLevel = parseLogLevel(import.meta.env.VITE_LOG_LEVEL);

  // Production warnings
  if (import.meta.env.PROD) {
    if (debugMode) {
      warnings.push('Debug mode is enabled in production. Consider disabling it.');
    }
    if (enableSignup) {
      warnings.push('User signup is enabled in production. Ensure this is intentional.');
    }
    if (logLevel === 'debug') {
      warnings.push('Log level is set to "debug" in production. Consider using "error" or "warn".');
    }
  }

  const config: EnvConfig = {
    supabaseUrl: supabaseUrl || '',
    supabasePublishableKey: supabasePublishableKey || '',
    supabaseProjectId: supabaseProjectId || '',
    enableSignup,
    requireMFA,
    requirePhone,
    minPasswordLength: Math.min(Math.max(minPasswordLength, 6), 128),
    debugMode,
    logLevel,
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    config: errors.length === 0 ? config : null,
  };
}

/**
 * Parse boolean environment variable
 */
function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer environment variable
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse log level with fallback
 */
function parseLogLevel(value: string | undefined): 'debug' | 'info' | 'warn' | 'error' {
  const validLevels = ['debug', 'info', 'warn', 'error'];
  const level = value?.toLowerCase();

  if (level && validLevels.includes(level)) {
    return level as 'debug' | 'info' | 'warn' | 'error';
  }

  // Default to error in production, debug in development
  return import.meta.env.PROD ? 'error' : 'debug';
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Log validation results to console
 */
export function logValidationResults(result: ValidationResult): void {
  if (result.errors.length > 0) {
    console.error('❌ Environment validation failed:');
    result.errors.forEach(error => console.error(`  - ${error}`));
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    result.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  if (result.isValid) {
    console.log('✅ Environment validation passed');
    if (import.meta.env.DEV && result.config) {
      console.log('Environment configuration:', {
        environment: import.meta.env.MODE,
        supabaseProjectId: result.config.supabaseProjectId,
        enableSignup: result.config.enableSignup,
        requireMFA: result.config.requireMFA,
        minPasswordLength: result.config.minPasswordLength,
        debugMode: result.config.debugMode,
        logLevel: result.config.logLevel,
      });
    }
  }
}

/**
 * Initialize and validate environment on app startup
 * Throws error if validation fails in production
 */
export function initializeEnvironment(): EnvConfig {
  const result = validateEnvironment();

  logValidationResults(result);

  // In production, throw error if validation fails
  if (!result.isValid && import.meta.env.PROD) {
    throw new Error(
      'Environment validation failed. Please check your environment variables:\n' +
      result.errors.join('\n')
    );
  }

  // In development, show error overlay but don't crash
  if (!result.isValid && import.meta.env.DEV) {
    console.error('Environment validation failed. The app may not function correctly.');
  }

  return result.config!;
}

// Export the config type for use in other files
export type { EnvConfig };
