// ============================================================
// Workspace Types with Entity Linking Support
// ============================================================

// Entity type that a workspace can be linked to
export type WorkspaceEntityType = 'account' | 'lead' | 'policy' | null;

export type WorkspaceStatus = 'idle' | 'processing' | 'completed' | 'failed';

// Base workspace from database
export interface Workspace {
    id: string;
    name: string;
    description?: string | null;
    task_type: string;
    status: WorkspaceStatus;
    notes?: string | null;

    // Entity linking
    account_id?: string | null;
    lead_id?: string | null;
    policy_id?: string | null;
    linked_entity_type?: WorkspaceEntityType;

    // Legacy field (keep for backwards compatibility)
    client_name?: string | null;

    // Analysis
    analysis_output?: Record<string, any>;

    // Timestamps
    created_by: string;
    created_at: string;
    updated_at: string;

    // Joined creator name (from hooks, not DB)
    creator_name?: string;
}

// Extended workspace with JOINed entity details
export interface WorkspaceWithEntities extends Workspace {
    // Account details
    account_name?: string | null;
    account_email?: string | null;
    account_type?: string | null;

    // Lead details
    lead_name?: string | null;
    lead_email?: string | null;
    lead_status?: string | null;
    pipeline_stage_id?: string | null;
    lead_company?: string | null;

    // Policy details
    policy_number?: string | null;
    carrier_name?: string | null;
    policy_lob?: string | null;
    policy_status?: string | null;
    effective_date?: string | null;
    expiration_date?: string | null;

    // Creator details
    creator_name?: string | null;
    creator_email?: string | null;
}

// Document attached to workspace
export interface WorkspaceDocument {
    id: string;
    workspace_id: string;
    file_name: string | null;
    file_url?: string | null;
    file_path?: string | null;
    role?: string | null;
    parseur_document_id?: string | null;
    created_at: string;
}

// For linking a workspace to an entity
export interface LinkWorkspacePayload {
    workspace_id: string;
    entity_type: 'account' | 'lead' | 'policy';
    entity_id: string;
}

// Filter options for workspace list
export interface WorkspaceFilters {
    search?: string;
    status?: WorkspaceStatus | 'all';
    task_type?: string | 'all';
    entity_type?: WorkspaceEntityType | 'all';
    account_id?: string;
    lead_id?: string;
    policy_id?: string;
    unlinked_only?: boolean;
    created_by?: string;
    date_from?: string;
    date_to?: string;
}

// Stats for workspace entity distribution
export interface WorkspaceEntityStats {
    total: number;
    unlinked: number;
    accounts: number;
    leads: number;
    policies: number;
}
