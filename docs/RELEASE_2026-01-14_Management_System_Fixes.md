# Management System Updates - January 14, 2026

## Summary

We've deployed 11 fixes to improve task management, policy handling, and document processing. This document explains what changed and how it affects your daily workflow.

---

## Table of Contents

1. [Task Assignment Changes](#1-task-assignment-changes)
2. [Policy Cancellation Scheduling](#2-policy-cancellation-scheduling)
3. [Policy Expiration Date Fix](#3-policy-expiration-date-fix)
4. [Document Upload Improvements](#4-document-upload-improvements)
5. [Navigation Update](#5-navigation-update)
6. [Quick Complete Button](#6-quick-complete-button)

---

## 1. Task Assignment Changes

### What Changed

- **Tasks now have clear ownership**: When tasks are created from templates (like renewal tasks), they go to a specific person, not everyone.
- **Mya receives renewal tasks**: Renewal verification tasks are now assigned directly to Mya.
- **Unassigned tasks are admin-only**: If a task has no assignee, only admins can see it. This prevents task overload for staff.

### How Assignment Works Now

1. **Specific User** - If the template has a person assigned, they get the task
2. **Role-Based** - If no person but a role is set (like "CSR"), someone with that role gets it
3. **Creator** - If neither is set, the person who triggered the action gets the task

### What You'll Notice

- Your task list will only show tasks assigned to you or that you created
- No more seeing everyone's tasks
- Admins can still see all tasks including unassigned ones

---

## 2. Policy Cancellation Scheduling

### What Changed

When you set a policy to "Inactive" or "Cancelled", the system now asks **when** the cancellation should take effect.

### How to Use

1. Open a policy and click **Edit**
2. Change status to "Cancelled" or select "Inactive"
3. A popup appears asking: **"When should this policy cancel?"**
4. Choose:
   - **Today** - Policy cancels immediately
   - **Future date** - Policy stays active until that date

### What Each Option Does

| Choice | Result |
|--------|--------|
| Today/Past date | Policy marked as "Cancelled" immediately |
| Future date | Policy shows "Scheduled to cancel on MM/DD/YYYY" but stays active |

### Why This Matters

- Policies scheduled for future cancellation still appear in active policy reports
- Renewal reminders won't trigger for policies scheduled to cancel
- You can plan ahead without immediately deactivating coverage

---

## 3. Policy Expiration Date Fix

### What Changed

The semi-annual (6-month) policy expiration date calculation was fixed.

### The Problem

- **Before**: Effective 01/10/2026 + semi-annual = 07/09/2027 (WRONG)
- **After**: Effective 01/10/2026 + semi-annual = 07/10/2026 (CORRECT)

### What You Need to Do

- **New policies**: Will calculate correctly automatically
- **Existing policies**: If you notice an incorrect expiration date, edit the policy and re-select the term. The date will recalculate correctly.

### Policy Term Reference

| Term | Duration | Example |
|------|----------|---------|
| Annual | 12 months | 01/10/2026 → 01/10/2027 |
| Semi-annual | 6 months | 01/10/2026 → 07/10/2026 |
| Quarterly | 3 months | 01/10/2026 → 04/10/2026 |
| Monthly | 1 month | 01/10/2026 → 02/10/2026 |

---

## 4. Document Upload Improvements

### A. Spouse Name Parsing

**What Changed**: When you upload a dec page with two names like "Brian Lewis & Letitia Lewis", the system now correctly separates them.

**Before**:
- Name: "Brian Lewis & Letitia Lewis" (all in one field)
- Spouse: (empty)

**After**:
- Name: "Brian Lewis"
- Spouse Name: "Letitia Lewis"
- Account Type: Automatically set to "Household"

### B. Phone Number Detection

**What Changed**: The system no longer confuses the agency phone number with the customer's phone number.

**Before**: Would sometimes pick up the agency phone (at the top of the document) as the customer's phone

**After**: Only extracts phone numbers from the "Named Insured" or "Applicant" section

### C. "Also Add a Policy" Toggle

**What Changed**: The toggle to add a policy during customer creation now works correctly.

**Before**: Toggle would activate even if only carrier OR policy number was found

**After**: Toggle only activates when BOTH carrier AND policy number are found (ensures complete policy data)

### D. Policy Type Consistency

**What Changed**: Policy types are now normalized consistently.

| What You Enter | What Gets Saved | What You See |
|----------------|-----------------|--------------|
| home_policy | home | Home |
| Home Policy | home | Home |
| HO3 | home | Home |
| homeowners | home | Home |
| auto_policy | auto | Auto |
| automobile | auto | Auto |

This ensures filtering and reports work correctly regardless of how the type was entered.

---

## 5. Navigation Update

### What Changed

The **CRM** section has been moved higher in the left sidebar navigation.

### New Order

1. Dashboard, AO Renewals, Leads, etc. (Top items)
2. **CRM** (Customers, Accounts, Contacts) ← Moved up!
3. Lewi AI
4. ACORD Forms
5. Marketing
6. Accounting
7. Team
...

### Why

The CRM section is used most frequently, so it's now easier to access without scrolling.

---

## 6. Quick Complete Button

### What Changed

You can now quickly mark tasks as complete from the **customer profile** Tasks section.

### How to Use

1. Go to any customer's profile
2. Find the **Tasks** section
3. Click the **checkmark icon** (✓) on the right side of any task
4. Task is marked complete instantly (no modal needed)

### Where This Works

| Location | Quick Complete Available? |
|----------|---------------------------|
| Customer Profile → Tasks | ✅ Yes (NEW!) |
| My Tasks Dashboard | ✅ Yes |
| Upcoming Tasks Widget | ✅ Yes |

---

## Duplicate Task Prevention

### What Changed (Behind the Scenes)

The system now prevents duplicate tasks from being created.

### Example Scenario

**Before**: Creating a customer with 3 policies (Home, Auto, Flood) would create 3 "Welcome Call" tasks.

**After**: Only 1 "Welcome Call" task is created, regardless of how many policies.

### How It Works

Tasks now have a "scope" that determines uniqueness:

| Scope | Meaning | Example |
|-------|---------|---------|
| Account | One task per customer | Welcome Call |
| Policy | One task per policy | Review Coverage |
| Renewal | One task per renewal cycle | Verify Payment |

You don't need to do anything different - this happens automatically.

---

## Questions?

If you encounter any issues or have questions about these changes, please contact Brian or submit a support ticket.

---

**Release Date**: January 14, 2026
**Version**: Management System Fixes v1.0
