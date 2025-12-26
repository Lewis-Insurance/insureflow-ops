-- ============================================================================
-- PERFORMANCE INDEXES MIGRATION
-- ============================================================================
-- Purpose: Add missing indexes for common query patterns
-- Based on actual schema analysis - only includes verified tables/columns
-- ============================================================================

-- ============================================================================
-- DOCUMENTS TABLE INDEXES
-- ============================================================================

-- Index for fetching documents by uploader
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
  ON documents(uploaded_by);

-- Index for document kind filtering
CREATE INDEX IF NOT EXISTS idx_documents_kind
  ON documents(kind);

-- Index for account-based document lookups
CREATE INDEX IF NOT EXISTS idx_documents_account_id
  ON documents(account_id);

-- ============================================================================
-- ACCOUNTS TABLE INDEXES
-- ============================================================================

-- Index for account type filtering
CREATE INDEX IF NOT EXISTS idx_accounts_type
  ON accounts(type);

-- Index for account name search (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_accounts_name_lower
  ON accounts(LOWER(name));

-- Index for team-based queries
CREATE INDEX IF NOT EXISTS idx_accounts_team_id
  ON accounts(team_id);

-- ============================================================================
-- POLICIES TABLE INDEXES
-- ============================================================================

-- Index for policy expiration date (renewal queries)
CREATE INDEX IF NOT EXISTS idx_policies_expiration
  ON policies(expiration_date);

-- Index for policy status filtering
CREATE INDEX IF NOT EXISTS idx_policies_status
  ON policies(status);

-- Index for account-based policy lookups
CREATE INDEX IF NOT EXISTS idx_policies_account_id
  ON policies(account_id);

-- Index for carrier lookups
CREATE INDEX IF NOT EXISTS idx_policies_carrier_id
  ON policies(carrier_id);

-- ============================================================================
-- QUOTES TABLE INDEXES
-- ============================================================================

-- Index for quote status filtering
CREATE INDEX IF NOT EXISTS idx_quotes_status
  ON quotes(status);

-- Index for account-based quote lookups
CREATE INDEX IF NOT EXISTS idx_quotes_account_id
  ON quotes(account_id);

-- Index for carrier lookups
CREATE INDEX IF NOT EXISTS idx_quotes_carrier_id
  ON quotes(carrier_id);

-- ============================================================================
-- TASKS TABLE INDEXES
-- ============================================================================

-- Index for task due dates
CREATE INDEX IF NOT EXISTS idx_tasks_due_at
  ON tasks(due_at);

-- Index for assigned user queries
CREATE INDEX IF NOT EXISTS idx_tasks_assignee
  ON tasks(assignee_id);

-- Index for task status
CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks(status);

-- Index for entity lookups (polymorphic association)
CREATE INDEX IF NOT EXISTS idx_tasks_entity
  ON tasks(entity_type, entity_id);

-- ============================================================================
-- COMMUNICATIONS TABLE INDEXES
-- ============================================================================

-- Foreign key index
CREATE INDEX IF NOT EXISTS idx_communications_account_id
  ON communications(account_id);

-- Index for communication type filtering
CREATE INDEX IF NOT EXISTS idx_communications_type
  ON communications(type);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_communications_occurred_at
  ON communications(occurred_at DESC);

-- ============================================================================
-- PROFILES TABLE INDEXES
-- ============================================================================

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles(role);

-- Index for staff users
CREATE INDEX IF NOT EXISTS idx_profiles_staff
  ON profiles(id) WHERE is_staff = true;

-- ============================================================================
-- ACORD FORMS INDEXES
-- ============================================================================

-- ACORD forms by account
CREATE INDEX IF NOT EXISTS idx_acord_forms_account
  ON acord_forms(account_id);

-- ACORD forms by template
CREATE INDEX IF NOT EXISTS idx_acord_forms_template
  ON acord_forms(template_id);

-- ACORD forms by submission status
CREATE INDEX IF NOT EXISTS idx_acord_forms_submission_status
  ON acord_forms(submission_status);

-- ============================================================================
-- DOCUMENT EXTRACTIONS INDEXES
-- ============================================================================

-- Document extractions by status (for processing queue)
CREATE INDEX IF NOT EXISTS idx_document_extractions_status
  ON document_extractions(status);

-- Document extractions by account
CREATE INDEX IF NOT EXISTS idx_document_extractions_account
  ON document_extractions(account_id);

-- ============================================================================
-- CALL SESSIONS INDEXES
-- ============================================================================

-- Call sessions by account
CREATE INDEX IF NOT EXISTS idx_call_sessions_account
  ON call_sessions(account_id);

-- Call sessions by date
CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at
  ON call_sessions(started_at DESC);

-- Call sessions by Twilio SID (for webhook lookups)
CREATE INDEX IF NOT EXISTS idx_call_sessions_twilio_sid
  ON call_sessions(twilio_call_sid);

-- ============================================================================
-- COMMENT: Run ANALYZE after migration to update statistics
-- ============================================================================
-- After running this migration, execute:
-- ANALYZE documents, accounts, policies, quotes, tasks, communications, profiles;
