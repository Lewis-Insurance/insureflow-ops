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

