import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getScoreBreakdown } from "@/integrations/supabase/hooks/useRescoreLeads";
import { 
  Package, 
  DollarSign, 
  Clock, 
  Phone, 
  Building2, 
  Shield 
} from "lucide-react";

interface LeadScoreBreakdownProps {
  lead: {
    lead_score: number;
    insurance_types?: string[];
    current_premium?: number | null;
    decision_timeframe?: string | null;
    email?: string | null;
    phone?: string | null;
    current_carrier?: string | null;
    source?: { type?: string } | null;
  };
}

export const LeadScoreBreakdown = ({ lead }: LeadScoreBreakdownProps) => {
  const breakdown = getScoreBreakdown(lead);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const scoreFactors = [
    {
      icon: Package,
      label: 'Insurance Needs',
      score: breakdown.insuranceNeeds,
      max: 25,
      description: 'Complexity and variety of coverage needs',
    },
    {
      icon: DollarSign,
      label: 'Premium Value',
      score: breakdown.premium,
      max: 20,
      description: 'Estimated annual premium potential',
    },
    {
      icon: Clock,
      label: 'Decision Timeline',
      score: breakdown.timeline,
      max: 20,
      description: 'Urgency to purchase insurance',
    },
    {
      icon: Phone,
      label: 'Contact Info',
      score: breakdown.contact,
      max: 15,
      description: 'Completeness of contact details',
    },
    {
      icon: Building2,
      label: 'Lead Source',
      score: breakdown.source,
      max: 10,
      description: 'Quality of lead source',
    },
    {
      icon: Shield,
      label: 'Current Carrier',
      score: breakdown.carrier,
      max: 10,
      description: 'Has existing coverage to replace',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Lead Score Breakdown</CardTitle>
          <Badge className={`text-2xl px-4 py-2 ${getScoreColor(lead.lead_score)}`}>
            {lead.lead_score}/100
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {scoreFactors.map((factor) => {
          const Icon = factor.icon;
          const percentage = (factor.score / factor.max) * 100;

          return (
            <div key={factor.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{factor.label}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {factor.score}/{factor.max}
                </span>
              </div>
              <Progress value={percentage} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {factor.description}
              </p>
            </div>
          );
        })}

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">Total Score</span>
            <span className="font-semibold">{breakdown.total}/100</span>
          </div>
          <Progress value={breakdown.total} className="h-3" />
        </div>
      </CardContent>
    </Card>
  );
};
