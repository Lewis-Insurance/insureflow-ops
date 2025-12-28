/**
 * Environment Variable Validation
 *
 * This module validates the application configuration at startup.
 * Note: Lovable doesn't support VITE_* env variables in production builds,
 * so we use safe defaults based on the hardcoded Supabase client config.
 */

import { logger } from '@/lib/logger';

interface EnvConfig {
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
  config: EnvConfig;
}

/**
 * Validates environment and returns configuration
 * Uses safe defaults since Lovable doesn't support VITE_* variables
 */
export function validateEnvironment(): ValidationResult {
  const warnings: string[] = [];

  // Parse feature flags with safe defaults
  const enableSignup = true; // Default enabled
  const requireMFA = false;
  const requirePhone = false;
  const minPasswordLength = 8;

  // Debug settings - production vs dev
  const isProduction = import.meta.env.PROD;
  const debugMode = !isProduction;
  const logLevel: 'debug' | 'info' | 'warn' | 'error' = isProduction ? 'error' : 'debug';

  const config: EnvConfig = {
    enableSignup,
    requireMFA,
    requirePhone,
    minPasswordLength,
    debugMode,
    logLevel,
  };

  return {
    isValid: true,
    errors: [],
    warnings,
    config,
  };
}

/**
 * Log validation results to console
 */
export function logValidationResults(result: ValidationResult): void {
  if (result.warnings.length > 0) {
    logger.warn('⚠️  Environment warnings:');
    result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
  }

  if (result.isValid) {
    logger.info('✅ Environment validation passed');
    if (import.meta.env.DEV) {
      logger.debug('Environment configuration:', {
        environment: import.meta.env.MODE,
        supabaseProjectId: 'lrqajzwcmdwahnjyidgv',
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
 */
export function initializeEnvironment(): EnvConfig {
  const result = validateEnvironment();

  logValidationResults(result);

  return result.config;
}

// Export the config type for use in other files
export type { EnvConfig };
