/**
 * Generated from the live database schema. DO NOT EDIT BY HAND.
 *
 * Regenerate after every migration:
 *     pnpm db:types
 *
 * `pnpm db:types` needs the local Supabase stack, which does not start on this
 * machine. Generate through the Supabase MCP connector instead and write the
 * `types` field of its response here verbatim, keeping this header.
 *
 * Project: maatrisetu (ap-south-1). Chosen for DPDP data residency - patient
 * data stays in India.
 */

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      anti_d_events: {
        Row: {
          clinic_id: string
          created_at: string
          dose_amount: number | null
          dose_unit: string | null
          event_type: string
          id: string
          note: string | null
          occurred_at: string
          patient_id: string
          pregnancy_id: string
          recorded_by: string
          titre_text: string | null
          updated_at: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          dose_amount?: number | null
          dose_unit?: string | null
          event_type: string
          id?: string
          note?: string | null
          occurred_at: string
          patient_id: string
          pregnancy_id: string
          recorded_by: string
          titre_text?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          dose_amount?: number | null
          dose_unit?: string | null
          event_type?: string
          id?: string
          note?: string | null
          occurred_at?: string
          patient_id?: string
          pregnancy_id?: string
          recorded_by?: string
          titre_text?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "anti_d_events_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "anti_d_events_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "anti_d_events_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string
          id: string
          patient_id: string
          pregnancy_id: string | null
          purpose: string | null
          scheduled_on: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by: string
          id?: string
          patient_id: string
          pregnancy_id?: string | null
          purpose?: string | null
          scheduled_on: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string
          id?: string
          patient_id?: string
          pregnancy_id?: string | null
          purpose?: string | null
          scheduled_on?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "appointments_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_description: string | null
          actor_staff_user_id: string | null
          actor_worker: string | null
          clinic_id: string
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          occurred_at: string
          payload: Json
          request_id: string | null
        }
        Insert: {
          action: string
          actor_description?: string | null
          actor_staff_user_id?: string | null
          actor_worker?: string | null
          clinic_id: string
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          occurred_at?: string
          payload?: Json
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_description?: string | null
          actor_staff_user_id?: string | null
          actor_worker?: string | null
          clinic_id?: string
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          occurred_at?: string
          payload?: Json
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_staff_user_id_fkey"
            columns: ["actor_staff_user_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_memberships: {
        Row: {
          clinic_id: string
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          revoked_at: string | null
          role: Database["public"]["Enums"]["clinic_role"]
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          role: Database["public"]["Enums"]["clinic_role"]
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["clinic_role"]
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinic_memberships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          timezone: string
          type: Database["public"]["Enums"]["clinic_type"]
          updated_at: string
          version: number
        }
        Insert: {
          address?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          timezone?: string
          type?: Database["public"]["Enums"]["clinic_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          address?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          type?: Database["public"]["Enums"]["clinic_type"]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          captured_at: string
          captured_by: string
          clinic_id: string
          created_at: string
          granted: boolean
          id: string
          language: string
          method: Database["public"]["Enums"]["consent_method"]
          patient_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          updated_at: string
          version: number
          withdrawal_note: string | null
          withdrawn_at: string | null
          withdrawn_by: string | null
          wording_version: string
        }
        Insert: {
          captured_at?: string
          captured_by: string
          clinic_id: string
          created_at?: string
          granted: boolean
          id?: string
          language: string
          method: Database["public"]["Enums"]["consent_method"]
          patient_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          updated_at?: string
          version?: number
          withdrawal_note?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          wording_version: string
        }
        Update: {
          captured_at?: string
          captured_by?: string
          clinic_id?: string
          created_at?: string
          granted?: boolean
          id?: string
          language?: string
          method?: Database["public"]["Enums"]["consent_method"]
          patient_id?: string
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          updated_at?: string
          version?: number
          withdrawal_note?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          wording_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "consent_records_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_attempts: {
        Row: {
          attempt_no: number
          attempted_at: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          outbox_event_id: string
          provider: string
          provider_message_id: string | null
          provider_status: string | null
          succeeded: boolean
        }
        Insert: {
          attempt_no: number
          attempted_at?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          outbox_event_id: string
          provider: string
          provider_message_id?: string | null
          provider_status?: string | null
          succeeded: boolean
        }
        Update: {
          attempt_no?: number
          attempted_at?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          outbox_event_id?: string
          provider?: string
          provider_message_id?: string | null
          provider_status?: string | null
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_outbox_event_id_fkey"
            columns: ["outbox_event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_references: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string
          id: string
          patient_id: string
          pregnancy_id: string
          reason: string
          to_external_name: string | null
          to_facility: string | null
          to_specialty: string | null
          to_staff_user_id: string | null
          updated_at: string
          urgency: string
          version: number
          visit_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by: string
          id?: string
          patient_id: string
          pregnancy_id: string
          reason: string
          to_external_name?: string | null
          to_facility?: string | null
          to_specialty?: string | null
          to_staff_user_id?: string | null
          updated_at?: string
          urgency?: string
          version?: number
          visit_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string
          id?: string
          patient_id?: string
          pregnancy_id?: string
          reason?: string
          to_external_name?: string | null
          to_facility?: string | null
          to_specialty?: string | null
          to_staff_user_id?: string | null
          updated_at?: string
          urgency?: string
          version?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_references_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_references_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "doctor_references_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "doctor_references_to_staff_user_id_fkey"
            columns: ["to_staff_user_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_references_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      extraction_runs: {
        Row: {
          attempt_no: number
          clinic_id: string
          completed_at: string | null
          created_at: string
          detected_report_type:
            | Database["public"]["Enums"]["report_type"]
            | null
          error_code: string | null
          error_message: string | null
          id: string
          model: string
          prompt_version: string
          provider: string
          raw_output: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["extraction_status"]
          updated_at: string
          upload_id: string
          version: number
        }
        Insert: {
          attempt_no?: number
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          detected_report_type?:
            | Database["public"]["Enums"]["report_type"]
            | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          model: string
          prompt_version: string
          provider: string
          raw_output?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["extraction_status"]
          updated_at?: string
          upload_id: string
          version?: number
        }
        Update: {
          attempt_no?: number
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          detected_report_type?:
            | Database["public"]["Enums"]["report_type"]
            | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          model?: string
          prompt_version?: string
          provider?: string
          raw_output?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["extraction_status"]
          updated_at?: string
          upload_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "extraction_runs_upload_fk"
            columns: ["clinic_id", "upload_id"]
            isOneToOne: false
            referencedRelation: "report_uploads"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      family_histories: {
        Row: {
          clinic_id: string
          created_at: string
          current_age_years: number | null
          disease: string
          id: string
          onset_age_years: number | null
          patient_id: string
          recorded_by: string | null
          relation: string
          remarks: string | null
          removed_at: string | null
          removed_by: string | null
          updated_at: string
          version: number
          vital_status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          current_age_years?: number | null
          disease: string
          id?: string
          onset_age_years?: number | null
          patient_id: string
          recorded_by?: string | null
          relation: string
          remarks?: string | null
          removed_at?: string | null
          removed_by?: string | null
          updated_at?: string
          version?: number
          vital_status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          current_age_years?: number | null
          disease?: string
          id?: string
          onset_age_years?: number | null
          patient_id?: string
          recorded_by?: string | null
          relation?: string
          remarks?: string | null
          removed_at?: string | null
          removed_by?: string | null
          updated_at?: string
          version?: number
          vital_status?: string
        }
        Relationships: []
      }
      finding_pins: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          observation_id: string | null
          pinned_at: string
          pinned_by: string
          pregnancy_id: string
          scan_report_id: string | null
          unpinned_at: string | null
          unpinned_by: string | null
          updated_at: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          observation_id?: string | null
          pinned_at?: string
          pinned_by: string
          pregnancy_id: string
          scan_report_id?: string | null
          unpinned_at?: string | null
          unpinned_by?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          observation_id?: string | null
          pinned_at?: string
          pinned_by?: string
          pregnancy_id?: string
          scan_report_id?: string | null
          unpinned_at?: string | null
          unpinned_by?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "finding_pins_observation_fk"
            columns: ["clinic_id", "observation_id"]
            isOneToOne: false
            referencedRelation: "observations"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "finding_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_pins_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "finding_pins_scan_fk"
            columns: ["clinic_id", "scan_report_id"]
            isOneToOne: false
            referencedRelation: "scan_reports"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "finding_pins_unpinned_by_fkey"
            columns: ["unpinned_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      flagged_diagnoses: {
        Row: {
          clinic_id: string
          created_at: string
          flagged_at: string
          flagged_by: string | null
          id: string
          label: string
          patient_id: string
          pregnancy_id: string
          resolved_at: string | null
          resolved_by: string | null
          section: string
          updated_at: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          label: string
          patient_id: string
          pregnancy_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          section: string
          updated_at?: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          label?: string
          patient_id?: string
          pregnancy_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          section?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      idempotency_requests: {
        Row: {
          actor_staff_user_id: string
          clinic_id: string
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          operation: string
          payload_hash: string
          request_key: string
          response_entity_id: string | null
          response_entity_table: string | null
          response_status: number | null
        }
        Insert: {
          actor_staff_user_id: string
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          operation: string
          payload_hash: string
          request_key: string
          response_entity_id?: string | null
          response_entity_table?: string | null
          response_status?: number | null
        }
        Update: {
          actor_staff_user_id?: string
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          operation?: string
          payload_hash?: string
          request_key?: string
          response_entity_id?: string | null
          response_entity_table?: string | null
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_requests_actor_staff_user_id_fkey"
            columns: ["actor_staff_user_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_requests_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      immunizations: {
        Row: {
          administered_at_facility: string | null
          administered_on: string | null
          batch_number: string | null
          clinic_id: string
          created_at: string
          id: string
          patient_id: string
          pregnancy_id: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["data_source"]
          status: Database["public"]["Enums"]["immunization_status"]
          updated_at: string
          vaccine: string
          version: number
        }
        Insert: {
          administered_at_facility?: string | null
          administered_on?: string | null
          batch_number?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          patient_id: string
          pregnancy_id: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          status?: Database["public"]["Enums"]["immunization_status"]
          updated_at?: string
          vaccine: string
          version?: number
        }
        Update: {
          administered_at_facility?: string | null
          administered_on?: string | null
          batch_number?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          pregnancy_id?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          status?: Database["public"]["Enums"]["immunization_status"]
          updated_at?: string
          vaccine?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "immunizations_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "immunizations_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "immunizations_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      master_packs: {
        Row: {
          advice: string | null
          clinic_id: string
          counselling: string[]
          created_at: string
          deleted_at: string | null
          id: string
          lab_orders: string[]
          medicines: Json
          name: string
          owner_staff_user_id: string
          scan_orders: string[]
          updated_at: string
          version: number
        }
        Insert: {
          advice?: string | null
          clinic_id: string
          counselling?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          lab_orders?: string[]
          medicines?: Json
          name: string
          owner_staff_user_id: string
          scan_orders?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          advice?: string | null
          clinic_id?: string
          counselling?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          lab_orders?: string[]
          medicines?: Json
          name?: string
          owner_staff_user_id?: string
          scan_orders?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "master_packs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_packs_owner_staff_user_id_fkey"
            columns: ["owner_staff_user_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_administrations: {
        Row: {
          administered_at: string
          administered_at_facility: string | null
          certainty: Database["public"]["Enums"]["administration_certainty"]
          clinic_id: string
          created_at: string
          dose_amount: number
          dose_unit: string
          id: string
          medicine_name: string
          note: string | null
          patient_id: string
          pregnancy_id: string
          recorded_at: string
          recorded_by: string
          route: Database["public"]["Enums"]["medication_route"]
          updated_at: string
          version: number
          visit_id: string | null
        }
        Insert: {
          administered_at: string
          administered_at_facility?: string | null
          certainty?: Database["public"]["Enums"]["administration_certainty"]
          clinic_id: string
          created_at?: string
          dose_amount: number
          dose_unit: string
          id?: string
          medicine_name: string
          note?: string | null
          patient_id: string
          pregnancy_id: string
          recorded_at?: string
          recorded_by: string
          route: Database["public"]["Enums"]["medication_route"]
          updated_at?: string
          version?: number
          visit_id?: string | null
        }
        Update: {
          administered_at?: string
          administered_at_facility?: string | null
          certainty?: Database["public"]["Enums"]["administration_certainty"]
          clinic_id?: string
          created_at?: string
          dose_amount?: number
          dose_unit?: string
          id?: string
          medicine_name?: string
          note?: string | null
          patient_id?: string
          pregnancy_id?: string
          recorded_at?: string
          recorded_by?: string
          route?: Database["public"]["Enums"]["medication_route"]
          updated_at?: string
          version?: number
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_administrations_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "medication_administrations_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "medication_administrations_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_administrations_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      menstrual_histories: {
        Row: {
          clinic_id: string
          created_at: string
          cycle_length_days: number | null
          cycle_regularity: string | null
          duration_days: number | null
          dysmenorrhea: boolean | null
          bowel_bladder: string | null
          flow: string | null
          id: string
          impacts_activities: boolean | null
          last_pap_smear_on: string | null
          lmp: string | null
          menarche_age_years: number | null
          pads_per_day: number | null
          patient_id: string
          pms_emotional: string[] | null
          pms_physical: string[] | null
          recorded_by: string | null
          recorded_on: string
          remarks: string | null
          source: Database["public"]["Enums"]["data_source"]
          updated_at: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          cycle_length_days?: number | null
          cycle_regularity?: string | null
          duration_days?: number | null
          dysmenorrhea?: boolean | null
          bowel_bladder?: string | null
          flow?: string | null
          id?: string
          impacts_activities?: boolean | null
          last_pap_smear_on?: string | null
          lmp?: string | null
          menarche_age_years?: number | null
          pads_per_day?: number | null
          patient_id: string
          pms_emotional?: string[] | null
          pms_physical?: string[] | null
          recorded_by?: string | null
          recorded_on: string
          remarks?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          cycle_length_days?: number | null
          cycle_regularity?: string | null
          duration_days?: number | null
          dysmenorrhea?: boolean | null
          bowel_bladder?: string | null
          flow?: string | null
          id?: string
          impacts_activities?: boolean | null
          last_pap_smear_on?: string | null
          lmp?: string | null
          menarche_age_years?: number | null
          pads_per_day?: number | null
          patient_id?: string
          pms_emotional?: string[] | null
          pms_physical?: string[] | null
          recorded_by?: string | null
          recorded_on?: string
          remarks?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "menstrual_histories_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "menstrual_histories_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          category: Database["public"]["Enums"]["observation_category"]
          clinic_id: string
          clinician_note: string | null
          created_at: string
          flagged_by_clinician: boolean | null
          id: string
          observed_date: string
          observed_date_precision: Database["public"]["Enums"]["date_precision"]
          patient_id: string
          pregnancy_id: string
          reference_high: number | null
          reference_low: number | null
          reference_text: string | null
          source: Database["public"]["Enums"]["data_source"]
          source_candidate_id: string | null
          source_upload_id: string | null
          superseded_at: string | null
          supersedes_id: string | null
          test_code: string
          test_name: string
          unit_normalized: string | null
          unit_original: string | null
          updated_at: string
          value_normalized: number | null
          value_numeric: number | null
          value_text: string | null
          verified_at: string
          verified_by: string
          version: number
        }
        Insert: {
          category: Database["public"]["Enums"]["observation_category"]
          clinic_id: string
          clinician_note?: string | null
          created_at?: string
          flagged_by_clinician?: boolean | null
          id?: string
          observed_date: string
          observed_date_precision?: Database["public"]["Enums"]["date_precision"]
          patient_id: string
          pregnancy_id: string
          reference_high?: number | null
          reference_low?: number | null
          reference_text?: string | null
          source: Database["public"]["Enums"]["data_source"]
          source_candidate_id?: string | null
          source_upload_id?: string | null
          superseded_at?: string | null
          supersedes_id?: string | null
          test_code: string
          test_name: string
          unit_normalized?: string | null
          unit_original?: string | null
          updated_at?: string
          value_normalized?: number | null
          value_numeric?: number | null
          value_text?: string | null
          verified_at?: string
          verified_by: string
          version?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["observation_category"]
          clinic_id?: string
          clinician_note?: string | null
          created_at?: string
          flagged_by_clinician?: boolean | null
          id?: string
          observed_date?: string
          observed_date_precision?: Database["public"]["Enums"]["date_precision"]
          patient_id?: string
          pregnancy_id?: string
          reference_high?: number | null
          reference_low?: number | null
          reference_text?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          source_candidate_id?: string | null
          source_upload_id?: string | null
          superseded_at?: string | null
          supersedes_id?: string | null
          test_code?: string
          test_name?: string
          unit_normalized?: string | null
          unit_original?: string | null
          updated_at?: string
          value_normalized?: number | null
          value_numeric?: number | null
          value_text?: string | null
          verified_at?: string
          verified_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "observations_candidate_fk"
            columns: ["clinic_id", "source_candidate_id"]
            isOneToOne: false
            referencedRelation: "report_candidates"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "observations_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "observations_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "observations_supersedes_fk"
            columns: ["clinic_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "observations"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "observations_upload_fk"
            columns: ["clinic_id", "source_upload_id"]
            isOneToOne: false
            referencedRelation: "report_uploads"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "observations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      obstetric_history: {
        Row: {
          baby_position: string | null
          birth_weight_grams: number | null
          child_alive: Database["public"]["Enums"]["known_status"]
          clinic_id: string
          complications: string | null
          conception_mode: string | null
          conception_remarks: string | null
          created_at: string
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          event_date: string | null
          event_date_precision: Database["public"]["Enums"]["date_precision"]
          gestation_category: string | null
          gestation_weeks_at_delivery: number | null
          has_uterine_scar: boolean
          id: string
          induced_complications: string[] | null
          induced_complications_remarks: string | null
          outcome: Database["public"]["Enums"]["pregnancy_outcome"]
          patient_id: string
          place_of_event: string | null
          plurality: string | null
          plurality_other: string | null
          pregnancy_id: string | null
          recorded_at: string
          recorded_by: string | null
          related_complications: string[] | null
          related_complications_remarks: string | null
          remarks: string | null
          scar_indication: string | null
          sequence_no: number
          source: Database["public"]["Enums"]["data_source"]
          updated_at: string
          version: number
          year_of_event: number | null
        }
        Insert: {
          baby_position?: string | null
          birth_weight_grams?: number | null
          child_alive?: Database["public"]["Enums"]["known_status"]
          clinic_id: string
          complications?: string | null
          conception_mode?: string | null
          conception_remarks?: string | null
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          event_date?: string | null
          event_date_precision?: Database["public"]["Enums"]["date_precision"]
          gestation_category?: string | null
          gestation_weeks_at_delivery?: number | null
          has_uterine_scar?: boolean
          id?: string
          induced_complications?: string[] | null
          induced_complications_remarks?: string | null
          outcome?: Database["public"]["Enums"]["pregnancy_outcome"]
          patient_id: string
          place_of_event?: string | null
          plurality?: string | null
          plurality_other?: string | null
          pregnancy_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          related_complications?: string[] | null
          related_complications_remarks?: string | null
          remarks?: string | null
          scar_indication?: string | null
          sequence_no: number
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
          version?: number
          year_of_event?: number | null
        }
        Update: {
          baby_position?: string | null
          birth_weight_grams?: number | null
          child_alive?: Database["public"]["Enums"]["known_status"]
          clinic_id?: string
          complications?: string | null
          conception_mode?: string | null
          conception_remarks?: string | null
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          event_date?: string | null
          event_date_precision?: Database["public"]["Enums"]["date_precision"]
          gestation_category?: string | null
          gestation_weeks_at_delivery?: number | null
          has_uterine_scar?: boolean
          id?: string
          induced_complications?: string[] | null
          induced_complications_remarks?: string | null
          outcome?: Database["public"]["Enums"]["pregnancy_outcome"]
          patient_id?: string
          place_of_event?: string | null
          plurality?: string | null
          plurality_other?: string | null
          pregnancy_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          related_complications?: string[] | null
          related_complications_remarks?: string | null
          remarks?: string | null
          scar_indication?: string | null
          sequence_no?: number
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
          version?: number
          year_of_event?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "obstetric_history_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "obstetric_history_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "obstetric_history_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      obstetric_history_infants: {
        Row: {
          apgar_1_min: number | null
          apgar_10_min: number | null
          apgar_5_min: number | null
          birth_weight_grams: number | null
          clinic_id: string
          created_at: string
          delivered_on: string | null
          delivered_time: string | null
          fetus_no: number
          history_id: string
          id: string
          outcome: string | null
          outcome_remarks: string | null
          sex: string | null
          updated_at: string
          version: number
        }
        Insert: {
          apgar_1_min?: number | null
          apgar_10_min?: number | null
          apgar_5_min?: number | null
          birth_weight_grams?: number | null
          clinic_id: string
          created_at?: string
          delivered_on?: string | null
          delivered_time?: string | null
          fetus_no: number
          history_id: string
          id?: string
          outcome?: string | null
          outcome_remarks?: string | null
          sex?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          apgar_1_min?: number | null
          apgar_10_min?: number | null
          apgar_5_min?: number | null
          birth_weight_grams?: number | null
          clinic_id?: string
          created_at?: string
          delivered_on?: string | null
          delivered_time?: string | null
          fetus_no?: number
          history_id?: string
          id?: string
          outcome?: string | null
          outcome_remarks?: string | null
          sex?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "obstetric_history_infants_history_fk"
            columns: ["clinic_id", "history_id"]
            isOneToOne: false
            referencedRelation: "obstetric_history"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          attempts: number
          clinic_id: string
          created_at: string
          dedupe_key: string
          event_type: string
          id: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          state: Database["public"]["Enums"]["outbox_state"]
          updated_at: string
          version: number
        }
        Insert: {
          attempts?: number
          clinic_id: string
          created_at?: string
          dedupe_key: string
          event_type: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          state?: Database["public"]["Enums"]["outbox_state"]
          updated_at?: string
          version?: number
        }
        Update: {
          attempts?: number
          clinic_id?: string
          created_at?: string
          dedupe_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          state?: Database["public"]["Enums"]["outbox_state"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          patient_id: string
          reaction: string | null
          recorded_at: string
          recorded_by: string | null
          retracted_at: string | null
          retracted_by: string | null
          retraction_reason: string | null
          severity: Database["public"]["Enums"]["allergy_severity"]
          source: Database["public"]["Enums"]["data_source"]
          substance: string
          updated_at: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          patient_id: string
          reaction?: string | null
          recorded_at?: string
          recorded_by?: string | null
          retracted_at?: string | null
          retracted_by?: string | null
          retraction_reason?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          source: Database["public"]["Enums"]["data_source"]
          substance: string
          updated_at?: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          reaction?: string | null
          recorded_at?: string
          recorded_by?: string | null
          retracted_at?: string | null
          retracted_by?: string | null
          retraction_reason?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          source?: Database["public"]["Enums"]["data_source"]
          substance?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "patient_allergies_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_allergies_retracted_by_fkey"
            columns: ["retracted_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_contacts: {
        Row: {
          clinic_id: string
          contact_name: string | null
          created_at: string
          id: string
          is_primary: boolean
          messaging_consent_at: string | null
          messaging_consent_withdrawn_at: string | null
          patient_id: string
          phone_e164: string
          relationship: Database["public"]["Enums"]["contact_relationship"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          clinic_id: string
          contact_name?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          messaging_consent_at?: string | null
          messaging_consent_withdrawn_at?: string | null
          patient_id: string
          phone_e164: string
          relationship?: Database["public"]["Enums"]["contact_relationship"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          clinic_id?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          messaging_consent_at?: string | null
          messaging_consent_withdrawn_at?: string | null
          patient_id?: string
          phone_e164?: string
          relationship?: Database["public"]["Enums"]["contact_relationship"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "patient_contacts_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "patient_contacts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_credentials: {
        Row: {
          clinic_id: string
          created_at: string
          password_hash: string
          patient_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          password_hash: string
          patient_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          password_hash?: string
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_credentials_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      patient_home_readings: {
        Row: {
          clinic_id: string
          created_at: string
          diastolic_mmhg: number | null
          glucose_context: Database["public"]["Enums"]["glucose_reading_context"] | null
          glucose_mg_dl: number | null
          id: string
          metric: Database["public"]["Enums"]["home_reading_metric"]
          patient_id: string
          pregnancy_id: string
          recorded_at: string
          systolic_mmhg: number | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          diastolic_mmhg?: number | null
          glucose_context?: Database["public"]["Enums"]["glucose_reading_context"] | null
          glucose_mg_dl?: number | null
          id?: string
          metric: Database["public"]["Enums"]["home_reading_metric"]
          patient_id: string
          pregnancy_id: string
          recorded_at?: string
          systolic_mmhg?: number | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          diastolic_mmhg?: number | null
          glucose_context?: Database["public"]["Enums"]["glucose_reading_context"] | null
          glucose_mg_dl?: number | null
          id?: string
          metric?: Database["public"]["Enums"]["home_reading_metric"]
          patient_id?: string
          pregnancy_id?: string
          recorded_at?: string
          systolic_mmhg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_home_readings_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "patient_home_readings_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      patient_past_histories: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_queries: {
        Row: {
          bot_response: string
          clinic_id: string
          created_at: string
          id: string
          is_reviewed: boolean
          patient_id: string
          pregnancy_id: string | null
          query_text: string
          reviewed_at: string | null
          reviewed_by: string | null
          triage_level: Database["public"]["Enums"]["triage_level"]
        }
        Insert: {
          bot_response: string
          clinic_id: string
          created_at?: string
          id?: string
          is_reviewed?: boolean
          patient_id: string
          pregnancy_id?: string | null
          query_text: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          triage_level: Database["public"]["Enums"]["triage_level"]
        }
        Update: {
          bot_response?: string
          clinic_id?: string
          created_at?: string
          id?: string
          is_reviewed?: boolean
          patient_id?: string
          pregnancy_id?: string | null
          query_text?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          triage_level?: Database["public"]["Enums"]["triage_level"]
        }
        Relationships: [
          {
            foreignKeyName: "patient_queries_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "patient_queries_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "patient_queries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          abha_id: string | null
          abha_verification: Database["public"]["Enums"]["abha_verification"]
          age_recorded_on: string | null
          allergy_status: Database["public"]["Enums"]["known_status"]
          blood_group: Database["public"]["Enums"]["blood_group"] | null
          blood_group_recorded_on: string | null
          blood_group_source: Database["public"]["Enums"]["data_source"] | null
          clinic_id: string
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          estimated_age_years: number | null
          full_name: string
          id: string
          qr_token_hash: string | null
          qr_token_issued_at: string | null
          qr_token_revoked_at: string | null
          uhid: string
          updated_at: string
          version: number
        }
        Insert: {
          abha_id?: string | null
          abha_verification?: Database["public"]["Enums"]["abha_verification"]
          age_recorded_on?: string | null
          allergy_status?: Database["public"]["Enums"]["known_status"]
          blood_group?: Database["public"]["Enums"]["blood_group"] | null
          blood_group_recorded_on?: string | null
          blood_group_source?: Database["public"]["Enums"]["data_source"] | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          estimated_age_years?: number | null
          full_name: string
          id?: string
          qr_token_hash?: string | null
          qr_token_issued_at?: string | null
          qr_token_revoked_at?: string | null
          uhid: string
          updated_at?: string
          version?: number
        }
        Update: {
          abha_id?: string | null
          abha_verification?: Database["public"]["Enums"]["abha_verification"]
          age_recorded_on?: string | null
          allergy_status?: Database["public"]["Enums"]["known_status"]
          blood_group?: Database["public"]["Enums"]["blood_group"] | null
          blood_group_recorded_on?: string | null
          blood_group_source?: Database["public"]["Enums"]["data_source"] | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          estimated_age_years?: number | null
          full_name?: string
          id?: string
          qr_token_hash?: string | null
          qr_token_issued_at?: string | null
          qr_token_revoked_at?: string | null
          uhid?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pregnancies: {
        Row: {
          abortions: number | null
          birth_plan: Json
          conception_mode: string | null
          consanguinity: string | null
          married_years: number | null
          clinic_id: string
          closed_at: string | null
          closed_by: string | null
          closure_note: string | null
          created_at: string
          created_by: string | null
          dating_certainty: Database["public"]["Enums"]["dating_certainty"]
          dating_confirmed_at: string | null
          dating_confirmed_by: string | null
          dating_method: Database["public"]["Enums"]["dating_method"]
          dating_reference_date: string | null
          dating_reference_ga_days: number | null
          gravida: number | null
          height_cm: number | null
          id: string
          living: number | null
          outcome: Database["public"]["Enums"]["pregnancy_outcome"] | null
          outcome_date: string | null
          parity: number | null
          patient_id: string
          pre_pregnancy_weight_kg: number | null
          reported_lmp: string | null
          reported_lmp_certainty: Database["public"]["Enums"]["dating_certainty"]
          status: Database["public"]["Enums"]["pregnancy_status"]
          updated_at: string
          version: number
        }
        Insert: {
          abortions?: number | null
          birth_plan?: Json
          conception_mode?: string | null
          consanguinity?: string | null
          married_years?: number | null
          clinic_id: string
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          created_at?: string
          created_by?: string | null
          dating_certainty?: Database["public"]["Enums"]["dating_certainty"]
          dating_confirmed_at?: string | null
          dating_confirmed_by?: string | null
          dating_method?: Database["public"]["Enums"]["dating_method"]
          dating_reference_date?: string | null
          dating_reference_ga_days?: number | null
          gravida?: number | null
          height_cm?: number | null
          id?: string
          living?: number | null
          outcome?: Database["public"]["Enums"]["pregnancy_outcome"] | null
          outcome_date?: string | null
          parity?: number | null
          patient_id: string
          pre_pregnancy_weight_kg?: number | null
          reported_lmp?: string | null
          reported_lmp_certainty?: Database["public"]["Enums"]["dating_certainty"]
          status?: Database["public"]["Enums"]["pregnancy_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          abortions?: number | null
          birth_plan?: Json
          conception_mode?: string | null
          consanguinity?: string | null
          married_years?: number | null
          clinic_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          created_at?: string
          created_by?: string | null
          dating_certainty?: Database["public"]["Enums"]["dating_certainty"]
          dating_confirmed_at?: string | null
          dating_confirmed_by?: string | null
          dating_method?: Database["public"]["Enums"]["dating_method"]
          dating_reference_date?: string | null
          dating_reference_ga_days?: number | null
          gravida?: number | null
          height_cm?: number | null
          id?: string
          living?: number | null
          outcome?: Database["public"]["Enums"]["pregnancy_outcome"] | null
          outcome_date?: string | null
          parity?: number | null
          patient_id?: string
          pre_pregnancy_weight_kg?: number | null
          reported_lmp?: string | null
          reported_lmp_certainty?: Database["public"]["Enums"]["dating_certainty"]
          status?: Database["public"]["Enums"]["pregnancy_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pregnancies_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregnancies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregnancies_dating_confirmed_by_fkey"
            columns: ["dating_confirmed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregnancies_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          clinic_id: string
          created_at: string
          dose_amount: number | null
          dose_unit: string | null
          duration_days: number | null
          end_date: string | null
          food_relation: Database["public"]["Enums"]["food_relation"]
          form: string | null
          frequency: Database["public"]["Enums"]["dose_frequency"]
          id: string
          instructions: string | null
          medicine_name: string
          pregnancy_id: string
          prescribed_by: string
          route: Database["public"]["Enums"]["medication_route"]
          start_date: string
          status: Database["public"]["Enums"]["prescription_status"]
          stop_reason: string | null
          stopped_at: string | null
          stopped_by: string | null
          supersedes_id: string | null
          updated_at: string
          version: number
          visit_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          dose_amount?: number | null
          dose_unit?: string | null
          duration_days?: number | null
          end_date?: string | null
          food_relation?: Database["public"]["Enums"]["food_relation"]
          form?: string | null
          frequency: Database["public"]["Enums"]["dose_frequency"]
          id?: string
          instructions?: string | null
          medicine_name: string
          pregnancy_id: string
          prescribed_by: string
          route?: Database["public"]["Enums"]["medication_route"]
          start_date?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          stop_reason?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          supersedes_id?: string | null
          updated_at?: string
          version?: number
          visit_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          dose_amount?: number | null
          dose_unit?: string | null
          duration_days?: number | null
          end_date?: string | null
          food_relation?: Database["public"]["Enums"]["food_relation"]
          form?: string | null
          frequency?: Database["public"]["Enums"]["dose_frequency"]
          id?: string
          instructions?: string | null
          medicine_name?: string
          pregnancy_id?: string
          prescribed_by?: string
          route?: Database["public"]["Enums"]["medication_route"]
          start_date?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          stop_reason?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          supersedes_id?: string | null
          updated_at?: string
          version?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_prescribed_by_fkey"
            columns: ["prescribed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_stopped_by_fkey"
            columns: ["stopped_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_supersedes_fk"
            columns: ["clinic_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      referral_access_log: {
        Row: {
          accessed_at: string
          client_ip_hash: string | null
          created_at: string
          id: string
          outcome: string
          referral_id: string
          token_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          client_ip_hash?: string | null
          created_at?: string
          id?: string
          outcome: string
          referral_id: string
          token_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          client_ip_hash?: string | null
          created_at?: string
          id?: string
          outcome?: string
          referral_id?: string
          token_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_access_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "referral_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_access_tokens: {
        Row: {
          clinic_id: string
          created_at: string
          expires_at: string
          id: string
          issued_by: string
          referral_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          expires_at: string
          id?: string
          issued_by: string
          referral_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string
          referral_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_access_tokens_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_access_tokens_referral_fk"
            columns: ["clinic_id", "referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "referral_access_tokens_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          accompanying_staff: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          clinic_id: string
          clinical_summary: string | null
          created_at: string
          created_by: string
          departure_at: string | null
          id: string
          indication: string | null
          issued_at: string | null
          issued_by: string | null
          issued_snapshot: Json | null
          lines_and_catheters: string | null
          origin_visit_id: string | null
          patient_id: string
          pregnancy_id: string
          pv_dilatation_cm: number | null
          pv_effacement_percent: number | null
          pv_examined_at: string | null
          pv_examined_by: string | null
          pv_liquor: string | null
          pv_membranes: Database["public"]["Enums"]["membrane_status"]
          pv_station: string | null
          receiving_contact: string | null
          receiving_facility: string | null
          referring_contact_phone: string | null
          referring_doctor_name: string | null
          referring_facility: string | null
          snapshot_schema_version: number | null
          status: Database["public"]["Enums"]["referral_status"]
          superseded_at: string | null
          supersedes_id: string | null
          transfer_bp_diastolic_mmhg: number | null
          transfer_bp_systolic_mmhg: number | null
          transfer_fetal_heart_rate_bpm: number | null
          transfer_pulse_bpm: number | null
          transfer_respiratory_rate_bpm: number | null
          transfer_spo2_percent: number | null
          transfer_temperature_c: number | null
          transfer_urine_albumin:
            | Database["public"]["Enums"]["dipstick_grade"]
            | null
          transfer_vitals_recorded_at: string | null
          transport_mode: string | null
          updated_at: string
          version: number
        }
        Insert: {
          accompanying_staff?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_id: string
          clinical_summary?: string | null
          created_at?: string
          created_by: string
          departure_at?: string | null
          id?: string
          indication?: string | null
          issued_at?: string | null
          issued_by?: string | null
          issued_snapshot?: Json | null
          lines_and_catheters?: string | null
          origin_visit_id?: string | null
          patient_id: string
          pregnancy_id: string
          pv_dilatation_cm?: number | null
          pv_effacement_percent?: number | null
          pv_examined_at?: string | null
          pv_examined_by?: string | null
          pv_liquor?: string | null
          pv_membranes?: Database["public"]["Enums"]["membrane_status"]
          pv_station?: string | null
          receiving_contact?: string | null
          receiving_facility?: string | null
          referring_contact_phone?: string | null
          referring_doctor_name?: string | null
          referring_facility?: string | null
          snapshot_schema_version?: number | null
          status?: Database["public"]["Enums"]["referral_status"]
          superseded_at?: string | null
          supersedes_id?: string | null
          transfer_bp_diastolic_mmhg?: number | null
          transfer_bp_systolic_mmhg?: number | null
          transfer_fetal_heart_rate_bpm?: number | null
          transfer_pulse_bpm?: number | null
          transfer_respiratory_rate_bpm?: number | null
          transfer_spo2_percent?: number | null
          transfer_temperature_c?: number | null
          transfer_urine_albumin?:
            | Database["public"]["Enums"]["dipstick_grade"]
            | null
          transfer_vitals_recorded_at?: string | null
          transport_mode?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          accompanying_staff?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_id?: string
          clinical_summary?: string | null
          created_at?: string
          created_by?: string
          departure_at?: string | null
          id?: string
          indication?: string | null
          issued_at?: string | null
          issued_by?: string | null
          issued_snapshot?: Json | null
          lines_and_catheters?: string | null
          origin_visit_id?: string | null
          patient_id?: string
          pregnancy_id?: string
          pv_dilatation_cm?: number | null
          pv_effacement_percent?: number | null
          pv_examined_at?: string | null
          pv_examined_by?: string | null
          pv_liquor?: string | null
          pv_membranes?: Database["public"]["Enums"]["membrane_status"]
          pv_station?: string | null
          receiving_contact?: string | null
          receiving_facility?: string | null
          referring_contact_phone?: string | null
          referring_doctor_name?: string | null
          referring_facility?: string | null
          snapshot_schema_version?: number | null
          status?: Database["public"]["Enums"]["referral_status"]
          superseded_at?: string | null
          supersedes_id?: string | null
          transfer_bp_diastolic_mmhg?: number | null
          transfer_bp_systolic_mmhg?: number | null
          transfer_fetal_heart_rate_bpm?: number | null
          transfer_pulse_bpm?: number | null
          transfer_respiratory_rate_bpm?: number | null
          transfer_spo2_percent?: number | null
          transfer_temperature_c?: number | null
          transfer_urine_albumin?:
            | Database["public"]["Enums"]["dipstick_grade"]
            | null
          transfer_vitals_recorded_at?: string | null
          transport_mode?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "referrals_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "referrals_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "referrals_pv_examined_by_fkey"
            columns: ["pv_examined_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_supersedes_fk"
            columns: ["clinic_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "referrals_visit_fk"
            columns: ["clinic_id", "origin_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      report_candidates: {
        Row: {
          clinic_id: string
          confidence: number | null
          corrected_at: string | null
          corrected_by: string | null
          correction_version: number
          created_at: string
          discarded_at: string | null
          extraction_run_id: string
          id: string
          observed_date: string | null
          observed_date_precision: Database["public"]["Enums"]["date_precision"]
          printed_label: string | null
          reference_high: number | null
          reference_low: number | null
          reference_text: string | null
          source_page: number | null
          test_code: string
          unit_normalized: string | null
          unit_original: string | null
          updated_at: string
          value_normalized: number | null
          value_numeric: number | null
          value_text: string | null
          version: number
        }
        Insert: {
          clinic_id: string
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_version?: number
          created_at?: string
          discarded_at?: string | null
          extraction_run_id: string
          id?: string
          observed_date?: string | null
          observed_date_precision?: Database["public"]["Enums"]["date_precision"]
          printed_label?: string | null
          reference_high?: number | null
          reference_low?: number | null
          reference_text?: string | null
          source_page?: number | null
          test_code: string
          unit_normalized?: string | null
          unit_original?: string | null
          updated_at?: string
          value_normalized?: number | null
          value_numeric?: number | null
          value_text?: string | null
          version?: number
        }
        Update: {
          clinic_id?: string
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_version?: number
          created_at?: string
          discarded_at?: string | null
          extraction_run_id?: string
          id?: string
          observed_date?: string | null
          observed_date_precision?: Database["public"]["Enums"]["date_precision"]
          printed_label?: string | null
          reference_high?: number | null
          reference_low?: number | null
          reference_text?: string | null
          source_page?: number | null
          test_code?: string
          unit_normalized?: string | null
          unit_original?: string | null
          updated_at?: string
          value_normalized?: number | null
          value_numeric?: number | null
          value_text?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_candidates_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_candidates_run_fk"
            columns: ["clinic_id", "extraction_run_id"]
            isOneToOne: false
            referencedRelation: "extraction_runs"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      report_reviews: {
        Row: {
          clinic_id: string
          created_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          id: string
          reason: string | null
          reviewed_at: string
          reviewed_by: string
          reviewed_candidate_versions: Json
          upload_id: string
          visit_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          decision: Database["public"]["Enums"]["review_decision"]
          id?: string
          reason?: string | null
          reviewed_at?: string
          reviewed_by: string
          reviewed_candidate_versions?: Json
          upload_id: string
          visit_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision"]
          id?: string
          reason?: string | null
          reviewed_at?: string
          reviewed_by?: string
          reviewed_candidate_versions?: Json
          upload_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reviews_upload_fk"
            columns: ["clinic_id", "upload_id"]
            isOneToOne: false
            referencedRelation: "report_uploads"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "report_reviews_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      report_uploads: {
        Row: {
          assignment_status: Database["public"]["Enums"]["upload_assignment_status"]
          byte_size: number
          clinic_id: string
          content_type: string
          created_at: string
          id: string
          object_key: string
          patient_id: string
          pregnancy_id: string | null
          quarantine_reason: string | null
          sha256: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
          visit_id: string | null
        }
        Insert: {
          assignment_status?: Database["public"]["Enums"]["upload_assignment_status"]
          byte_size: number
          clinic_id: string
          content_type: string
          created_at?: string
          id?: string
          object_key: string
          patient_id: string
          pregnancy_id?: string | null
          quarantine_reason?: string | null
          sha256: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
          visit_id?: string | null
        }
        Update: {
          assignment_status?: Database["public"]["Enums"]["upload_assignment_status"]
          byte_size?: number
          clinic_id?: string
          content_type?: string
          created_at?: string
          id?: string
          object_key?: string
          patient_id?: string
          pregnancy_id?: string | null
          quarantine_reason?: string | null
          sha256?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_uploads_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "report_uploads_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "report_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_uploads_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      scan_reports: {
        Row: {
          afi_cm: number | null
          cervical_length_mm: number | null
          clinic_id: string
          created_at: string
          deepest_pocket_cm: number | null
          efw_centile: number | null
          efw_grams: number | null
          fetal_heart_rate_bpm: number | null
          findings: string | null
          ga_days_at_scan: number | null
          id: string
          impression: string | null
          middle_cerebral_artery_pi: number | null
          patient_id: string
          performed_at_facility: string | null
          placenta_grade: number | null
          placenta_position: string | null
          pregnancy_id: string
          presentation: Database["public"]["Enums"]["fetal_presentation"]
          scan_date: string
          scan_date_precision: Database["public"]["Enums"]["date_precision"]
          scan_type: Database["public"]["Enums"]["scan_type"]
          source: Database["public"]["Enums"]["data_source"]
          source_upload_id: string | null
          superseded_at: string | null
          supersedes_id: string | null
          umbilical_artery_pi: number | null
          umbilical_artery_ri: number | null
          updated_at: string
          verified_at: string
          verified_by: string
          version: number
        }
        Insert: {
          afi_cm?: number | null
          cervical_length_mm?: number | null
          clinic_id: string
          created_at?: string
          deepest_pocket_cm?: number | null
          efw_centile?: number | null
          efw_grams?: number | null
          fetal_heart_rate_bpm?: number | null
          findings?: string | null
          ga_days_at_scan?: number | null
          id?: string
          impression?: string | null
          middle_cerebral_artery_pi?: number | null
          patient_id: string
          performed_at_facility?: string | null
          placenta_grade?: number | null
          placenta_position?: string | null
          pregnancy_id: string
          presentation?: Database["public"]["Enums"]["fetal_presentation"]
          scan_date: string
          scan_date_precision?: Database["public"]["Enums"]["date_precision"]
          scan_type?: Database["public"]["Enums"]["scan_type"]
          source?: Database["public"]["Enums"]["data_source"]
          source_upload_id?: string | null
          superseded_at?: string | null
          supersedes_id?: string | null
          umbilical_artery_pi?: number | null
          umbilical_artery_ri?: number | null
          updated_at?: string
          verified_at?: string
          verified_by: string
          version?: number
        }
        Update: {
          afi_cm?: number | null
          cervical_length_mm?: number | null
          clinic_id?: string
          created_at?: string
          deepest_pocket_cm?: number | null
          efw_centile?: number | null
          efw_grams?: number | null
          fetal_heart_rate_bpm?: number | null
          findings?: string | null
          ga_days_at_scan?: number | null
          id?: string
          impression?: string | null
          middle_cerebral_artery_pi?: number | null
          patient_id?: string
          performed_at_facility?: string | null
          placenta_grade?: number | null
          placenta_position?: string | null
          pregnancy_id?: string
          presentation?: Database["public"]["Enums"]["fetal_presentation"]
          scan_date?: string
          scan_date_precision?: Database["public"]["Enums"]["date_precision"]
          scan_type?: Database["public"]["Enums"]["scan_type"]
          source?: Database["public"]["Enums"]["data_source"]
          source_upload_id?: string | null
          superseded_at?: string | null
          supersedes_id?: string | null
          umbilical_artery_pi?: number | null
          umbilical_artery_ri?: number | null
          updated_at?: string
          verified_at?: string
          verified_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scan_reports_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "scan_reports_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "scan_reports_supersedes_fk"
            columns: ["clinic_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "scan_reports"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "scan_reports_upload_fk"
            columns: ["clinic_id", "source_upload_id"]
            isOneToOne: false
            referencedRelation: "report_uploads"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "scan_reports_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_users: {
        Row: {
          auth_user_id: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          phone: string | null
          registration_no: string | null
          updated_at: string
          version: number
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          registration_no?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          registration_no?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      visit_advice: {
        Row: {
          additional_advice: string | null
          clinic_id: string
          created_at: string
          danger_signs_counselled: boolean
          dfkc_counselled: boolean
          id: string
          lab_orders: string[]
          left_lateral_rest: boolean
          next_followup_date: string | null
          nutrition_counselled: boolean
          recorded_by: string
          scan_orders: string[]
          updated_at: string
          version: number
          visit_id: string
        }
        Insert: {
          additional_advice?: string | null
          clinic_id: string
          created_at?: string
          danger_signs_counselled?: boolean
          dfkc_counselled?: boolean
          id?: string
          lab_orders?: string[]
          left_lateral_rest?: boolean
          next_followup_date?: string | null
          nutrition_counselled?: boolean
          recorded_by: string
          scan_orders?: string[]
          updated_at?: string
          version?: number
          visit_id: string
        }
        Update: {
          additional_advice?: string | null
          clinic_id?: string
          created_at?: string
          danger_signs_counselled?: boolean
          dfkc_counselled?: boolean
          id?: string
          lab_orders?: string[]
          left_lateral_rest?: boolean
          next_followup_date?: string | null
          nutrition_counselled?: boolean
          recorded_by?: string
          scan_orders?: string[]
          updated_at?: string
          version?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_advice_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_advice_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      visit_amendments: {
        Row: {
          amended_at: string
          amended_by: string
          changes: Json
          clinic_id: string
          created_at: string
          id: string
          reason: string
          visit_id: string
        }
        Insert: {
          amended_at?: string
          amended_by: string
          changes: Json
          clinic_id: string
          created_at?: string
          id?: string
          reason: string
          visit_id: string
        }
        Update: {
          amended_at?: string
          amended_by?: string
          changes?: Json
          clinic_id?: string
          created_at?: string
          id?: string
          reason?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_amendments_amended_by_fkey"
            columns: ["amended_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_amendments_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      visit_drafts: {
        Row: {
          author_id: string
          base_visit_version: number
          clinic_id: string
          created_at: string
          id: string
          payload: Json
          updated_at: string
          version: number
          visit_id: string
        }
        Insert: {
          author_id: string
          base_visit_version: number
          clinic_id: string
          created_at?: string
          id?: string
          payload?: Json
          updated_at?: string
          version?: number
          visit_id: string
        }
        Update: {
          author_id?: string
          base_visit_version?: number
          clinic_id?: string
          created_at?: string
          id?: string
          payload?: Json
          updated_at?: string
          version?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_drafts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_drafts_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      visit_vitals: {
        Row: {
          bp_diastolic_mmhg: number | null
          bp_systolic_mmhg: number | null
          clinic_id: string
          created_at: string
          fetal_heart_rate_bpm: number | null
          fundal_height_cm: number | null
          id: string
          note: string | null
          pulse_bpm: number | null
          recorded_at: string
          recorded_by: string | null
          respiratory_rate_bpm: number | null
          sequence_no: number
          spo2_percent: number | null
          temperature_c: number | null
          updated_at: string
          urine_albumin: Database["public"]["Enums"]["dipstick_grade"] | null
          urine_sugar: Database["public"]["Enums"]["dipstick_grade"] | null
          version: number
          visit_id: string
          weight_kg: number | null
        }
        Insert: {
          bp_diastolic_mmhg?: number | null
          bp_systolic_mmhg?: number | null
          clinic_id: string
          created_at?: string
          fetal_heart_rate_bpm?: number | null
          fundal_height_cm?: number | null
          id?: string
          note?: string | null
          pulse_bpm?: number | null
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate_bpm?: number | null
          sequence_no?: number
          spo2_percent?: number | null
          temperature_c?: number | null
          updated_at?: string
          urine_albumin?: Database["public"]["Enums"]["dipstick_grade"] | null
          urine_sugar?: Database["public"]["Enums"]["dipstick_grade"] | null
          version?: number
          visit_id: string
          weight_kg?: number | null
        }
        Update: {
          bp_diastolic_mmhg?: number | null
          bp_systolic_mmhg?: number | null
          clinic_id?: string
          created_at?: string
          fetal_heart_rate_bpm?: number | null
          fundal_height_cm?: number | null
          id?: string
          note?: string | null
          pulse_bpm?: number | null
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate_bpm?: number | null
          sequence_no?: number
          spo2_percent?: number | null
          temperature_c?: number | null
          updated_at?: string
          urine_albumin?: Database["public"]["Enums"]["dipstick_grade"] | null
          urine_sugar?: Database["public"]["Enums"]["dipstick_grade"] | null
          version?: number
          visit_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_vitals_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_vitals_visit_fk"
            columns: ["clinic_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      visits: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          clinic_id: string
          clinician_id: string | null
          consultation_summary: string | null
          created_at: string
          dating_method_at_visit:
            | Database["public"]["Enums"]["dating_method"]
            | null
          diagnosis: string | null
          examination: string | null
          chief_complaints: Json | null
          exam_per_abdomen: string | null
          exam_per_speculum: string | null
          exam_per_vaginum: string | null
          ga_days_at_visit: number | null
          id: string
          impression: string | null
          occurred_at: string
          opened_by: string | null
          patient_id: string
          pregnancy_id: string
          saved_at: string | null
          saved_by: string | null
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          version: number
          visit_type: Database["public"]["Enums"]["visit_type"]
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_id: string
          clinician_id?: string | null
          consultation_summary?: string | null
          created_at?: string
          dating_method_at_visit?:
            | Database["public"]["Enums"]["dating_method"]
            | null
          diagnosis?: string | null
          examination?: string | null
          chief_complaints?: Json | null
          exam_per_abdomen?: string | null
          exam_per_speculum?: string | null
          exam_per_vaginum?: string | null
          ga_days_at_visit?: number | null
          id?: string
          impression?: string | null
          occurred_at?: string
          opened_by?: string | null
          patient_id: string
          pregnancy_id: string
          saved_at?: string | null
          saved_by?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
          version?: number
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_id?: string
          clinician_id?: string | null
          consultation_summary?: string | null
          created_at?: string
          dating_method_at_visit?:
            | Database["public"]["Enums"]["dating_method"]
            | null
          diagnosis?: string | null
          examination?: string | null
          chief_complaints?: Json | null
          exam_per_abdomen?: string | null
          exam_per_speculum?: string | null
          exam_per_vaginum?: string | null
          ga_days_at_visit?: number | null
          id?: string
          impression?: string | null
          occurred_at?: string
          opened_by?: string | null
          patient_id?: string
          pregnancy_id?: string
          saved_at?: string | null
          saved_by?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
          version?: number
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "visits_pregnancy_fk"
            columns: ["clinic_id", "pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "visits_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_queries: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          association_candidates: Json
          association_status: Database["public"]["Enums"]["contact_association_status"]
          audio_duration_seconds: number | null
          audio_mime_type: string | null
          audio_object_key: string | null
          channel: Database["public"]["Enums"]["voice_channel"]
          clinic_id: string
          contact_id: string | null
          created_at: string
          detected_language: string | null
          from_phone_e164: string | null
          id: string
          lexicon_version: string | null
          matched_phrases: string[]
          patient_id: string | null
          processing_error: string | null
          processing_state: Database["public"]["Enums"]["voice_processing_state"]
          provider_message_id: string | null
          received_at: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_in_visit_id: string | null
          routing_bucket:
            | Database["public"]["Enums"]["query_routing_bucket"]
            | null
          transcript_model: string | null
          transcript_original: string | null
          transcript_provider: string | null
          transcription_confidence: number | null
          translation_en: string | null
          updated_at: string
          version: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          association_candidates?: Json
          association_status?: Database["public"]["Enums"]["contact_association_status"]
          audio_duration_seconds?: number | null
          audio_mime_type?: string | null
          audio_object_key?: string | null
          channel?: Database["public"]["Enums"]["voice_channel"]
          clinic_id: string
          contact_id?: string | null
          created_at?: string
          detected_language?: string | null
          from_phone_e164?: string | null
          id?: string
          lexicon_version?: string | null
          matched_phrases?: string[]
          patient_id?: string | null
          processing_error?: string | null
          processing_state?: Database["public"]["Enums"]["voice_processing_state"]
          provider_message_id?: string | null
          received_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_in_visit_id?: string | null
          routing_bucket?:
            | Database["public"]["Enums"]["query_routing_bucket"]
            | null
          transcript_model?: string | null
          transcript_original?: string | null
          transcript_provider?: string | null
          transcription_confidence?: number | null
          translation_en?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          association_candidates?: Json
          association_status?: Database["public"]["Enums"]["contact_association_status"]
          audio_duration_seconds?: number | null
          audio_mime_type?: string | null
          audio_object_key?: string | null
          channel?: Database["public"]["Enums"]["voice_channel"]
          clinic_id?: string
          contact_id?: string | null
          created_at?: string
          detected_language?: string | null
          from_phone_e164?: string | null
          id?: string
          lexicon_version?: string | null
          matched_phrases?: string[]
          patient_id?: string | null
          processing_error?: string | null
          processing_state?: Database["public"]["Enums"]["voice_processing_state"]
          provider_message_id?: string | null
          received_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_in_visit_id?: string | null
          routing_bucket?:
            | Database["public"]["Enums"]["query_routing_bucket"]
            | null
          transcript_model?: string | null
          transcript_original?: string | null
          transcript_provider?: string | null
          transcription_confidence?: number | null
          translation_en?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "voice_queries_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_queries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_queries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "patient_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_queries_patient_fk"
            columns: ["clinic_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "voice_queries_visit_fk"
            columns: ["clinic_id", "resolved_in_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_voice_query: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_request_id: string
          p_voice_query_id: string
        }
        Returns: undefined
      }
      apply_voice_transcription: {
        Args: {
          p_clinic_id: string
          p_confidence: number
          p_detected_language: string
          p_lexicon_version: string
          p_matched_phrases: string[]
          p_model: string
          p_provider: string
          p_request_id: string
          p_routing_bucket: Database["public"]["Enums"]["query_routing_bucket"]
          p_transcript: string
          p_translation_en: string
          p_voice_query_id: string
          p_worker: string
        }
        Returns: undefined
      }
      assign_report_upload: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_pregnancy_id: string
          p_quarantine_reason: string
          p_request_id: string
          p_upload_id: string
        }
        Returns: undefined
      }
      associate_voice_query: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_contact_id: string
          p_patient_id: string
          p_request_id: string
          p_voice_query_id: string
        }
        Returns: undefined
      }
      cancel_appointment: {
        Args: {
          p_actor_staff_user_id: string
          p_appointment_id: string
          p_clinic_id: string
          p_request_id: string
        }
        Returns: undefined
      }
      delete_master_pack: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_expected_version: number
          p_pack_id: string
          p_request_id: string
        }
        Returns: undefined
      }
      cancel_visit: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_expected_version: number
          p_reason: string
          p_request_id: string
          p_visit_id: string
        }
        Returns: number
      }
      claim_voice_transcription: {
        Args: {
          p_clinic_id: string
          p_request_id: string
          p_voice_query_id: string
          p_worker: string
        }
        Returns: boolean
      }
      close_pregnancy: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_expected_version: number
          p_note: string
          p_outcome: Database["public"]["Enums"]["pregnancy_outcome"]
          p_outcome_date: string
          p_pregnancy_id: string
          p_request_id: string
          p_status: Database["public"]["Enums"]["pregnancy_status"]
        }
        Returns: number
      }
      complete_extraction_run: {
        Args: {
          p_candidates: Json
          p_clinic_id: string
          p_raw_output: Json
          p_report_type: Database["public"]["Enums"]["report_type"]
          p_request_id: string
          p_run_id: string
          p_worker: string
        }
        Returns: number
      }
      correct_report_candidate: {
        Args: {
          p_actor_staff_user_id: string
          p_candidate_id: string
          p_clinic_id: string
          p_discard: boolean
          p_observed_date: string
          p_request_id: string
          p_unit: string
          p_value_numeric: number
          p_value_text: string
        }
        Returns: number
      }
      create_pregnancy: {
        Args: {
          p_abortions: number
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_dating_certainty: Database["public"]["Enums"]["dating_certainty"]
          p_dating_method: Database["public"]["Enums"]["dating_method"]
          p_dating_reference_date: string
          p_dating_reference_ga_days: number
          p_gravida: number
          p_height_cm: number
          p_living: number
          p_obstetric_history: Json
          p_parity: number
          p_patient_id: string
          p_pre_pregnancy_weight_kg: number
          p_reported_lmp: string
          p_reported_lmp_certainty: Database["public"]["Enums"]["dating_certainty"]
          p_request_id: string
        }
        Returns: string
      }
      create_referral_draft: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_indication: string
          p_origin_visit_id: string
          p_pregnancy_id: string
          p_receiving_facility: string
          p_request_id: string
          p_supersedes_id: string
        }
        Returns: string
      }
      create_referral_token: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_referral_id: string
          p_request_id: string
          p_token_hash: string
          p_ttl_minutes: number
        }
        Returns: Json
      }
      fail_extraction_run: {
        Args: {
          p_clinic_id: string
          p_error: string
          p_error_code: string
          p_request_id: string
          p_run_id: string
          p_worker: string
        }
        Returns: undefined
      }
      fail_voice_transcription: {
        Args: {
          p_clinic_id: string
          p_error: string
          p_request_id: string
          p_voice_query_id: string
          p_worker: string
        }
        Returns: undefined
      }
      find_patient_by_qr: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_request_id: string
          p_token_hash: string
        }
        Returns: string
      }
      flag_diagnoses: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_labels: string[]
          p_pregnancy_id: string
          p_request_id: string
          p_section: string
        }
        Returns: number
      }
      issue_patient_qr: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_patient_id: string
          p_request_id: string
          p_token_hash: string
        }
        Returns: string
      }
      issue_referral: {
        Args: {
          p_actor_staff_user_id: string
          p_as_of_date: string
          p_clinic_id: string
          p_expected_version: number
          p_referral_id: string
          p_request_id: string
          p_snapshot_schema_version: number
        }
        Returns: Json
      }
      log_referral_access: {
        Args: {
          p_client_ip_hash: string
          p_token_hash: string
          p_user_agent: string
        }
        Returns: Json
      }
      open_or_reuse_visit: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_pregnancy_id: string
          p_request_id: string
          p_visit_type: Database["public"]["Enums"]["visit_type"]
        }
        Returns: Json
      }
      record_immunization: {
        Args: {
          p_actor_staff_user_id: string
          p_administered_on: string
          p_batch_number: string
          p_clinic_id: string
          p_facility: string
          p_pregnancy_id: string
          p_request_id: string
          p_source: Database["public"]["Enums"]["data_source"]
          p_status: Database["public"]["Enums"]["immunization_status"]
          p_vaccine: string
        }
        Returns: string
      }
      record_report_upload: {
        Args: {
          p_actor_staff_user_id: string
          p_byte_size: number
          p_clinic_id: string
          p_content_type: string
          p_object_key: string
          p_patient_id: string
          p_pregnancy_id: string
          p_request_id: string
          p_sha256: string
          p_visit_id: string
        }
        Returns: string
      }
      record_visit_vitals: {
        Args: {
          p_actor_staff_user_id: string
          p_bp_diastolic_mmhg: number
          p_bp_systolic_mmhg: number
          p_clinic_id: string
          p_fetal_heart_rate_bpm: number
          p_fundal_height_cm: number
          p_note: string
          p_pulse_bpm: number
          p_request_id: string
          p_respiratory_rate_bpm: number
          p_spo2_percent: number
          p_temperature_c: number
          p_urine_albumin: Database["public"]["Enums"]["dipstick_grade"]
          p_urine_sugar: Database["public"]["Enums"]["dipstick_grade"]
          p_visit_id: string
          p_weight_kg: number
        }
        Returns: string
      }
      record_voice_note: {
        Args: {
          p_actor_staff_user_id: string
          p_audio_duration_seconds: number
          p_audio_mime_type: string
          p_audio_object_key: string
          p_channel: Database["public"]["Enums"]["voice_channel"]
          p_clinic_id: string
          p_contact_id: string
          p_from_phone_e164: string
          p_patient_id: string
          p_provider_message_id: string
          p_request_id: string
        }
        Returns: string
      }
      register_patient: {
        Args: {
          p_abha_id: string
          p_abha_verification: Database["public"]["Enums"]["abha_verification"]
          p_actor_staff_user_id: string
          p_age_recorded_on: string
          p_allergies: Json
          p_allergy_status: Database["public"]["Enums"]["known_status"]
          p_blood_group: Database["public"]["Enums"]["blood_group"]
          p_blood_group_recorded_on: string
          p_blood_group_source: Database["public"]["Enums"]["data_source"]
          p_clinic_id: string
          p_contacts: Json
          p_date_of_birth: string
          p_estimated_age_years: number
          p_full_name: string
          p_request_id: string
          p_uhid: string
        }
        Returns: string
      }
      remove_family_history_entry: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_request_id: string
          p_entry_id: string
          p_expected_version: number
          p_patient_id: string
        }
        Returns: undefined
      }
      resolve_flagged_diagnosis: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_flag_id: string
          p_request_id: string
        }
        Returns: undefined
      }
      revoke_patient_qr: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_patient_id: string
          p_reason: string
          p_request_id: string
        }
        Returns: boolean
      }
      revoke_referral_token: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_reason: string
          p_request_id: string
          p_token_id: string
        }
        Returns: boolean
      }
      save_family_history_entry: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_request_id: string
          p_entry: Json
          p_entry_id: string
          p_expected_version: number
          p_patient_id: string
        }
        Returns: string
      }
      save_master_pack: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_expected_version: number
          p_pack: Json
          p_pack_id: string
          p_request_id: string
        }
        Returns: string
      }
      seed_master_packs: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_packs: Json
          p_request_id: string
        }
        Returns: number
      }
      save_menstrual_history: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_entry: Json
          p_expected_version: number
          p_history_id: string
          p_patient_id: string
          p_recorded_on: string
          p_request_id: string
        }
        Returns: string
      }
      save_obstetric_history_entry: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_entry: Json
          p_expected_version: number
          p_history_id: string
          p_patient_id: string
          p_request_id: string
        }
        Returns: string
      }
      save_past_history: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_request_id: string
          p_expected_version: number
          p_notes: string
          p_patient_id: string
        }
        Returns: number
      }
      save_visit_consultation: {
        Args: {
          p_actor_staff_user_id: string
          p_advice: Json
          p_as_of_date: string
          p_clinic_id: string
          p_diagnosis?: string
          p_examination?: string
          p_expected_version: number
          p_idempotency_key: string
          p_impression: string
          p_payload_hash: string
          p_pin_observation_ids: string[]
          p_prescriptions: Json
          p_reference?: Json
          p_request_id: string
          p_resolve_query_ids: string[]
          p_summary?: string
          p_unpin_observation_ids: string[]
          p_verify_candidates: Json
          p_visit_id: string
        }
        Returns: Json
      }
      save_visit_consultation_ext: {
        Args: {
          p_actor_staff_user_id: string
          p_advice: Json
          p_as_of_date: string
          p_clinic_id: string
          p_diagnosis: string
          p_examination: string
          p_expected_version: number
          p_extras: Json
          p_idempotency_key: string
          p_impression: string
          p_payload_hash: string
          p_pin_observation_ids: string[]
          p_prescriptions: Json
          p_reference: Json
          p_request_id: string
          p_resolve_query_ids: string[]
          p_summary: string
          p_unpin_observation_ids: string[]
          p_verify_candidates: Json
          p_visit_id: string
        }
        Returns: Json
      }
      schedule_appointment: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_patient_id: string
          p_pregnancy_id: string
          p_purpose: string
          p_request_id: string
          p_scheduled_on: string
        }
        Returns: string
      }
      start_extraction_run: {
        Args: {
          p_clinic_id: string
          p_model: string
          p_prompt_version: string
          p_provider: string
          p_request_id: string
          p_upload_id: string
          p_worker: string
        }
        Returns: string
      }
      update_pregnancy_dating: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_dating_certainty: Database["public"]["Enums"]["dating_certainty"]
          p_dating_method: Database["public"]["Enums"]["dating_method"]
          p_dating_reference_date: string
          p_dating_reference_ga_days: number
          p_expected_version: number
          p_pregnancy_id: string
          p_reason: string
          p_request_id: string
        }
        Returns: number
      }
      update_pregnancy_profile: {
        Args: {
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_expected_version: number
          p_pregnancy_id: string
          p_profile: Json
          p_request_id: string
        }
        Returns: number
      }
      update_referral_draft: {
        Args: {
          p_accompanying_staff: string
          p_actor_staff_user_id: string
          p_clinic_id: string
          p_clinical_summary: string
          p_departure_at: string
          p_expected_version: number
          p_indication: string
          p_lines_and_catheters: string
          p_pv_dilatation_cm: number
          p_pv_effacement_percent: number
          p_pv_examined_at: string
          p_pv_examined_by: string
          p_pv_liquor: string
          p_pv_membranes: Database["public"]["Enums"]["membrane_status"]
          p_pv_station: string
          p_receiving_contact: string
          p_receiving_facility: string
          p_referral_id: string
          p_referring_contact_phone: string
          p_referring_doctor_name: string
          p_referring_facility: string
          p_request_id: string
          p_transfer_bp_diastolic_mmhg: number
          p_transfer_bp_systolic_mmhg: number
          p_transfer_fetal_heart_rate_bpm: number
          p_transfer_pulse_bpm: number
          p_transfer_respiratory_rate_bpm: number
          p_transfer_spo2_percent: number
          p_transfer_temperature_c: number
          p_transfer_urine_albumin: Database["public"]["Enums"]["dipstick_grade"]
          p_transfer_vitals_recorded_at: string
          p_transport_mode: string
        }
        Returns: number
      }
    }
    Enums: {
      abha_verification: "NOT_PROVIDED" | "SELF_DECLARED" | "VERIFIED"
      administration_certainty:
        | "WITNESSED"
        | "DOCUMENTED"
        | "PATIENT_REPORTED"
        | "UNCERTAIN"
      allergy_severity: "UNKNOWN" | "MILD" | "MODERATE" | "SEVERE"
      blood_group:
        | "A_POS"
        | "A_NEG"
        | "B_POS"
        | "B_NEG"
        | "AB_POS"
        | "AB_NEG"
        | "O_POS"
        | "O_NEG"
      clinic_role: "DOCTOR" | "NURSE" | "ASSISTANT" | "ADMIN"
      clinic_type: "MUNICIPAL" | "PRIVATE" | "NURSING_HOME" | "OTHER"
      consent_method:
        | "VERBAL_WITNESSED"
        | "WRITTEN_SIGNED"
        | "DIGITAL_AFFIRMATION"
      consent_purpose:
        | "RECORD_KEEPING"
        | "MESSAGING"
        | "VOICE_PROCESSING"
        | "REFERRAL_SHARING"
      contact_association_status: "VERIFIED" | "AMBIGUOUS" | "UNMATCHED"
      contact_relationship:
        | "SELF"
        | "HUSBAND"
        | "MOTHER"
        | "MOTHER_IN_LAW"
        | "FATHER"
        | "OTHER_RELATIVE"
        | "NEIGHBOUR"
        | "OTHER"
      data_source:
        | "CLINICIAN_ENTERED"
        | "STAFF_ENTERED"
        | "EXTRACTED_VERIFIED"
        | "PATIENT_REPORTED"
        | "EXTERNAL_RECORD"
      date_precision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN"
      dating_certainty: "CERTAIN" | "APPROXIMATE" | "UNKNOWN"
      dating_method: "LMP" | "ULTRASOUND" | "CLINICAL_ESTIMATE" | "UNKNOWN"
      delivery_mode:
        | "VAGINAL"
        | "ASSISTED_VAGINAL"
        | "LSCS_EMERGENCY"
        | "LSCS_ELECTIVE"
        | "UNKNOWN"
      dipstick_grade:
        | "NIL"
        | "TRACE"
        | "ONE_PLUS"
        | "TWO_PLUS"
        | "THREE_PLUS"
        | "FOUR_PLUS"
      dose_frequency:
        | "OD"
        | "BD"
        | "TDS"
        | "QID"
        | "HS"
        | "SOS"
        | "PRN"
        | "STAT"
        | "WEEKLY"
        | "OTHER"
      extraction_status:
        | "QUEUED"
        | "PROCESSING"
        | "NEEDS_CORRECTION"
        | "READY_FOR_REVIEW"
        | "FAILED"
      fetal_presentation:
        | "CEPHALIC"
        | "BREECH"
        | "TRANSVERSE"
        | "OBLIQUE"
        | "UNSTABLE"
        | "NOT_ASSESSED"
      food_relation:
        | "BEFORE_FOOD"
        | "AFTER_FOOD"
        | "WITH_FOOD"
        | "NOT_SPECIFIED"
      glucose_reading_context:
        | "FASTING"
        | "POST_BREAKFAST"
        | "POST_LUNCH"
        | "POST_DINNER"
        | "RANDOM"
      home_reading_metric: "BLOOD_GLUCOSE" | "BLOOD_PRESSURE"
      immunization_status: "PLANNED" | "GIVEN" | "NOT_GIVEN" | "UNKNOWN"
      known_status: "UNKNOWN" | "NONE_KNOWN" | "KNOWN"
      medication_route:
        | "ORAL"
        | "IV"
        | "IM"
        | "SC"
        | "PR"
        | "PV"
        | "TOPICAL"
        | "INHALED"
        | "OTHER"
      membrane_status: "INTACT" | "RUPTURED" | "NOT_ASSESSED"
      observation_category:
        | "HEMATOLOGY"
        | "BIOCHEMISTRY"
        | "SEROLOGY"
        | "URINE"
        | "ENDOCRINE"
        | "OTHER"
      outbox_state:
        | "PENDING"
        | "IN_FLIGHT"
        | "DELIVERED"
        | "FAILED"
        | "ABANDONED"
      pregnancy_outcome:
        | "LIVE_BIRTH"
        | "STILLBIRTH"
        | "ABORTION_SPONTANEOUS"
        | "ABORTION_INDUCED"
        | "ECTOPIC"
        | "MOLAR"
        | "UNKNOWN"
      pregnancy_status: "ACTIVE" | "COMPLETED" | "CLOSED_UNKNOWN"
      prescription_status: "ACTIVE" | "COMPLETED" | "STOPPED" | "SUPERSEDED"
      query_routing_bucket: "INFORMATIONAL" | "NEEDS_REVIEW" | "PRIORITY_REVIEW"
      referral_status: "DRAFT" | "ISSUED" | "SUPERSEDED" | "CANCELLED"
      report_type:
        | "CBC"
        | "OGTT"
        | "SEROLOGY"
        | "URINE"
        | "BLOOD_GROUP"
        | "THYROID"
        | "LFT"
        | "RFT"
        | "HPLC"
        | "ULTRASOUND"
        | "OTHER"
        | "UNRECOGNISED"
      review_decision: "ACCEPTED" | "REJECTED"
      scan_type:
        | "DATING"
        | "NT_NB"
        | "TIFFA"
        | "GROWTH"
        | "GROWTH_DOPPLER"
        | "BPP"
        | "OTHER"
      triage_level: "CRITICAL" | "IMPORTANT" | "NORMAL"
      upload_assignment_status: "ASSIGNED" | "UNASSIGNED" | "QUARANTINED"
      visit_status: "OPEN" | "SAVED" | "CANCELLED"
      visit_type: "ANC_OPD" | "FOLLOW_UP" | "EMERGENCY" | "OTHER"
      voice_channel: "WHATSAPP" | "IN_APP_UPLOAD" | "OTHER"
      voice_processing_state:
        | "RECEIVED"
        | "QUEUED"
        | "TRANSCRIBING"
        | "TRANSLATING"
        | "READY"
        | "FAILED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      abha_verification: ["NOT_PROVIDED", "SELF_DECLARED", "VERIFIED"],
      administration_certainty: [
        "WITNESSED",
        "DOCUMENTED",
        "PATIENT_REPORTED",
        "UNCERTAIN",
      ],
      allergy_severity: ["UNKNOWN", "MILD", "MODERATE", "SEVERE"],
      blood_group: [
        "A_POS",
        "A_NEG",
        "B_POS",
        "B_NEG",
        "AB_POS",
        "AB_NEG",
        "O_POS",
        "O_NEG",
      ],
      clinic_role: ["DOCTOR", "NURSE", "ASSISTANT", "ADMIN"],
      clinic_type: ["MUNICIPAL", "PRIVATE", "NURSING_HOME", "OTHER"],
      consent_method: [
        "VERBAL_WITNESSED",
        "WRITTEN_SIGNED",
        "DIGITAL_AFFIRMATION",
      ],
      consent_purpose: [
        "RECORD_KEEPING",
        "MESSAGING",
        "VOICE_PROCESSING",
        "REFERRAL_SHARING",
      ],
      contact_association_status: ["VERIFIED", "AMBIGUOUS", "UNMATCHED"],
      contact_relationship: [
        "SELF",
        "HUSBAND",
        "MOTHER",
        "MOTHER_IN_LAW",
        "FATHER",
        "OTHER_RELATIVE",
        "NEIGHBOUR",
        "OTHER",
      ],
      data_source: [
        "CLINICIAN_ENTERED",
        "STAFF_ENTERED",
        "EXTRACTED_VERIFIED",
        "PATIENT_REPORTED",
        "EXTERNAL_RECORD",
      ],
      date_precision: ["DAY", "MONTH", "YEAR", "UNKNOWN"],
      dating_certainty: ["CERTAIN", "APPROXIMATE", "UNKNOWN"],
      dating_method: ["LMP", "ULTRASOUND", "CLINICAL_ESTIMATE", "UNKNOWN"],
      delivery_mode: [
        "VAGINAL",
        "ASSISTED_VAGINAL",
        "LSCS_EMERGENCY",
        "LSCS_ELECTIVE",
        "UNKNOWN",
      ],
      dipstick_grade: [
        "NIL",
        "TRACE",
        "ONE_PLUS",
        "TWO_PLUS",
        "THREE_PLUS",
        "FOUR_PLUS",
      ],
      dose_frequency: [
        "OD",
        "BD",
        "TDS",
        "QID",
        "HS",
        "SOS",
        "PRN",
        "STAT",
        "WEEKLY",
        "OTHER",
      ],
      extraction_status: [
        "QUEUED",
        "PROCESSING",
        "NEEDS_CORRECTION",
        "READY_FOR_REVIEW",
        "FAILED",
      ],
      fetal_presentation: [
        "CEPHALIC",
        "BREECH",
        "TRANSVERSE",
        "OBLIQUE",
        "UNSTABLE",
        "NOT_ASSESSED",
      ],
      food_relation: [
        "BEFORE_FOOD",
        "AFTER_FOOD",
        "WITH_FOOD",
        "NOT_SPECIFIED",
      ],
      glucose_reading_context: [
        "FASTING",
        "POST_BREAKFAST",
        "POST_LUNCH",
        "POST_DINNER",
        "RANDOM",
      ],
      home_reading_metric: ["BLOOD_GLUCOSE", "BLOOD_PRESSURE"],
      immunization_status: ["PLANNED", "GIVEN", "NOT_GIVEN", "UNKNOWN"],
      known_status: ["UNKNOWN", "NONE_KNOWN", "KNOWN"],
      medication_route: [
        "ORAL",
        "IV",
        "IM",
        "SC",
        "PR",
        "PV",
        "TOPICAL",
        "INHALED",
        "OTHER",
      ],
      membrane_status: ["INTACT", "RUPTURED", "NOT_ASSESSED"],
      observation_category: [
        "HEMATOLOGY",
        "BIOCHEMISTRY",
        "SEROLOGY",
        "URINE",
        "ENDOCRINE",
        "OTHER",
      ],
      outbox_state: [
        "PENDING",
        "IN_FLIGHT",
        "DELIVERED",
        "FAILED",
        "ABANDONED",
      ],
      pregnancy_outcome: [
        "LIVE_BIRTH",
        "STILLBIRTH",
        "ABORTION_SPONTANEOUS",
        "ABORTION_INDUCED",
        "ECTOPIC",
        "MOLAR",
        "UNKNOWN",
      ],
      pregnancy_status: ["ACTIVE", "COMPLETED", "CLOSED_UNKNOWN"],
      prescription_status: ["ACTIVE", "COMPLETED", "STOPPED", "SUPERSEDED"],
      query_routing_bucket: [
        "INFORMATIONAL",
        "NEEDS_REVIEW",
        "PRIORITY_REVIEW",
      ],
      referral_status: ["DRAFT", "ISSUED", "SUPERSEDED", "CANCELLED"],
      report_type: [
        "CBC",
        "OGTT",
        "SEROLOGY",
        "URINE",
        "BLOOD_GROUP",
        "THYROID",
        "LFT",
        "RFT",
        "HPLC",
        "ULTRASOUND",
        "OTHER",
        "UNRECOGNISED",
      ],
      review_decision: ["ACCEPTED", "REJECTED"],
      scan_type: [
        "DATING",
        "NT_NB",
        "TIFFA",
        "GROWTH",
        "GROWTH_DOPPLER",
        "BPP",
        "OTHER",
      ],
      triage_level: ["CRITICAL", "IMPORTANT", "NORMAL"],
      upload_assignment_status: ["ASSIGNED", "UNASSIGNED", "QUARANTINED"],
      visit_status: ["OPEN", "SAVED", "CANCELLED"],
      visit_type: ["ANC_OPD", "FOLLOW_UP", "EMERGENCY", "OTHER"],
      voice_channel: ["WHATSAPP", "IN_APP_UPLOAD", "OTHER"],
      voice_processing_state: [
        "RECEIVED",
        "QUEUED",
        "TRANSCRIBING",
        "TRANSLATING",
        "READY",
        "FAILED",
      ],
    },
  },
} as const
