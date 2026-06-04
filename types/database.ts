export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          role: Database["public"]["Enums"]["profile_role"];
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          role?: Database["public"]["Enums"]["profile_role"];
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      clinics: {
        Row: {
          id: string;
          name: string;
          legal_name: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          timezone: string;
          plan: Database["public"]["Enums"]["clinic_plan"];
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          name: string;
          legal_name?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          timezone?: string;
          plan?: Database["public"]["Enums"]["clinic_plan"];
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["clinics"]["Insert"]>;
      };
      clinic_members: {
        Row: {
          id: string;
          clinic_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["clinic_member_role"];
          status: Database["public"]["Enums"]["clinic_member_status"];
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["clinic_member_role"];
          status?: Database["public"]["Enums"]["clinic_member_status"];
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["clinic_members"]["Insert"]>;
      };
      patients: {
        Row: {
          id: string;
          clinic_id: string;
          primary_doctor_id: string | null;
          full_name: string;
          date_of_birth: string | null;
          sex: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          allergies: string | null;
          current_medications: string | null;
          relevant_history: string | null;
          status: Database["public"]["Enums"]["patient_status"];
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          primary_doctor_id?: string | null;
          full_name: string;
          date_of_birth?: string | null;
          sex?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          allergies?: string | null;
          current_medications?: string | null;
          relevant_history?: string | null;
          status?: Database["public"]["Enums"]["patient_status"];
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["patients"]["Insert"]>;
      };
      appointments: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          doctor_id: string | null;
          title: string;
          appointment_type: string | null;
          location: string | null;
          meeting_url: string | null;
          starts_at: Timestamp;
          ends_at: Timestamp;
          status: Database["public"]["Enums"]["appointment_status"];
          invite_status: Database["public"]["Enums"]["invite_status"];
          reminder_status: Database["public"]["Enums"]["reminder_status"];
          notes: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          doctor_id?: string | null;
          title: string;
          appointment_type?: string | null;
          location?: string | null;
          meeting_url?: string | null;
          starts_at: Timestamp;
          ends_at: Timestamp;
          status?: Database["public"]["Enums"]["appointment_status"];
          invite_status?: Database["public"]["Enums"]["invite_status"];
          reminder_status?: Database["public"]["Enums"]["reminder_status"];
          notes?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Insert"]>;
      };
      payments: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string | null;
          appointment_id: string | null;
          amount: number;
          currency: string;
          status: Database["public"]["Enums"]["payment_status"];
          payment_method: string | null;
          concept: string | null;
          paid_at: Timestamp | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id?: string | null;
          appointment_id?: string | null;
          amount: number;
          currency?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          payment_method?: string | null;
          concept?: string | null;
          paid_at?: Timestamp | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      };
      medical_note_templates: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          specialty: string | null;
          description: string | null;
          template_schema: Json;
          is_system_template: boolean;
          is_active: boolean;
          created_by: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          specialty?: string | null;
          description?: string | null;
          template_schema: Json;
          is_system_template?: boolean;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["medical_note_templates"]["Insert"]>;
      };
      medical_notes: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          doctor_id: string | null;
          appointment_id: string | null;
          template_id: string | null;
          status: Database["public"]["Enums"]["medical_note_status"];
          specialty: string | null;
          clinical_impression: string | null;
          diagnosis: string | null;
          icd10_code: string | null;
          note_data: Json;
          finalized_at: Timestamp | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          doctor_id?: string | null;
          appointment_id?: string | null;
          template_id?: string | null;
          status?: Database["public"]["Enums"]["medical_note_status"];
          specialty?: string | null;
          clinical_impression?: string | null;
          diagnosis?: string | null;
          icd10_code?: string | null;
          note_data: Json;
          finalized_at?: Timestamp | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["medical_notes"]["Insert"]>;
      };
      consents: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          created_by: string | null;
          consent_type: string;
          consent_version: string;
          consent_text: string;
          signing_token: string;
          status: Database["public"]["Enums"]["consent_status"];
          expires_at: Timestamp | null;
          signed_at: Timestamp | null;
          revoked_at: Timestamp | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          created_by?: string | null;
          consent_type: string;
          consent_version: string;
          consent_text: string;
          signing_token: string;
          status?: Database["public"]["Enums"]["consent_status"];
          expires_at?: Timestamp | null;
          signed_at?: Timestamp | null;
          revoked_at?: Timestamp | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["consents"]["Insert"]>;
      };
      consent_signatures: {
        Row: {
          id: string;
          consent_id: string;
          patient_id: string;
          signer_full_name: string;
          signature_data: string | null;
          accepted_privacy_notice: boolean;
          accepted_sensitive_data_processing: boolean;
          signed_at: Timestamp;
          ip_metadata: string | null;
          user_agent: string | null;
          document_hash: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          consent_id: string;
          patient_id: string;
          signer_full_name: string;
          signature_data?: string | null;
          accepted_privacy_notice?: boolean;
          accepted_sensitive_data_processing?: boolean;
          signed_at?: Timestamp;
          ip_metadata?: string | null;
          user_agent?: string | null;
          document_hash?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["consent_signatures"]["Insert"]>;
      };
      calendar_integrations: {
        Row: {
          id: string;
          clinic_id: string;
          user_id: string;
          provider: string;
          provider_calendar_id: string | null;
          calendar_name: string | null;
          sync_direction: string;
          access_token_encrypted: string | null;
          refresh_token_encrypted: string | null;
          token_expires_at: Timestamp | null;
          last_sync_at: Timestamp | null;
          status: Database["public"]["Enums"]["calendar_integration_status"];
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          user_id: string;
          provider: string;
          provider_calendar_id?: string | null;
          calendar_name?: string | null;
          sync_direction?: string;
          access_token_encrypted?: string | null;
          refresh_token_encrypted?: string | null;
          token_expires_at?: Timestamp | null;
          last_sync_at?: Timestamp | null;
          status?: Database["public"]["Enums"]["calendar_integration_status"];
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_integrations"]["Insert"]>;
      };
      appointment_invites: {
        Row: {
          id: string;
          clinic_id: string;
          appointment_id: string;
          patient_id: string;
          channel: string;
          provider: string | null;
          status: Database["public"]["Enums"]["invite_status"];
          external_event_id: string | null;
          ics_uid: string | null;
          sent_at: Timestamp | null;
          accepted_at: Timestamp | null;
          declined_at: Timestamp | null;
          failed_reason: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id: string;
          patient_id: string;
          channel: string;
          provider?: string | null;
          status?: Database["public"]["Enums"]["invite_status"];
          external_event_id?: string | null;
          ics_uid?: string | null;
          sent_at?: Timestamp | null;
          accepted_at?: Timestamp | null;
          declined_at?: Timestamp | null;
          failed_reason?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["appointment_invites"]["Insert"]>;
      };
      bot_settings: {
        Row: {
          id: string;
          clinic_id: string;
          enabled: boolean;
          channel: string;
          reminder_hours_before: number;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          max_reminders_per_patient: number;
          message_template: string | null;
          escalation_behavior: string;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          enabled?: boolean;
          channel?: string;
          reminder_hours_before?: number;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          max_reminders_per_patient?: number;
          message_template?: string | null;
          escalation_behavior?: string;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["bot_settings"]["Insert"]>;
      };
      bot_logs: {
        Row: {
          id: string;
          clinic_id: string;
          appointment_id: string;
          patient_id: string;
          channel: string | null;
          message: string | null;
          patient_response: string | null;
          result: string | null;
          provider_message_id: string | null;
          sent_at: Timestamp | null;
          responded_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id: string;
          patient_id: string;
          channel?: string | null;
          message?: string | null;
          patient_response?: string | null;
          result?: string | null;
          provider_message_id?: string | null;
          sent_at?: Timestamp | null;
          responded_at?: Timestamp | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["bot_logs"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          clinic_id: string;
          actor_user_id: string | null;
          entity_type: string;
          entity_id: string | null;
          action: string;
          metadata: Json | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          actor_user_id?: string | null;
          entity_type: string;
          entity_id?: string | null;
          action: string;
          metadata?: Json | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_clinic_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      has_clinic_role: {
        Args: { clinic_id: string; allowed_roles: string[] };
        Returns: boolean;
      };
      is_clinic_member: {
        Args: { clinic_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      profile_role: "doctor" | "admin" | "assistant";
      clinic_plan: "initial" | "professional" | "clinic";
      clinic_member_role: "owner" | "doctor" | "assistant" | "admin";
      clinic_member_status: "active" | "invited" | "suspended";
      patient_status: "active" | "inactive" | "follow_up";
      appointment_status: "scheduled" | "confirmed" | "waiting" | "completed" | "cancelled";
      invite_status: "not_sent" | "sent" | "accepted" | "declined" | "pending" | "failed";
      reminder_status: "not_scheduled" | "scheduled" | "sent" | "failed";
      payment_status: "pending" | "paid" | "cancelled" | "refunded";
      medical_note_status: "draft" | "finalized" | "archived";
      consent_status: "pending" | "signed" | "expired" | "revoked";
      calendar_integration_status: "connected" | "disconnected" | "expired" | "failed";
    };
    CompositeTypes: Record<string, never>;
  };
};
