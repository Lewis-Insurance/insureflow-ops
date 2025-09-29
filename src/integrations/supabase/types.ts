export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      account_memberships: {
        Row: {
          account_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_tags: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          tag_name: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          tag_name: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"] | null
          account_type: Database["public"]["Enums"]["account_type_new"] | null
          address_line1: string | null
          address_line2: string | null
          business_id: string | null
          city: string | null
          contact_id: string | null
          created_at: string
          custom: Json | null
          deleted_at: string | null
          email: string | null
          id: string
          lead_source_detail: string | null
          name: string
          notes: string | null
          owner_agent_id: string | null
          phone: string | null
          search_vector: unknown | null
          source: string | null
          state: string | null
          team_id: string | null
          tin_last4: string | null
          type: Database["public"]["Enums"]["account_type_v2"]
          type_old: Database["public"]["Enums"]["account_type"] | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          account_type?: Database["public"]["Enums"]["account_type_new"] | null
          address_line1?: string | null
          address_line2?: string | null
          business_id?: string | null
          city?: string | null
          contact_id?: string | null
          created_at?: string
          custom?: Json | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          lead_source_detail?: string | null
          name: string
          notes?: string | null
          owner_agent_id?: string | null
          phone?: string | null
          search_vector?: unknown | null
          source?: string | null
          state?: string | null
          team_id?: string | null
          tin_last4?: string | null
          type?: Database["public"]["Enums"]["account_type_v2"]
          type_old?: Database["public"]["Enums"]["account_type"] | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          account_type?: Database["public"]["Enums"]["account_type_new"] | null
          address_line1?: string | null
          address_line2?: string | null
          business_id?: string | null
          city?: string | null
          contact_id?: string | null
          created_at?: string
          custom?: Json | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          lead_source_detail?: string | null
          name?: string
          notes?: string | null
          owner_agent_id?: string | null
          phone?: string | null
          search_vector?: unknown | null
          source?: string | null
          state?: string | null
          team_id?: string | null
          tin_last4?: string | null
          type?: Database["public"]["Enums"]["account_type_v2"]
          type_old?: Database["public"]["Enums"]["account_type"] | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          email: string
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["agent_role"] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          email: string
          id?: string
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["agent_role"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["agent_role"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          changed_at: string | null
          changed_by: string | null
          created_at: string
          details: Json | null
          diff: Json | null
          entity: string
          entity_id: string | null
          id: number
          row_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string
          details?: Json | null
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
          row_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string
          details?: Json | null
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
          row_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bulk_actions: {
        Row: {
          action_type: string
          completed_at: string | null
          created_at: string
          created_by: string
          entity_ids: string[]
          entity_type: string
          error_count: number | null
          errors: Json | null
          id: string
          parameters: Json
          progress: number | null
          started_at: string | null
          status: string
          success_count: number | null
          total_count: number
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          entity_ids: string[]
          entity_type: string
          error_count?: number | null
          errors?: Json | null
          id?: string
          parameters?: Json
          progress?: number | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          total_count: number
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          entity_ids?: string[]
          entity_type?: string
          error_count?: number | null
          errors?: Json | null
          id?: string
          parameters?: Json
          progress?: number | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          total_count?: number
        }
        Relationships: []
      }
      business_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          address_legal: Json | null
          address_mailing: Json | null
          annual_revenue: number | null
          business_type:
            | Database["public"]["Enums"]["business_type_enum"]
            | null
          created_at: string | null
          created_by: string | null
          dba: string | null
          deleted_at: string | null
          ein: string | null
          emails: Json | null
          id: string
          legal_name: string
          naics_code: string | null
          num_employees: number | null
          phones: Json | null
          primary_contact_id: string | null
          risk_score: number | null
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
          years_in_business: number | null
        }
        Insert: {
          address_legal?: Json | null
          address_mailing?: Json | null
          annual_revenue?: number | null
          business_type?:
            | Database["public"]["Enums"]["business_type_enum"]
            | null
          created_at?: string | null
          created_by?: string | null
          dba?: string | null
          deleted_at?: string | null
          ein?: string | null
          emails?: Json | null
          id?: string
          legal_name: string
          naics_code?: string | null
          num_employees?: number | null
          phones?: Json | null
          primary_contact_id?: string | null
          risk_score?: number | null
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
          years_in_business?: number | null
        }
        Update: {
          address_legal?: Json | null
          address_mailing?: Json | null
          annual_revenue?: number | null
          business_type?:
            | Database["public"]["Enums"]["business_type_enum"]
            | null
          created_at?: string | null
          created_by?: string | null
          dba?: string | null
          deleted_at?: string | null
          ein?: string | null
          emails?: Json | null
          id?: string
          legal_name?: string
          naics_code?: string | null
          num_employees?: number | null
          phones?: Json | null
          primary_contact_id?: string | null
          risk_score?: number | null
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
          years_in_business?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          account_id: string | null
          consent_played: boolean
          contact_id: string | null
          created_at: string
          disposition: string | null
          duration_seconds: number | null
          ended_at: string | null
          from_number: string
          id: string
          metadata: Json | null
          recording_url: string | null
          started_at: string
          to_number: string
          twilio_call_sid: string | null
        }
        Insert: {
          account_id?: string | null
          consent_played?: boolean
          contact_id?: string | null
          created_at?: string
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number: string
          id?: string
          metadata?: Json | null
          recording_url?: string | null
          started_at?: string
          to_number: string
          twilio_call_sid?: string | null
        }
        Update: {
          account_id?: string | null
          consent_played?: boolean
          contact_id?: string | null
          created_at?: string
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string
          id?: string
          metadata?: Json | null
          recording_url?: string | null
          started_at?: string
          to_number?: string
          twilio_call_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "call_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          agency_code: string | null
          agency_login_url: string | null
          billing_portal_url: string | null
          city: string | null
          claims_phone: string | null
          contact_email: string | null
          contact_info: Json | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          main_phone: string | null
          naic: string | null
          name: string
          portals: Json | null
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          agency_code?: string | null
          agency_login_url?: string | null
          billing_portal_url?: string | null
          city?: string | null
          claims_phone?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          main_phone?: string | null
          naic?: string | null
          name: string
          portals?: Json | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          agency_code?: string | null
          agency_login_url?: string | null
          billing_portal_url?: string | null
          city?: string | null
          claims_phone?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          main_phone?: string | null
          naic?: string | null
          name?: string
          portals?: Json | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      claims: {
        Row: {
          adjuster_contact: string | null
          adjuster_name: string | null
          amount_claimed: number | null
          amount_estimate: number | null
          amount_paid: number | null
          claim_number: string
          created_at: string
          date_of_loss: string | null
          description: string | null
          documents: Json | null
          id: string
          loss_date: string | null
          notes: string | null
          policy_id: string
          reported_at: string | null
          settlement_date: string | null
          status: Database["public"]["Enums"]["claim_status"]
          type_of_loss: string | null
          updated_at: string
        }
        Insert: {
          adjuster_contact?: string | null
          adjuster_name?: string | null
          amount_claimed?: number | null
          amount_estimate?: number | null
          amount_paid?: number | null
          claim_number: string
          created_at?: string
          date_of_loss?: string | null
          description?: string | null
          documents?: Json | null
          id?: string
          loss_date?: string | null
          notes?: string | null
          policy_id: string
          reported_at?: string | null
          settlement_date?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          type_of_loss?: string | null
          updated_at?: string
        }
        Update: {
          adjuster_contact?: string | null
          adjuster_name?: string | null
          amount_claimed?: number | null
          amount_estimate?: number | null
          amount_paid?: number | null
          claim_number?: string
          created_at?: string
          date_of_loss?: string | null
          description?: string | null
          documents?: Json | null
          id?: string
          loss_date?: string | null
          notes?: string | null
          policy_id?: string
          reported_at?: string | null
          settlement_date?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          type_of_loss?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_user_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_business_accounts: {
        Row: {
          account_id: string
          annual_revenue: number | null
          created_at: string | null
          dba_name: string | null
          employees_count: number | null
          fein: string | null
          legal_name: string | null
          naics_code: string | null
          notes: string | null
          primary_contact_id: string | null
          updated_at: string | null
          years_in_business: number | null
        }
        Insert: {
          account_id: string
          annual_revenue?: number | null
          created_at?: string | null
          dba_name?: string | null
          employees_count?: number | null
          fein?: string | null
          legal_name?: string | null
          naics_code?: string | null
          notes?: string | null
          primary_contact_id?: string | null
          updated_at?: string | null
          years_in_business?: number | null
        }
        Update: {
          account_id?: string
          annual_revenue?: number | null
          created_at?: string | null
          dba_name?: string | null
          employees_count?: number | null
          fein?: string | null
          legal_name?: string | null
          naics_code?: string | null
          notes?: string | null
          primary_contact_id?: string | null
          updated_at?: string | null
          years_in_business?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_business_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_business_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "commercial_business_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_business_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_business_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_business_accounts_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_business_accounts_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          account_id: string | null
          agent_id: string | null
          body: string | null
          created_at: string | null
          deleted_at: string | null
          direction:
            | Database["public"]["Enums"]["communication_direction"]
            | null
          id: string
          meta: Json | null
          occurred_at: string | null
          subject: string | null
          type: Database["public"]["Enums"]["communication_type"]
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          agent_id?: string | null
          body?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?:
            | Database["public"]["Enums"]["communication_direction"]
            | null
          id?: string
          meta?: Json | null
          occurred_at?: string | null
          subject?: string | null
          type: Database["public"]["Enums"]["communication_type"]
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          agent_id?: string | null
          body?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?:
            | Database["public"]["Enums"]["communication_direction"]
            | null
          id?: string
          meta?: Json | null
          occurred_at?: string | null
          subject?: string | null
          type?: Database["public"]["Enums"]["communication_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "communications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_evidence: {
        Row: {
          consent_type: string
          contact_id: string
          created_at: string
          created_by: string | null
          evidence_ref: string | null
          expires_at: string | null
          granted_at: string
          id: string
          ip_address: unknown | null
          location_data: Json | null
          method: string
          notes: string | null
          revoked_at: string | null
          status: string
          user_agent: string | null
        }
        Insert: {
          consent_type: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          evidence_ref?: string | null
          expires_at?: string | null
          granted_at?: string
          id?: string
          ip_address?: unknown | null
          location_data?: Json | null
          method: string
          notes?: string | null
          revoked_at?: string | null
          status: string
          user_agent?: string | null
        }
        Update: {
          consent_type?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          evidence_ref?: string | null
          expires_at?: string | null
          granted_at?: string
          id?: string
          ip_address?: unknown | null
          location_data?: Json | null
          method?: string
          notes?: string | null
          revoked_at?: string | null
          status?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_evidence_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_evidence_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          account_id: string
          captured_at: string | null
          created_at: string | null
          deleted_at: string | null
          evidence_url: string | null
          granted: boolean | null
          id: string
          method: Database["public"]["Enums"]["consent_method_crm"] | null
          type: Database["public"]["Enums"]["consent_type_crm"]
          updated_at: string | null
        }
        Insert: {
          account_id: string
          captured_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          evidence_url?: string | null
          granted?: boolean | null
          id?: string
          method?: Database["public"]["Enums"]["consent_method_crm"] | null
          type: Database["public"]["Enums"]["consent_type_crm"]
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          captured_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          evidence_url?: string | null
          granted?: boolean | null
          id?: string
          method?: Database["public"]["Enums"]["consent_method_crm"] | null
          type?: Database["public"]["Enums"]["consent_type_crm"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          tag_name: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          tag_name: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          address_mailing: Json | null
          address_residential: Json | null
          best_call_time: string | null
          consent_sms: boolean
          consent_sms_at: string | null
          consent_voice: boolean
          consent_voice_at: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          email_other: string[] | null
          email_primary: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          last_name: string
          lead_score: number | null
          marital_status:
            | Database["public"]["Enums"]["marital_status_type"]
            | null
          middle_name: string | null
          phone: string | null
          phone_home: string | null
          phone_mobile: string | null
          phone_work: string | null
          preferred_contact_method:
            | Database["public"]["Enums"]["preferred_contact_method"]
            | null
          renewal_probability: number | null
          risk_score: number | null
          role: string | null
          source: string | null
          ssn_encrypted: string | null
          ssn_last4: string | null
          tags: string[] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          address_mailing?: Json | null
          address_residential?: Json | null
          best_call_time?: string | null
          consent_sms?: boolean
          consent_sms_at?: string | null
          consent_voice?: boolean
          consent_voice_at?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          email_other?: string[] | null
          email_primary?: string | null
          first_name: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          last_name: string
          lead_score?: number | null
          marital_status?:
            | Database["public"]["Enums"]["marital_status_type"]
            | null
          middle_name?: string | null
          phone?: string | null
          phone_home?: string | null
          phone_mobile?: string | null
          phone_work?: string | null
          preferred_contact_method?:
            | Database["public"]["Enums"]["preferred_contact_method"]
            | null
          renewal_probability?: number | null
          risk_score?: number | null
          role?: string | null
          source?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          address_mailing?: Json | null
          address_residential?: Json | null
          best_call_time?: string | null
          consent_sms?: boolean
          consent_sms_at?: string | null
          consent_voice?: boolean
          consent_voice_at?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          email_other?: string[] | null
          email_primary?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          last_name?: string
          lead_score?: number | null
          marital_status?:
            | Database["public"]["Enums"]["marital_status_type"]
            | null
          middle_name?: string | null
          phone?: string | null
          phone_home?: string | null
          phone_mobile?: string | null
          phone_work?: string | null
          preferred_contact_method?:
            | Database["public"]["Enums"]["preferred_contact_method"]
            | null
          renewal_probability?: number | null
          risk_score?: number | null
          role?: string | null
          source?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          created_at: string
          customer_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_id: string
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          external_ref: string | null
          id: string
          name: string
          notes_summary: string | null
          phone: string | null
          postal_code: string | null
          search_vector: unknown | null
          state: string | null
          status: string | null
          type: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_id: string
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_ref?: string | null
          id?: string
          name: string
          notes_summary?: string | null
          phone?: string | null
          postal_code?: string | null
          search_vector?: unknown | null
          state?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_id?: string
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_ref?: string | null
          id?: string
          name?: string
          notes_summary?: string | null
          phone?: string | null
          postal_code?: string | null
          search_vector?: unknown | null
          state?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          download_count: number | null
          expires_at: string | null
          export_url: string | null
          id: string
          request_type: string
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          download_count?: number | null
          expires_at?: string | null
          export_url?: string | null
          id?: string
          request_type: string
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          download_count?: number | null
          expires_at?: string | null
          export_url?: string | null
          id?: string
          request_type?: string
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      detailed_audit_logs: {
        Row: {
          action: string
          changed_fields: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown | null
          metadata: Json | null
          occurred_at: string
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          changed_fields?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          occurred_at?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          changed_fields?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          occurred_at?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          account_id: string | null
          category: Database["public"]["Enums"]["document_category"] | null
          created_at: string
          file_size: number | null
          filename: string
          id: string
          kind: string
          mime_type: string | null
          name: string | null
          pii_level: string | null
          policy_id: string | null
          sha256: string | null
          signature_request_id: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"] | null
          created_at?: string
          file_size?: number | null
          filename: string
          id?: string
          kind: string
          mime_type?: string | null
          name?: string | null
          pii_level?: string | null
          policy_id?: string | null
          sha256?: string | null
          signature_request_id?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"] | null
          created_at?: string
          file_size?: number | null
          filename?: string
          id?: string
          kind?: string
          mime_type?: string | null
          name?: string | null
          pii_level?: string | null
          policy_id?: string | null
          sha256?: string | null
          signature_request_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_user_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_detection_rules: {
        Row: {
          created_at: string
          entity_type: string
          id: string
          is_active: boolean | null
          match_fields: Json
          rule_name: string
          threshold: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: string
          is_active?: boolean | null
          match_fields: Json
          rule_name: string
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: string
          is_active?: boolean | null
          match_fields?: Json
          rule_name?: string
          threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      duplicate_flags: {
        Row: {
          account_id: string
          created_at: string
          flagged_by: string
          id: string
          reason: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          flagged_by: string
          id?: string
          reason?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          flagged_by?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_flags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_flags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "duplicate_flags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_flags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_flags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_groups: {
        Row: {
          created_at: string
          entity_ids: string[]
          entity_type: string
          id: string
          match_score: number
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          entity_ids: string[]
          entity_type: string
          id?: string
          match_score: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          entity_ids?: string[]
          entity_type?: string
          id?: string
          match_score?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_groups_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "duplicate_detection_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      email_change_requests: {
        Row: {
          created_at: string
          current_email: string
          expires_at: string
          id: string
          reason: string | null
          requested_at: string
          requested_email: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_email: string
          expires_at?: string
          id?: string
          reason?: string | null
          requested_at?: string
          requested_email: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_email?: string
          expires_at?: string
          id?: string
          reason?: string | null
          requested_at?: string
          requested_email?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      enhanced_audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          changed_at: string | null
          changed_by: string | null
          created_at: string | null
          diff: Json | null
          id: string
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_role?: string | null
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          diff?: Json | null
          id?: string
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_role?: string | null
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          diff?: Json | null
          id?: string
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          occurred_at: string
          payload: Json | null
          type: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          type: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          type?: string
        }
        Relationships: []
      }
      household_accounts: {
        Row: {
          account_id: string
          created_at: string | null
          head_contact_id: string | null
          household_name: string | null
          notes: string | null
          num_dependents: number | null
          spouse_contact_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          head_contact_id?: string | null
          household_name?: string | null
          notes?: string | null
          num_dependents?: number | null
          spouse_contact_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          head_contact_id?: string | null
          household_name?: string | null
          notes?: string | null
          num_dependents?: number | null
          spouse_contact_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "household_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_head_contact_id_fkey"
            columns: ["head_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_head_contact_id_fkey"
            columns: ["head_contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_spouse_contact_id_fkey"
            columns: ["spouse_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_spouse_contact_id_fkey"
            columns: ["spouse_contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_logs: {
        Row: {
          actions_taken: Json | null
          created_at: string
          ended_at: string | null
          id: string
          impersonator_id: string
          ip_address: unknown | null
          reason: string | null
          session_id: string
          started_at: string
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          actions_taken?: Json | null
          created_at?: string
          ended_at?: string | null
          id?: string
          impersonator_id: string
          ip_address?: unknown | null
          reason?: string | null
          session_id: string
          started_at?: string
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          actions_taken?: Json | null
          created_at?: string
          ended_at?: string | null
          id?: string
          impersonator_id?: string
          ip_address?: unknown | null
          reason?: string | null
          session_id?: string
          started_at?: string
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          error_rows: number | null
          field_mapping: Json | null
          filename: string
          id: string
          import_type: string
          imported_by: string
          processed_rows: number | null
          started_at: string | null
          status: string | null
          successful_rows: number | null
          total_rows: number
          validation_errors: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_rows?: number | null
          field_mapping?: Json | null
          filename: string
          id?: string
          import_type: string
          imported_by: string
          processed_rows?: number | null
          started_at?: string | null
          status?: string | null
          successful_rows?: number | null
          total_rows: number
          validation_errors?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_rows?: number | null
          field_mapping?: Json | null
          filename?: string
          id?: string
          import_type?: string
          imported_by?: string
          processed_rows?: number | null
          started_at?: string | null
          status?: string | null
          successful_rows?: number | null
          total_rows?: number
          validation_errors?: Json | null
        }
        Relationships: []
      }
      import_staging: {
        Row: {
          batch_id: string
          created_at: string
          entity_id: string | null
          id: string
          mapped_data: Json | null
          raw_data: Json
          row_number: number
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          entity_id?: string | null
          id?: string
          mapped_data?: Json | null
          raw_data: Json
          row_number: number
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          mapped_data?: Json | null
          raw_data?: Json
          row_number?: number
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      insured_addresses: {
        Row: {
          account_id: string
          city: string
          country: string
          created_at: string
          id: string
          is_primary: boolean
          kind: string | null
          line1: string
          line2: string | null
          postal_code: string
          state: string
          updated_at: string
          verified_status: string | null
        }
        Insert: {
          account_id: string
          city: string
          country?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string | null
          line1: string
          line2?: string | null
          postal_code: string
          state: string
          updated_at?: string
          verified_status?: string | null
        }
        Update: {
          account_id?: string
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string | null
          line1?: string
          line2?: string | null
          postal_code?: string
          state?: string
          updated_at?: string
          verified_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insured_addresses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_addresses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "insured_addresses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_addresses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_addresses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insured_emails: {
        Row: {
          account_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean
          is_verified: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insured_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "insured_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insured_phones: {
        Row: {
          account_id: string
          created_at: string
          do_not_call: boolean
          e164: string
          id: string
          is_primary: boolean
          type: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          do_not_call?: boolean
          e164: string
          id?: string
          is_primary?: boolean
          type?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          do_not_call?: boolean
          e164?: string
          id?: string
          is_primary?: boolean
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insured_phones_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_phones_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "insured_phones_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_phones_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_phones_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insured_profiles: {
        Row: {
          account_id: string
          created_at: string
          deleted_at: string | null
          display_name: string | null
          first_name: string | null
          last_contact_at: string | null
          last_name: string | null
          org_name: string | null
          primary_address_id: string | null
          primary_email_id: string | null
          primary_phone_id: string | null
          search_vector: unknown | null
          status: string | null
          tags: string[] | null
          type: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          org_name?: string | null
          primary_address_id?: string | null
          primary_email_id?: string | null
          primary_phone_id?: string | null
          search_vector?: unknown | null
          status?: string | null
          tags?: string[] | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          org_name?: string | null
          primary_address_id?: string | null
          primary_email_id?: string | null
          primary_phone_id?: string | null
          search_vector?: unknown | null
          status?: string | null
          tags?: string[] | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insured_profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "insured_profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insured_profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_id: string
          amount: number
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          due_at: string | null
          id: string
          invoice_number: string
          policy_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          invoice_number: string
          policy_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          invoice_number?: string
          policy_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_user_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      lines_of_business: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      merge_history: {
        Row: {
          created_at: string
          entity_type: string
          id: string
          merge_data: Json
          merged_by: string
          merged_ids: string[]
          survivor_id: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: string
          merge_data: Json
          merged_by: string
          merged_ids: string[]
          survivor_id: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: string
          merge_data?: Json
          merged_by?: string
          merged_ids?: string[]
          survivor_id?: string
        }
        Relationships: []
      }
      mgas: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          agency_login_url: string | null
          city: string | null
          code: string | null
          contact_email: string | null
          contact_info: Json | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          main_phone: string | null
          name: string
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          agency_login_url?: string | null
          city?: string | null
          code?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          main_phone?: string | null
          name: string
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          agency_login_url?: string | null
          city?: string | null
          code?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          main_phone?: string | null
          name?: string
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          account_id: string
          author_id: string
          body: string
          created_at: string
          customer_id: string | null
          id: string
          title: string | null
        }
        Insert: {
          account_id: string
          author_id: string
          body: string
          created_at?: string
          customer_id?: string | null
          id?: string
          title?: string | null
        }
        Update: {
          account_id?: string
          author_id?: string
          body?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          account_id: string
          close_date: string | null
          created_at: string
          customer_id: string | null
          expected_value: number | null
          id: string
          name: string
          source: string | null
          stage: Database["public"]["Enums"]["opportunity_stage"]
          updated_at: string
        }
        Insert: {
          account_id: string
          close_date?: string | null
          created_at?: string
          customer_id?: string | null
          expected_value?: number | null
          id?: string
          name: string
          source?: string | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          close_date?: string | null
          created_at?: string
          customer_id?: string | null
          expected_value?: number | null
          id?: string
          name?: string
          source?: string | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method_crm"] | null
          paid_at: string | null
          processor_ref: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method_crm"] | null
          paid_at?: string | null
          processor_ref?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method_crm"] | null
          paid_at?: string | null
          processor_ref?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_verification_codes: {
        Row: {
          attempts: number | null
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          user_id: string
          verification_code: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          phone_number: string
          user_id: string
          verification_code: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          user_id?: string
          verification_code?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      policies: {
        Row: {
          account_id: string | null
          billing_frequency:
            | Database["public"]["Enums"]["billing_frequency"]
            | null
          billing_method: Database["public"]["Enums"]["billing_method"] | null
          carrier: string
          carrier_id: string | null
          coverage: Json | null
          created_at: string
          custom: Json | null
          effective_date: string
          expiration_date: string
          id: string
          insured_items: Json | null
          insured_user_id: string
          line_of_business: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          policy_number: string
          premium: number
          status: string | null
        }
        Insert: {
          account_id?: string | null
          billing_frequency?:
            | Database["public"]["Enums"]["billing_frequency"]
            | null
          billing_method?: Database["public"]["Enums"]["billing_method"] | null
          carrier: string
          carrier_id?: string | null
          coverage?: Json | null
          created_at?: string
          custom?: Json | null
          effective_date: string
          expiration_date: string
          id?: string
          insured_items?: Json | null
          insured_user_id: string
          line_of_business?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          policy_number: string
          premium: number
          status?: string | null
        }
        Update: {
          account_id?: string | null
          billing_frequency?:
            | Database["public"]["Enums"]["billing_frequency"]
            | null
          billing_method?: Database["public"]["Enums"]["billing_method"] | null
          carrier?: string
          carrier_id?: string | null
          coverage?: Json | null
          created_at?: string
          custom?: Json | null
          effective_date?: string
          expiration_date?: string
          id?: string
          insured_items?: Json | null
          insured_user_id?: string
          line_of_business?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          policy_number?: string
          premium?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_access_logs: {
        Row: {
          accessor_user_id: string | null
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown | null
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          accessor_user_id?: string | null
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          accessor_user_id?: string | null
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_staff: boolean | null
          notification_email: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          is_staff?: boolean | null
          notification_email?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_staff?: boolean | null
          notification_email?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          account_id: string
          carrier_id: string | null
          competitor_carrier: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          line_of_business: Database["public"]["Enums"]["line_of_business"]
          options: Json | null
          quote_ref: string | null
          quoted_at: string | null
          reason_loss: string | null
          reason_win: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          carrier_id?: string | null
          competitor_carrier?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          line_of_business: Database["public"]["Enums"]["line_of_business"]
          options?: Json | null
          quote_ref?: string | null
          quoted_at?: string | null
          reason_loss?: string | null
          reason_win?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          carrier_id?: string | null
          competitor_carrier?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          line_of_business?: Database["public"]["Enums"]["line_of_business"]
          options?: Json | null
          quote_ref?: string | null
          quoted_at?: string | null
          reason_loss?: string | null
          reason_win?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      role_change_requests: {
        Row: {
          created_at: string
          current_user_role: Database["public"]["Enums"]["user_role"]
          expires_at: string
          id: string
          reason: string | null
          requested_at: string
          requested_role: Database["public"]["Enums"]["user_role"]
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_user_role: Database["public"]["Enums"]["user_role"]
          expires_at?: string
          id?: string
          reason?: string | null
          requested_at?: string
          requested_role: Database["public"]["Enums"]["user_role"]
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_user_role?: Database["public"]["Enums"]["user_role"]
          expires_at?: string
          id?: string
          reason?: string | null
          requested_at?: string
          requested_role?: Database["public"]["Enums"]["user_role"]
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          filters: Json
          id: string
          is_default: boolean
          name: string
          organization_shared: boolean
          updated_at: string
          view_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          filters?: Json
          id?: string
          is_default?: boolean
          name: string
          organization_shared?: boolean
          updated_at?: string
          view_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          organization_shared?: boolean
          updated_at?: string
          view_type?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          account_id: string | null
          body: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["sms_direction"]
          error_code: string | null
          from_number: string
          id: string
          metadata: Json | null
          status: string | null
          to_number: string
          twilio_message_sid: string | null
        }
        Insert: {
          account_id?: string | null
          body?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["sms_direction"]
          error_code?: string | null
          from_number: string
          id?: string
          metadata?: Json | null
          status?: string | null
          to_number: string
          twilio_message_sid?: string | null
        }
        Update: {
          account_id?: string | null
          body?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["sms_direction"]
          error_code?: string | null
          from_number?: string
          id?: string
          metadata?: Json | null
          status?: string | null
          to_number?: string
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sms_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          account_id: string
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          account_id: string | null
          assignee_agent_id: string | null
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          details: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          assignee_agent_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          details?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          assignee_agent_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          details?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      telephony_settings: {
        Row: {
          created_at: string | null
          forward_number: string
          id: string
          last_error_at: string | null
          last_webhook_error: string | null
          recording_enabled: boolean | null
          twilio_phone_number: string
          updated_at: string | null
          webhook_status: string | null
        }
        Insert: {
          created_at?: string | null
          forward_number: string
          id?: string
          last_error_at?: string | null
          last_webhook_error?: string | null
          recording_enabled?: boolean | null
          twilio_phone_number: string
          updated_at?: string | null
          webhook_status?: string | null
        }
        Update: {
          created_at?: string | null
          forward_number?: string
          id?: string
          last_error_at?: string | null
          last_webhook_error?: string | null
          recording_enabled?: boolean | null
          twilio_phone_number?: string
          updated_at?: string | null
          webhook_status?: string | null
        }
        Relationships: []
      }
      twilio_consents: {
        Row: {
          channel: string
          contact_id: string
          created_at: string | null
          event: string
          id: string
          method: string
          notes: string | null
          reference_id: string | null
          source: string | null
        }
        Insert: {
          channel: string
          contact_id: string
          created_at?: string | null
          event: string
          id?: string
          method: string
          notes?: string | null
          reference_id?: string | null
          source?: string | null
        }
        Update: {
          channel?: string
          contact_id?: string
          created_at?: string | null
          event?: string
          id?: string
          method?: string
          notes?: string | null
          reference_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "twilio_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twilio_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          device_info: Json | null
          expires_at: string
          id: string
          ip_address: unknown | null
          last_active: string
          location_data: Json | null
          revoked_at: string | null
          session_token: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          expires_at: string
          id?: string
          ip_address?: unknown | null
          last_active?: string
          location_data?: Json | null
          revoked_at?: string | null
          session_token?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          expires_at?: string
          id?: string
          ip_address?: unknown | null
          last_active?: string
          location_data?: Json | null
          revoked_at?: string | null
          session_token?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      customers_unified: {
        Row: {
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          external_ref: string | null
          id: string | null
          name: string | null
          notes_summary: string | null
          phone: string | null
          postal_code: string | null
          search_vector: unknown | null
          state: string | null
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: never
          created_at?: string | null
          email?: string | null
          external_ref?: never
          id?: string | null
          name?: string | null
          notes_summary?: string | null
          phone?: string | null
          postal_code?: string | null
          search_vector?: unknown | null
          state?: string | null
          status?: never
          type?: never
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: never
          created_at?: string | null
          email?: string | null
          external_ref?: never
          id?: string | null
          name?: string | null
          notes_summary?: string | null
          phone?: string | null
          postal_code?: string | null
          search_vector?: unknown | null
          state?: string | null
          status?: never
          type?: never
          updated_at?: string | null
        }
        Relationships: []
      }
      insureds: {
        Row: {
          email: string | null
          id: string | null
          name: string | null
          phone: string | null
          primary_contact_email: string | null
          search_vector: unknown | null
          type: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_accounts: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"] | null
          account_type: Database["public"]["Enums"]["account_type_new"] | null
          address_line1: string | null
          address_line2: string | null
          business_id: string | null
          city: string | null
          contact_id: string | null
          created_at: string | null
          custom: Json | null
          deleted_at: string | null
          email: string | null
          id: string | null
          lead_source_detail: string | null
          name: string | null
          notes: string | null
          owner_agent_id: string | null
          phone: string | null
          source: string | null
          state: string | null
          team_id: string | null
          tin_last4: string | null
          type_old: Database["public"]["Enums"]["account_type"] | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          account_type?: Database["public"]["Enums"]["account_type_new"] | null
          address_line1?: string | null
          address_line2?: string | null
          business_id?: string | null
          city?: string | null
          contact_id?: string | null
          created_at?: string | null
          custom?: Json | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          lead_source_detail?: string | null
          name?: string | null
          notes?: string | null
          owner_agent_id?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          team_id?: string | null
          tin_last4?: string | null
          type_old?: Database["public"]["Enums"]["account_type"] | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          account_type?: Database["public"]["Enums"]["account_type_new"] | null
          address_line1?: string | null
          address_line2?: string | null
          business_id?: string | null
          city?: string | null
          contact_id?: string | null
          created_at?: string | null
          custom?: Json | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          lead_source_detail?: string | null
          name?: string | null
          notes?: string | null
          owner_agent_id?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          team_id?: string | null
          tin_last4?: string | null
          type_old?: Database["public"]["Enums"]["account_type"] | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_contacts: {
        Row: {
          account_id: string | null
          address_mailing: Json | null
          address_residential: Json | null
          best_call_time: string | null
          consent_sms: boolean | null
          consent_sms_at: string | null
          consent_voice: boolean | null
          consent_voice_at: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          email_other: string[] | null
          email_primary: string | null
          first_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string | null
          last_name: string | null
          lead_score: number | null
          marital_status:
            | Database["public"]["Enums"]["marital_status_type"]
            | null
          middle_name: string | null
          phone: string | null
          phone_home: string | null
          phone_mobile: string | null
          phone_work: string | null
          preferred_contact_method:
            | Database["public"]["Enums"]["preferred_contact_method"]
            | null
          renewal_probability: number | null
          risk_score: number | null
          role: string | null
          source: string | null
          ssn_encrypted: string | null
          ssn_last4: string | null
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          address_mailing?: Json | null
          address_residential?: Json | null
          best_call_time?: string | null
          consent_sms?: boolean | null
          consent_sms_at?: string | null
          consent_voice?: boolean | null
          consent_voice_at?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          email_other?: string[] | null
          email_primary?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string | null
          last_name?: string | null
          lead_score?: number | null
          marital_status?:
            | Database["public"]["Enums"]["marital_status_type"]
            | null
          middle_name?: string | null
          phone?: string | null
          phone_home?: string | null
          phone_mobile?: string | null
          phone_work?: string | null
          preferred_contact_method?:
            | Database["public"]["Enums"]["preferred_contact_method"]
            | null
          renewal_probability?: number | null
          risk_score?: number | null
          role?: string | null
          source?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          address_mailing?: Json | null
          address_residential?: Json | null
          best_call_time?: string | null
          consent_sms?: boolean | null
          consent_sms_at?: string | null
          consent_voice?: boolean | null
          consent_voice_at?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          email_other?: string[] | null
          email_primary?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string | null
          last_name?: string | null
          lead_score?: number | null
          marital_status?:
            | Database["public"]["Enums"]["marital_status_type"]
            | null
          middle_name?: string | null
          phone?: string | null
          phone_home?: string | null
          phone_mobile?: string | null
          phone_work?: string | null
          preferred_contact_method?:
            | Database["public"]["Enums"]["preferred_contact_method"]
            | null
          renewal_probability?: number | null
          risk_score?: number | null
          role?: string | null
          source?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_accounts: {
        Row: {
          account_id: string | null
          name: string | null
          role: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_policies: {
        Row: {
          account_id: string | null
          carrier: string | null
          carrier_id: string | null
          created_at: string | null
          effective_date: string | null
          expiration_date: string | null
          id: string | null
          insured_user_id: string | null
          line_of_business: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          policy_number: string | null
          premium: number | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customers_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "insureds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_tag_to_customer: {
        Args: {
          p_account_id: string
          p_color?: string
          p_customer_id: string
          p_tag_name: string
        }
        Returns: undefined
      }
      compute_insured_search_vector: {
        Args: { p_account_id: string }
        Returns: unknown
      }
      create_account_with_membership: {
        Args: { account_data: Json; owner_user_id: string }
        Returns: Json
      }
      create_detailed_audit_log: {
        Args: {
          p_action: string
          p_changed_fields?: Json
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: string
      }
      customers_search: {
        Args: {
          limit_count?: number
          offset_count?: number
          p_account_id: string
          q: string
        }
        Returns: {
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          external_ref: string | null
          id: string | null
          name: string | null
          notes_summary: string | null
          phone: string | null
          postal_code: string | null
          search_vector: unknown | null
          state: string | null
          status: string | null
          type: string | null
          updated_at: string | null
        }[]
      }
      customers_search_v1: {
        Args: {
          p_filters?: Json
          p_limit?: number
          p_offset?: number
          p_sort?: string
        }
        Returns: {
          account_id: string
          balance: number
          city: string
          created_at: string
          display_name: string
          last_contact_at: string
          org_name: string
          policies_count: number
          primary_email: string
          primary_phone: string
          rank: number
          state: string
          type: string
          updated_at: string
        }[]
      }
      decrypt_ssn: {
        Args: { enc: string }
        Returns: string
      }
      digits_only: {
        Args: { "": string }
        Returns: string
      }
      encrypt_ssn: {
        Args: { ssn: string }
        Returns: string
      }
      generate_backup_codes: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      get_my_claims: {
        Args: Record<PropertyKey, never>
        Returns: {
          adjuster_contact: string | null
          adjuster_name: string | null
          amount_claimed: number | null
          amount_estimate: number | null
          amount_paid: number | null
          claim_number: string
          created_at: string
          date_of_loss: string | null
          description: string | null
          documents: Json | null
          id: string
          loss_date: string | null
          notes: string | null
          policy_id: string
          reported_at: string | null
          settlement_date: string | null
          status: Database["public"]["Enums"]["claim_status"]
          type_of_loss: string | null
          updated_at: string
        }[]
      }
      get_my_policies: {
        Args: Record<PropertyKey, never>
        Returns: {
          account_id: string | null
          billing_frequency:
            | Database["public"]["Enums"]["billing_frequency"]
            | null
          billing_method: Database["public"]["Enums"]["billing_method"] | null
          carrier: string
          carrier_id: string | null
          coverage: Json | null
          created_at: string
          custom: Json | null
          effective_date: string
          expiration_date: string
          id: string
          insured_items: Json | null
          insured_user_id: string
          line_of_business: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          policy_number: string
          premium: number
          status: string | null
        }[]
      }
      get_policies_with_claims: {
        Args: Record<PropertyKey, never>
        Returns: {
          amount_estimate: number
          carrier: string
          claim_id: string
          claim_number: string
          effective_date: string
          expiration_date: string
          insured_user_id: string
          policy_id: string
          policy_number: string
          premium: number
          status: Database["public"]["Enums"]["claim_status"]
        }[]
      }
      get_policies_with_claims_secure: {
        Args: Record<PropertyKey, never>
        Returns: {
          amount_estimate: number
          carrier: string
          claim_id: string
          claim_number: string
          effective_date: string
          expiration_date: string
          insured_user_id: string
          policy_id: string
          policy_number: string
          premium: number
          status: Database["public"]["Enums"]["claim_status"]
        }[]
      }
      get_user_claims: {
        Args: Record<PropertyKey, never>
        Returns: {
          adjuster_contact: string | null
          adjuster_name: string | null
          amount_claimed: number | null
          amount_estimate: number | null
          amount_paid: number | null
          claim_number: string
          created_at: string
          date_of_loss: string | null
          description: string | null
          documents: Json | null
          id: string
          loss_date: string | null
          notes: string | null
          policy_id: string
          reported_at: string | null
          settlement_date: string | null
          status: Database["public"]["Enums"]["claim_status"]
          type_of_loss: string | null
          updated_at: string
        }[]
      }
      get_user_policies: {
        Args: Record<PropertyKey, never>
        Returns: {
          account_id: string | null
          billing_frequency:
            | Database["public"]["Enums"]["billing_frequency"]
            | null
          billing_method: Database["public"]["Enums"]["billing_method"] | null
          carrier: string
          carrier_id: string | null
          coverage: Json | null
          created_at: string
          custom: Json | null
          effective_date: string
          expiration_date: string
          id: string
          insured_items: Json | null
          insured_user_id: string
          line_of_business: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          policy_number: string
          premium: number
          status: string | null
        }[]
      }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: { desired: Database["public"]["Enums"]["user_role"]; uid: string }
        Returns: boolean
      }
      has_sms_consent: {
        Args: { target_contact_id: string }
        Returns: boolean
      }
      insureds_search_v1: {
        Args: {
          p_after_id?: string
          p_after_updated_at?: string
          p_filters?: Json
          p_limit?: number
          p_sort?: string
        }
        Returns: {
          account_id: string
          balance: number
          city: string
          created_at: string
          display_name: string
          last_contact_at: string
          org_name: string
          policies_count: number
          primary_email: string
          primary_phone: string
          state: string
          type: string
          updated_at: string
        }[]
      }
      is_account_member: {
        Args: { a_id: string }
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never> | { uid: string }
        Returns: boolean
      }
      is_member: {
        Args: { account: string; roles?: string[] }
        Returns: boolean
      }
      is_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      jsonb_diff_vals: {
        Args: { a: Json; b: Json }
        Returns: Json
      }
      log_profile_access: {
        Args: { action_type: string; details_json?: Json; target_id: string }
        Returns: undefined
      }
      merge_duplicate_records: {
        Args: { group_id: string; merged_data?: Json; survivor_id: string }
        Returns: Json
      }
      normalize_phone_number: {
        Args: { phone_input: string }
        Returns: string
      }
      pick_enum_label: {
        Args: { candidates: string[]; enum_type: unknown }
        Returns: string
      }
      process_csv_batch: {
        Args: { batch_id: string; field_mapping?: Json; import_type?: string }
        Returns: Json
      }
      scan_for_duplicates: {
        Args: { entity_type?: string; similarity_threshold?: number }
        Returns: Json
      }
      search_customers: {
        Args: { q: string }
        Returns: {
          email: string
          entity_type: string
          id: string
          label: string
          phone: string
        }[]
      }
      search_customers_ft: {
        Args: { q: string }
        Returns: {
          email: string
          entity_type: string
          id: string
          label: string
          phone: string
        }[]
      }
      seed_default_tags: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      test_auth_context: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      unified_customer_search: {
        Args: {
          p_filters?: Json
          p_limit?: number
          p_offset?: number
          p_sort?: string
        }
        Returns: {
          account_id: string
          balance: number
          city: string
          created_at: string
          display_name: string
          email: string
          id: string
          last_contact_at: string
          name: string
          notes_summary: string
          org_name: string
          phone: string
          policies_count: number
          postal_code: string
          primary_email: string
          primary_phone: string
          rank: number
          state: string
          status: string
          type: string
          updated_at: string
        }[]
      }
      update_account_secure: {
        Args: { account_data: Json; account_id: string }
        Returns: Json
      }
      upsert_membership: {
        Args: { p_account: string; p_role?: string; p_user: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "lead" | "active" | "churned"
      account_type: "household" | "business"
      account_type_enum: "individual" | "business" | "household"
      account_type_new: "individual" | "business" | "household"
      account_type_v2: "household" | "commercial_business"
      agent_role: "staff" | "admin" | "producer"
      billing_freq_enum: "monthly" | "quarterly" | "semiannual" | "annual"
      billing_frequency: "monthly" | "quarterly" | "semiannual" | "annual"
      billing_method: "direct_bill" | "agency_bill"
      billing_method_enum: "direct_bill" | "agency_bill"
      business_type_enum:
        | "corporation"
        | "llc"
        | "partnership"
        | "sole_proprietorship"
        | "nonprofit"
        | "other"
      claim_status: "open" | "in_review" | "approved" | "denied" | "closed"
      comm_direction_enum: "inbound" | "outbound"
      comm_type_enum: "email" | "sms" | "call" | "meeting" | "note"
      communication_direction: "inbound" | "outbound"
      communication_type: "email" | "sms" | "call" | "meeting" | "note"
      consent_method: "verbal" | "web" | "sms_keyword" | "paper"
      consent_method_crm: "verbal" | "written" | "checkbox"
      consent_type: "sms" | "voice" | "email"
      consent_type_crm:
        | "marketing_opt_in"
        | "recording_consent"
        | "sms_consent"
        | "email_consent"
      consent_type_enum:
        | "marketing_opt_in"
        | "recording_consent"
        | "sms_consent"
        | "email_consent"
      document_category:
        | "id"
        | "proof_of_address"
        | "dec_page"
        | "quote"
        | "claim"
        | "other"
      gender_type: "male" | "female" | "other" | "prefer_not_to_say"
      invoice_status: "open" | "paid" | "overdue" | "void"
      invoice_status_enum: "open" | "paid" | "overdue" | "void"
      line_of_business:
        | "auto"
        | "home"
        | "renters"
        | "umbrella"
        | "life"
        | "health"
        | "commercial_auto"
        | "bop"
        | "gl"
        | "workers_comp"
        | "property"
        | "other"
      lob_enum:
        | "auto"
        | "home"
        | "renters"
        | "umbrella"
        | "life"
        | "health"
        | "commercial_auto"
        | "bop"
        | "gl"
        | "workers_comp"
        | "property"
        | "other"
      marital_status_type:
        | "single"
        | "married"
        | "divorced"
        | "widowed"
        | "separated"
      note_type: "general" | "call" | "email" | "meeting" | "system"
      opportunity_stage:
        | "new"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      payment_method_crm:
        | "cash"
        | "check"
        | "credit_card"
        | "debit_card"
        | "ach"
        | "wire"
        | "other"
      payment_type: "direct" | "agency"
      policy_status_enum:
        | "quoted"
        | "bound"
        | "active"
        | "pending_cancel"
        | "cancelled"
        | "expired"
      preferred_contact_method: "email" | "phone" | "sms" | "mail"
      priority_enum: "low" | "med" | "high"
      quote_status: "open" | "won" | "lost" | "expired"
      quote_status_enum: "open" | "won" | "lost" | "expired"
      sms_direction: "in" | "out"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
      task_status_enum: "open" | "done" | "cancelled"
      user_role:
        | "customer"
        | "staff"
        | "admin"
        | "owner"
        | "csr"
        | "producer"
        | "accounting"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["lead", "active", "churned"],
      account_type: ["household", "business"],
      account_type_enum: ["individual", "business", "household"],
      account_type_new: ["individual", "business", "household"],
      account_type_v2: ["household", "commercial_business"],
      agent_role: ["staff", "admin", "producer"],
      billing_freq_enum: ["monthly", "quarterly", "semiannual", "annual"],
      billing_frequency: ["monthly", "quarterly", "semiannual", "annual"],
      billing_method: ["direct_bill", "agency_bill"],
      billing_method_enum: ["direct_bill", "agency_bill"],
      business_type_enum: [
        "corporation",
        "llc",
        "partnership",
        "sole_proprietorship",
        "nonprofit",
        "other",
      ],
      claim_status: ["open", "in_review", "approved", "denied", "closed"],
      comm_direction_enum: ["inbound", "outbound"],
      comm_type_enum: ["email", "sms", "call", "meeting", "note"],
      communication_direction: ["inbound", "outbound"],
      communication_type: ["email", "sms", "call", "meeting", "note"],
      consent_method: ["verbal", "web", "sms_keyword", "paper"],
      consent_method_crm: ["verbal", "written", "checkbox"],
      consent_type: ["sms", "voice", "email"],
      consent_type_crm: [
        "marketing_opt_in",
        "recording_consent",
        "sms_consent",
        "email_consent",
      ],
      consent_type_enum: [
        "marketing_opt_in",
        "recording_consent",
        "sms_consent",
        "email_consent",
      ],
      document_category: [
        "id",
        "proof_of_address",
        "dec_page",
        "quote",
        "claim",
        "other",
      ],
      gender_type: ["male", "female", "other", "prefer_not_to_say"],
      invoice_status: ["open", "paid", "overdue", "void"],
      invoice_status_enum: ["open", "paid", "overdue", "void"],
      line_of_business: [
        "auto",
        "home",
        "renters",
        "umbrella",
        "life",
        "health",
        "commercial_auto",
        "bop",
        "gl",
        "workers_comp",
        "property",
        "other",
      ],
      lob_enum: [
        "auto",
        "home",
        "renters",
        "umbrella",
        "life",
        "health",
        "commercial_auto",
        "bop",
        "gl",
        "workers_comp",
        "property",
        "other",
      ],
      marital_status_type: [
        "single",
        "married",
        "divorced",
        "widowed",
        "separated",
      ],
      note_type: ["general", "call", "email", "meeting", "system"],
      opportunity_stage: [
        "new",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      payment_method_crm: [
        "cash",
        "check",
        "credit_card",
        "debit_card",
        "ach",
        "wire",
        "other",
      ],
      payment_type: ["direct", "agency"],
      policy_status_enum: [
        "quoted",
        "bound",
        "active",
        "pending_cancel",
        "cancelled",
        "expired",
      ],
      preferred_contact_method: ["email", "phone", "sms", "mail"],
      priority_enum: ["low", "med", "high"],
      quote_status: ["open", "won", "lost", "expired"],
      quote_status_enum: ["open", "won", "lost", "expired"],
      sms_direction: ["in", "out"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
      task_status_enum: ["open", "done", "cancelled"],
      user_role: [
        "customer",
        "staff",
        "admin",
        "owner",
        "csr",
        "producer",
        "accounting",
      ],
    },
  },
} as const
