/**
 * Environment Variable Validator
 *
 * Provides utilities for validating required environment variables
 * in Supabase Edge Functions. Follows "fail closed" security principle.
 */

/**
 * Gets an environment variable or throws if not set.
 * Use this for REQUIRED environment variables.
 *
 * @param name - The name of the environment variable
 * @param description - Optional description for error messages
 * @returns The environment variable value
 * @throws Error if the variable is not set
 */
export function requireEnv(name: string, description?: string): string {
  const value = Deno.env.get(name);
  if (!value || value.trim() === '') {
    const desc = description ? ` (${description})` : '';
    throw new Error(`Missing required environment variable: ${name}${desc}`);
  }
  return value;
}

/**
 * Gets an environment variable or returns a default value.
 * Use this for OPTIONAL environment variables with sensible defaults.
 *
 * @param name - The name of the environment variable
 * @param defaultValue - The default value if not set
 * @returns The environment variable value or the default
 */
export function getEnvOrDefault(name: string, defaultValue: string): string {
  const value = Deno.env.get(name);
  return value && value.trim() !== '' ? value : defaultValue;
}

/**
 * Validates multiple environment variables at once.
 * Returns an object with all values or throws with a comprehensive error.
 *
 * @param specs - Object mapping variable names to their descriptions
 * @returns Object with all environment variable values
 * @throws Error listing all missing variables
 */
export function validateEnvVars<T extends Record<string, string>>(
  specs: T
): Record<keyof T, string> {
  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const [name, description] of Object.entries(specs)) {
    const value = Deno.env.get(name);
    if (!value || value.trim() === '') {
      missing.push(`${name} (${description})`);
    } else {
      values[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(m => `  - ${m}`).join('\n')}`
    );
  }

  return values as Record<keyof T, string>;
}

/**
 * Creates a validated error response for missing configuration.
 * Returns a Response object that can be directly returned from the handler.
 *
 * @param error - The error to wrap
 * @param corsHeaders - CORS headers to include
 * @returns A Response object with 500 status
 */
export function configErrorResponse(
  error: Error,
  corsHeaders: Record<string, string>
): Response {
  console.error('Configuration error:', error.message);

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Server configuration error',
      // Only include details in development
      ...(Deno.env.get('ENVIRONMENT') !== 'production' && { details: error.message }),
    }),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Common environment variable sets for different types of functions.
 * Use these as starting points for validation.
 */
export const CommonEnvSpecs = {
  supabase: {
    SUPABASE_URL: 'Supabase project URL',
    SUPABASE_SERVICE_ROLE_KEY: 'Supabase service role key',
  },
  azure: {
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'Azure Document Intelligence endpoint',
    AZURE_DOCUMENT_INTELLIGENCE_KEY: 'Azure Document Intelligence API key',
  },
  twilio: {
    TWILIO_ACCOUNT_SID: 'Twilio account SID',
    TWILIO_AUTH_TOKEN: 'Twilio auth token',
    TWILIO_PHONE_NUMBER: 'Twilio phone number',
  },
  email: {
    RESEND_API_KEY: 'Resend API key for email sending',
  },
  ai: {
    // OpenAI is the default AI provider (set AI_PROVIDER=openai)
    OPENAI_API_KEY: 'OpenAI API key for AI features',
  },
  aiAnthropic: {
    // Alternative: Anthropic Claude (set AI_PROVIDER=anthropic)
    ANTHROPIC_API_KEY: 'Anthropic API key for Claude',
  },
  aiGemini: {
    // Alternative: Google Gemini (set AI_PROVIDER=gemini)
    GOOGLE_AI_API_KEY: 'Google AI API key for Gemini',
  },
} as const;
