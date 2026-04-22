import { Button } from "@/components/ui/button";
import { todayLocalDate } from "@/lib/date/localDate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Table } from "lucide-react";
import { toast } from "sonner";
import type { AORenewal } from "@/hooks/useAORenewals";

interface ExportButtonProps {
  data: AORenewal[];
  filename?: string;
}

export function ExportButton({ data, filename = "ao-renewals-analytics" }: ExportButtonProps) {
  const formatCurrency = (value: number | null) => {
    if (!value) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US");
  };

  const exportToCSV = () => {
    try {
      const headers = [
        "Customer Name",
        "Policy Number",
        "Policy Type",
        "Renewal Date",
        "Premium",
        "Carrier",
        "Status",
        "Priority",
        "3 Year Losses",
        "Oldest in Household",
        "Assigned To",
        "Notes",
        "Created At",
        "Last Contact",
      ];

      const rows = data.map((renewal) => [
        renewal.customer_name,
        renewal.policy_number,
        renewal.policy_type || "",
        formatDate(renewal.renewal_date),
        renewal.current_premium || 0,
        renewal.current_carrier || "",
        renewal.status,
        renewal.priority,
        renewal.losses_3yr ?? "",
        renewal.oldest_in_household ?? "",
        renewal.assigned_to || "",
        (renewal.notes || "").replace(/"/g, '""'), // Escape quotes
        formatDate(renewal.created_at || renewal.renewal_date),
        renewal.last_contact_date ? formatDate(renewal.last_contact_date) : "",
      ]);

      // Create CSV content
      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${cell}"`).join(",")
        ),
      ].join("\n");

      // Create and download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      link.setAttribute("href", url);
      link.setAttribute("download", `${filename}-${todayLocalDate()}.csv`);
      link.style.visibility = "hidden";
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("CSV exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export CSV");
    }
  };

  const exportToJSON = () => {
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      link.setAttribute("href", url);
      link.setAttribute("download", `${filename}-${todayLocalDate()}.json`);
      link.style.visibility = "hidden";
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("JSON exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export JSON");
    }
  };

  const exportToExcel = () => {
    toast.info("Excel export coming soon! Use CSV for now.");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Export Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportToCSV}>
          <Table className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToJSON}>
          <FileText className="h-4 w-4 mr-2" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToExcel} disabled>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as Excel (Coming Soon)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
