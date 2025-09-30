# Task Automation Guide

## Overview
Phase 2 of the task management system enables automatic task generation based on business events using pre-configured templates.

## Key Concepts

### Task Templates
Templates define:
- What task to create
- When to create it (trigger event)
- Default priority and category
- Expected completion time
- Execution order

### Trigger Events
Tasks are automatically generated when these events occur:
- `quote_requested` - When a new quote is requested
- `quote_accepted` - When a customer accepts a quote
- `policy_issued` - When a new policy is issued
- `policy_renewal_due` - When a policy is approaching renewal
- `claim_filed` - When a claim is filed
- `payment_overdue` - When payment is past due
- `service_request` - When a service request is created
- `manual` - For templates that don't auto-trigger

## Setup Instructions

### 1. Create Task Templates (Admin Only)

Navigate to Admin → Task Templates tab:

1. Click "Seed Default Templates" to create 10 common templates
2. Or create custom templates:
   - Set trigger event
   - Define priority and category
   - Set estimated duration for auto due dates
   - Set task order for sequence
   - Toggle active/inactive status

### 2. Integrate into Your Workflows

#### Method 1: Using Helper Components

```tsx
import { QuoteTaskGenerator } from '@/components/quotes/QuoteTaskGenerator';

// In your quote detail/edit component
<QuoteTaskGenerator 
  quoteId={quote.id}
  accountId={quote.account_id}
  status={quote.status}
/>
```

#### Method 2: Using Helper Function

```tsx
import { generateTasks } from '@/lib/taskAutomation';

// After creating a policy
const handlePolicyCreation = async (policyData) => {
  const policy = await createPolicy(policyData);
  
  // Auto-generate tasks
  await generateTasks(
    'policy_issued',
    policy.account_id,
    'policy',
    policy.id
  );
};
```

#### Method 3: Using Hook Directly

```tsx
import { useTaskTemplates } from '@/hooks/useTaskTemplates';

const { generateTasksFromEvent } = useTaskTemplates();

// When quote is accepted
await generateTasksFromEvent(
  'quote_accepted',
  accountId,
  'quote',
  quoteId
);
```

## Task Sequencing

Templates with the same trigger event are executed in order based on their `task_order` field:

```
task_order: 1 → "Initial Contact" (due in 24h)
task_order: 2 → "Risk Assessment" (due in 48h)  
task_order: 3 → "Quote Preparation" (due in 72h)
```

## Task Dependencies

Future phases will support task dependencies where:
- Task B cannot start until Task A is completed
- Dependent tasks are automatically marked as "blocked"
- Visual indication of dependency chains

## Examples

### Example 1: Quote Request Workflow

Create templates for:
1. Initial Contact (24h) - High priority
2. Needs Analysis (48h) - Medium priority
3. Quote Preparation (72h) - Medium priority
4. Quote Delivery (96h) - High priority
5. Follow-up Call (120h) - Low priority

### Example 2: Policy Onboarding

Create templates for:
1. Document Collection (24h) - High priority
2. Payment Verification (48h) - High priority
3. Policy Setup (72h) - Medium priority
4. Welcome Call (1 week) - Medium priority

### Example 3: Claim Processing

Create templates for:
1. First Notice (4h) - Urgent priority
2. Document Request (24h) - High priority
3. Adjuster Assignment (48h) - High priority
4. Investigation (1 week) - Medium priority

## Best Practices

1. **Keep templates simple**: One clear action per template
2. **Set realistic durations**: Base on actual business SLAs
3. **Use task order**: Ensure logical workflow progression
4. **Test before activating**: Create templates as inactive, test manually, then activate
5. **Review regularly**: Update templates based on team feedback
6. **Monitor generation logs**: Check `task_generation_log` table for debugging

## Troubleshooting

### Tasks not generating automatically
- Check template `is_active` is true
- Verify trigger event matches your code
- Check `task_generation_log` table for errors
- Ensure account has proper memberships

### Wrong due dates
- Review `estimated_duration_hours` in template
- System adds duration to current time for due date
- Null duration = no due date

### Duplicate tasks
- Generation is idempotent per event
- Check your code isn't calling generation multiple times
- Review trigger event logic

## Next Steps (Phase 3)

Phase 3 will add:
- Kanban board view
- Calendar view
- My Tasks dashboard
- Task checklists
- Bulk actions
