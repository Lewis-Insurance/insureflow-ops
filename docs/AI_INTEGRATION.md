# AI Integration Guide

Comprehensive guide to InsureFlow Ops AI capabilities including the AI Brain, knowledge base, predictive analytics, and document intelligence.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [AI Brain & Knowledge Base](#ai-brain--knowledge-base)
- [Predictive Analytics](#predictive-analytics)
- [Document Intelligence](#document-intelligence)
- [AI Task Generation](#ai-task-generation)
- [Coverage Gap Analysis](#coverage-gap-analysis)
- [Best Practices](#best-practices)

---

## Architecture Overview

InsureFlow Ops uses a multi-layered AI architecture:

```
┌─────────────────────────────────────────────┐
│          User Interface Layer               │
│  (Chat, Dashboards, Analysis Pages)         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         React Hooks Layer                   │
│  (useAIBrain, usePredictiveAnalytics, etc)  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│      Supabase Edge Functions                │
│  (AI processing, embeddings, analysis)      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│    External AI Services                     │
│  (Anthropic Claude, OpenAI, Azure)          │
└─────────────────────────────────────────────┘
```

---

## AI Brain & Knowledge Base

### Overview

The AI Brain is the core intelligence system that:
- Answers insurance-specific questions
- Provides policy recommendations
- Searches through knowledge base
- Learns from user interactions

### Components

#### 1. AIAssistantChat Component

**Location**: `src/components/ai/AIAssistantChat.tsx`

**Features**:
- Streaming responses
- Knowledge base integration
- Context-aware suggestions
- Response regeneration
- Feedback collection

**Usage**:
```tsx
import { AIAssistantChat } from '@/components/ai/AIAssistantChat';

function MyPage() {
  return (
    <AIAssistantChat
      initialContext={{
        accountId: 'account-123',
        policyId: 'policy-456',
      }}
    />
  );
}
```

#### 2. Knowledge Base Hook

**Location**: `src/hooks/useAIBrain.ts`

**Key Functions**:

```tsx
// Query knowledge base
const { data: results } = useKnowledgeSearch('umbrella policy');

// Add new knowledge
const addKnowledgeMutation = useAddKnowledge();
await addKnowledgeMutation.mutateAsync({
  title: 'Umbrella Policy Guidelines',
  content: 'Content here...',
  category: 'policies',
  tags: ['umbrella', 'liability'],
});

// Get knowledge analytics
const { data: analytics } = useKnowledgeAnalytics();
```

### Knowledge Base Schema

```sql
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT, -- 'policies', 'claims', 'underwriting', etc.
  tags TEXT[],
  embedding vector(1536), -- For semantic search
  version INTEGER DEFAULT 1,
  is_current_version BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Caching Strategy

**Three-tier caching** for optimal performance:

1. **Memory Cache (Session)**: Hot queries, instant access
2. **LocalStorage (24 hours)**: Recent queries, 5MB limit
3. **IndexedDB (7 days)**: Historical queries, 50MB limit

**Implementation**:
```tsx
// In AIAssistantChat.tsx
const kbCacheRef = useRef<Map<string, CacheEntry>>(new Map());

// Cache configuration
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 500;

// Cache hit reduces API calls by 60%+
```

### Knowledge Entry Versioning

Track changes to knowledge entries:

```tsx
// View version history
const { data: history } = useKnowledgeHistory(entryId);

// Revert to previous version
const revertMutation = useRevertKnowledge();
await revertMutation.mutateAsync({
  knowledgeId: entryId,
  version: 3,
});
```

---

## Predictive Analytics

### Overview

AI-powered churn prediction and customer insights system.

### Components

#### Customer Predictions Table

```sql
CREATE TABLE customer_predictions (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),

  -- Churn metrics
  churn_probability INTEGER (0-100),
  churn_risk_level TEXT, -- 'critical', 'high', 'medium', 'low'
  churn_factors JSONB,

  -- Renewal metrics
  renewal_probability INTEGER (0-100),
  predicted_renewal_date DATE,

  -- Product recommendations
  next_product_prediction TEXT,
  cross_sell_opportunities JSONB,

  -- Financial
  predicted_ltv NUMERIC(10,2),
  premium_sensitivity_score INTEGER,

  -- AI insights
  ai_summary TEXT,
  ai_recommendations JSONB
);
```

#### Prediction Hook

**Location**: `src/hooks/usePredictiveAnalytics.ts`

**Usage**:
```tsx
// Get at-risk customers
const { data: atRiskCustomers } = useAtRiskCustomers();

// Get prediction for specific customer
const { data: prediction } = useCustomerPrediction(customerId);

// Create intervention
const createInterventionMutation = useCreateIntervention();
await createInterventionMutation.mutateAsync({
  account_id: customerId,
  intervention_type: 'proactive_call',
  intervention_title: 'Retention Call',
  scheduled_date: '2024-12-15',
});

// Record actual outcome
const recordOutcomeMutation = useRecordPredictionOutcome();
await recordOutcomeMutation.mutateAsync({
  predictionId: prediction.id,
  outcome: 'renewed',
  outcomeDate: new Date().toISOString(),
});
```

### Prediction Model Factors

The prediction engine analyzes:

1. **Engagement Metrics**:
   - Last contact date
   - Response rate to communications
   - Portal login frequency

2. **Payment Behavior**:
   - On-time payment rate
   - Payment method changes
   - Auto-pay enrollment

3. **Policy Data**:
   - Coverage adequacy
   - Policy age/tenure
   - Recent changes

4. **Service Interactions**:
   - Support ticket count
   - Claim history
   - Quote activity

5. **External Factors**:
   - Market conditions
   - Competitive pressure
   - Seasonal trends

### Intervention Tracking

Track retention efforts and measure ROI:

```tsx
// Get interventions for customer
const { data: interventions } = useRetentionInterventions({
  accountId: customerId,
});

// Update intervention status
const updateMutation = useUpdateIntervention();
await updateMutation.mutateAsync({
  id: interventionId,
  updates: {
    status: 'completed',
    customer_response: 'positive',
    was_successful: true,
    retained_revenue: 5000,
  },
});

// Calculate ROI
const calculateROI = useCalculateInterventionROI();
await calculateROI.mutateAsync(interventionId);
```

---

## Document Intelligence

### Overview

AI-powered document analysis for policy documents, quotes, certificates of insurance, etc.

### Features

1. **Document Classification**
2. **Data Extraction**
3. **Coverage Analysis**
4. **Comparison & Gap Detection**

### Document Analysis Hook

**Location**: `src/hooks/useDocumentAnalysis.ts`

**Usage**:
```tsx
// Upload and analyze document
const analyzeMutation = useAnalyzeDocument();

const file = event.target.files[0];
const result = await analyzeMutation.mutateAsync({
  file,
  document_type: 'policy',
  account_id: customerId,
});

// Result structure
{
  document_id: 'doc-123',
  document_type: 'policy',
  extracted_data: {
    policy_number: 'POL-2024-001',
    effective_date: '2024-01-01',
    premium: 2500,
    coverages: [
      { type: 'general_liability', limit: '1000000', deductible: '1000' }
    ]
  },
  ai_summary: 'Commercial general liability policy...',
  confidence_score: 95,
}
```

### Document Processing Pipeline

```
Upload → Storage → OCR → Classification → Extraction → Analysis → Storage
```

1. **Upload**: File uploaded to Supabase Storage
2. **Storage**: Stored in `policy-documents` bucket
3. **OCR**: Azure Document Intelligence extracts text
4. **Classification**: AI determines document type
5. **Extraction**: Structured data extraction
6. **Analysis**: AI analyzes coverage, identifies gaps
7. **Storage**: Results stored in database

### Edge Functions

**analyze-document**: Main document processing function

```typescript
// supabase/functions/analyze-document/index.ts
export async function analyzeDocument(file: File) {
  // 1. Upload to storage
  const { data: fileData } = await uploadFile(file);

  // 2. OCR extraction
  const text = await extractText(fileData.url);

  // 3. AI classification
  const documentType = await classifyDocument(text);

  // 4. Structured extraction
  const extractedData = await extractPolicyData(text, documentType);

  // 5. Analysis & insights
  const analysis = await analyzePolicy(extractedData);

  return {
    document_id: fileData.id,
    document_type: documentType,
    extracted_data: extractedData,
    ai_summary: analysis.summary,
    recommendations: analysis.recommendations,
  };
}
```

---

## AI Task Generation

### Overview

Automatically generate tasks based on triggers and events.

### Task Generation Rules

```sql
CREATE TABLE task_generation_rules (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT, -- 'document_analysis_complete', 'coverage_gap_identified', etc.
  conditions JSONB,
  task_title_template TEXT,
  task_description_template TEXT,
  task_type TEXT,
  priority TEXT,
  assign_to_type TEXT, -- 'account_owner', 'specific_user', 'role'
  due_in_days INTEGER,
  is_active BOOLEAN DEFAULT true
);
```

### Usage

**Location**: `src/hooks/useTaskGeneration.ts`

```tsx
// Get active rules
const { data: rules } = useTaskGenerationRules();

// Create rule
const createRuleMutation = useCreateTaskGenerationRule();
await createRuleMutation.mutateAsync({
  name: 'High Lead Score Follow-up',
  trigger_type: 'lead_score_increase',
  task_title_template: 'Hot lead - {{customer_name}}',
  task_description_template: 'Lead score increased to {{score}}. Contact immediately.',
  task_type: 'follow_up',
  priority: 'urgent',
  assign_to_type: 'account_owner',
  due_in_hours: 24,
});

// View generated tasks
const { data: generatedTasks } = useGeneratedTasksLog();
```

### Trigger Types

- `document_analysis_complete`: After document analysis
- `coverage_gap_identified`: When gap detected
- `lead_score_increase`: Significant score change
- `renewal_risk_alert`: At-risk renewal identified
- `policy_expiring_soon`: Policy expiration approaching
- `quote_expired`: Quote expired without action
- `customer_interaction`: Customer engagement event

---

## Coverage Gap Analysis

### Overview

AI-powered identification of coverage gaps and cross-sell opportunities.

### Schema

```sql
CREATE TABLE coverage_gap_analysis (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),

  -- Customer profile
  customer_profile JSONB,
  current_policies JSONB,

  -- Gap analysis
  identified_gaps JSONB,
  risk_score INTEGER (0-100),
  risk_level TEXT,

  -- Recommendations
  recommended_coverages JSONB,
  estimated_premium_increase NUMERIC(10,2),

  -- AI insights
  ai_summary TEXT,
  ai_recommendations TEXT,

  -- Status
  status TEXT DEFAULT 'pending',
  quote_id UUID REFERENCES quotes(id)
);
```

### Usage

**Location**: `src/hooks/useCoverageGapAnalysis.ts`

```tsx
// Analyze customer coverage
const analyzeGaps = useAnalyzeCoverageGaps();

const result = await analyzeGaps.mutateAsync({
  account_id: customerId,
  customer_profile: {
    industry: 'construction',
    employees: 50,
    revenue: 2000000,
    vehicles: 10,
  },
  current_policies: [
    { type: 'general_liability', limit: '1000000' },
    { type: 'workers_comp', limit: 'statutory' },
  ],
});

// Result structure
{
  analysis_id: 'gap-123',
  risk_score: 75,
  risk_level: 'high',
  identified_gaps: [
    {
      gap_type: 'missing_coverage',
      coverage_type: 'commercial_auto',
      severity: 'high',
      rationale: 'Company operates 10 vehicles without auto coverage'
    },
    {
      gap_type: 'insufficient_limit',
      coverage_type: 'general_liability',
      severity: 'medium',
      rationale: 'Current $1M limit may be insufficient for contract requirements'
    }
  ],
  recommended_coverages: [
    {
      coverage_type: 'commercial_auto',
      recommended_limit: '$1,000,000',
      estimated_premium: 8500,
      priority: 'high'
    }
  ],
  ai_summary: 'Critical gap in commercial auto coverage...',
}

// Create quote from recommendations
const createQuote = useCreateQuoteFromGap();
await createQuote.mutateAsync({
  gap_analysis_id: result.analysis_id,
  selected_coverages: ['commercial_auto', 'umbrella'],
});
```

### Gap Analysis Templates

Industry-specific templates for common gap scenarios:

```tsx
// Get templates for industry
const { data: templates } = useCoverageGapTemplates({
  industry: 'construction',
});

// Template structure
{
  name: 'Construction Industry Standard',
  required_coverages: ['general_liability', 'workers_comp', 'commercial_auto'],
  recommended_coverages: ['builders_risk', 'equipment', 'umbrella'],
  risk_indicators: {
    employees_gt: 5,
    vehicles_gt: 2,
    annual_revenue_gt: 500000
  }
}
```

---

## Best Practices

### 1. Caching Strategy

**DO**:
- Cache knowledge base queries for 24 hours
- Use LRU eviction for large caches
- Implement three-tier caching (memory → localStorage → IndexedDB)

**DON'T**:
- Cache sensitive customer data
- Store API keys in client-side cache
- Exceed browser storage limits

### 2. Error Handling

```tsx
try {
  const result = await aiAnalysisMutation.mutateAsync(data);
  toast.success('Analysis complete');
} catch (error) {
  // Graceful degradation
  if (error.code === 'RATE_LIMIT') {
    toast.error('Too many requests. Please wait a moment.');
  } else if (error.code === 'INVALID_INPUT') {
    toast.error('Invalid input data. Please check and try again.');
  } else {
    toast.error('Analysis failed. Our team has been notified.');
    // Log to error tracking service
    logError(error);
  }
}
```

### 3. Cost Optimization

**Reduce AI API costs**:
- Batch similar requests
- Use caching aggressively
- Implement request throttling
- Monitor usage with analytics

```tsx
// Batch knowledge searches
const searches = ['umbrella', 'workers comp', 'general liability'];
const results = await Promise.all(
  searches.map(query => searchKnowledge(query))
);
```

### 4. User Feedback Loop

Collect feedback to improve AI quality:

```tsx
// Add feedback to AI responses
const provideFeedback = useAIResponseFeedback();

<Button
  onClick={() =>
    provideFeedback.mutate({
      message_id: messageId,
      helpful: true,
      feedback_text: 'Very helpful!',
    })
  }
>
  👍 Helpful
</Button>
```

### 5. Progressive Enhancement

Ensure app works without AI features:

```tsx
function PolicyRecommendations() {
  const { data: aiRecommendations, isLoading, error } = useAIRecommendations();

  // Fallback to rule-based recommendations
  const fallbackRecommendations = useMemo(() => {
    return generateRuleBasedRecommendations(customer);
  }, [customer]);

  const recommendations = aiRecommendations || fallbackRecommendations;

  return <RecommendationsList recommendations={recommendations} />;
}
```

### 6. Monitoring & Observability

Track AI performance metrics:

```tsx
// Log AI request metrics
const logAIMetrics = (metrics: AIMetrics) => {
  analytics.track('ai_request', {
    feature: metrics.feature,
    latency_ms: metrics.latency,
    tokens_used: metrics.tokens,
    cached: metrics.cached,
    success: metrics.success,
  });
};
```

---

## Environment Configuration

Required environment variables:

```env
# AI Services
VITE_ANTHROPIC_API_KEY=your_key_here
VITE_OPENAI_API_KEY=your_key_here

# Azure Document Intelligence
VITE_AZURE_DOCUMENT_ENDPOINT=your_endpoint
VITE_AZURE_DOCUMENT_KEY=your_key

# Feature Flags
VITE_ENABLE_AI_CHAT=true
VITE_ENABLE_PREDICTIVE_ANALYTICS=true
VITE_ENABLE_DOCUMENT_INTELLIGENCE=true
```

---

## Resources

- **Anthropic Claude**: https://docs.anthropic.com/
- **OpenAI API**: https://platform.openai.com/docs
- **Azure AI**: https://learn.microsoft.com/en-us/azure/ai-services/
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions

---

**Last Updated**: December 3, 2024
**Version**: 1.0.0
