# InsureFlow Payment Tracking & Bank Reconciliation

## Complete Accountant's Manual

**Version:** 1.0
**Last Updated:** December 2024
**System:** InsureFlow Ops - Lewis Insurance

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Getting Started](#2-getting-started)
3. [Recording Payments](#3-recording-payments)
4. [Managing Day Sheets](#4-managing-day-sheets)
5. [End of Day Process](#5-end-of-day-process)
6. [Creating Bank Deposits](#6-creating-bank-deposits)
7. [QuickBooks Reconciliation](#7-quickbooks-reconciliation)
8. [Monthly Bank Statement Reconciliation](#8-monthly-bank-statement-reconciliation)
9. [Reports & Analytics](#9-reports--analytics)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. System Overview

### What This System Does

The InsureFlow Payment Tracking module manages the complete lifecycle of premium payments:

```
Customer Payment → Day Sheet → Bank Deposit → Bank Statement Match
```

### Key Concepts

| Term | Definition |
|------|------------|
| **Payment** | An individual premium payment from a customer |
| **Day Sheet** | A daily batch of all payments received (like a cash drawer) |
| **Escrow Deposit** | The physical bank deposit created from a day sheet |
| **Bank Statement Line** | A single transaction from your bank statement |
| **Reconciliation** | Matching your deposits to bank statement lines |

### Payment Methods Supported

- Cash
- Personal Check
- Business Check
- Credit Card
- Debit Card
- ACH/EFT
- Agency Bill
- Finance Company

---

## 2. Getting Started

### Accessing the System

1. Log in to InsureFlow at [lewisinsurance.ai](https://lewisinsurance.ai)
2. In the left sidebar, expand **"Accounting"**
3. You'll see three options:
   - **Payments** - View and record payments
   - **Day Sheets** - Manage daily payment batches
   - **Bank Reconciliation** - Match deposits to bank statements

### Navigation Quick Reference

| Task | Where to Go |
|------|-------------|
| Record a new payment | Accounting → Payments → "Record Payment" button |
| View today's day sheet | Accounting → Day Sheets (current day highlighted) |
| Close out the day | Accounting → Day Sheets → Select today → "Close Day Sheet" |
| Import bank statement | Accounting → Bank Reconciliation → "Import Statement" |

---

## 3. Recording Payments

### When to Record a Payment

Record a payment immediately when:
- A customer pays in person (cash, check, card)
- A check arrives in the mail
- You receive an ACH/EFT notification
- An online payment is processed

### Step-by-Step: Recording a Payment

1. Go to **Accounting → Payments**
2. Click the **"Record Payment"** button (top right)
3. Fill in the payment details:

#### Required Fields

| Field | What to Enter |
|-------|---------------|
| **Payment Method** | Select from dropdown (Cash, Check, Credit Card, etc.) |
| **Amount** | The payment amount in dollars |
| **Received Date** | Date payment was received (defaults to today) |

#### Optional but Recommended Fields

| Field | When to Use |
|-------|-------------|
| **Policy** | Search and select the policy this payment applies to |
| **Payer Name** | Name on the check or person making payment |
| **Check Number** | Required for check payments |
| **Reference Number** | For card/ACH transactions (confirmation number) |
| **Notes** | Any additional information |

4. Click **"Record Payment"**
5. A receipt number is automatically generated (e.g., RCP-ABC123)

### Recording Cash Payments

For cash payments, you can optionally enter:
- **Amount Tendered** - How much cash the customer gave
- The system automatically calculates **Change Given**

Example:
- Payment Amount: $156.00
- Amount Tendered: $160.00
- Change Given: $4.00 (calculated automatically)

### Recording Check Payments

For check payments, always enter:
- **Check Number** (required)
- **Check Date** (if different from received date)
- **Payer Name** (name printed on check)
- **Payer Address** (optional, for records)

### Recording Card Payments

For credit/debit card payments:
- **Reference Number** - The transaction/confirmation number
- This is important for reconciling card processor statements

---

## 4. Managing Day Sheets

### What is a Day Sheet?

A day sheet is a daily batch that automatically collects all payments received that day. Think of it like a cash drawer report.

- One day sheet per day (created automatically when first payment is recorded)
- Shows running totals by payment method
- Must be "closed" before creating a bank deposit

### Viewing Day Sheets

1. Go to **Accounting → Day Sheets**
2. You'll see:
   - **Today's Day Sheet** - Highlighted at the top with summary
   - **Recent Day Sheets** - Listed below with status

### Day Sheet Statuses

| Status | Meaning |
|--------|---------|
| **Open** (blue) | Active - payments can still be added |
| **Closed** (amber) | Finalized - ready for deposit |
| **Deposited** (green) | Bank deposit has been created |

### Viewing Day Sheet Details

Click on any day sheet to see:
- Complete list of all payments
- Breakdown by payment method
- Total cash, checks, cards, ACH
- Grand total
- Check count (for deposit slip)

---

## 5. End of Day Process

### Daily Closeout Checklist

Complete these steps at the end of each business day:

#### Step 1: Review Today's Payments

1. Go to **Accounting → Day Sheets**
2. Click on today's date
3. Review all payments for accuracy
4. Verify totals match your records

#### Step 2: Close the Day Sheet

1. From the day sheet detail page, click **"Close Day Sheet"**
2. A summary dialog appears showing:
   - Total payment count
   - Cash total
   - Check total (with count)
   - Card total
   - ACH total
   - Grand total

3. Optionally add notes (e.g., "Verified by Jane")

#### Step 3: Create Bank Deposit (Optional)

If you want to create the deposit record immediately:

1. Check **"Create escrow deposit"**
2. Select the **Bank Account** (e.g., "Escrow Account - First Bank")
3. The depositable amount (Cash + Checks) is shown

4. Click **"Close Day Sheet"**

The system will:
- Lock the day sheet (no more payments can be added)
- Calculate final totals
- Generate a day sheet number (e.g., DS-20241228-A1B2)
- Create the escrow deposit record (if selected)

### What Gets Deposited?

Only **cash and checks** go to the bank deposit:

| Payment Method | Goes to Bank Deposit? |
|---------------|----------------------|
| Cash | ✅ Yes |
| Checks | ✅ Yes |
| Credit Card | ❌ No (processed by card company) |
| Debit Card | ❌ No (processed by card company) |
| ACH/EFT | ❌ No (electronic transfer) |
| Agency Bill | ❌ No (carrier handles) |

---

## 6. Creating Bank Deposits

### Preparing the Physical Deposit

After closing a day sheet with "Create escrow deposit" checked:

1. Gather all cash and checks from the day
2. Complete a bank deposit slip:
   - Cash amount: From day sheet
   - Check count and total: From day sheet
   - Use the deposit slip number from the bank

### Recording the Deposit Slip Number

1. Go to **Accounting → Day Sheets**
2. Find the closed day sheet (status: "Deposited")
3. The deposit record is linked automatically

### Verifying the Deposit

After the bank processes your deposit:

1. The deposit will appear on your bank statement
2. Match it in the reconciliation process (see Section 8)

---

## 7. QuickBooks Reconciliation

### Overview

Since we're using manual verification (no QuickBooks API), you'll need to:
1. Export payment data from InsureFlow
2. Enter deposits manually in QuickBooks
3. Verify amounts match

### Daily QuickBooks Entry

After closing each day sheet:

1. **In InsureFlow:**
   - Go to the closed day sheet
   - Note the deposit amount (Cash + Checks)
   - Note the date

2. **In QuickBooks:**
   - Create a Bank Deposit entry
   - Enter the total amount
   - Use the day sheet number as reference

### Verifying Totals Match

At month end, compare:

| InsureFlow | QuickBooks |
|------------|------------|
| Sum of all deposits for month | Bank deposit entries for month |
| Should match exactly | |

### If Amounts Don't Match

1. Check each day sheet against QuickBooks entries
2. Look for:
   - Missing deposits
   - Transposition errors
   - Duplicate entries
3. Make adjusting entries as needed

---

## 8. Monthly Bank Statement Reconciliation

### Overview

At month end, you'll import your bank statement and match each deposit to your escrow deposit records.

### Step 1: Download Bank Statement

1. Log in to your bank's website
2. Navigate to your escrow/trust account
3. Download the statement as **CSV format**
   - Usually under "Download" or "Export"
   - Select the statement period (e.g., December 1-31, 2024)
   - Choose CSV format

### Step 2: Import Statement to InsureFlow

1. Go to **Accounting → Bank Reconciliation**
2. Click **"Import Statement"**
3. Fill in the details:

| Field | What to Enter |
|-------|---------------|
| **Bank Account** | Select your escrow account |
| **Statement Date** | Last day of the statement period |
| **Period Start** | First day of statement |
| **Period End** | Last day of statement |
| **Beginning Balance** | From your bank statement |
| **Ending Balance** | From your bank statement |

4. **Upload the CSV file** - Drag and drop or click to browse
5. Click **"Import Statement"**

### Step 3: Review Imported Transactions

After import, you'll see:
- **Unmatched** - Transactions needing attention
- **Matched** - Successfully matched to deposits
- **Excluded** - Non-premium transactions (fees, transfers)

### Step 4: Match Deposits

For each deposit line on the bank statement:

1. Find the corresponding line in the **Unmatched** tab
2. Click the **link icon** (🔗) to match
3. Select the matching escrow deposit from the list
4. The system shows "Exact Match" if amounts match perfectly

### Understanding Transaction Types

Your bank statement will show:

| Description Pattern | What It Is |
|--------------------|------------|
| `Deposit` | Your premium deposits ✅ Match these |
| `AUTO-OWNERS INS. PREM` | Carrier premium sweep ❌ Exclude |
| `PROG AMERICAN INS PREM` | Carrier premium sweep ❌ Exclude |
| `FOREMOST EPM PYMT` | Carrier premium sweep ❌ Exclude |
| `INTERNET XFR` | Internal transfer ❌ Exclude |
| `BASS UW, INC` | MGA premium sweep ❌ Exclude |

### Step 5: Exclude Non-Premium Transactions

Carrier premium sweeps and transfers are NOT your deposits. To exclude:

1. Find the transaction in the Unmatched list
2. Click the **exclude icon** (🚫)
3. Select a reason (e.g., "Carrier premium sweep")

### Step 6: Handle Variances

If a deposit amount doesn't match exactly:

1. Check the day sheet for the deposit date
2. Look for:
   - Voided payments
   - NSF checks
   - Adjustment entries
3. If legitimate, match anyway and note the variance

### Step 7: Complete Reconciliation

When all lines are matched or excluded:

1. Review the summary:
   - Matched lines
   - Excluded lines
   - Any remaining unmatched

2. If unmatched lines remain, investigate before completing

3. The statement status changes to **"Completed"**

---

## 9. Reports & Analytics

### Payment Reports

From **Accounting → Payments**, you can:

- **Filter by date range** - Quick filters for Today, 7 Days, This Month
- **Filter by status** - Recorded, Deposited, Voided
- **Filter by method** - Cash, Check, Card, etc.
- **Export data** - Download for external reporting

### Day Sheet Reports

From any day sheet, you can:

- **Print Day Sheet** - Formatted report for records
- View payment breakdown by method
- See check list with numbers

### Reconciliation Status

From **Bank Reconciliation**, you can see:

- Statements pending reconciliation
- Completed reconciliations
- Match success rate

---

## 10. Troubleshooting

### Common Issues

#### "I recorded a payment on the wrong day"

1. If day sheet is still **Open**: The payment will be on today's sheet regardless of received date
2. If day sheet is **Closed**: Contact admin to void and re-record

#### "I need to void a payment"

1. Go to **Accounting → Payments**
2. Find the payment
3. Click the menu (⋮) → **Void Payment**
4. Enter a reason
5. The payment is marked as voided (not deleted)

#### "My day sheet totals don't match my drawer"

1. Print the day sheet detail
2. Compare each payment to your records
3. Check for:
   - Missing payments (record them)
   - Duplicate payments (void duplicates)
   - Incorrect amounts (void and re-record)

#### "Bank statement import failed"

1. Check CSV format - must have Date, Description, Amount columns
2. Ensure file is saved as CSV (not Excel format)
3. Try downloading statement again from bank

#### "Deposit doesn't match bank statement"

1. Check the deposit date vs. bank posting date (may differ by 1-2 days)
2. Look for combined deposits (bank may combine multiple deposits)
3. Check for bank adjustments or fees

### Getting Help

For system issues:
- Contact your InsureFlow administrator
- Reference the day sheet number or payment receipt number

For accounting questions:
- Consult with your CPA
- Keep records of all reconciliation notes

---

## Quick Reference Card

### Daily Tasks

| When | Task | Where |
|------|------|-------|
| Throughout day | Record payments | Payments → Record Payment |
| End of day | Review day sheet | Day Sheets → Today |
| End of day | Close day sheet | Day Sheets → Close Day Sheet |
| After bank visit | Verify deposit | Day Sheets → Deposit status |

### Monthly Tasks

| When | Task | Where |
|------|------|-------|
| Month end | Download bank CSV | Your bank's website |
| Month end | Import statement | Bank Reconciliation → Import |
| Month end | Match deposits | Bank Reconciliation → Match |
| Month end | Exclude non-deposits | Bank Reconciliation → Exclude |
| Month end | Complete reconciliation | Bank Reconciliation → Complete |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Open global search |
| `Esc` | Close dialog/modal |

---

## Appendix: Your Bank Statement Format

Your bank exports CSV files with these columns:

```
"Date","Description","Comments","Check Number","Amount","Balance"
```

Example transactions:

| Type | Example | Action |
|------|---------|--------|
| Your deposit | `"12/23/2025","Deposit","Deposit","","$1,628.00"` | **Match** to escrow deposit |
| Carrier sweep | `"12/24/2025","AUTO-OWNERS INS. PREM AR12036200"..."-$904.04"` | **Exclude** (carrier premium) |
| Transfer | `"12/22/2025","INTERNET XFR TO CHECKG x4747"..."-$299.00"` | **Exclude** (internal transfer) |

---

**Document Version:** 1.0
**Created:** December 2024
**For:** Lewis Insurance Accounting Team
