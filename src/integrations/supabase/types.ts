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
          search_vector: unknown
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
          search_vector?: unknown
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
          search_vector?: unknown
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
      ai_actions: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          payload: Json
          result: Json | null
          source_message_id: string | null
          status: string
          ticket_id: string
          updated_at: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          payload: Json
          result?: Json | null
          source_message_id?: string | null
          status?: string
          ticket_id: string
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          source_message_id?: string | null
          status?: string
          ticket_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          account_id: string | null
          context: Json | null
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          assignment_strategy: string
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          eligible_users: string[] | null
          id: string
          is_active: boolean | null
          last_assigned_at: string | null
          last_assigned_to: string | null
          name: string
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          assignment_strategy: string
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          eligible_users?: string[] | null
          id?: string
          is_active?: boolean | null
          last_assigned_at?: string | null
          last_assigned_to?: string | null
          name: string
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          assignment_strategy?: string
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          eligible_users?: string[] | null
          id?: string
          is_active?: boolean | null
          last_assigned_at?: string | null
          last_assigned_to?: string | null
          name?: string
          priority?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "assignment_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_rules_last_assigned_to_fkey"
            columns: ["last_assigned_to"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "assignment_rules_last_assigned_to_fkey"
            columns: ["last_assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "call_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_enrollments: {
        Row: {
          campaign_id: string
          completed_at: string | null
          converted_at: string | null
          current_step: number | null
          emails_clicked: number | null
          emails_opened: number | null
          emails_sent: number | null
          enrolled_at: string | null
          id: string
          lead_id: string
          next_step_at: string | null
          sms_responded: number | null
          sms_sent: number | null
          status: string
          unsubscribed_at: string | null
        }
        Insert: {
          campaign_id: string
          completed_at?: string | null
          converted_at?: string | null
          current_step?: number | null
          emails_clicked?: number | null
          emails_opened?: number | null
          emails_sent?: number | null
          enrolled_at?: string | null
          id?: string
          lead_id: string
          next_step_at?: string | null
          sms_responded?: number | null
          sms_sent?: number | null
          status?: string
          unsubscribed_at?: string | null
        }
        Update: {
          campaign_id?: string
          completed_at?: string | null
          converted_at?: string | null
          current_step?: number | null
          emails_clicked?: number | null
          emails_opened?: number | null
          emails_sent?: number | null
          enrolled_at?: string | null
          id?: string
          lead_id?: string
          next_step_at?: string | null
          sms_responded?: number | null
          sms_sent?: number | null
          status?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "nurture_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
          default_commission_rate: number | null
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
          default_commission_rate?: number | null
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
          default_commission_rate?: number | null
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
      certificates_of_insurance: {
        Row: {
          account_id: string
          additional_insureds: Json | null
          ai_generated: boolean | null
          approved_by: string | null
          certificate_holder_address: Json | null
          certificate_holder_name: string
          certificate_number: string
          coverage_details: Json
          created_at: string
          current_version: number | null
          document_url: string | null
          effective_date: string
          expiration_date: string
          generated_by: string | null
          id: string
          policy_id: string | null
          sent_at: string | null
          special_provisions: string | null
          status: string
          ticket_id: string | null
          updated_at: string
          versions: Json | null
        }
        Insert: {
          account_id: string
          additional_insureds?: Json | null
          ai_generated?: boolean | null
          approved_by?: string | null
          certificate_holder_address?: Json | null
          certificate_holder_name: string
          certificate_number: string
          coverage_details: Json
          created_at?: string
          current_version?: number | null
          document_url?: string | null
          effective_date: string
          expiration_date: string
          generated_by?: string | null
          id?: string
          policy_id?: string | null
          sent_at?: string | null
          special_provisions?: string | null
          status?: string
          ticket_id?: string | null
          updated_at?: string
          versions?: Json | null
        }
        Update: {
          account_id?: string
          additional_insureds?: Json | null
          ai_generated?: boolean | null
          approved_by?: string | null
          certificate_holder_address?: Json | null
          certificate_holder_name?: string
          certificate_number?: string
          coverage_details?: Json
          created_at?: string
          current_version?: number | null
          document_url?: string | null
          effective_date?: string
          expiration_date?: string
          generated_by?: string | null
          id?: string
          policy_id?: string | null
          sent_at?: string | null
          special_provisions?: string | null
          status?: string
          ticket_id?: string | null
          updated_at?: string
          versions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_of_insurance_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_of_insurance_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_of_insurance_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      coi_audit_log: {
        Row: {
          action: string
          coi_id: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          coi_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          coi_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coi_audit_log_coi_id_fkey"
            columns: ["coi_id"]
            isOneToOne: false
            referencedRelation: "certificates_of_insurance"
            referencedColumns: ["id"]
          },
        ]
      }
      coi_templates: {
        Row: {
          coverage_defaults: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          special_provisions_template: string | null
          updated_at: string | null
        }
        Insert: {
          coverage_defaults?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          special_provisions_template?: string | null
          updated_at?: string | null
        }
        Update: {
          coverage_defaults?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          special_provisions_template?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
            foreignKeyName: "commercial_business_accounts_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
        ]
      }
      comparison_sessions: {
        Row: {
          account_id: string | null
          client_name: string | null
          comparison_results: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          option1_data: Json
          option2_data: Json
          report_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          client_name?: string | null
          comparison_results?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          option1_data: Json
          option2_data: Json
          report_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          client_name?: string | null
          comparison_results?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          option1_data?: Json
          option2_data?: Json
          report_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comparison_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
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
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
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
        ]
      }
      customer_identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          phone: string | null
          profile_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_identities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "customer_identities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          search_vector: unknown
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
          search_vector?: unknown
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
          search_vector?: unknown
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
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      document_processing_queue: {
        Row: {
          account_id: string
          attempts: number | null
          batch_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          file_name: string
          file_size: number
          id: string
          max_attempts: number | null
          metadata: Json | null
          ocr_result: Json | null
          priority: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["batch_status"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          attempts?: number | null
          batch_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_name: string
          file_size: number
          id?: string
          max_attempts?: number | null
          metadata?: Json | null
          ocr_result?: Json | null
          priority?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          attempts?: number | null
          batch_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_size?: number
          id?: string
          max_attempts?: number | null
          metadata?: Json | null
          ocr_result?: Json | null
          priority?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          account_id: string | null
          category: Database["public"]["Enums"]["document_category"] | null
          created_at: string
          file_missing: boolean
          file_size: number | null
          filename: string
          id: string
          kind: string
          last_checked_at: string | null
          mime_type: string | null
          name: string | null
          pii_level: string | null
          policy_id: string | null
          sha256: string | null
          signature_request_id: string | null
          size_bytes: number | null
          storage_bucket: string | null
          storage_path: string
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"] | null
          created_at?: string
          file_missing?: boolean
          file_size?: number | null
          filename: string
          id?: string
          kind: string
          last_checked_at?: string | null
          mime_type?: string | null
          name?: string | null
          pii_level?: string | null
          policy_id?: string | null
          sha256?: string | null
          signature_request_id?: string | null
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"] | null
          created_at?: string
          file_missing?: boolean
          file_size?: number | null
          filename?: string
          id?: string
          kind?: string
          last_checked_at?: string | null
          mime_type?: string | null
          name?: string | null
          pii_level?: string | null
          policy_id?: string | null
          sha256?: string | null
          signature_request_id?: string | null
          size_bytes?: number | null
          storage_bucket?: string | null
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
            foreignKeyName: "documents_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
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
      extracted_policies: {
        Row: {
          account_id: string | null
          carrier: string
          confidence_scores: Json | null
          created_at: string | null
          document_path: string | null
          extracted_data: Json
          extraction_metadata: Json | null
          id: string
          policy_number: string | null
          session_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          carrier: string
          confidence_scores?: Json | null
          created_at?: string | null
          document_path?: string | null
          extracted_data: Json
          extraction_metadata?: Json | null
          id?: string
          policy_number?: string | null
          session_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          carrier?: string
          confidence_scores?: Json | null
          created_at?: string | null
          document_path?: string | null
          extracted_data?: Json
          extraction_metadata?: Json | null
          id?: string
          policy_number?: string | null
          session_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_policies_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "comparison_sessions"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "household_accounts_head_contact_id_fkey"
            columns: ["head_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_accounts_spouse_contact_id_fkey"
            columns: ["spouse_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
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
      inbound_allowlist: {
        Row: {
          channel: string
          created_at: string | null
          id: string
          note: string | null
          value: string
        }
        Insert: {
          channel: string
          created_at?: string | null
          id?: string
          note?: string | null
          value: string
        }
        Update: {
          channel?: string
          created_at?: string | null
          id?: string
          note?: string | null
          value?: string
        }
        Relationships: []
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
          search_vector: unknown
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
          search_vector?: unknown
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
          search_vector?: unknown
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
            foreignKeyName: "invoices_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          job_id: string
          message: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          job_id: string
          message: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          job_id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          account_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          input_data: Json
          job_type: Database["public"]["Enums"]["job_type"]
          max_attempts: number
          metadata: Json | null
          result_data: Json | null
          result_session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json
          job_type?: Database["public"]["Enums"]["job_type"]
          max_attempts?: number
          metadata?: Json | null
          result_data?: Json | null
          result_session_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json
          job_type?: Database["public"]["Enums"]["job_type"]
          max_attempts?: number
          metadata?: Json | null
          result_data?: Json | null
          result_session_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_result_session_id_fkey"
            columns: ["result_session_id"]
            isOneToOne: false
            referencedRelation: "comparison_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_entries: {
        Row: {
          answer_canonical_markdown: string
          applies_if: string | null
          carrier: string | null
          citations: string | null
          confidence: number | null
          display_order: number | null
          effective_date: string | null
          exceptions_notes: string | null
          expiration_date: string | null
          faq_short_answer: string | null
          jurisdiction: string | null
          last_verified_date: string | null
          policy_form_id: string | null
          priority: number | null
          product_line: string
          program_or_form: string | null
          question_canonical: string | null
          record_id: string
          seo_snippet: string | null
          source_type: string | null
          tags: string | null
          topic: string
          verified_by: string | null
        }
        Insert: {
          answer_canonical_markdown: string
          applies_if?: string | null
          carrier?: string | null
          citations?: string | null
          confidence?: number | null
          display_order?: number | null
          effective_date?: string | null
          exceptions_notes?: string | null
          expiration_date?: string | null
          faq_short_answer?: string | null
          jurisdiction?: string | null
          last_verified_date?: string | null
          policy_form_id?: string | null
          priority?: number | null
          product_line: string
          program_or_form?: string | null
          question_canonical?: string | null
          record_id: string
          seo_snippet?: string | null
          source_type?: string | null
          tags?: string | null
          topic: string
          verified_by?: string | null
        }
        Update: {
          answer_canonical_markdown?: string
          applies_if?: string | null
          carrier?: string | null
          citations?: string | null
          confidence?: number | null
          display_order?: number | null
          effective_date?: string | null
          exceptions_notes?: string | null
          expiration_date?: string | null
          faq_short_answer?: string | null
          jurisdiction?: string | null
          last_verified_date?: string | null
          policy_form_id?: string | null
          priority?: number | null
          product_line?: string
          program_or_form?: string | null
          question_canonical?: string | null
          record_id?: string
          seo_snippet?: string | null
          source_type?: string | null
          tags?: string | null
          topic?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      kb_sources: {
        Row: {
          jurisdiction: string | null
          name: string
          notes: string | null
          publisher: string | null
          source_id: string
          source_type: string
          url_or_path: string | null
          version_or_date: string | null
        }
        Insert: {
          jurisdiction?: string | null
          name: string
          notes?: string | null
          publisher?: string | null
          source_id: string
          source_type: string
          url_or_path?: string | null
          version_or_date?: string | null
        }
        Update: {
          jurisdiction?: string | null
          name?: string
          notes?: string | null
          publisher?: string | null
          source_id?: string
          source_type?: string
          url_or_path?: string | null
          version_or_date?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          account_id: string | null
          category: string
          confidence_score: number | null
          content: string
          created_at: string
          created_by: string | null
          embedding: string | null
          embedding_model: string | null
          helpful_count: number | null
          id: string
          last_accessed: string | null
          metadata: Json | null
          not_helpful_count: number | null
          processed_at: string | null
          source: string | null
          tags: string[] | null
          title: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          account_id?: string | null
          category: string
          confidence_score?: number | null
          content: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          embedding_model?: string | null
          helpful_count?: number | null
          id?: string
          last_accessed?: string | null
          metadata?: Json | null
          not_helpful_count?: number | null
          processed_at?: string | null
          source?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          account_id?: string | null
          category?: string
          confidence_score?: number | null
          content?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          embedding_model?: string | null
          helpful_count?: number | null
          id?: string
          last_accessed?: string | null
          metadata?: Json | null
          not_helpful_count?: number | null
          processed_at?: string | null
          source?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_gaps: {
        Row: {
          answered: boolean | null
          context: string | null
          created_at: string | null
          frequency: number | null
          id: string
          last_asked_at: string | null
          question: string
          updated_at: string | null
        }
        Insert: {
          answered?: boolean | null
          context?: string | null
          created_at?: string | null
          frequency?: number | null
          id?: string
          last_asked_at?: string | null
          question: string
          updated_at?: string | null
        }
        Update: {
          answered?: boolean | null
          context?: string | null
          created_at?: string | null
          frequency?: number | null
          id?: string
          last_asked_at?: string | null
          question?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      knowledge_usage_logs: {
        Row: {
          context: string | null
          created_at: string | null
          id: string
          knowledge_base_id: string | null
          query: string | null
          response_helpful: boolean | null
          response_time_ms: number | null
          user_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          id?: string
          knowledge_base_id?: string | null
          query?: string | null
          response_helpful?: boolean | null
          response_time_ms?: number | null
          user_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          id?: string
          knowledge_base_id?: string | null
          query?: string | null
          response_helpful?: boolean | null
          response_time_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_usage_logs_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          lead_id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          title: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          title: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "lead_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          cost_per_lead: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          cost_per_lead?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          cost_per_lead?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          assigned_at: string | null
          assigned_to: string | null
          city: string | null
          converted_account_id: string | null
          converted_at: string | null
          created_at: string | null
          created_by: string | null
          current_carrier: string | null
          current_premium: number | null
          custom_fields: Json | null
          decision_timeframe: string | null
          email: string | null
          first_name: string
          id: string
          insurance_types: string[] | null
          last_contact_at: string | null
          last_contact_type: string | null
          last_name: string
          lead_score: number | null
          lost_notes: string | null
          lost_reason: string | null
          next_follow_up_date: string | null
          notes: string | null
          phone: string | null
          search_vector: unknown
          source_details: Json | null
          source_id: string | null
          state: string | null
          status: string
          tags: string[] | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          city?: string | null
          converted_account_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_carrier?: string | null
          current_premium?: number | null
          custom_fields?: Json | null
          decision_timeframe?: string | null
          email?: string | null
          first_name: string
          id?: string
          insurance_types?: string[] | null
          last_contact_at?: string | null
          last_contact_type?: string | null
          last_name: string
          lead_score?: number | null
          lost_notes?: string | null
          lost_reason?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone?: string | null
          search_vector?: unknown
          source_details?: Json | null
          source_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          city?: string | null
          converted_account_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_carrier?: string | null
          current_premium?: number | null
          custom_fields?: Json | null
          decision_timeframe?: string | null
          email?: string | null
          first_name?: string
          id?: string
          insurance_types?: string[] | null
          last_contact_at?: string | null
          last_contact_type?: string | null
          last_name?: string
          lead_score?: number | null
          lost_notes?: string | null
          lost_reason?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone?: string | null
          search_vector?: unknown
          source_details?: Json | null
          source_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_account_id_fkey"
            columns: ["converted_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_source_performance"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
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
            foreignKeyName: "notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nurture_campaigns: {
        Row: {
          completed_count: number | null
          converted_count: number | null
          created_at: string | null
          created_by: string | null
          currently_enrolled: number | null
          description: string | null
          enrollment_conditions: Json
          id: string
          is_active: boolean | null
          name: string
          steps: Json
          total_enrolled: number | null
          unsubscribed_count: number | null
          updated_at: string | null
        }
        Insert: {
          completed_count?: number | null
          converted_count?: number | null
          created_at?: string | null
          created_by?: string | null
          currently_enrolled?: number | null
          description?: string | null
          enrollment_conditions: Json
          id?: string
          is_active?: boolean | null
          name: string
          steps: Json
          total_enrolled?: number | null
          unsubscribed_count?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_count?: number | null
          converted_count?: number | null
          created_at?: string | null
          created_by?: string | null
          currently_enrolled?: number | null
          description?: string | null
          enrollment_conditions?: Json
          id?: string
          is_active?: boolean | null
          name?: string
          steps?: Json
          total_enrolled?: number | null
          unsubscribed_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nurture_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "nurture_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_cache: {
        Row: {
          accessed_at: string
          created_at: string
          document_hash: string
          expires_at: string | null
          id: string
          key: string
          metadata: Json | null
          ocr_text: string | null
        }
        Insert: {
          accessed_at?: string
          created_at?: string
          document_hash: string
          expires_at?: string | null
          id?: string
          key: string
          metadata?: Json | null
          ocr_text?: string | null
        }
        Update: {
          accessed_at?: string
          created_at?: string
          document_hash?: string
          expires_at?: string | null
          id?: string
          key?: string
          metadata?: Json | null
          ocr_text?: string | null
        }
        Relationships: []
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
      pipeline_rules: {
        Row: {
          actions: Json
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          execution_count: number | null
          id: string
          is_active: boolean | null
          last_executed_at: string | null
          name: string
          priority: number | null
          time_threshold_hours: number | null
          trigger_event: string
          trigger_stage: string
          updated_at: string | null
        }
        Insert: {
          actions: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          name: string
          priority?: number | null
          time_threshold_hours?: number | null
          trigger_event: string
          trigger_stage: string
          updated_at?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string
          priority?: number | null
          time_threshold_hours?: number | null
          trigger_event?: string
          trigger_stage?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "pipeline_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          policy_term: string | null
          premium: number
          status: string | null
          updated_at: string
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
          policy_term?: string | null
          premium: number
          status?: string | null
          updated_at?: string
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
          policy_term?: string | null
          premium?: number
          status?: string | null
          updated_at?: string
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
            foreignKeyName: "policies_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_goals: {
        Row: {
          created_at: string
          daily_target: number | null
          id: string
          month: string
          monthly_revenue_target: number | null
          monthly_target: number | null
          producer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_target?: number | null
          id?: string
          month: string
          monthly_revenue_target?: number | null
          monthly_target?: number | null
          producer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_target?: number | null
          id?: string
          month?: string
          monthly_revenue_target?: number | null
          monthly_target?: number | null
          producer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_access_logs: {
        Row: {
          accessor_user_id: string | null
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          accessor_user_id?: string | null
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          accessor_user_id?: string | null
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
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
          locale: string | null
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
          locale?: string | null
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
          locale?: string | null
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
            foreignKeyName: "quotes_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_campaigns: {
        Row: {
          account_id: string
          campaign_type: string
          completed_touchpoints: number | null
          created_at: string
          created_by: string | null
          days_before_renewal: number
          end_date: string | null
          id: string
          personalization: Json | null
          renewal_id: string
          renewal_result: string | null
          start_date: string
          status: string
          total_touchpoints: number
          touchpoints: Json
          updated_at: string
        }
        Insert: {
          account_id: string
          campaign_type: string
          completed_touchpoints?: number | null
          created_at?: string
          created_by?: string | null
          days_before_renewal: number
          end_date?: string | null
          id?: string
          personalization?: Json | null
          renewal_id: string
          renewal_result?: string | null
          start_date: string
          status?: string
          total_touchpoints: number
          touchpoints?: Json
          updated_at?: string
        }
        Update: {
          account_id?: string
          campaign_type?: string
          completed_touchpoints?: number | null
          created_at?: string
          created_by?: string | null
          days_before_renewal?: number
          end_date?: string | null
          id?: string
          personalization?: Json | null
          renewal_id?: string
          renewal_result?: string | null
          start_date?: string
          status?: string
          total_touchpoints?: number
          touchpoints?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "renewal_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_campaigns_renewal_id_fkey"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_risk_history: {
        Row: {
          account_id: string
          calculated_at: string
          id: string
          renewal_id: string
          risk_factors: Json
          risk_level: string
          risk_score: number
        }
        Insert: {
          account_id: string
          calculated_at?: string
          id?: string
          renewal_id: string
          risk_factors: Json
          risk_level: string
          risk_score: number
        }
        Update: {
          account_id?: string
          calculated_at?: string
          id?: string
          renewal_id?: string
          risk_factors?: Json
          risk_level?: string
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "renewal_risk_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_risk_history_renewal_id_fkey"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      renewals: {
        Row: {
          account_id: string
          assigned_to: string | null
          carrier: string | null
          competitor_activity_detected: boolean | null
          completed_at: string | null
          contact_count: number | null
          created_at: string
          current_premium: number | null
          engagement_score: number | null
          expiration_date: string
          has_payment_issues: boolean | null
          has_recent_claim: boolean | null
          id: string
          last_contact_date: string | null
          last_risk_calculation: string | null
          lost_reason: string | null
          notes: string | null
          policy_id: string | null
          policy_number: string | null
          policy_type: string
          price_change_pct: number | null
          priority: string | null
          renewal_date: string
          renewal_premium: number | null
          risk_factors: Json | null
          risk_level: string | null
          risk_score: number | null
          sentiment_score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_to?: string | null
          carrier?: string | null
          competitor_activity_detected?: boolean | null
          completed_at?: string | null
          contact_count?: number | null
          created_at?: string
          current_premium?: number | null
          engagement_score?: number | null
          expiration_date: string
          has_payment_issues?: boolean | null
          has_recent_claim?: boolean | null
          id?: string
          last_contact_date?: string | null
          last_risk_calculation?: string | null
          lost_reason?: string | null
          notes?: string | null
          policy_id?: string | null
          policy_number?: string | null
          policy_type: string
          price_change_pct?: number | null
          priority?: string | null
          renewal_date: string
          renewal_premium?: number | null
          risk_factors?: Json | null
          risk_level?: string | null
          risk_score?: number | null
          sentiment_score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_to?: string | null
          carrier?: string | null
          competitor_activity_detected?: boolean | null
          completed_at?: string | null
          contact_count?: number | null
          created_at?: string
          current_premium?: number | null
          engagement_score?: number | null
          expiration_date?: string
          has_payment_issues?: boolean | null
          has_recent_claim?: boolean | null
          id?: string
          last_contact_date?: string | null
          last_risk_calculation?: string | null
          lost_reason?: string | null
          notes?: string | null
          policy_id?: string | null
          policy_number?: string | null
          policy_type?: string
          price_change_pct?: number | null
          priority?: string | null
          renewal_date?: string
          renewal_premium?: number | null
          risk_factors?: Json | null
          risk_level?: string | null
          risk_score?: number | null
          sentiment_score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "renewals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
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
            foreignKeyName: "sms_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
        ]
      }
      task_activity_feed: {
        Row: {
          action_type: string
          changes: Json | null
          created_at: string
          id: string
          metadata: Json | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          changes?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          changes?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_feed_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          attached_at: string
          attached_by: string | null
          document_id: string
          id: string
          task_id: string
        }
        Insert: {
          attached_at?: string
          attached_by?: string | null
          document_id: string
          id?: string
          task_id: string
        }
        Update: {
          attached_at?: string
          attached_by?: string | null
          document_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_completed: boolean
          item_order: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_completed?: boolean
          item_order?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_completed?: boolean
          item_order?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_generation_log: {
        Row: {
          entity_id: string | null
          entity_type: string | null
          generated_at: string
          id: string
          metadata: Json | null
          task_id: string | null
          template_id: string | null
          trigger_event: Database["public"]["Enums"]["task_trigger_event"]
        }
        Insert: {
          entity_id?: string | null
          entity_type?: string | null
          generated_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string | null
          template_id?: string | null
          trigger_event: Database["public"]["Enums"]["task_trigger_event"]
        }
        Update: {
          entity_id?: string | null
          entity_type?: string | null
          generated_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string | null
          template_id?: string | null
          trigger_event?: Database["public"]["Enums"]["task_trigger_event"]
        }
        Relationships: [
          {
            foreignKeyName: "task_generation_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_generation_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrence_rules: {
        Row: {
          created_at: string
          day_of_month: number | null
          days_of_week: number[] | null
          end_date: string | null
          id: string
          is_active: boolean
          last_generated_at: string | null
          max_occurrences: number | null
          month_of_year: number | null
          occurrences_count: number | null
          recurrence_interval: number
          recurrence_pattern: string
          template_task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          max_occurrences?: number | null
          month_of_year?: number | null
          occurrences_count?: number | null
          recurrence_interval?: number
          recurrence_pattern: string
          template_task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          max_occurrences?: number | null
          month_of_year?: number | null
          occurrences_count?: number | null
          recurrence_interval?: number
          recurrence_pattern?: string
          template_task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_recurrence_rules_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reminders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          remind_at: string
          reminder_type: string
          sent_at: string | null
          status: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          remind_at: string
          reminder_type: string
          sent_at?: string | null
          status?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          remind_at?: string
          reminder_type?: string
          sent_at?: string | null
          status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          category: Database["public"]["Enums"]["task_category"]
          created_at: string
          default_assignee_role: string | null
          dependencies: Json | null
          description: string | null
          estimated_duration_hours: number | null
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          priority: Database["public"]["Enums"]["task_priority"]
          task_order: number | null
          trigger_event: Database["public"]["Enums"]["task_trigger_event"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          default_assignee_role?: string | null
          dependencies?: Json | null
          description?: string | null
          estimated_duration_hours?: number | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          priority?: Database["public"]["Enums"]["task_priority"]
          task_order?: number | null
          trigger_event: Database["public"]["Enums"]["task_trigger_event"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          default_assignee_role?: string | null
          dependencies?: Json | null
          description?: string | null
          estimated_duration_hours?: number | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          task_order?: number | null
          trigger_event?: Database["public"]["Enums"]["task_trigger_event"]
          updated_at?: string
        }
        Relationships: []
      }
      task_time_entries: {
        Row: {
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          id: string
          notes: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          account_id: string | null
          assigned_by: string | null
          assignee_agent_id: string | null
          assignee_id: string | null
          category: Database["public"]["Enums"]["task_category"] | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          dependencies: Json | null
          description: string | null
          details: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          notes: string | null
          parent_task_id: string | null
          policy_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          quote_id: string | null
          related_lead_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          assigned_by?: string | null
          assignee_agent_id?: string | null
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["task_category"] | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dependencies?: Json | null
          description?: string | null
          details?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          parent_task_id?: string | null
          policy_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quote_id?: string | null
          related_lead_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          assigned_by?: string | null
          assignee_agent_id?: string | null
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["task_category"] | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dependencies?: Json | null
          description?: string | null
          details?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          parent_task_id?: string | null
          policy_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quote_id?: string | null
          related_lead_id?: string | null
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
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      telephony_settings: {
        Row: {
          created_at: string | null
          forward_number: string | null
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
          forward_number?: string | null
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
          forward_number?: string | null
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
      ticket_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["ticket_action_type"]
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          id: string
          is_approved: boolean | null
          metadata: Json | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["ticket_action_type"]
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          metadata?: Json | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["ticket_action_type"]
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          metadata?: Json | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_actions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachments: Json | null
          author_id: string | null
          author_type: string
          content: string
          created_at: string
          email_in_reply_to: string | null
          email_message_id: string | null
          external_recipients: string[] | null
          external_sender: string | null
          id: string
          is_internal: boolean | null
          message_type: string
          metadata: Json | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          author_type?: string
          content: string
          created_at?: string
          email_in_reply_to?: string | null
          email_message_id?: string | null
          external_recipients?: string[] | null
          external_sender?: string | null
          id?: string
          is_internal?: boolean | null
          message_type?: string
          metadata?: Json | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          author_type?: string
          content?: string
          created_at?: string
          email_in_reply_to?: string | null
          email_message_id?: string | null
          external_recipients?: string[] | null
          external_sender?: string | null
          id?: string
          is_internal?: boolean | null
          message_type?: string
          metadata?: Json | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          account_id: string
          assigned_to: string | null
          assignee_id: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_activity_at: string | null
          metadata: Json | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          requester_id: string | null
          resolution: string | null
          search_vector: unknown
          source: Database["public"]["Enums"]["ticket_source"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tags: string[] | null
          ticket_number: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_to?: string | null
          assignee_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_id?: string | null
          resolution?: string | null
          search_vector?: unknown
          source?: Database["public"]["Enums"]["ticket_source"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tags?: string[] | null
          ticket_number: string
          title?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_to?: string | null
          assignee_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_id?: string | null
          resolution?: string | null
          search_vector?: unknown
          source?: Database["public"]["Enums"]["ticket_source"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          tags?: string[] | null
          ticket_number?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "producer_lead_stats"
            referencedColumns: ["producer_id"]
          },
          {
            foreignKeyName: "tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          device_info: Json | null
          expires_at: string
          id: string
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
          last_active?: string
          location_data?: Json | null
          revoked_at?: string | null
          session_token?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      document_batch_summary: {
        Row: {
          account_id: string | null
          batch_completed: string | null
          batch_id: string | null
          batch_started: string | null
          completed: number | null
          failed: number | null
          processing: number | null
          queued: number | null
          total_files: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_source_performance: {
        Row: {
          avg_lead_score: number | null
          conversion_rate: number | null
          converted_leads: number | null
          cost_per_lead: number | null
          roi: number | null
          source_id: string | null
          source_name: string | null
          source_type: string | null
          total_leads: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      pipeline_summary: {
        Row: {
          avg_score: number | null
          lead_count: number | null
          new_this_month: number | null
          new_this_week: number | null
          status: string | null
          total_premium_value: number | null
        }
        Relationships: []
      }
      producer_lead_stats: {
        Row: {
          avg_lead_score: number | null
          contacted_leads: number | null
          lost_leads: number | null
          new_leads: number | null
          producer_id: string | null
          producer_name: string | null
          qualified_leads: number | null
          quoted_leads: number | null
          total_leads: number | null
          total_won_premium: number | null
          win_rate: number | null
          won_leads: number | null
        }
        Relationships: []
      }
      v_kb_simple: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          id: string | null
          metadata: string | null
          source: string | null
          tags: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          category?: never
          content?: string | null
          created_at?: never
          id?: string | null
          metadata?: never
          source?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: never
        }
        Update: {
          category?: never
          content?: string | null
          created_at?: never
          id?: string | null
          metadata?: never
          source?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: never
        }
        Relationships: []
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
      append_coi_version: {
        Args: { p_coi_id: string; p_version_data: Json }
        Returns: undefined
      }
      assign_lead: {
        Args: { p_lead_id: string; p_manual_assignee?: string }
        Returns: string
      }
      calculate_days_since_last_contact: {
        Args: { renewal_account_id: string }
        Returns: number
      }
      calculate_lead_score: { Args: { p_lead_id: string }; Returns: number }
      claim_jobs_for_worker: {
        Args: { p_batch_size?: number }
        Returns: {
          account_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          input_data: Json
          job_type: Database["public"]["Enums"]["job_type"]
          max_attempts: number
          metadata: Json | null
          result_data: Json | null
          result_session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_expired_ocr_cache: { Args: never; Returns: undefined }
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
      create_ticket_with_message: {
        Args: {
          p_account_id: string
          p_contact_id: string
          p_content?: string
          p_description: string
          p_priority?: string
          p_source?: string
          p_subject: string
        }
        Returns: string
      }
      create_ticket_with_message_v2: {
        Args: {
          p_account_id: string
          p_contact_id: string
          p_content: string
          p_description: string
          p_priority: string
          p_source: string
          p_subject: string
        }
        Returns: string
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
      decrypt_ssn: { Args: { enc: string }; Returns: string }
      digits_only: { Args: { "": string }; Returns: string }
      encrypt_ssn: { Args: { ssn: string }; Returns: string }
      find_recent_ticket_by_sender: {
        Args: { p_sender: string }
        Returns: {
          account_id: string
          assigned_to: string | null
          assignee_id: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_activity_at: string | null
          metadata: Json | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          requester_id: string | null
          resolution: string | null
          search_vector: unknown
          source: Database["public"]["Enums"]["ticket_source"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tags: string[] | null
          ticket_number: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_backup_codes: { Args: never; Returns: string[] }
      generate_coi_number: { Args: never; Returns: string }
      generate_recurring_task_instance: {
        Args: { p_due_date: string; p_template_task_id: string }
        Returns: string
      }
      generate_tasks_from_templates: {
        Args: {
          p_account_id: string
          p_entity_id?: string
          p_entity_type?: string
          p_trigger_event: Database["public"]["Enums"]["task_trigger_event"]
        }
        Returns: Json
      }
      generate_ticket_number: { Args: never; Returns: string }
      get_policies_claims_secure: {
        Args: never
        Returns: {
          account_id: string
          amount_estimate: number
          carrier: string
          claim_id: string
          claim_number: string
          effective_date: string
          expiration_date: string
          policy_id: string
          policy_number: string
          premium: number
          status: Database["public"]["Enums"]["claim_status"]
        }[]
      }
      get_policies_with_claims_secure: {
        Args: never
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
        Args: never
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
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_claims_secure: {
        Args: never
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
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_policies: {
        Args: never
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
          policy_term: string | null
          premium: number
          status: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "policies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_policies_secure: {
        Args: never
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
          policy_term: string | null
          premium: number
          status: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "policies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: { desired: Database["public"]["Enums"]["user_role"]; uid: string }
        Returns: boolean
      }
      has_sms_consent: { Args: { target_contact_id: string }; Returns: boolean }
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
      is_account_member: { Args: { a_id: string }; Returns: boolean }
      is_admin:
        | { Args: { uid: string }; Returns: boolean }
        | { Args: never; Returns: boolean }
      is_member: {
        Args: { account: string; roles?: string[] }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      jsonb_diff_vals: { Args: { a: Json; b: Json }; Returns: Json }
      kb_resolve_answer: {
        Args: {
          in_carrier?: string
          in_date?: string
          in_jurisdiction?: string
          in_program?: string
          q: string
        }
        Returns: {
          answer_canonical_markdown: string
          applies_if: string | null
          carrier: string | null
          citations: string | null
          confidence: number | null
          display_order: number | null
          effective_date: string | null
          exceptions_notes: string | null
          expiration_date: string | null
          faq_short_answer: string | null
          jurisdiction: string | null
          last_verified_date: string | null
          policy_form_id: string | null
          priority: number | null
          product_line: string
          program_or_form: string | null
          question_canonical: string | null
          record_id: string
          seo_snippet: string | null
          source_type: string | null
          tags: string | null
          topic: string
          verified_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "kb_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_knowledge_gap: {
        Args: { p_context?: string; p_question: string }
        Returns: string
      }
      log_profile_access: {
        Args: { action_type: string; details_json?: Json; target_id: string }
        Returns: undefined
      }
      merge_duplicate_records: {
        Args: { group_id: string; merged_data?: Json; survivor_id: string }
        Returns: Json
      }
      move_lead_to_stage: {
        Args: { p_lead_id: string; p_new_status: string }
        Returns: boolean
      }
      normalize_phone_number: { Args: { phone_input: string }; Returns: string }
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
      search_knowledge: {
        Args: {
          filter_account_id?: string
          filter_category?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
      search_knowledge_base: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          search_category?: string
        }
        Returns: {
          category: string
          confidence_score: number
          content: string
          id: string
          similarity: number
          source: string
          tags: string[]
          title: string
        }[]
      }
      seed_default_tags: { Args: { p_account_id: string }; Returns: undefined }
      set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      test_auth_context: { Args: never; Returns: Json }
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
      user_has_lead_access: { Args: { p_lead_id: string }; Returns: boolean }
    }
    Enums: {
      account_status: "lead" | "active" | "churned"
      account_type: "household" | "business"
      account_type_enum: "individual" | "business" | "household"
      account_type_new: "individual" | "business" | "household"
      account_type_v2: "household" | "commercial_business"
      agent_role: "staff" | "admin" | "producer"
      batch_status: "queued" | "processing" | "completed" | "failed"
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
      job_status: "queued" | "running" | "succeeded" | "failed" | "canceled"
      job_type: "comparison" | "extraction" | "analysis"
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
      task_category:
        | "quote"
        | "policy"
        | "claim"
        | "renewal"
        | "service"
        | "general"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
      task_status_enum: "open" | "done" | "cancelled"
      task_trigger_event:
        | "quote_requested"
        | "quote_accepted"
        | "policy_issued"
        | "policy_renewal_due"
        | "claim_filed"
        | "payment_overdue"
        | "service_request"
        | "manual"
      ticket_action_type:
        | "ai_summary"
        | "ai_action_item"
        | "ai_draft_response"
        | "manual_note"
        | "status_change"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_source: "email" | "phone" | "manual" | "web_form" | "chat"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_customer"
        | "resolved"
        | "closed"
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
      batch_status: ["queued", "processing", "completed", "failed"],
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
      job_status: ["queued", "running", "succeeded", "failed", "canceled"],
      job_type: ["comparison", "extraction", "analysis"],
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
      task_category: [
        "quote",
        "policy",
        "claim",
        "renewal",
        "service",
        "general",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
      task_status_enum: ["open", "done", "cancelled"],
      task_trigger_event: [
        "quote_requested",
        "quote_accepted",
        "policy_issued",
        "policy_renewal_due",
        "claim_filed",
        "payment_overdue",
        "service_request",
        "manual",
      ],
      ticket_action_type: [
        "ai_summary",
        "ai_action_item",
        "ai_draft_response",
        "manual_note",
        "status_change",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_source: ["email", "phone", "manual", "web_form", "chat"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ],
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
