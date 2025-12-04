import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAutoScoreQuote } from "./useQuoteScoring";
import { useTriggerFollowUpProcessor } from "./useQuoteFollowups";
import { toast } from "sonner";

export interface ParsedQuoteData {
  policyNumber?: string;
  carrier?: string;
  premium?: number;
  effectiveDate?: string;
  expirationDate?: string;
  lineOfBusiness?: string;
  coverages?: Array<{
    type: string;
    limit?: string;
    deductible?: string;
    premium?: number;
  }>;
}

/**
 * Hook for uploading quote documents with automatic parsing and scoring
 * Workflow: Upload PDF → AI Parse → Create Quote → Create Coverages → Auto-Score
 */
export function useQuoteDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const autoScore = useAutoScoreQuote();
  const triggerFollowUps = useTriggerFollowUpProcessor();

  const uploadAndParseQuote = async (file: File, accountId: string) => {
    setIsUploading(true);

    try {
      // Step 1: Upload document to storage
      const filePath = `quotes/${accountId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Step 2: Parse document with AI
      // Note: You'll need to implement the AI parsing edge function
      // This is a placeholder for the actual implementation
      const { data: parseData, error: parseError } = await supabase.functions.invoke(
        "ai-document-analysis",
        {
          body: {
            action: "insurance_extraction",
            documentPath: filePath,
          },
        }
      );

      if (parseError) throw parseError;

      const extracted = parseData?.extracted || {};

      // Step 3: Lookup or create carrier
      let carrierId: string | null = null;
      if (extracted.carrier) {
        // Try to find existing carrier
        const { data: existingCarrier } = await supabase
          .from("carriers")
          .select("id")
          .eq("name", extracted.carrier)
          .single();

        if (existingCarrier) {
          carrierId = existingCarrier.id;
        } else {
          // Create new carrier if not exists
          const { data: newCarrier } = await supabase
            .from("carriers")
            .insert({ name: extracted.carrier })
            .select("id")
            .single();

          carrierId = newCarrier?.id || null;
        }
      }

      // Step 4: Create quote record
      const { data: quote, error: createError } = await supabase
        .from("quotes")
        .insert({
          account_id: accountId,
          quote_ref: extracted.policyNumber || `QTE-${Date.now()}`,
          carrier_id: carrierId,
          premium: extracted.totalPremium,
          line_of_business: extracted.type || "auto",
          options: extracted, // Store all extracted data in JSONB
          status: "open",
          quoted_at: new Date().toISOString(),
          // Set expiration to 30 days from now if not provided
          expires_at: extracted.expirationDate ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;

      // Step 5: Create coverage records if coverages were extracted
      if (extracted.coverages && extracted.coverages.length > 0) {
        const coverageInserts = extracted.coverages.map((cov: any) => ({
          quote_id: quote.id,
          coverage_type: cov.type || "Unknown",
          limit_amount: cov.limit,
          deductible_amount: cov.deductible,
          premium_amount: cov.premium,
          is_included: true,
          extracted_from_document: true,
        }));

        const { error: coverageError } = await supabase
          .from("quote_coverages")
          .insert(coverageInserts);

        if (coverageError) {
          console.error("Failed to insert coverages:", coverageError);
          // Don't fail the whole operation if coverages fail
        }
      }

      // Step 6: Auto-score the quote
      autoScore.mutate(quote.id);

      // Step 7: Trigger follow-up processor to evaluate and schedule follow-ups
      triggerFollowUps.mutate({ quote_id: quote.id });

      toast.success("Quote uploaded and analyzed successfully", {
        description: `Quote ${quote.quote_ref} has been created and scored`,
      });

      return quote;
    } catch (error: any) {
      toast.error("Failed to upload quote", {
        description: error.message,
      });
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadAndParseQuote,
    isUploading,
  };
}

/**
 * Helper function to convert File to base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}
