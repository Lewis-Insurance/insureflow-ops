/**
 * Client Intelligence Types
 * 
 * TypeScript types for the Client Intelligence AI feature
 */

// =============================================================================
// CONTEXT TYPES
// =============================================================================

export interface ClientContext {
  accountId: string;
  accountName: string;
  formattedContext: string;
  tokenEstimate: number;
  dataSummary: ClientDataSummary;
  buildTime: number; // ms to build context
}

export interface ClientDataSummary {
  policiesCount: number;
  activePoliciesCount: number;
  claimsCount: number;
  openClaimsCount: number;
  documentsCount: number;
  contactsCount: number;
  tasksCount: number;
  openTasksCount: number;
  communicationsCount: number;
  quotesCount: number;
  totalPremium: number;
  oldestPolicyDate: string | null;
  newestPolicyDate: string | null;
}

// =============================================================================
// RAW DATA TYPES (from database)
// =============================================================================

export interface ClientRawData {
  account: AccountData | null;
  contacts: ContactData[];
  policies: PolicyData[];
  claims: ClaimData[];
  documents: DocumentData[];
  tasks: TaskData[];
  calls: CallData[];
  messages: MessageData[];
  events: EventData[];
  quotes: QuoteData[];
}

export interface AccountData {
  id: string;
  name: string;
  account_type: string | null;
  account_status: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  source: string | null;
  lead_source_detail: string | null;
  created_at: string;
  updated_at: string;
  custom?: Record<string, unknown> | null;
  tags?: Array<{ id: string; name: string; color?: string }>;
}

export interface ContactData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface PolicyData {
  id: string;
  policy_number: string;
  line_of_business: string | null;
  carrier: string | null;
  carrier_info?: { id: string; name: string } | null;
  mga_info?: { id: string; name: string; code?: string } | null;
  effective_date: string | null;
  expiration_date: string | null;
  premium: number | null;
  status: string | null;
  coverage_summary: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimData {
  id: string;
  claim_number: string;
  policy_id: string;
  description: string | null;
  type_of_loss: string | null;
  loss_date: string | null;
  date_of_loss: string | null;
  reported_at: string | null;
  status: string;
  amount_claimed: number | null;
  amount_estimate: number | null;
  amount_paid: number | null;
  adjuster_name: string | null;
  adjuster_contact: string | null;
  notes: string | null;
  settlement_date: string | null;
  created_at: string;
  policy?: {
    policy_number: string;
    line_of_business: string | null;
    carrier?: { name: string } | null;
  };
}

export interface DocumentData {
  id: string;
  file_name: string | null;
  document_type: string | null;
  category: string | null;
  extracted_text: string | null;
  created_at: string;
  file_size: number | null;
}

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  assigned_to?: string | null;
}

export interface CallData {
  id: string;
  direction: string | null;
  status: string | null;
  duration: number | null;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface MessageData {
  id: string;
  direction: string | null;
  body: string | null;
  status: string | null;
  created_at: string;
}

export interface EventData {
  id: string;
  event_type: string | null;
  title: string | null;
  description: string | null;
  occurred_at: string | null;
  created_at: string;
}

export interface QuoteData {
  id: string;
  quote_number: string | null;
  line_of_business: string | null;
  carrier: string | null;
  carrier_info?: { id: string; name: string } | null;
  premium: number | null;
  status: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  created_at: string;
  notes: string | null;
}

// =============================================================================
// QUESTION TEMPLATES
// =============================================================================

export interface QuestionTemplate {
  id: string;
  category: string;
  title: string;
  question: string;
  icon?: string;
}

export const SUGGESTED_QUESTIONS: QuestionTemplate[] = [
  {
    id: 'coverage-gaps',
    category: 'Coverage Analysis',
    title: 'Coverage Gap Analysis',
    question: "Analyze this client's current coverage and identify any gaps or areas of concern. Consider their business type, location, and risk profile.",
    icon: 'shield',
  },
  {
    id: 'renewal-strategy',
    category: 'Renewal Prep',
    title: 'Renewal Strategy',
    question: "Prepare a renewal strategy for this client's upcoming policy expirations. Include key talking points, potential rate changes to discuss, and retention strategies.",
    icon: 'calendar',
  },
  {
    id: 'cross-sell',
    category: 'Cross-Sell',
    title: 'Cross-Sell Opportunities',
    question: "What additional insurance products would benefit this client based on their profile, current coverage, and industry? Prioritize by potential value and likelihood of interest.",
    icon: 'trending-up',
  },
  {
    id: 'risk-assessment',
    category: 'Risk Assessment',
    title: 'Risk Factor Analysis',
    question: "What risk factors should I be aware of for this client? Consider their claims history, coverage limits, industry risks, and any red flags in their profile.",
    icon: 'alert-triangle',
  },
  {
    id: 'activity-summary',
    category: 'Activity Summary',
    title: '90-Day Activity Summary',
    question: "Summarize all interactions and activity with this client in the last 90 days. Include communications, policy changes, claims, and any notable events.",
    icon: 'activity',
  },
  {
    id: 'claims-analysis',
    category: 'Claims Analysis',
    title: 'Claims History Analysis',
    question: "Analyze this client's claims history and identify patterns. Are there recurring issues? What loss prevention recommendations would you make?",
    icon: 'file-text',
  },
  {
    id: 'account-health',
    category: 'Account Health',
    title: 'Overall Account Health',
    question: "Provide an overall health assessment of this client account. Consider policy status, premium trends, claims ratio, engagement level, and churn risk.",
    icon: 'heart',
  },
  {
    id: 'meeting-prep',
    category: 'Meeting Prep',
    title: 'Client Meeting Preparation',
    question: "I have a meeting with this client. Prepare a brief including: key account highlights, recent activity, open items needing discussion, and suggested talking points.",
    icon: 'users',
  },
];

// =============================================================================
// RESPONSE TYPES
// =============================================================================

export interface ClientIntelligenceResponse {
  runId: string;
  question: string;
  answer: string;
  structuredResponse?: CEOCopilotResponse;
  tokensUsed: number;
  cost: number;
  timestamp: string;
}

export interface ClientIntelligenceState {
  isLoading: boolean;
  isLoadingContext: boolean;
  context: ClientContext | null;
  responses: ClientIntelligenceResponse[];
  error: string | null;
}

// =============================================================================
// CEO COPILOT STRUCTURED RESPONSE SCHEMA
// =============================================================================
// Aligned with the Ultimate System Prompt requirements

export interface CEOCopilotResponse {
  // Required sections from system prompt
  executive_summary: string;
  
  key_findings: KeyFinding[];
  recommendations: Recommendation[];
  action_items: ActionItem[];
  risk_flags: RiskFlag[];
  
  // Analysis-specific sections (optional based on question type)
  coverage_gaps?: CoverageGap[];
  cross_sell_opportunities?: CrossSellOpportunity[];
  activity_summary?: ActivitySummary;
  
  // Citations for trust/verification
  citations: Citation[];
  
  // Metadata
  confidence_score: number; // 0-1
  tokens_used: number;
  analysis_timestamp: string;
}

export interface KeyFinding {
  id: string;
  finding: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category?: string;
  evidence: Citation[];
}

export interface Recommendation {
  id: string;
  priority: 1 | 2 | 3; // 1 = highest
  recommendation: string;
  rationale: string;
  expected_impact?: string;
  evidence: Citation[];
}

export interface ActionItem {
  id: string;
  action: string;
  owner_suggestion?: string;
  due_suggestion?: string; // e.g., "Within 7 days", "Before renewal"
  priority: 'urgent' | 'high' | 'medium' | 'low';
  can_create_task: boolean;
  related_finding_id?: string;
}

export interface RiskFlag {
  id: string;
  risk_type: 'coverage_gap' | 'churn' | 'claims_pattern' | 'compliance' | 'renewal' | 'payment' | 'other';
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitigation_suggestion?: string;
  evidence: Citation[];
}

export interface CoverageGap {
  id: string;
  gap_type: string; // e.g., "No cyber liability coverage"
  current_state: string;
  recommended_coverage: string;
  estimated_premium?: string;
  risk_if_unaddressed: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface CrossSellOpportunity {
  id: string;
  product: string;
  rationale: string;
  estimated_premium?: string;
  likelihood: 'high' | 'medium' | 'low';
  talking_points: string[];
}

export interface ActivitySummary {
  period: string; // e.g., "Last 90 days"
  total_interactions: number;
  key_events: ActivityEvent[];
  engagement_trend: 'increasing' | 'stable' | 'decreasing';
  last_contact_date?: string;
  next_renewal_date?: string;
}

export interface ActivityEvent {
  date: string;
  type: string;
  description: string;
  source_ref?: Citation;
}

// =============================================================================
// CITATION TYPES
// =============================================================================

export interface Citation {
  id: string;
  source_type: 'policy' | 'claim' | 'note' | 'document' | 'task' | 'call' | 'sms' | 'event' | 'quote' | 'email';
  source_id: string;
  source_label: string; // Human-readable, e.g., "Policy #ABC123"
  snippet?: string; // Relevant excerpt
  deep_link: string; // URL path to navigate to source
  timestamp?: string;
  relevance_score?: number; // 0-1, how relevant this citation is
}

// =============================================================================
// CONTEXT PACK TYPES (for edge function)
// =============================================================================

export interface ContextPack {
  account_id: string;
  account_name: string;
  
  // Structured snapshot (always included)
  structured_snapshot: {
    account: AccountData;
    contacts: ContactData[];
    policies: PolicyData[];
    claims: ClaimData[];
    active_tasks: TaskData[];
  };
  
  // Retrieved chunks from semantic search
  retrieved_chunks: RetrievedChunk[];
  
  // Token budget tracking
  token_count: number;
  max_tokens: number;
  
  // Metadata
  build_time_ms: number;
  cache_hit: boolean;
  expires_at: string;
}

export interface RetrievedChunk {
  id: string;
  source_type: string;
  source_id: string;
  source_label: string;
  content: string;
  snippet: string;
  deep_link: string;
  similarity_score: number;
  timestamp?: string;
}

// =============================================================================
// EMBEDDING TYPES
// =============================================================================

export interface EmbeddingRecord {
  id: string;
  account_id: string;
  source_type: string;
  source_id: string;
  source_label: string;
  content: string;
  content_hash: string;
  chunk_index: number;
  chunk_total: number;
  embedding?: number[];
  metadata: {
    timestamp?: string;
    snippet?: string;
    deep_link?: string;
    relevance_boost?: number;
  };
  created_at: string;
  updated_at: string;
  indexed_at: string;
}

export interface IndexJob {
  id: string;
  account_id: string;
  source_type: string;
  source_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

