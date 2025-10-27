import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface GenerateQuoteDocParams {
  leadId: string;
  insuranceType: string;
}

interface GenerateQuoteDocResponse {
  quoteDocument: string;
  leadInfo: {
    name: string;
    email: string | null;
    phone: string | null;
    insuranceType: string;
  };
}

export const useGenerateQuoteDoc = () => {
  return useMutation({
    mutationFn: async ({ leadId, insuranceType }: GenerateQuoteDocParams) => {
      const { data, error } = await supabase.functions.invoke('generate-insurance-quote-doc', {
        body: { leadId, insuranceType }
      });

      if (error) throw error;
      if (!data) throw new Error('No data returned from function');

      return data as GenerateQuoteDocResponse;
    },
    onError: (error: Error) => {
      console.error('Error generating quote document:', error);
      toast({
        title: "Failed to generate document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
