-- Team Messaging System Migration
-- Creates tables for internal team communication (DMs, group chats, account threads)

-- ============================================================================
-- TEAM CONVERSATIONS
-- ============================================================================
-- Represents a conversation container (DM, group chat, or account-linked thread)
CREATE TABLE IF NOT EXISTS team_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'account_thread')),
  name TEXT,  -- For group chats/channels (null for DMs)
  description TEXT,  -- Optional description for channels
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,  -- For account-linked threads
  created_by UUID NOT NULL REFERENCES auth.users(id),
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying conversations by workspace
CREATE INDEX IF NOT EXISTS idx_team_conversations_workspace ON team_conversations(agency_workspace_id);
-- Index for account-linked threads
CREATE INDEX IF NOT EXISTS idx_team_conversations_account ON team_conversations(account_id) WHERE account_id IS NOT NULL;

-- ============================================================================
-- CONVERSATION PARTICIPANTS
-- ============================================================================
-- Links users to conversations with roles and read tracking
CREATE TABLE IF NOT EXISTS team_conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,  -- For unread message tracking
  last_read_message_id UUID,  -- Last message the user has read
  muted BOOLEAN DEFAULT FALSE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  UNIQUE(conversation_id, user_id)
);

-- Index for finding user's conversations
CREATE INDEX IF NOT EXISTS idx_team_conversation_participants_user ON team_conversation_participants(user_id);
-- Index for finding participants in a conversation
CREATE INDEX IF NOT EXISTS idx_team_conversation_participants_convo ON team_conversation_participants(conversation_id);

-- ============================================================================
-- MESSAGES
-- ============================================================================
-- Individual messages within conversations
CREATE TABLE IF NOT EXISTS team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'system', 'link')),
  reply_to_id UUID REFERENCES team_messages(id) ON DELETE SET NULL,  -- For threading
  metadata JSONB DEFAULT '{}',  -- File info, @mentions, linked records, etc.
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,  -- Soft delete
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching messages in a conversation (ordered by time)
CREATE INDEX IF NOT EXISTS idx_team_messages_conversation ON team_messages(conversation_id, created_at DESC);
-- Index for finding replies to a message
CREATE INDEX IF NOT EXISTS idx_team_messages_reply_to ON team_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
-- Index for searching messages by sender
CREATE INDEX IF NOT EXISTS idx_team_messages_sender ON team_messages(sender_id);

-- ============================================================================
-- MESSAGE REACTIONS
-- ============================================================================
-- Emoji reactions on messages
CREATE TABLE IF NOT EXISTS team_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- Index for fetching reactions on a message
CREATE INDEX IF NOT EXISTS idx_team_message_reactions_message ON team_message_reactions(message_id);

-- ============================================================================
-- USER PRESENCE
-- ============================================================================
-- Track online/away/offline status for team members
CREATE TABLE IF NOT EXISTS team_user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  custom_status TEXT,  -- "In a meeting", "Out of office", etc.
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching presence by workspace
CREATE INDEX IF NOT EXISTS idx_team_user_presence_workspace ON team_user_presence(agency_workspace_id);

-- ============================================================================
-- MENTIONS
-- ============================================================================
-- Track @mentions for notifications and searching
CREATE TABLE IF NOT EXISTS team_message_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, mentioned_user_id)
);

-- Index for finding unread mentions for a user
CREATE INDEX IF NOT EXISTS idx_team_message_mentions_user ON team_message_mentions(mentioned_user_id, read_at);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE team_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_message_mentions ENABLE ROW LEVEL SECURITY;

-- CONVERSATIONS: Users can see conversations they're a participant in
CREATE POLICY "Users can view conversations they participate in"
  ON team_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_conversation_participants tcp
      WHERE tcp.conversation_id = team_conversations.id
        AND tcp.user_id = auth.uid()
    )
  );

-- CONVERSATIONS: Users can create conversations in their workspace
CREATE POLICY "Users can create conversations in their workspace"
  ON team_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = team_conversations.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- CONVERSATIONS: Owners/admins can update conversations
CREATE POLICY "Conversation owners can update"
  ON team_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_conversation_participants tcp
      WHERE tcp.conversation_id = team_conversations.id
        AND tcp.user_id = auth.uid()
        AND tcp.role IN ('owner', 'admin')
    )
  );

-- PARTICIPANTS: Users can see participants in their conversations
CREATE POLICY "Users can view participants in their conversations"
  ON team_conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_conversation_participants my_participation
      WHERE my_participation.conversation_id = team_conversation_participants.conversation_id
        AND my_participation.user_id = auth.uid()
    )
  );

-- PARTICIPANTS: Conversation owners/admins can add participants
CREATE POLICY "Conversation admins can add participants"
  ON team_conversation_participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_conversation_participants tcp
      WHERE tcp.conversation_id = team_conversation_participants.conversation_id
        AND tcp.user_id = auth.uid()
        AND tcp.role IN ('owner', 'admin')
    )
    OR
    -- Allow users to add themselves when creating a conversation
    team_conversation_participants.user_id = auth.uid()
  );

-- PARTICIPANTS: Users can update their own participation (mute, last_read_at)
CREATE POLICY "Users can update their own participation"
  ON team_conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

-- MESSAGES: Users can see messages in conversations they participate in
CREATE POLICY "Users can view messages in their conversations"
  ON team_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_conversation_participants tcp
      WHERE tcp.conversation_id = team_messages.conversation_id
        AND tcp.user_id = auth.uid()
    )
  );

-- MESSAGES: Participants can send messages to their conversations
CREATE POLICY "Participants can send messages"
  ON team_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_conversation_participants tcp
      WHERE tcp.conversation_id = team_messages.conversation_id
        AND tcp.user_id = auth.uid()
    )
  );

-- MESSAGES: Users can edit/delete their own messages
CREATE POLICY "Users can update their own messages"
  ON team_messages FOR UPDATE
  USING (sender_id = auth.uid());

-- REACTIONS: Users can see reactions on messages they can see
CREATE POLICY "Users can view reactions on visible messages"
  ON team_message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_messages tm
      JOIN team_conversation_participants tcp ON tcp.conversation_id = tm.conversation_id
      WHERE tm.id = team_message_reactions.message_id
        AND tcp.user_id = auth.uid()
    )
  );

-- REACTIONS: Users can add reactions to messages they can see
CREATE POLICY "Users can add reactions"
  ON team_message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_messages tm
      JOIN team_conversation_participants tcp ON tcp.conversation_id = tm.conversation_id
      WHERE tm.id = team_message_reactions.message_id
        AND tcp.user_id = auth.uid()
    )
  );

-- REACTIONS: Users can remove their own reactions
CREATE POLICY "Users can remove their own reactions"
  ON team_message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- PRESENCE: Users can see presence of users in their workspace
CREATE POLICY "Users can view presence in their workspace"
  ON team_user_presence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = team_user_presence.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- PRESENCE: Users can update their own presence
CREATE POLICY "Users can update their own presence"
  ON team_user_presence FOR ALL
  USING (user_id = auth.uid());

-- MENTIONS: Users can see their own mentions
CREATE POLICY "Users can view their own mentions"
  ON team_message_mentions FOR SELECT
  USING (mentioned_user_id = auth.uid());

-- MENTIONS: Can insert mentions when sending messages
CREATE POLICY "Can create mentions when sending messages"
  ON team_message_mentions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_messages tm
      WHERE tm.id = team_message_mentions.message_id
        AND tm.sender_id = auth.uid()
    )
  );

-- MENTIONS: Users can mark their own mentions as read
CREATE POLICY "Users can update their own mentions"
  ON team_message_mentions FOR UPDATE
  USING (mentioned_user_id = auth.uid());

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create a direct message conversation between two users
CREATE OR REPLACE FUNCTION get_or_create_dm_conversation(
  p_user_id_1 UUID,
  p_user_id_2 UUID,
  p_agency_workspace_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Look for existing DM between these two users
  SELECT tc.id INTO v_conversation_id
  FROM team_conversations tc
  WHERE tc.type = 'direct'
    AND tc.agency_workspace_id = p_agency_workspace_id
    AND EXISTS (
      SELECT 1 FROM team_conversation_participants tcp1
      WHERE tcp1.conversation_id = tc.id AND tcp1.user_id = p_user_id_1
    )
    AND EXISTS (
      SELECT 1 FROM team_conversation_participants tcp2
      WHERE tcp2.conversation_id = tc.id AND tcp2.user_id = p_user_id_2
    )
    AND (
      SELECT COUNT(*) FROM team_conversation_participants tcp
      WHERE tcp.conversation_id = tc.id
    ) = 2
  LIMIT 1;

  -- If no existing DM, create one
  IF v_conversation_id IS NULL THEN
    INSERT INTO team_conversations (agency_workspace_id, type, created_by)
    VALUES (p_agency_workspace_id, 'direct', p_user_id_1)
    RETURNING id INTO v_conversation_id;

    -- Add both participants
    INSERT INTO team_conversation_participants (conversation_id, user_id, role)
    VALUES
      (v_conversation_id, p_user_id_1, 'member'),
      (v_conversation_id, p_user_id_2, 'member');
  END IF;

  RETURN v_conversation_id;
END;
$$;

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION get_unread_message_counts(p_user_id UUID)
RETURNS TABLE (
  conversation_id UUID,
  unread_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    tcp.conversation_id,
    COUNT(tm.id) AS unread_count
  FROM team_conversation_participants tcp
  LEFT JOIN team_messages tm ON tm.conversation_id = tcp.conversation_id
    AND tm.created_at > COALESCE(tcp.last_read_at, '1970-01-01'::timestamptz)
    AND tm.sender_id != p_user_id
    AND tm.deleted_at IS NULL
  WHERE tcp.user_id = p_user_id
  GROUP BY tcp.conversation_id;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at on conversations when modified
CREATE OR REPLACE FUNCTION update_team_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_conversations_updated_at
  BEFORE UPDATE ON team_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_team_conversation_timestamp();

-- Update conversation's updated_at when a new message is sent
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE team_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_messages_update_conversation
  AFTER INSERT ON team_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- Update presence timestamp
CREATE OR REPLACE FUNCTION update_presence_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_user_presence_updated_at
  BEFORE UPDATE ON team_user_presence
  FOR EACH ROW
  EXECUTE FUNCTION update_presence_timestamp();
