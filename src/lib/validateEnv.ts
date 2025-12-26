/**
 * Environment Variable Validation
 *
 * Validates required environment variables at app startup.
 * Provides helpful error messages for missing configuration.
 */

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

// Required variables - app won't work without these
const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

// Optional but recommended - app works but with reduced functionality
const OPTIONAL_ENV_VARS = [
  'VITE_SENTRY_DSN', // Error tracking
  'VITE_APP_VERSION', // Version tracking
] as const;

/**
 * Validate all environment variables
 * Call this early in app initialization (main.tsx)
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const key of REQUIRED_ENV_VARS) {
    const value = import.meta.env[key];
    if (!value || value === 'undefined' || value === 'null') {
      missing.push(key);
    }
  }

  // Check optional variables
  for (const key of OPTIONAL_ENV_VARS) {
    const value = import.meta.env[key];
    if (!value) {
      warnings.push(`${key} not set - some features may be limited`);
    }
  }

  // Validate Supabase URL format
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.includes('supabase.co')) {
    warnings.push('VITE_SUPABASE_URL may be invalid - should contain supabase.co');
  }

  // Validate Supabase key format (should be a JWT)
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseKey && (!supabaseKey.startsWith('eyJ') || supabaseKey.length < 100)) {
    warnings.push('VITE_SUPABASE_ANON_KEY may be invalid - should be a JWT token');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate and throw on missing required variables
 * Use in development to catch configuration issues early
 */
export function assertEnvValid(): void {
  const result = validateEnv();

  if (!result.valid) {
    const errorMessage = [
      'Missing required environment variables:',
      ...result.missing.map((key) => `  - ${key}`),
      '',
      'Please check your .env file or environment configuration.',
      'See CLAUDE.md for required environment variables.',
    ].join('\n');

    if (import.meta.env.DEV) {
      // In development, throw to make the error obvious
      console.error(errorMessage);
      throw new Error(`Environment validation failed: ${result.missing.join(', ')}`);
    } else {
      // In production, log but don't crash (graceful degradation)
      console.error('[ENV]', errorMessage);
    }
  }

  // Log warnings in development
  if (import.meta.env.DEV && result.warnings.length > 0) {
    console.warn('[ENV] Configuration warnings:');
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }
}

/**
 * Get environment variable with type safety
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = import.meta.env[key];
  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return import.meta.env.PROD;
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

/**
 * Get the current environment mode
 */
export function getMode(): string {
  return import.meta.env.MODE;
}
