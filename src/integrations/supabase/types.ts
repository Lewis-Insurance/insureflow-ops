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
          address_line1: string | null
          address_line2: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          source: string | null
          state: string | null
          tin_last4: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          source?: string | null
          state?: string | null
          tin_last4?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          source?: string | null
          state?: string | null
          tin_last4?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
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
      carriers: {
        Row: {
          billing_portal_url: string | null
          claims_phone: string | null
          created_at: string
          id: string
          naic: string | null
          name: string
          updated_at: string
        }
        Insert: {
          billing_portal_url?: string | null
          claims_phone?: string | null
          created_at?: string
          id?: string
          naic?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          billing_portal_url?: string | null
          claims_phone?: string | null
          created_at?: string
          id?: string
          naic?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          amount_estimate: number | null
          claim_number: string
          created_at: string
          description: string | null
          id: string
          loss_date: string | null
          policy_id: string
          status: Database["public"]["Enums"]["claim_status"]
          updated_at: string
        }
        Insert: {
          amount_estimate?: number | null
          claim_number: string
          created_at?: string
          description?: string | null
          id?: string
          loss_date?: string | null
          policy_id: string
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Update: {
          amount_estimate?: number | null
          claim_number?: string
          created_at?: string
          description?: string | null
          id?: string
          loss_date?: string | null
          policy_id?: string
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "my_policies"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "policies_with_claims"
            referencedColumns: ["policy_id"]
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
        ]
      }
      consents: {
        Row: {
          contact_id: string
          created_at: string
          granted_at: string
          id: string
          method: Database["public"]["Enums"]["consent_method"]
          proof_ref: string | null
          revoked_at: string | null
          type: Database["public"]["Enums"]["consent_type"]
        }
        Insert: {
          contact_id: string
          created_at?: string
          granted_at?: string
          id?: string
          method: Database["public"]["Enums"]["consent_method"]
          proof_ref?: string | null
          revoked_at?: string | null
          type: Database["public"]["Enums"]["consent_type"]
        }
        Update: {
          contact_id?: string
          created_at?: string
          granted_at?: string
          id?: string
          method?: Database["public"]["Enums"]["consent_method"]
          proof_ref?: string | null
          revoked_at?: string | null
          type?: Database["public"]["Enums"]["consent_type"]
        }
        Relationships: [
          {
            foreignKeyName: "consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
          consent_sms: boolean
          consent_sms_at: string | null
          consent_voice: boolean
          consent_voice_at: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          role: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          consent_sms?: boolean
          consent_sms_at?: string | null
          consent_voice?: boolean
          consent_voice_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          role?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          consent_sms?: boolean
          consent_sms_at?: string | null
          consent_voice?: boolean
          consent_voice_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          role?: string | null
          source?: string | null
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "data_export_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
          file_size: number | null
          filename: string
          id: string
          kind: string
          mime_type: string | null
          pii_level: string | null
          policy_id: string | null
          signature_request_id: string | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          file_size?: number | null
          filename: string
          id?: string
          kind: string
          mime_type?: string | null
          pii_level?: string | null
          policy_id?: string | null
          signature_request_id?: string | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          file_size?: number | null
          filename?: string
          id?: string
          kind?: string
          mime_type?: string | null
          pii_level?: string | null
          policy_id?: string | null
          signature_request_id?: string | null
          storage_path?: string
          updated_at?: string
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
            referencedRelation: "my_policies"
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
            referencedRelation: "policies_with_claims"
            referencedColumns: ["policy_id"]
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
        Relationships: [
          {
            foreignKeyName: "email_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "impersonation_logs_impersonator_id_fkey"
            columns: ["impersonator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "phone_verification_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          account_id: string | null
          carrier: string
          carrier_id: string | null
          created_at: string
          effective_date: string
          expiration_date: string
          id: string
          insured_user_id: string
          line_of_business: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          policy_number: string
          premium: number
          status: string | null
        }
        Insert: {
          account_id?: string | null
          carrier: string
          carrier_id?: string | null
          created_at?: string
          effective_date: string
          expiration_date: string
          id?: string
          insured_user_id: string
          line_of_business?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          policy_number: string
          premium: number
          status?: string | null
        }
        Update: {
          account_id?: string | null
          carrier?: string
          carrier_id?: string | null
          created_at?: string
          effective_date?: string
          expiration_date?: string
          id?: string
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
        Relationships: [
          {
            foreignKeyName: "profile_access_logs_accessor_user_id_fkey"
            columns: ["accessor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_access_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          backup_codes: string[] | null
          created_at: string
          full_name: string | null
          id: string
          is_staff: boolean
          locale: string | null
          mfa_enabled: boolean | null
          mfa_secret: string | null
          notification_email: boolean | null
          notification_sms: boolean | null
          phone: string | null
          phone_verification_sent_at: string | null
          phone_verified: boolean | null
          role: Database["public"]["Enums"]["user_role"]
          timezone: string | null
        }
        Insert: {
          avatar_url?: string | null
          backup_codes?: string[] | null
          created_at?: string
          full_name?: string | null
          id: string
          is_staff?: boolean
          locale?: string | null
          mfa_enabled?: boolean | null
          mfa_secret?: string | null
          notification_email?: boolean | null
          notification_sms?: boolean | null
          phone?: string | null
          phone_verification_sent_at?: string | null
          phone_verified?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string | null
        }
        Update: {
          avatar_url?: string | null
          backup_codes?: string[] | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_staff?: boolean
          locale?: string | null
          mfa_enabled?: boolean | null
          mfa_secret?: string | null
          notification_email?: boolean | null
          notification_sms?: boolean | null
          phone?: string | null
          phone_verification_sent_at?: string | null
          phone_verified?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string | null
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "role_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
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
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
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
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_claims: {
        Row: {
          amount_estimate: number | null
          claim_number: string | null
          created_at: string | null
          description: string | null
          id: string | null
          policy_id: string | null
          status: Database["public"]["Enums"]["claim_status"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "my_policies"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "policies_with_claims"
            referencedColumns: ["policy_id"]
          },
        ]
      }
      my_policies: {
        Row: {
          carrier: string | null
          created_at: string | null
          effective_date: string | null
          expiration_date: string | null
          id: string | null
          insured_user_id: string | null
          policy_number: string | null
          premium: number | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string | null
          insured_user_id?: string | null
          policy_number?: string | null
          premium?: number | null
        }
        Update: {
          carrier?: string | null
          created_at?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string | null
          insured_user_id?: string | null
          policy_number?: string | null
          premium?: number | null
        }
        Relationships: []
      }
      policies_with_claims: {
        Row: {
          amount_estimate: number | null
          carrier: string | null
          claim_id: string | null
          claim_number: string | null
          effective_date: string | null
          expiration_date: string | null
          insured_user_id: string | null
          policy_id: string | null
          policy_number: string | null
          premium: number | null
          status: Database["public"]["Enums"]["claim_status"] | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      has_role: {
        Args: { desired: Database["public"]["Enums"]["user_role"]; uid: string }
        Returns: boolean
      }
      is_admin: {
        Args: { uid: string }
        Returns: boolean
      }
      is_staff: {
        Args: { uid: string }
        Returns: boolean
      }
      set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "household" | "business"
      claim_status: "open" | "in_review" | "approved" | "denied" | "closed"
      consent_method: "verbal" | "web" | "sms_keyword" | "paper"
      consent_type: "sms" | "voice" | "email"
      payment_type: "direct" | "agency"
      sms_direction: "in" | "out"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
      user_role: "customer" | "staff" | "admin"
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
      account_type: ["household", "business"],
      claim_status: ["open", "in_review", "approved", "denied", "closed"],
      consent_method: ["verbal", "web", "sms_keyword", "paper"],
      consent_type: ["sms", "voice", "email"],
      payment_type: ["direct", "agency"],
      sms_direction: ["in", "out"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
      user_role: ["customer", "staff", "admin"],
    },
  },
} as const
