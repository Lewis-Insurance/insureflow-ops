import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const AI_SURFACE_FILES = [
  'src/components/ai/AIResultsActionBar.tsx',
  'src/components/customers/AICustomerActions.tsx',
  'src/components/quotes/AIQuoteAssistant.tsx',
  'src/hooks/useAIEmailComposer.ts',
  'src/hooks/useEmailComposer.ts',
];

function walkTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return walkTsFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function relative(path: string): string {
  return path.slice(repoRoot.length + 1).split(/[\\/]/).join('/');
}

function containsClientSendInvoke(source: string): boolean {
  return [
    "functions.invoke('send-sms'",
    'functions.invoke("send-sms"',
    "functions.invoke('email-send'",
    'functions.invoke("email-send"',
  ].some((needle) => source.includes(needle));
}

describe('no AI-result direct client send paths', () => {
  it('keeps known AI UI surfaces from invoking client-send functions or minting approval markers directly', () => {
    const forbidden = [
      "functions.invoke('send-sms'",
      'functions.invoke("send-sms"',
      "functions.invoke('email-send'",
      'functions.invoke("email-send"',
      "createClientSendApproval('send-sms'",
      'createClientSendApproval("send-sms"',
      "createClientSendApproval('email-send'",
      'createClientSendApproval("email-send"',
    ];

    for (const relPath of AI_SURFACE_FILES) {
      const source = readFileSync(resolve(repoRoot, relPath), 'utf8');
      for (const needle of forbidden) {
        expect(source, `${relPath} must not contain ${needle}`).not.toContain(needle);
      }
    }
  });

  it('removes the legacy AIResultsActionBar SMS dialog and presents send actions as gated only', () => {
    const source = readFileSync(resolve(repoRoot, 'src/components/ai/AIResultsActionBar.tsx'), 'utf8');

    expect(source).toContain('SMS gated by Floor');
    expect(source).toContain('Email gated by Floor');
    expect(source).toContain('AI_RESULTS_SMS_DISABLED_REASON');
    expect(source).toContain('AI_RESULTS_EMAIL_DISABLED_REASON');
    expect(source).not.toContain('Send SMS Dialog');
    expect(source).not.toContain('setShowSMSDialog(true)');
    expect(source).not.toContain('smsPhoneNumber');
    expect(source).not.toContain('smsMessage');
    expect(source).not.toContain('handleSendSMS');
  });

  it('allows human send surfaces to use approvals while keeping AI surfaces out of those sends', () => {
    const allSrcFiles = walkTsFiles(resolve(repoRoot, 'src')).filter(
      (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'),
    );
    const clientSendCallers = allSrcFiles
      .map((file) => ({ file: relative(file), source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => containsClientSendInvoke(source))
      .map(({ file }) => file)
      .sort();

    expect(clientSendCallers).toEqual([
      'src/components/communications/SMSComposerModal.tsx',
      'src/hooks/useSMSMessages.ts',
    ]);

    for (const relPath of clientSendCallers) {
      const source = readFileSync(resolve(repoRoot, relPath), 'utf8');
      expect(source).toContain('createClientSendApproval');
      expect(source).toContain('client_send_approval');
    }
  });
});
