import { useEffect } from "react";
import { useGenerateTaskSilent, TriggerType } from "./useTaskGeneration";

/**
 * Auto-generate tasks when certain events occur
 * This hook provides simple integration points for automatic task generation
 */

interface AutoGenerateParams {
  enabled?: boolean;
  triggerType: TriggerType;
  triggerData: {
    account_id?: string;
    customer_name?: string;
    entity_type?: string;
    entity_id?: string;
    [key: string]: any;
  };
  enhanceWithAI?: boolean;
}

/**
 * Hook to automatically generate task when conditions are met
 * Use in components to trigger task generation on specific events
 */
export function useAutoTaskGeneration({ enabled = true, triggerType, triggerData, enhanceWithAI = true }: AutoGenerateParams) {
  const generateTask = useGenerateTaskSilent();

  useEffect(() => {
    if (!enabled) return;

    // Only trigger if we have minimum required data
    if (!triggerData || Object.keys(triggerData).length === 0) return;

    // Generate task automatically
    generateTask.mutate({
      triggerType,
      triggerData,
      enhanceWithAI,
    });
  }, [enabled, triggerType, JSON.stringify(triggerData)]);

  return {
    isGenerating: generateTask.isPending,
    error: generateTask.error,
  };
}

/**
 * Hook for document analysis completion
 * Call this after document analysis is complete
 */
export function useDocumentAnalysisTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromAnalysis = (params: {
    accountId?: string;
    documentId: string;
    documentName: string;
    analysisResults?: any;
  }) => {
    generateTask.mutate({
      triggerType: "document_analysis_complete",
      triggerData: {
        account_id: params.accountId,
        entity_type: "document",
        entity_id: params.documentId,
        document_name: params.documentName,
        analysis_summary: params.analysisResults?.summary || "Document analysis completed",
        ...params.analysisResults,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromAnalysis,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for coverage gap identification
 * Call this when coverage gaps are identified
 */
export function useCoverageGapTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromGap = (params: {
    accountId: string;
    customerName: string;
    policyId?: string;
    gapDetails: string;
    recommendedCoverage: string;
  }) => {
    generateTask.mutate({
      triggerType: "coverage_gap_identified",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        entity_type: "policy",
        entity_id: params.policyId,
        gap_details: params.gapDetails,
        recommended_coverage: params.recommendedCoverage,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromGap,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for renewal risk alerts
 * Call this when renewal risk is detected
 */
export function useRenewalRiskTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromRisk = (params: {
    accountId: string;
    customerName: string;
    policyId: string;
    riskLevel: string;
    riskFactors: string[];
    expirationDate: string;
  }) => {
    generateTask.mutate({
      triggerType: "renewal_risk_alert",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        entity_type: "policy",
        entity_id: params.policyId,
        risk_level: params.riskLevel,
        risk_factors: params.riskFactors,
        expiration_date: params.expirationDate,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromRisk,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for lead score increases
 * Call this when lead score increases significantly
 */
export function useLeadScoreTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromScoreIncrease = (params: {
    accountId: string;
    customerName: string;
    leadId: string;
    previousScore: number;
    newScore: number;
    scoreReasons: string[];
  }) => {
    generateTask.mutate({
      triggerType: "lead_score_increase",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        entity_type: "lead",
        entity_id: params.leadId,
        previous_score: params.previousScore,
        new_score: params.newScore,
        score_increase: params.newScore - params.previousScore,
        score_reasons: params.scoreReasons,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromScoreIncrease,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for policy expiration
 * Call this when policy is expiring soon
 */
export function usePolicyExpirationTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromExpiration = (params: {
    accountId: string;
    customerName: string;
    policyId: string;
    policyType: string;
    expirationDate: string;
    daysUntilExpiration: number;
  }) => {
    generateTask.mutate({
      triggerType: "policy_expiring_soon",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        entity_type: "policy",
        entity_id: params.policyId,
        policy_type: params.policyType,
        expiration_date: params.expirationDate,
        days_until_expiration: params.daysUntilExpiration,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromExpiration,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for quote expiration
 * Call this when quote expires
 */
export function useQuoteExpirationTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromQuoteExpiration = (params: {
    accountId: string;
    customerName: string;
    quoteId: string;
    quotePremium: number;
    expirationDate: string;
  }) => {
    generateTask.mutate({
      triggerType: "quote_expired",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        entity_type: "quote",
        entity_id: params.quoteId,
        quote_premium: params.quotePremium,
        expiration_date: params.expirationDate,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromQuoteExpiration,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for customer interactions
 * Call this after significant customer interactions
 */
export function useCustomerInteractionTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromInteraction = (params: {
    accountId: string;
    customerName: string;
    interactionType: string;
    interactionSummary: string;
    sentiment?: string;
  }) => {
    generateTask.mutate({
      triggerType: "customer_interaction",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        interaction_type: params.interactionType,
        interaction_summary: params.interactionSummary,
        sentiment: params.sentiment,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromInteraction,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for claim filing
 * Call this when a claim is filed
 */
export function useClaimFiledTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromClaim = (params: {
    accountId: string;
    customerName: string;
    claimId: string;
    claimType: string;
    claimAmount?: number;
    urgency?: string;
  }) => {
    generateTask.mutate({
      triggerType: "claim_filed",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        entity_type: "claim",
        entity_id: params.claimId,
        claim_type: params.claimType,
        claim_amount: params.claimAmount,
        urgency: params.urgency || "normal",
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromClaim,
    isGenerating: generateTask.isPending,
  };
}

/**
 * Hook for payment overdue
 * Call this when payment is overdue
 */
export function usePaymentOverdueTaskGeneration() {
  const generateTask = useGenerateTaskSilent();

  const generateFromOverdue = (params: {
    accountId: string;
    customerName: string;
    policyId: string;
    amountDue: number;
    daysOverdue: number;
  }) => {
    generateTask.mutate({
      triggerType: "payment_overdue",
      triggerData: {
        account_id: params.accountId,
        customer_name: params.customerName,
        entity_type: "policy",
        entity_id: params.policyId,
        amount_due: params.amountDue,
        days_overdue: params.daysOverdue,
      },
      enhanceWithAI: true,
    });
  };

  return {
    generateFromOverdue,
    isGenerating: generateTask.isPending,
  };
}
