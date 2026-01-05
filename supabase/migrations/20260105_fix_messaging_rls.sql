-- Fix RLS policies for team messaging
-- The self-referential policy on team_conversation_participants may cause issues

-- Drop the existing complex policy
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON team_conversation_participants;

-- Create simpler, more direct policies
-- Policy 1: Users can always see their own participation records
CREATE POLICY "Users can view own participations"
  ON team_conversation_participants FOR SELECT
  USING (user_id = auth.uid());

-- Policy 2: Users can see other participants in conversations they belong to
-- This uses a subquery that first finds the user's conversations
CREATE POLICY "Users can view co-participants"
  ON team_conversation_participants FOR SELECT
  USING (
    conversation_id IN (
      SELECT tcp.conversation_id
      FROM team_conversation_participants tcp
      WHERE tcp.user_id = auth.uid()
    )
  );
