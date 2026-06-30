import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { redactPII } from '../../supabase/functions/_shared/floorSafety.ts';
import { redactModelBoundaryText } from '../../supabase/functions/_shared/ai-client.ts';
import {
  isModelBoundaryUrl,
  redactRequestInitForModelBoundary,
} from '../../supabase/functions/_shared/modelBoundaryFetch.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const rawPiiFixture = [
  'SSN: 123-45-6789',
  'DOB: 01/02/1980',
  "Driver's License: D1234567",
  'Account number: 9876543210',
  'VIN: 1HGCM82633A004352',
  'Policy number: AUTO-123456789',
].join('\n');

const rawNeedles = [
  '123-45-6789',
  '01/02/1980',
  'D1234567',
  '9876543210',
  '1HGCM82633A004352',
  'AUTO-123456789',
];

const nestedRawNeedles = [
  ...rawNeedles,
  'https://lrqajzwcmdwahnjyidgv.supabase.co/storage/v1/object/sign/documents/private/acord.pdf?token=abc123',
  'documents/private/acord.pdf',
  '550e8400-e29b-41d4-a716-446655440000',
];

const modelProviderPatterns = [
  /api\.openai\.com\/v1\/(?:chat\/completions|embeddings)/,
  /api\.anthropic\.com\/v1\/messages/,
  /generativelanguage\.googleapis\.com\/v1beta\/models\/[^\s`'"]+:generateContent/,
  /\/openai\/deployments\/[^\s`'"]+\/(?:chat\/completions|embeddings)|AZURE_OPENAI/,
];

const rawFetchPattern = /(?<![\w.])fetch\s*\(/;
const sharedClientProviderChokepoints = new Set(['supabase/functions/_shared/ai-client.ts']);

function readTypeScriptFiles(dir: string): Array<{ path: string; source: string }> {
  const entries = readdirSync(dir);
  const files: Array<{ path: string; source: string }> = [];

  for (const entry of entries) {
    const absolutePath = resolve(dir, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...readTypeScriptFiles(absolutePath));
      continue;
    }

    if (entry.endsWith('.ts')) {
      files.push({
        path: absolutePath.slice(repoRoot.length + 1),
        source: readFileSync(absolutePath, 'utf8'),
      });
    }
  }

  return files;
}

describe('PII redaction at model boundaries', () => {
  it('redacts SSN, DOB, DLN, account, VIN, and full policy numbers', () => {
    const { redacted, redactions } = redactPII(rawPiiFixture);

    for (const raw of rawNeedles) {
      expect(redacted).not.toContain(raw);
    }

    expect(redactions.map((item) => item.type)).toEqual(expect.arrayContaining([
      'ssn',
      'dob_or_dln_label',
      'account_number',
      'vin',
      'policy_number',
    ]));
  });

  it('redacts text through the shared AI model-boundary helper', () => {
    const redacted = redactModelBoundaryText(rawPiiFixture, 'unit-test');

    for (const raw of rawNeedles) {
      expect(redacted).not.toContain(raw);
    }
  });

  it('redacts nested model request bodies through the model-boundary fetch wrapper', () => {
    const modelBoundaryUrls = [
      'https://api.openai.com/v1/chat/completions',
      'https://api.openai.com/v1/embeddings',
      'https://api.anthropic.com/v1/messages',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=test',
      'https://example.openai.azure.com/openai/deployments/chat/chat/completions?api-version=2024-02-15-preview',
      'https://example.openai.azure.com/openai/deployments/embed/embeddings?api-version=2024-02-15-preview',
    ];

    const body = {
      messages: [{ role: 'user', content: rawPiiFixture }],
      input: [
        `Nested text ${rawPiiFixture}`,
        {
          signedUrl:
            'https://lrqajzwcmdwahnjyidgv.supabase.co/storage/v1/object/sign/documents/private/acord.pdf?token=abc123',
          storagePath: 'documents/private/acord.pdf',
          rawRef: '550e8400-e29b-41d4-a716-446655440000',
        },
      ],
    };

    for (const url of modelBoundaryUrls) {
      expect(isModelBoundaryUrl(url)).toBe(true);

      const redactedInit = redactRequestInitForModelBoundary(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const serialized = String(redactedInit?.body);

      for (const raw of nestedRawNeedles) {
        expect(serialized).not.toContain(raw);
      }
    }
  });

  it('routes shared chat and embedding calls through redaction before provider fetches', () => {
    const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/ai-client.ts'), 'utf8');

    expect(source).toContain("import { redactPII }");
    expect(source).toContain('redactChatMessages(messages)');
    expect(source).toContain('redactModelBoundaryText(text,');
    expect(source).toContain('redactModelBoundaryText(inputText,');
  });

  it('routes direct model-provider fetches outside the shared AI client through modelBoundaryFetch', () => {
    const providerFiles = readTypeScriptFiles(resolve(repoRoot, 'supabase/functions')).filter(({ source }) =>
      modelProviderPatterns.some((pattern) => pattern.test(source)),
    );

    const rawFetchOffenders = providerFiles
      .filter(({ path }) => !sharedClientProviderChokepoints.has(path))
      .filter(({ source }) => rawFetchPattern.test(source))
      .map(({ path }) => path);

    const missingWrapperOffenders = providerFiles
      .filter(({ path }) => !sharedClientProviderChokepoints.has(path))
      .filter(({ source }) => !source.includes('modelBoundaryFetch('))
      .map(({ path }) => path);

    expect(rawFetchOffenders).toEqual([]);
    expect(missingWrapperOffenders).toEqual([]);
  });

  it('keeps critical direct AI functions redacted before model calls', () => {
    const executeSource = readFileSync(resolve(repoRoot, 'supabase/functions/execute-ai-module/index.ts'), 'utf8');
    const brainSource = readFileSync(resolve(repoRoot, 'supabase/functions/ai-brain-rag/index.ts'), 'utf8');
    const documentAnalysisSource = readFileSync(resolve(repoRoot, 'supabase/functions/ai-document-analysis/index.ts'), 'utf8');

    expect(executeSource).toContain("import { redactPII }");
    expect(executeSource).toContain('redactPII(text.substring(0, 80000))');
    expect(executeSource).toContain('redactPII(input_text).redacted');

    expect(brainSource).toContain("generateText(query, systemPrompt)");
    expect(brainSource).toContain('generateEmbedding(query)');

    expect(documentAnalysisSource).toContain("import { redactPII }");
    expect(documentAnalysisSource).toContain('const redactedMessages = redactModelMessagesForAI(messages);');
    expect(documentAnalysisSource).toContain('messages: redactedMessages');
  });

  it('redacts execute-ai-module system prompts before Azure chat messages', () => {
    const executeSource = readFileSync(resolve(repoRoot, 'supabase/functions/execute-ai-module/index.ts'), 'utf8');
    const redactedSystemPrompt = "const systemPrompt = redactPII(String(module.system_prompt ?? '')).redacted;";
    const azureSystemMessage = "{ role: 'system', content: systemPrompt }";

    expect(executeSource).toContain(redactedSystemPrompt);
    expect(executeSource.indexOf(azureSystemMessage)).toBeGreaterThan(executeSource.indexOf(redactedSystemPrompt));
  });

  it('does not interpolate raw document names into ai-document-analysis model context', () => {
    const documentAnalysisSource = readFileSync(resolve(repoRoot, 'supabase/functions/ai-document-analysis/index.ts'), 'utf8');

    expect(documentAnalysisSource).not.toMatch(/return `Document \$\{idx \+ 1\}[^`]*\$\{doc\.name\}[^`]*`;/);
    expect(documentAnalysisSource).toContain("return `Document ${idx + 1}:${warningText}\\n${doc.content || '[No content]'}`;");
  });
});
