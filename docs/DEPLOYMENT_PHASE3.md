# Phase 3 Deployment Guide

**Date:** 2025-12-04
**Phase:** 3 - AI Capability Enhancements
**Status:** Ready for Production Deployment

---

## ✅ Pre-Deployment Checklist

- ✅ All code committed and pushed to GitHub
- ✅ No breaking changes
- ✅ Backward compatible
- ✅ All tests passing (manual verification)
- ⏳ Database migration ready to apply
- ⏳ Edge functions deployed (if needed)

---

## 📊 What's Being Deployed

### Code Changes:
1. **AI Response Feedback UI** - Thumbs up/down buttons on all AI messages
2. **Knowledge Entry Editing** - Edit dialog with version history
3. **KB Cache Extension** - Increased from 30 min to 24 hours

### Database Changes:
1. **New Table:** `knowledge_base_versions` - Version history tracking
2. **New Trigger:** Auto-save versions on knowledge updates
3. **New Function:** `get_knowledge_version_diff()` - Compare versions
4. **New Indexes:** Performance optimization for version queries
5. **RLS Policies:** Security for version access

### Discovered Features (Already in Production):
- Multi-tier caching system
- Knowledge analytics dashboard
- AI task generation
- Coverage gap analysis

---

## 🗄️ DATABASE DEPLOYMENT

### Option 1: Via Supabase Dashboard (RECOMMENDED)

1. **Go to Supabase Dashboard:**
   - Navigate to: https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv
   - Click on "SQL Editor"

2. **Run the Migration SQL:**
   - Copy the entire SQL from the file below
   - Paste into SQL Editor
   - Click "Run"

**SQL File Location:** `supabase/migrations/20251204000001_add_knowledge_base_versions.sql`

**SQL to Execute:**

```sql
-- Migration: Add Knowledge Base Version History
-- Date: 2024-12-04

-- =============================================================================
-- PART 1: Create knowledge_base_versions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  changed_by UUID REFERENCES auth.users(id),
  change_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.knowledge_base_versions IS 'Version history for knowledge base entries';

-- =============================================================================
-- PART 2: Create indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_kb_versions_knowledge_id
  ON public.knowledge_base_versions(knowledge_id);

CREATE INDEX IF NOT EXISTS idx_kb_versions_knowledge_version
  ON public.knowledge_base_versions(knowledge_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_kb_versions_changed_by
  ON public.knowledge_base_versions(changed_by);

CREATE INDEX IF NOT EXISTS idx_kb_versions_created
  ON public.knowledge_base_versions(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_versions_unique
  ON public.knowledge_base_versions(knowledge_id, version_number);

-- =============================================================================
-- PART 3: Row Level Security
-- =============================================================================

ALTER TABLE public.knowledge_base_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view knowledge versions"
  ON public.knowledge_base_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert knowledge versions"
  ON public.knowledge_base_versions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- =============================================================================
-- PART 4: Auto-version function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_knowledge_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM public.knowledge_base_versions
  WHERE knowledge_id = OLD.id;

  INSERT INTO public.knowledge_base_versions (
    knowledge_id, version_number, title, content, category,
    tags, source, metadata, changed_by, change_notes
  ) VALUES (
    OLD.id, next_version, OLD.title, OLD.content, OLD.category,
    OLD.tags, OLD.source, OLD.metadata, auth.uid(),
    'Auto-saved version before update'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 5: Trigger
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_create_knowledge_version ON public.knowledge_base;

CREATE TRIGGER trigger_create_knowledge_version
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW
  WHEN (
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.content IS DISTINCT FROM NEW.content OR
    OLD.category IS DISTINCT FROM NEW.category OR
    OLD.tags IS DISTINCT FROM NEW.tags OR
    OLD.source IS DISTINCT FROM NEW.source OR
    OLD.metadata IS DISTINCT FROM NEW.metadata
  )
  EXECUTE FUNCTION public.create_knowledge_version();

-- =============================================================================
-- PART 6: Version diff function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_knowledge_version_diff(
  p_knowledge_id UUID,
  p_version_1 INTEGER,
  p_version_2 INTEGER
)
RETURNS TABLE (
  field TEXT,
  version_1_value TEXT,
  version_2_value TEXT,
  changed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH v1 AS (
    SELECT * FROM public.knowledge_base_versions
    WHERE knowledge_id = p_knowledge_id AND version_number = p_version_1
  ),
  v2 AS (
    SELECT * FROM public.knowledge_base_versions
    WHERE knowledge_id = p_knowledge_id AND version_number = p_version_2
  )
  SELECT 'title'::TEXT, v1.title, v2.title, (v1.title IS DISTINCT FROM v2.title) FROM v1, v2
  UNION ALL
  SELECT 'content'::TEXT, v1.content, v2.content, (v1.content IS DISTINCT FROM v2.content) FROM v1, v2
  UNION ALL
  SELECT 'category'::TEXT, v1.category, v2.category, (v1.category IS DISTINCT FROM v2.category) FROM v1, v2
  UNION ALL
  SELECT 'source'::TEXT, v1.source, v2.source, (v1.source IS DISTINCT FROM v2.source) FROM v1, v2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 7: Permissions
-- =============================================================================

GRANT SELECT ON public.knowledge_base_versions TO authenticated;
GRANT INSERT ON public.knowledge_base_versions TO authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify table was created
SELECT COUNT(*) FROM public.knowledge_base_versions;

-- Verify trigger exists
SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_create_knowledge_version';

-- Verify function exists
SELECT proname FROM pg_proc WHERE proname = 'create_knowledge_version';
```

3. **Verify Success:**
   - The query should complete without errors
   - You should see: "Success. No rows returned"
   - Run verification queries at the end to confirm

---

### Option 2: Via Supabase CLI

```bash
# Make sure you're in the project directory
cd /Users/brianlewis/Documents/insurance-function/insureflow-ops

# Set access token
export SUPABASE_ACCESS_TOKEN=sbp_709723b6d66f36e8f72cef7f825704f88965d11a

# Link to project
supabase link --project-ref lrqajzwcmdwahnjyidgv

# Apply migration directly via psql
supabase db push
```

**Note:** CLI may have issues due to remote migrations from Lovable. Dashboard method is safer.

---

## 🚀 APPLICATION DEPLOYMENT

Since you're using **Lovable** for deployment, the code changes are automatically deployed when you push to GitHub.

### Verify Deployment:

1. **Check GitHub Actions (if configured):**
   - Go to: https://github.com/Lewis-Insurance/insureflow-ops/actions
   - Look for latest workflow run
   - Ensure it completes successfully

2. **Check Lovable Dashboard:**
   - Your Lovable project should auto-deploy from main branch
   - Verify the latest commit is deployed

3. **Test in Production:**
   - Open AI Assistant Chat
   - Look for thumbs up/down buttons on AI responses
   - Click one and verify toast notification appears

---

## 🔍 POST-DEPLOYMENT VERIFICATION

### 1. Database Verification

Run these queries in Supabase SQL Editor:

```sql
-- Check table exists
SELECT table_name FROM information_schema.tables
WHERE table_name = 'knowledge_base_versions';

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename = 'knowledge_base_versions';

-- Check policies exist
SELECT policyname FROM pg_policies
WHERE tablename = 'knowledge_base_versions';

-- Check trigger exists
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgname = 'trigger_create_knowledge_version';
```

**Expected Results:**
- Table exists: ✅
- RLS enabled: true
- Policies: 2 (view and insert)
- Trigger enabled: true

### 2. Application Verification

**Test Feedback Buttons:**
1. Open AI Assistant Chat in production
2. Send a test message
3. Look for 👍 and 👎 buttons on AI response
4. Click one button
5. Verify "Thanks for your feedback!" appears
6. Check database:
   ```sql
   SELECT * FROM ai_response_feedback ORDER BY created_at DESC LIMIT 5;
   ```

**Test Knowledge Editing (if using Knowledge Manager):**
1. Open Knowledge Manager
2. Find a knowledge entry
3. Click edit (when integrated)
4. Make a change
5. Save
6. Check version was created:
   ```sql
   SELECT * FROM knowledge_base_versions ORDER BY created_at DESC LIMIT 5;
   ```

### 3. Performance Verification

**Check Cache Hit Rate:**
```sql
-- If ai_feedback_analytics view exists
SELECT
  date,
  cache_hit_rate,
  cached_responses,
  total_feedback
FROM ai_feedback_analytics
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;
```

---

## 📊 MONITORING

### Metrics to Watch:

1. **AI Response Feedback:**
   - Helpfulness rate (target: > 70%)
   - Feedback volume
   - Response time

2. **Cache Performance:**
   - Hit rate (target: > 60%)
   - API cost reduction (target: 40%)
   - Response latency

3. **Knowledge Versions:**
   - Versions created per day
   - Edit frequency
   - Rollback usage

### Dashboard Queries:

```sql
-- Feedback summary (last 7 days)
SELECT
  DATE(created_at) as date,
  COUNT(*) as total,
  SUM(CASE WHEN helpful THEN 1 ELSE 0 END) as helpful_count,
  ROUND(100.0 * SUM(CASE WHEN helpful THEN 1 ELSE 0 END) / COUNT(*), 2) as helpfulness_rate
FROM ai_response_feedback
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Version activity (last 7 days)
SELECT
  DATE(created_at) as date,
  COUNT(DISTINCT knowledge_id) as entries_modified,
  COUNT(*) as versions_created
FROM knowledge_base_versions
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🔧 ROLLBACK PLAN

If issues arise, you can rollback:

### Rollback Database Changes:

```sql
-- Drop trigger
DROP TRIGGER IF EXISTS trigger_create_knowledge_version ON public.knowledge_base;

-- Drop function
DROP FUNCTION IF EXISTS public.create_knowledge_version();
DROP FUNCTION IF EXISTS public.get_knowledge_version_diff(UUID, INTEGER, INTEGER);

-- Drop table (WARNING: loses all version history)
DROP TABLE IF EXISTS public.knowledge_base_versions CASCADE;
```

### Rollback Code Changes:

```bash
# Revert to previous commit
git revert HEAD~3..HEAD

# Push rollback
git push origin main
```

**Note:** Database rollback will lose all version history. Only use if critical issues occur.

---

## 📞 SUPPORT

### If Issues Occur:

1. **Check Logs:**
   - Supabase Dashboard → Logs
   - Look for errors related to knowledge_base_versions

2. **Verify Permissions:**
   - Ensure RLS policies are correct
   - Check user roles have access

3. **Test in Staging:**
   - If available, test migration in staging first

### Known Issues:

**None expected** - Migration is backward compatible and uses `IF NOT EXISTS` clauses.

---

## ✅ DEPLOYMENT CHECKLIST

Before deployment:
- [ ] All code pushed to GitHub
- [ ] Database migration SQL reviewed
- [ ] Rollback plan understood

During deployment:
- [ ] Run database migration SQL
- [ ] Verify migration success
- [ ] Check application deployment
- [ ] Test feedback buttons
- [ ] Verify no errors in logs

After deployment:
- [ ] Monitor feedback volume
- [ ] Check cache hit rate
- [ ] Verify version creation works
- [ ] Update team on new features
- [ ] Document any issues

---

## 🎉 SUCCESS CRITERIA

Deployment is successful when:
- ✅ Database migration completes without errors
- ✅ Feedback buttons appear on AI messages
- ✅ Feedback submissions work
- ✅ Version history tracks changes
- ✅ No increase in error rates
- ✅ Performance metrics stable or improved

---

## 📝 NEXT STEPS AFTER DEPLOYMENT

1. Monitor for 24-48 hours
2. Collect user feedback
3. Review analytics data
4. Plan Phase 4 implementation
5. Train team on new features

---

**Deployment Owner:** Brian Lewis
**Deployment Date:** 2025-12-04
**Phase:** 3 - AI Capability Enhancements
**Status:** Ready for Production
