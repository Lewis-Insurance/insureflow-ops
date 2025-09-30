import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/layout/AppLayout';
import { useNavigate } from 'react-router-dom';
import { FileText, Users, TrendingUp, DollarSign } from 'lucide-react';

interface Report {
  id: string;
  title: string;
  description?: string;
  category: 'renewals' | 'commissions' | 'production' | 'financial';
  linkedEntity?: 'customers' | 'policies' | 'agents';
}

const reports: Report[] = [
  // Left Column Reports
  {
    id: 'renewals-lob',
    title: 'Renewals by Line of Business',
    category: 'renewals',
    linkedEntity: 'policies'
  },
  {
    id: 'agents-commissions-endorsements',
    title: 'Agents Commissions By Endorsements',
    category: 'commissions',
    linkedEntity: 'policies'
  },
  {
    id: 'agency-commissions-policy-status',
    title: 'Agency Commissions by Policy Status',
    category: 'commissions',
    linkedEntity: 'policies'
  },
  {
    id: 'agents-commissions-carriers-by-agent',
    title: 'Agents Commissions And Carriers By Agent',
    category: 'commissions',
    linkedEntity: 'agents'
  },
  {
    id: 'agents-commissions-policies',
    title: 'Agents Commissions By Policies',
    category: 'commissions',
    linkedEntity: 'policies'
  },
  {
    id: 'commissions-rules-agent',
    title: 'Commissions Rules By Agent',
    category: 'commissions',
    linkedEntity: 'agents'
  },
  {
    id: 'commissions-rules-mga',
    title: 'Commissions Rules By MGA',
    category: 'commissions',
    linkedEntity: 'agents'
  },
  {
    id: 'top-10-carriers-commission',
    title: 'Top 10 Carriers By Total Agency Commission',
    category: 'commissions',
    linkedEntity: 'policies'
  },
  {
    id: 'top-10-agents-agent-commission',
    title: 'Top 10 Agents By Agent Commission',
    category: 'production',
    linkedEntity: 'agents'
  },
  {
    id: 'cross-sell-opportunities',
    title: 'Cross-Sell Opportunities',
    category: 'production',
    linkedEntity: 'customers'
  },
  {
    id: 'insured-total-value',
    title: 'Insured Total Value',
    category: 'financial',
    linkedEntity: 'customers'
  },
  {
    id: 'agency-commission-payment',
    title: 'Agency Commission and Non-commission Received by Payment',
    category: 'financial'
  },
  {
    id: 'agent-commission-payment',
    title: 'Agent Commission and Non-commission Received by Payment',
    category: 'financial'
  },
  {
    id: 'agent-production-summary',
    title: 'Agent Production (Summary)',
    category: 'production',
    linkedEntity: 'agents'
  },
  
  // Right Column Reports
  {
    id: 'renewals-carrier',
    title: 'Renewals by Carrier',
    category: 'renewals',
    linkedEntity: 'policies'
  },
  {
    id: 'agents-commissions-endorsements-payment-date',
    title: 'Agents Commissions By Endorsements With Payment Date',
    category: 'commissions',
    linkedEntity: 'policies'
  },
  {
    id: 'agents-commissions',
    title: 'Agents Commissions',
    category: 'commissions',
    linkedEntity: 'agents'
  },
  {
    id: 'agents-commissions-carrier',
    title: 'Agents Commissions By Carrier',
    category: 'commissions',
    linkedEntity: 'policies'
  },
  {
    id: 'commissions-rules-agency',
    title: 'Commissions Rules By Agency',
    category: 'commissions'
  },
  {
    id: 'commissions-rules-carrier',
    title: 'Commissions Rules By Carrier',
    category: 'commissions',
    linkedEntity: 'policies'
  },
  {
    id: 'top-10-mgas-commission',
    title: 'Top 10 MGAs By Total Agency Commission',
    category: 'commissions',
    linkedEntity: 'agents'
  },
  {
    id: 'top-10-agents-total-commission',
    title: 'Top 10 Agents By Total Agency Commission',
    category: 'production',
    linkedEntity: 'agents'
  },
  {
    id: 'revenue',
    title: 'Revenue',
    category: 'financial'
  },
  {
    id: 'invoices-receipts-fees',
    title: 'Invoices / Receipts Fees',
    category: 'financial'
  },
  {
    id: 'insureds-financial-summary',
    title: 'Insureds Financial Summary',
    category: 'financial',
    linkedEntity: 'customers'
  },
  {
    id: 'agency-commission-summary',
    title: 'Agency Commission and Non-commission Received (Summary)',
    category: 'financial'
  },
  {
    id: 'agent-production',
    title: 'Agent Production',
    category: 'production',
    linkedEntity: 'agents'
  },
  {
    id: 'unearned-commissions',
    title: 'Unearned Commissions',
    category: 'financial'
  }
];

const getCategoryIcon = (category: Report['category']) => {
  switch (category) {
    case 'renewals':
      return <FileText className="h-4 w-4" />;
    case 'commissions':
      return <DollarSign className="h-4 w-4" />;
    case 'production':
      return <TrendingUp className="h-4 w-4" />;
    case 'financial':
      return <DollarSign className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const getCategoryColor = (category: Report['category']) => {
  switch (category) {
    case 'renewals':
      return 'bg-blue-500/10 text-blue-700 border-blue-200';
    case 'commissions':
      return 'bg-green-500/10 text-green-700 border-green-200';
    case 'production':
      return 'bg-purple-500/10 text-purple-700 border-purple-200';
    case 'financial':
      return 'bg-orange-500/10 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-500/10 text-gray-700 border-gray-200';
  }
};

export default function ReportsPage() {
  const navigate = useNavigate();

  const handleViewReport = (report: Report) => {
    // Navigate to related entities or show report data
    if (report.linkedEntity === 'customers') {
      navigate('/customers');
    } else if (report.linkedEntity === 'policies') {
      navigate('/policies');
    } else {
      // For now, show a placeholder or future report implementation
      console.log(`Viewing report: ${report.title}`);
    }
  };

  // Split reports into two columns
  const leftColumnReports = reports.slice(0, Math.ceil(reports.length / 2));
  const rightColumnReports = reports.slice(Math.ceil(reports.length / 2));

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">
              Comprehensive reports for renewals, commissions, production, and financial data
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {leftColumnReports.map((report) => (
              <Card key={report.id} className="transition-all hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                      {getCategoryIcon(report.category)}
                      {report.title}
                    </CardTitle>
                    <Badge 
                      variant="outline" 
                      className={getCategoryColor(report.category)}
                    >
                      {report.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    {report.linkedEntity && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        Links to {report.linkedEntity}
                      </div>
                    )}
                    <Button 
                      onClick={() => handleViewReport(report)}
                      className="ml-auto"
                    >
                      View Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {rightColumnReports.map((report) => (
              <Card key={report.id} className="transition-all hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                      {getCategoryIcon(report.category)}
                      {report.title}
                    </CardTitle>
                    <Badge 
                      variant="outline" 
                      className={getCategoryColor(report.category)}
                    >
                      {report.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    {report.linkedEntity && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        Links to {report.linkedEntity}
                      </div>
                    )}
                    <Button 
                      onClick={() => handleViewReport(report)}
                      className="ml-auto"
                    >
                      View Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}