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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      briefs: {
        Row: {
          about: string | null
          ai_generated_copy: Json | null
          channels: string[]
          client_id: string
          content_type: string
          conversation_id: string | null
          created_at: string
          deadline: string | null
          id: string
          name: string
          status: string
          template_ids: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          about?: string | null
          ai_generated_copy?: Json | null
          channels?: string[]
          client_id: string
          content_type: string
          conversation_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          name: string
          status?: string
          template_ids?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          about?: string | null
          ai_generated_copy?: Json | null
          channels?: string[]
          client_id?: string
          content_type?: string
          conversation_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          name?: string
          status?: string
          template_ids?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_platforms: {
        Row: {
          additional_config: Json | null
          api_key_encrypted: string | null
          api_secret_encrypted: string | null
          client_id: string
          created_at: string
          id: string
          is_connected: boolean
          last_sync_at: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          schema_cache: Json | null
          updated_at: string
        }
        Insert: {
          additional_config?: Json | null
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_connected?: boolean
          last_sync_at?: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          schema_cache?: Json | null
          updated_at?: string
        }
        Update: {
          additional_config?: Json | null
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          last_sync_at?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          schema_cache?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_platforms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          brand_voice: string | null
          competitors: Json | null
          copy_examples: Json | null
          created_at: string
          differentiators: Json | null
          do_rules: Json | null
          dont_rules: Json | null
          id: string
          industry: string | null
          is_active: boolean
          key_messaging_pillars: Json | null
          legal_requirements: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          tagline: string | null
          target_audience: Json | null
          tone_presets: Json | null
          updated_at: string
          value_propositions: Json | null
          website_url: string | null
        }
        Insert: {
          brand_voice?: string | null
          competitors?: Json | null
          copy_examples?: Json | null
          created_at?: string
          differentiators?: Json | null
          do_rules?: Json | null
          dont_rules?: Json | null
          id?: string
          industry?: string | null
          is_active?: boolean
          key_messaging_pillars?: Json | null
          legal_requirements?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          tagline?: string | null
          target_audience?: Json | null
          tone_presets?: Json | null
          updated_at?: string
          value_propositions?: Json | null
          website_url?: string | null
        }
        Update: {
          brand_voice?: string | null
          competitors?: Json | null
          copy_examples?: Json | null
          created_at?: string
          differentiators?: Json | null
          do_rules?: Json | null
          dont_rules?: Json | null
          id?: string
          industry?: string | null
          is_active?: boolean
          key_messaging_pillars?: Json | null
          legal_requirements?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          tagline?: string | null
          target_audience?: Json | null
          tone_presets?: Json | null
          updated_at?: string
          value_propositions?: Json | null
          website_url?: string | null
        }
        Relationships: []
      }
      data_visibility: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_visible: boolean
          item_id: string
          item_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          item_id: string
          item_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          item_id?: string
          item_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_visibility_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          client_id: string | null
          created_at: string
          description: string
          id: string
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description: string
          id?: string
          status?: string
          title: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string
          id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_content: {
        Row: {
          assumptions: Json | null
          channel: Database["public"]["Enums"]["channel_type"] | null
          client_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          id: string
          input_params: Json
          output_content: Json
          platform: Database["public"]["Enums"]["platform_type"] | null
          sources_used: Json | null
          user_id: string
        }
        Insert: {
          assumptions?: Json | null
          channel?: Database["public"]["Enums"]["channel_type"] | null
          client_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          created_at?: string
          id?: string
          input_params?: Json
          output_content?: Json
          platform?: Database["public"]["Enums"]["platform_type"] | null
          sources_used?: Json | null
          user_id: string
        }
        Update: {
          assumptions?: Json | null
          channel?: Database["public"]["Enums"]["channel_type"] | null
          client_id?: string
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          id?: string
          input_params?: Json
          output_content?: Json
          platform?: Database["public"]["Enums"]["platform_type"] | null
          sources_used?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_content_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          category: string | null
          client_id: string | null
          content: string
          content_type: string
          created_at: string
          id: string
          is_vendor_doc: boolean
          metadata: Json | null
          platform: Database["public"]["Enums"]["platform_type"] | null
          source_url: string
          title: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          client_id?: string | null
          content: string
          content_type?: string
          created_at?: string
          id?: string
          is_vendor_doc?: boolean
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["platform_type"] | null
          source_url: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          client_id?: string | null
          content?: string
          content_type?: string
          created_at?: string
          id?: string
          is_vendor_doc?: boolean
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["platform_type"] | null
          source_url?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sync_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_documents: number | null
          id: string
          new_documents: number | null
          platforms_processed: Json | null
          started_at: string
          status: string
          total_documents: number | null
          updated_documents: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_documents?: number | null
          id?: string
          new_documents?: number | null
          platforms_processed?: Json | null
          started_at?: string
          status?: string
          total_documents?: number | null
          updated_documents?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_documents?: number | null
          id?: string
          new_documents?: number | null
          platforms_processed?: Json | null
          started_at?: string
          status?: string
          total_documents?: number | null
          updated_documents?: number | null
        }
        Relationships: []
      }
      platform_schemas: {
        Row: {
          client_platform_id: string
          created_at: string
          data_type: string | null
          description: string | null
          id: string
          last_seen_at: string | null
          metadata: Json | null
          name: string
          sample_values: Json | null
          schema_type: string
          updated_at: string
        }
        Insert: {
          client_platform_id: string
          created_at?: string
          data_type?: string | null
          description?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          name: string
          sample_values?: Json | null
          schema_type: string
          updated_at?: string
        }
        Update: {
          client_platform_id?: string
          created_at?: string
          data_type?: string | null
          description?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          name?: string
          sample_values?: Json | null
          schema_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_schemas_client_platform_id_fkey"
            columns: ["client_platform_id"]
            isOneToOne: false
            referencedRelation: "client_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_approved: boolean
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_approved?: boolean
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_approved?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          about: string | null
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          about?: string | null
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          about?: string | null
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_library: {
        Row: {
          body_preview: string | null
          category: string | null
          channel: string
          client_id: string | null
          content_type: string
          created_at: string
          description: string | null
          html_content: string | null
          id: string
          is_global: boolean | null
          name: string
          preview_text: string | null
          subject_line: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          body_preview?: string | null
          category?: string | null
          channel: string
          client_id?: string | null
          content_type: string
          created_at?: string
          description?: string | null
          html_content?: string | null
          id?: string
          is_global?: boolean | null
          name: string
          preview_text?: string | null
          subject_line?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          body_preview?: string | null
          category?: string | null
          channel?: string
          client_id?: string | null
          content_type?: string
          created_at?: string
          description?: string | null
          html_content?: string | null
          id?: string
          is_global?: boolean | null
          name?: string
          preview_text?: string | null
          subject_line?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_library_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member"
      channel_type: "email" | "push" | "sms" | "in_app"
      content_type: "copy" | "code"
      platform_type: "braze" | "klaviyo" | "iterable" | "customerio" | "hubspot"
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
      app_role: ["admin", "member"],
      channel_type: ["email", "push", "sms", "in_app"],
      content_type: ["copy", "code"],
      platform_type: ["braze", "klaviyo", "iterable", "customerio", "hubspot"],
    },
  },
} as const
