# Task Management System - Phase 4 Guide

## Overview
Phase 4 introduces advanced task management features including time tracking, analytics, dependencies, recurring tasks, and activity monitoring.

## New Features

### 1. Task Time Tracking
Track time spent on tasks with built-in timer functionality.

**Features:**
- Start/stop timer for active tasks
- Log time entries with notes
- View total time spent per task
- Delete time entries
- Automatic duration calculation

**Usage:**
```tsx
import { TaskTimeTracker } from '@/components/tasks/TaskTimeTracker';

<TaskTimeTracker taskId={taskId} />
```

**In Task Detail View:**
- Click "Start Timer" to begin tracking
- Timer displays in real-time (HH:MM:SS format)
- Click "Stop" to end tracking and add optional notes
- View all time entries with durations

### 2. Task Analytics Dashboard
Visual analytics and insights for task performance.

**Metrics Displayed:**
- Total tasks count
- Completion rate percentage
- Tasks in progress
- Overdue tasks count
- Status distribution (pie chart)
- Priority distribution (bar chart)
- Category distribution (bar chart)

**Access:** Navigate to Tasks → Analytics tab

**Features:**
- Real-time statistics
- Visual charts using Recharts
- Automatic data aggregation
- Summary cards for key metrics

### 3. Advanced Filtering
Comprehensive task filtering with multiple criteria.

**Available Filters:**
- Text search (title/description)
- Status (pending, in_progress, completed, cancelled)
- Priority (low, medium, high, urgent)
- Category (quote, policy, claim, renewal, service, general)
- Due date range
- Created date range
- Assigned user

**Usage:**
```tsx
import { TaskAdvancedFilters } from '@/components/tasks/TaskAdvancedFilters';

<TaskAdvancedFilters 
  onFiltersChange={(filters) => applyFilters(filters)}
  onClear={() => clearFilters()}
/>
```

**Features:**
- Expandable/collapsible filter panel
- Active filter count display
- Clear all filters button
- Date range pickers with calendar
- Real-time filtering

### 4. Task Dependencies
Create and visualize task relationships and blocking dependencies.

**Dependency Types:**
- `finish_to_start` - Task B cannot start until Task A finishes (most common)
- `start_to_start` - Task B cannot start until Task A starts
- `finish_to_finish` - Task B cannot finish until Task A finishes
- `start_to_finish` - Task B cannot finish until Task A starts

**Features:**
- Add dependencies between tasks
- View "Blocked By" tasks (tasks that must complete first)
- View "Blocking" tasks (tasks waiting on this one)
- Remove dependencies
- Prevent circular dependencies (database constraint)

**Usage:**
```tsx
import { TaskDependencyVisualizer } from '@/components/tasks/TaskDependencyVisualizer';

<TaskDependencyVisualizer taskId={taskId} accountId={accountId} />
```

**In Task Detail:**
- Shows tasks blocking this task (in red)
- Shows tasks this task is blocking (in orange)
- Add new dependencies via dropdown
- Remove dependencies with delete button

### 5. Activity Feed
Real-time activity log for all task changes.

**Tracked Actions:**
- Task created
- Status changed
- Task assigned
- Task updated
- Comments added
- Attachments added

**Features:**
- Automatic activity logging via database triggers
- Shows user who performed action
- Displays time elapsed since action
- Includes change details
- Chronological timeline view

**Usage:**
```tsx
import { TaskActivityFeed } from '@/components/tasks/TaskActivityFeed';

<TaskActivityFeed taskId={taskId} />
```

### 6. Task Checklists (from Phase 3)
Break down tasks into smaller checkable items.

**Features:**
- Add checklist items
- Check/uncheck items
- Progress tracking (X/Y completed)
- Reorder items
- Delete items

**Usage:**
```tsx
import { TaskChecklist } from '@/components/tasks/TaskChecklist';

<TaskChecklist taskId={taskId} />
```

## Database Schema

### task_time_entries
```sql
- id (uuid, primary key)
- task_id (uuid, references tasks)
- user_id (uuid, references auth.users)
- started_at (timestamp)
- ended_at (timestamp, nullable)
- duration_minutes (integer, calculated)
- notes (text, nullable)
- created_at, updated_at
```

### task_recurrence_rules
```sql
- id (uuid, primary key)
- template_task_id (uuid, references tasks)
- recurrence_pattern (text: daily, weekly, monthly, yearly, custom)
- recurrence_interval (integer)
- days_of_week (integer[])
- day_of_month (integer)
- month_of_year (integer)
- end_date (date, nullable)
- max_occurrences (integer, nullable)
- last_generated_at (timestamp)
- occurrences_count (integer)
- is_active (boolean)
- created_at, updated_at
```

### task_dependencies
```sql
- id (uuid, primary key)
- task_id (uuid, references tasks)
- depends_on_task_id (uuid, references tasks)
- dependency_type (text)
- created_at
- UNIQUE constraint on (task_id, depends_on_task_id)
- CHECK constraint preventing self-reference
```

### task_activity_feed
```sql
- id (uuid, primary key)
- task_id (uuid, references tasks)
- user_id (uuid, references auth.users, nullable)
- action_type (text)
- changes (jsonb)
- metadata (jsonb)
- created_at
```

## Integration Examples

### Time Tracking in Task Detail
```tsx
// Automatically integrated in TaskDetail component
<TaskDetail task={task} ... />
// Includes time tracker with start/stop functionality
```

### Analytics in Reports
```tsx
// Add to reports page or dashboard
<TaskAnalyticsDashboard />
// Shows comprehensive task statistics
```

### Dependencies in Workflow
```tsx
// Check if task is blocked before allowing status change
const isBlocked = await checkTaskDependencies(taskId);
if (isBlocked) {
  toast({
    title: 'Task Blocked',
    description: 'Complete dependent tasks first',
    variant: 'destructive',
  });
}
```

## Best Practices

### Time Tracking
1. Start timer when beginning work on a task
2. Add notes when stopping timer for context
3. Review time entries regularly for accuracy
4. Use total time for project estimates

### Task Dependencies
1. Keep dependency chains simple and linear
2. Avoid circular dependencies (prevented by database)
3. Update dependent task status when completing blockers
4. Use finish_to_start for most workflows

### Activity Monitoring
1. Review activity feed to track team progress
2. Use for audit trails and compliance
3. Monitor for bottlenecks in workflows
4. Identify frequently updated tasks

### Analytics
1. Review completion rates weekly
2. Track overdue tasks and adjust priorities
3. Monitor workload distribution across categories
4. Use metrics to optimize team capacity

## Performance Considerations

- Activity feed limited to 50 most recent entries
- Time entries ordered by started_at DESC
- Dependencies use indexed foreign keys
- All queries use proper RLS policies for security

## Security

All Phase 4 tables have Row-Level Security (RLS) enabled:
- Users can only view data for tasks they have access to
- Time entries are user-scoped
- Dependencies inherit task permissions
- Activity feed is read-only via policies

## Future Enhancements (Phase 5 Ideas)

- **Email notifications** for task assignments and due dates
- **Slack/Teams integration** for activity updates  
- **Recurring tasks automation** with cron job
- **AI-powered task suggestions** based on patterns
- **Task templates from completed tasks**
- **Workload balancing** across team members
- **Custom fields** for task metadata
- **Export/import** task data

## Troubleshooting

### Time Tracker Not Stopping
- Ensure you have network connectivity
- Check browser console for errors
- Verify RLS policies allow updates to your entries

### Dependencies Not Showing
- Ensure tasks are in same account context
- Check that dependencies were created successfully
- Verify both tasks still exist (not deleted)

### Activity Feed Empty
- Activity logging requires trigger to be enabled
- Check that trigger `log_task_activity_trigger` exists
- Verify you have SELECT permission on task_activity_feed

### Analytics Not Loading
- Ensure tasks are being fetched successfully
- Check that you have access to the tasks
- Verify network requests in browser DevTools

## Support

For issues or questions:
1. Check database logs for errors
2. Review RLS policies for permissions
3. Verify triggers are enabled
4. Check console for client-side errors
