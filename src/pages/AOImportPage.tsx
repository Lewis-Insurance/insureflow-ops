import { AppLayout } from "@/components/layout/AppLayout";
import { AOImportWizard } from "@/components/renewals/AOImportWizard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AOImportPage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/renewals")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Renewals
              </Button>
            </div>
            <h1 className="text-3xl font-bold">Auto-Owners Import</h1>
            <p className="text-muted-foreground">
              Import renewal data from Auto-Owners reports
            </p>
          </div>
        </div>

        {/* Import Wizard */}
        <AOImportWizard />
      </div>
    </AppLayout>
  );
}
