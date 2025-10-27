import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRescoreLeads } from "@/integrations/supabase/hooks/useRescoreLeads";
import { RefreshCw, Zap } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const LeadScoringAdmin = () => {
  const rescoreLeads = useRescoreLeads();

  const handleRescoreAll = () => {
    rescoreLeads.mutate({ rescoreAll: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Lead Scoring Engine
        </CardTitle>
        <CardDescription>
          Automatically calculates lead scores based on multiple factors
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Scoring Factors:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Insurance needs complexity (0-25 points)</li>
            <li>• Premium potential (0-20 points)</li>
            <li>• Decision timeline urgency (0-20 points)</li>
            <li>• Contact information completeness (0-15 points)</li>
            <li>• Lead source quality (0-10 points)</li>
            <li>• Current carrier status (0-10 points)</li>
          </ul>
        </div>

        <div className="pt-4 border-t">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Rescore All Leads
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rescore All Leads?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will recalculate scores for all leads in your database. This may take a few moments.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRescoreAll}
                  disabled={rescoreLeads.isPending}
                >
                  {rescoreLeads.isPending ? "Scoring..." : "Rescore All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
};
