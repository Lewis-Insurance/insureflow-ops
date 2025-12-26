/**
 * AI Client - Multi-provider AI integration
 *
 * Supports:
 * - Google Gemini (default, free tier available)
 * - OpenAI
 * - Anthropic Claude
 *
 * Configure via environment variables:
 * - AI_PROVIDER: 'gemini' | 'openai' | 'anthropic' (default: 'gemini')
 * - GOOGLE_AI_API_KEY: For Gemini
 * - OPENAI_API_KEY: For OpenAI
 * - ANTHROPIC_API_KEY: For Anthropic
 */

export type AIProvider = 'gemini' | 'openai' | 'anthropic';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface AIResponse {
  content: string | null;
  tool_calls?: ToolCall[];
  finish_reason?: string;
}

export interface AIClientOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Get the configured AI provider
 */
export function getAIProvider(): AIProvider {
  const provider = Deno.env.get('AI_PROVIDER')?.toLowerCase();
  if (provider === 'openai' || provider === 'anthropic' || provider === 'gemini') {
    return provider;
  }
  return 'gemini'; // Default to Gemini (has free tier)
}

/**
 * Get the API key for the current provider
 */
export function getAIApiKey(provider?: AIProvider): string {
  const p = provider || getAIProvider();

  switch (p) {
    case 'gemini':
      const geminiKey = Deno.env.get('GOOGLE_AI_API_KEY');
      if (!geminiKey) throw new Error('Missing GOOGLE_AI_API_KEY environment variable');
      return geminiKey;
    case 'openai':
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) throw new Error('Missing OPENAI_API_KEY environment variable');
      return openaiKey;
    case 'anthropic':
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) throw new Error('Missing ANTHROPIC_API_KEY environment variable');
      return anthropicKey;
    default:
      throw new Error(`Unknown AI provider: ${p}`);
  }
}

/**
 * Get the default model for the provider
 */
export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-1.5-flash';
    case 'openai':
      return 'gpt-5-mini'; // Updated to GPT-5-mini (released August 2025)
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    default:
      return 'gpt-5-mini';
  }
}

/**
 * Call Gemini API
 */
async function callGemini(
  apiKey: string,
  messages: ChatMessage[],
  tools?: Tool[],
  options?: AIClientOptions
): Promise<AIResponse> {
  const model = options?.model || 'gemini-1.5-flash';

  // Convert messages to Gemini format
  const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  // Build request body
  const body: any = {
    contents,
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 4096,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    body.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate) {
    throw new Error('No response from Gemini');
  }

  const content = candidate.content?.parts?.[0];

  // Check for function calls
  if (content?.functionCall) {
    return {
      content: null,
      tool_calls: [{
        id: `call_${Date.now()}`,
        type: 'function',
        function: {
          name: content.functionCall.name,
          arguments: JSON.stringify(content.functionCall.args),
        },
      }],
      finish_reason: 'tool_calls',
    };
  }

  return {
    content: content?.text || '',
    finish_reason: candidate.finishReason,
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  tools?: Tool[],
  options?: AIClientOptions
): Promise<AIResponse> {
  const model = options?.model || 'gpt-5-mini';

  const body: any = {
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
      ...(m.name && { name: m.name }),
    })),
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error('No response from OpenAI');
  }

  return {
    content: choice.message?.content || null,
    tool_calls: choice.message?.tool_calls,
    finish_reason: choice.finish_reason,
  };
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  apiKey: string,
  messages: ChatMessage[],
  tools?: Tool[],
  options?: AIClientOptions
): Promise<AIResponse> {
  const model = options?.model || 'claude-3-haiku-20240307';

  // Extract system message
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  const body: any = {
    model,
    max_tokens: options?.maxTokens ?? 4096,
    messages: chatMessages,
  };

  if (systemMessage) {
    body.system = systemMessage;
  }

  // Convert tools to Anthropic format
  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', response.status, errorText);
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Check for tool use
  const toolUseBlock = data.content?.find((c: any) => c.type === 'tool_use');
  if (toolUseBlock) {
    return {
      content: null,
      tool_calls: [{
        id: toolUseBlock.id,
        type: 'function',
        function: {
          name: toolUseBlock.name,
          arguments: JSON.stringify(toolUseBlock.input),
        },
      }],
      finish_reason: 'tool_use',
    };
  }

  const textBlock = data.content?.find((c: any) => c.type === 'text');
  return {
    content: textBlock?.text || '',
    finish_reason: data.stop_reason,
  };
}

/**
 * Main AI chat function - routes to appropriate provider
 */
export async function chatCompletion(
  messages: ChatMessage[],
  tools?: Tool[],
  options?: AIClientOptions
): Promise<AIResponse> {
  const provider = getAIProvider();
  const apiKey = getAIApiKey(provider);

  console.log(`Using AI provider: ${provider}`);

  switch (provider) {
    case 'gemini':
      return callGemini(apiKey, messages, tools, options);
    case 'openai':
      return callOpenAI(apiKey, messages, tools, options);
    case 'anthropic':
      return callAnthropic(apiKey, messages, tools, options);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Simple text completion without tools
 */
export async function generateText(
  prompt: string,
  systemPrompt?: string,
  options?: AIClientOptions
): Promise<string> {
  const messages: ChatMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await chatCompletion(messages, undefined, options);
  return response.content || '';
}

/**
 * JSON completion - requests structured JSON output
 */
export async function generateJSON<T = any>(
  prompt: string,
  systemPrompt?: string,
  options?: AIClientOptions
): Promise<T> {
  const jsonSystemPrompt = `${systemPrompt || ''}\n\nYou must respond with valid JSON only. No markdown, no explanation, just the JSON object.`.trim();

  const result = await generateText(prompt, jsonSystemPrompt, options);

  // Try to extract JSON from response
  let jsonStr = result.trim();

  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }

  return JSON.parse(jsonStr.trim());
}

/**
 * Generate embeddings for text
 * Uses OpenAI's text-embedding-3-small model (works regardless of chat provider)
 */
export async function generateEmbedding(
  text: string,
  model: string = 'text-embedding-3-small'
): Promise<number[]> {
  // Embeddings always use OpenAI (best quality/cost ratio)
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable (required for embeddings)');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI Embeddings API error:', response.status, errorText);
    throw new Error(`Embeddings API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  model: string = 'text-embedding-3-small'
): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable (required for embeddings)');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI Embeddings API error:', response.status, errorText);
    throw new Error(`Embeddings API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.data.map((d: any) => d.embedding);
}
