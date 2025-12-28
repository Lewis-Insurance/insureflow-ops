/**
 * Client Context Builder Service
 * 
 * Aggregates all client data from the database and formats it
 * into AI-friendly context for Prism AI analysis
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type {
  ClientContext,
  ClientRawData,
  ClientDataSummary,
  AccountData,
  ContactData,
  PolicyData,
  ClaimData,
  DocumentData,
  TaskData,
  CallData,
  MessageData,
  EventData,
  QuoteData,
} from '@/types/client-intelligence';
import {
  formatAccount,
  formatContacts,
  formatPolicies,
  formatClaims,
  formatDocuments,
  formatTasks,
  formatCommunications,
  formatQuotes,
} from './contextFormatters';

// Maximum context length in characters (~25K tokens at 4 chars/token)
const MAX_CONTEXT_LENGTH = 100000;

// Token estimate: roughly 4 characters per token
const CHARS_PER_TOKEN = 4;

// =============================================================================
// MAIN CONTEXT BUILDER CLASS
// =============================================================================

export class ClientContextBuilder {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Build complete client context for AI analysis
   */
  async buildContext(options?: {
    includeDocumentText?: boolean;
    maxDocuments?: number;
  }): Promise<ClientContext> {
    const startTime = Date.now();
    const includeDocumentText = options?.includeDocumentText ?? true;
    const maxDocuments = options?.maxDocuments ?? 20;

    // Fetch all raw data in parallel
    const rawData = await this.fetchAllData();

    if (!rawData.account) {
      throw new Error(`Account not found: ${this.accountId}`);
    }

    // Format each section
    const sections: string[] = [];

    // Header
    sections.push(this.buildHeader(rawData.account));

    // Account profile
    sections.push(formatAccount(rawData.account));

    // Contacts
    sections.push(formatContacts(rawData.contacts));

    // Policies
    sections.push(formatPolicies(rawData.policies));

    // Claims
    sections.push(formatClaims(rawData.claims));

    // Documents (with optional text extraction)
    const limitedDocs = rawData.documents.slice(0, maxDocuments);
    sections.push(formatDocuments(limitedDocs, includeDocumentText));

    // Tasks
    sections.push(formatTasks(rawData.tasks));

    // Communications
    sections.push(formatCommunications(
      rawData.calls,
      rawData.messages,
      rawData.events
    ));

    // Quotes
    sections.push(formatQuotes(rawData.quotes));

    // Combine all sections
    let formattedContext = sections.join('\n---\n\n');

    // Truncate if needed
    if (formattedContext.length > MAX_CONTEXT_LENGTH) {
      formattedContext = this.smartTruncate(formattedContext, MAX_CONTEXT_LENGTH);
    }

    // Calculate summary
    const dataSummary = this.calculateSummary(rawData);

    const buildTime = Date.now() - startTime;

    return {
      accountId: this.accountId,
      accountName: rawData.account.name,
      formattedContext,
      tokenEstimate: Math.ceil(formattedContext.length / CHARS_PER_TOKEN),
      dataSummary,
      buildTime,
    };
  }

  // ===========================================================================
  // DATA FETCHING
  // ===========================================================================

  private async fetchAllData(): Promise<ClientRawData> {
    const [
      accountResult,
      contactsResult,
      policiesResult,
      claimsResult,
      documentsResult,
      tasksResult,
      callsResult,
      messagesResult,
      eventsResult,
      quotesResult,
    ] = await Promise.allSettled([
      this.fetchAccount(),
      this.fetchContacts(),
      this.fetchPolicies(),
      this.fetchClaims(),
      this.fetchDocuments(),
      this.fetchTasks(),
      this.fetchCalls(),
      this.fetchMessages(),
      this.fetchEvents(),
      this.fetchQuotes(),
    ]);

    return {
      account: accountResult.status === 'fulfilled' ? accountResult.value : null,
      contacts: contactsResult.status === 'fulfilled' ? contactsResult.value : [],
      policies: policiesResult.status === 'fulfilled' ? policiesResult.value : [],
      claims: claimsResult.status === 'fulfilled' ? claimsResult.value : [],
      documents: documentsResult.status === 'fulfilled' ? documentsResult.value : [],
      tasks: tasksResult.status === 'fulfilled' ? tasksResult.value : [],
      calls: callsResult.status === 'fulfilled' ? callsResult.value : [],
      messages: messagesResult.status === 'fulfilled' ? messagesResult.value : [],
      events: eventsResult.status === 'fulfilled' ? eventsResult.value : [],
      quotes: quotesResult.status === 'fulfilled' ? quotesResult.value : [],
    };
  }

  private async fetchAccount(): Promise<AccountData | null> {
    const { data, error } = await supabase
      .from('accounts')
      .select(`
        id,
        name,
        account_type,
        account_status,
        phone,
        email,
        address_line1,
        address_line2,
        city,
        state,
        zip_code,
        notes,
        source,
        lead_source_detail,
        custom,
        created_at,
        updated_at,
        tags:account_tags(
          tag:tags(id, name, color)
        )
      `)
      .eq('id', this.accountId)
      .is('deleted_at', null)
      .single();

    if (error) {
      logger.error('Error fetching account:', error);
      return null;
    }

    // Flatten tags
    const tags = (data as any)?.tags?.map((t: any) => t.tag).filter(Boolean) || [];

    return {
      ...data,
      tags,
    } as AccountData;
  }

  private async fetchContacts(): Promise<ContactData[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        role,
        is_primary,
        created_at
      `)
      .eq('account_id', this.accountId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching contacts:', error);
      return [];
    }

    return data as ContactData[];
  }

  private async fetchPolicies(): Promise<PolicyData[]> {
    const { data, error } = await supabase
      .from('policies')
      .select(`
        id,
        policy_number,
        line_of_business,
        carrier,
        carrier_info:carriers!policies_carrier_id_fkey(id, name),
        mga_info:mgas!policies_mga_id_fkey(id, name, code),
        effective_date,
        expiration_date,
        premium,
        status,
        coverage_summary,
        notes,
        created_at,
        updated_at
      `)
      .eq('account_id', this.accountId)
      .is('deleted_at', null)
      .order('expiration_date', { ascending: false });

    if (error) {
      logger.error('Error fetching policies:', error);
      return [];
    }

    return data as PolicyData[];
  }

  private async fetchClaims(): Promise<ClaimData[]> {
    // First get policy IDs for this account
    const { data: policies } = await supabase
      .from('policies')
      .select('id')
      .eq('account_id', this.accountId);

    if (!policies || policies.length === 0) {
      return [];
    }

    const policyIds = policies.map(p => p.id);

    const { data, error } = await supabase
      .from('claims')
      .select(`
        id,
        claim_number,
        policy_id,
        description,
        type_of_loss,
        loss_date,
        date_of_loss,
        reported_at,
        status,
        amount_claimed,
        amount_estimate,
        amount_paid,
        adjuster_name,
        adjuster_contact,
        notes,
        settlement_date,
        created_at,
        policy:policies!inner(
          policy_number,
          line_of_business,
          carrier:carriers(name)
        )
      `)
      .in('policy_id', policyIds)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching claims:', error);
      return [];
    }

    return data as ClaimData[];
  }

  private async fetchDocuments(): Promise<DocumentData[]> {
    const { data, error } = await supabase
      .from('documents')
      .select(`
        id,
        file_name,
        document_type,
        category,
        extracted_text,
        created_at,
        file_size
      `)
      .eq('account_id', this.accountId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Error fetching documents:', error);
      return [];
    }

    return data as DocumentData[];
  }

  private async fetchTasks(): Promise<TaskData[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        completed_at,
        created_at,
        assigned_to
      `)
      .eq('entity_id', this.accountId)
      .eq('entity_type', 'account')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('Error fetching tasks:', error);
      return [];
    }

    return data as TaskData[];
  }

  private async fetchCalls(): Promise<CallData[]> {
    const { data, error } = await supabase
      .from('call_sessions')
      .select(`
        id,
        direction,
        status,
        duration,
        notes,
        started_at,
        ended_at,
        created_at
      `)
      .eq('account_id', this.accountId)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Error fetching calls:', error);
      return [];
    }

    return data as CallData[];
  }

  private async fetchMessages(): Promise<MessageData[]> {
    const { data, error } = await supabase
      .from('sms_messages')
      .select(`
        id,
        direction,
        body,
        status,
        created_at
      `)
      .eq('account_id', this.accountId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Error fetching messages:', error);
      return [];
    }

    return data as MessageData[];
  }

  private async fetchEvents(): Promise<EventData[]> {
    const { data, error } = await supabase
      .from('events')
      .select(`
        id,
        event_type,
        title,
        description,
        occurred_at,
        created_at
      `)
      .eq('entity_id', this.accountId)
      .eq('entity_type', 'account')
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('Error fetching events:', error);
      return [];
    }

    return data as EventData[];
  }

  private async fetchQuotes(): Promise<QuoteData[]> {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        id,
        quote_number,
        line_of_business,
        carrier,
        carrier_info:carriers!quotes_carrier_id_fkey(id, name),
        premium,
        status,
        effective_date,
        expiration_date,
        created_at,
        notes
      `)
      .eq('account_id', this.accountId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      logger.error('Error fetching quotes:', error);
      return [];
    }

    return data as QuoteData[];
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private buildHeader(account: AccountData): string {
    const now = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `# CLIENT INTELLIGENCE REPORT
**Client:** ${account.name}
**Report Generated:** ${now}
**Account ID:** ${account.id}

This document contains comprehensive client data for AI analysis.
Use this information to provide insights, identify opportunities, and assess risks.
`;
  }

  private calculateSummary(data: ClientRawData): ClientDataSummary {
    const now = new Date();
    const activePolicies = data.policies.filter(p => {
      if (!p.expiration_date) return true;
      return new Date(p.expiration_date) >= now;
    });
    const openClaims = data.claims.filter(c => 
      c.status === 'open' || c.status === 'pending' || c.status === 'in_review'
    );
    const openTasks = data.tasks.filter(t => 
      t.status !== 'completed' && t.status !== 'cancelled'
    );
    const totalPremium = data.policies.reduce((sum, p) => sum + (p.premium || 0), 0);

    // Find date range
    const policyDates = data.policies
      .map(p => p.effective_date)
      .filter(Boolean)
      .map(d => new Date(d!).getTime());
    
    return {
      policiesCount: data.policies.length,
      activePoliciesCount: activePolicies.length,
      claimsCount: data.claims.length,
      openClaimsCount: openClaims.length,
      documentsCount: data.documents.length,
      contactsCount: data.contacts.length,
      tasksCount: data.tasks.length,
      openTasksCount: openTasks.length,
      communicationsCount: data.calls.length + data.messages.length + data.events.length,
      quotesCount: data.quotes.length,
      totalPremium,
      oldestPolicyDate: policyDates.length > 0 
        ? new Date(Math.min(...policyDates)).toISOString() 
        : null,
      newestPolicyDate: policyDates.length > 0 
        ? new Date(Math.max(...policyDates)).toISOString() 
        : null,
    };
  }

  private smartTruncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    // Find section boundaries
    const sections = text.split('\n---\n');
    
    // Prioritize keeping: Account, Policies, Claims, then truncate others
    const priorityOrder = [
      'CLIENT INTELLIGENCE REPORT',
      'CLIENT PROFILE',
      'POLICIES',
      'CLAIMS',
      'CONTACTS',
      'TASKS',
      'DOCUMENTS',
      'COMMUNICATION',
      'QUOTE',
    ];

    // Sort sections by priority
    sections.sort((a, b) => {
      const getPriority = (section: string) => {
        for (let i = 0; i < priorityOrder.length; i++) {
          if (section.includes(priorityOrder[i])) return i;
        }
        return priorityOrder.length;
      };
      return getPriority(a) - getPriority(b);
    });

    // Build result keeping high priority sections
    let result = '';
    for (const section of sections) {
      if (result.length + section.length + 10 < maxLength) {
        result += (result ? '\n---\n' : '') + section;
      } else {
        // Add truncation notice
        result += '\n---\n\n*[Additional sections truncated due to context length limits]*';
        break;
      }
    }

    return result;
  }
}

// =============================================================================
// CONVENIENCE FUNCTION
// =============================================================================

export async function buildClientContext(
  accountId: string,
  options?: {
    includeDocumentText?: boolean;
    maxDocuments?: number;
  }
): Promise<ClientContext> {
  const builder = new ClientContextBuilder(accountId);
  return builder.buildContext(options);
}


