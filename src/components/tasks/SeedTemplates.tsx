import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTaskTemplates } from '@/hooks/useTaskTemplates';
import { Loader2, Sparkles } from 'lucide-react';

/**
 * Component to seed the database with common task templates
 */
export function SeedTemplates() {
  const { createTemplate } = useTaskTemplates();
  const [seeding, setSeeding] = useState(false);

  const seedDefaultTemplates = async () => {
    setSeeding(true);
    
    const templates = [
      // Quote Request Flow
      {
        name: 'Initial Contact & Qualification',
        description: 'Contact prospect to understand their insurance needs and qualify the opportunity',
        category: 'quote' as const,
        trigger_event: 'quote_requested' as const,
        priority: 'high' as const,
        estimated_duration_hours: 24,
        task_order: 1,
        is_active: true,
      },
      {
        name: 'Risk Assessment',
        description: 'Review risk factors and gather necessary underwriting information',
        category: 'quote' as const,
        trigger_event: 'quote_requested' as const,
        priority: 'medium' as const,
        estimated_duration_hours: 48,
        task_order: 2,
        is_active: true,
      },
      {
        name: 'Quote Preparation',
        description: 'Prepare and review quote with pricing and coverage details',
        category: 'quote' as const,
        trigger_event: 'quote_requested' as const,
        priority: 'medium' as const,
        estimated_duration_hours: 72,
        task_order: 3,
        is_active: true,
      },
      
      // Policy Issuance Flow
      {
        name: 'Document Collection',
        description: 'Collect all required documents and signatures from insured',
        category: 'policy' as const,
        trigger_event: 'policy_issued' as const,
        priority: 'high' as const,
        estimated_duration_hours: 24,
        task_order: 1,
        is_active: true,
      },
      {
        name: 'Payment Verification',
        description: 'Verify payment has been received and processed',
        category: 'policy' as const,
        trigger_event: 'policy_issued' as const,
        priority: 'high' as const,
        estimated_duration_hours: 48,
        task_order: 2,
        is_active: true,
      },
      {
        name: 'Welcome Call',
        description: 'Make welcome call to review policy details and answer questions',
        category: 'policy' as const,
        trigger_event: 'policy_issued' as const,
        priority: 'medium' as const,
        estimated_duration_hours: 168, // 7 days
        task_order: 3,
        is_active: true,
      },
      
      // Renewal Flow
      {
        name: '60-Day Renewal Review',
        description: 'Review policy for renewal, check for any changes needed',
        category: 'renewal' as const,
        trigger_event: 'policy_renewal_due' as const,
        priority: 'medium' as const,
        estimated_duration_hours: 24,
        task_order: 1,
        is_active: true,
      },
      {
        name: 'Renewal Quote Preparation',
        description: 'Prepare renewal offer with updated pricing',
        category: 'renewal' as const,
        trigger_event: 'policy_renewal_due' as const,
        priority: 'medium' as const,
        estimated_duration_hours: 720, // 30 days
        task_order: 2,
        is_active: true,
      },
      
      // Claim Flow
      {
        name: 'First Notice of Loss',
        description: 'Contact insured to gather initial claim details',
        category: 'claim' as const,
        trigger_event: 'claim_filed' as const,
        priority: 'high' as const,
        estimated_duration_hours: 4,
        task_order: 1,
        is_active: true,
      },
      {
        name: 'Claim Documentation',
        description: 'Collect all required claim documentation and evidence',
        category: 'claim' as const,
        trigger_event: 'claim_filed' as const,
        priority: 'high' as const,
        estimated_duration_hours: 48,
        task_order: 2,
        is_active: true,
      },
    ];

    for (const template of templates) {
      await createTemplate(template);
    }

    setSeeding(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Quick Start
        </CardTitle>
        <CardDescription>
          Seed your database with common insurance workflow templates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={seedDefaultTemplates}
          disabled={seeding}
        >
          {seeding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {seeding ? 'Creating Templates...' : 'Seed Default Templates'}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          This will create 10 task templates for common insurance workflows
        </p>
      </CardContent>
    </Card>
  );
}
