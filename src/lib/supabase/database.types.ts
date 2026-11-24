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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_handoffs: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          reason: string
          summary: Json
          taken_at: string | null
          taken_by: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          reason: string
          summary?: Json
          taken_at?: string | null
          taken_by?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          reason?: string
          summary?: Json
          taken_at?: string | null
          taken_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_handoffs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_handoffs_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_lessons: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          original_reply: string | null
          reason: string | null
          situation: string | null
          source_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          original_reply?: string | null
          reason?: string | null
          situation?: string | null
          source_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          original_reply?: string | null
          reason?: string | null
          situation?: string | null
          source_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_lessons_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_lessons_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          conversation_id: string
          cost_usd: number | null
          created_at: string
          detail: string | null
          finished_at: string | null
          id: string
          status: string
          trigger_message_id: string
        }
        Insert: {
          conversation_id: string
          cost_usd?: number | null
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: string
          status?: string
          trigger_message_id: string
        }
        Update: {
          conversation_id?: string
          cost_usd?: number | null
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: string
          status?: string
          trigger_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          detected_kind: Database["public"]["Enums"]["attachment_kind"] | null
          external_url: string | null
          id: string
          message_id: string
          mime_type: string | null
          storage_path: string | null
          transcript: string | null
          type: Database["public"]["Enums"]["attachment_type"]
        }
        Insert: {
          created_at?: string
          detected_kind?: Database["public"]["Enums"]["attachment_kind"] | null
          external_url?: string | null
          id?: string
          message_id: string
          mime_type?: string | null
          storage_path?: string | null
          transcript?: string | null
          type: Database["public"]["Enums"]["attachment_type"]
        }
        Update: {
          created_at?: string
          detected_kind?: Database["public"]["Enums"]["attachment_kind"] | null
          external_url?: string | null
          id?: string
          message_id?: string
          mime_type?: string | null
          storage_path?: string | null
          transcript?: string | null
          type?: Database["public"]["Enums"]["attachment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      business_knowledge: {
        Row: {
          content: string
          key: string
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          key: string
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          key?: string
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_knowledge_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          active: boolean
          category: string | null
          description: string | null
          external_id: string
          id: string
          image_url: string | null
          name: string
          product_url: string | null
          synced_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          description?: string | null
          external_id: string
          id?: string
          image_url?: string | null
          name: string
          product_url?: string | null
          synced_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          description?: string | null
          external_id?: string
          id?: string
          image_url?: string | null
          name?: string
          product_url?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      channel_accounts: {
        Row: {
          connected_at: string
          created_at: string
          display_name: string
          id: string
          platform: Database["public"]["Enums"]["channel_platform"]
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
          zernio_account_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          display_name: string
          id?: string
          platform: Database["public"]["Enums"]["channel_platform"]
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          zernio_account_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          display_name?: string
          id?: string
          platform?: Database["public"]["Enums"]["channel_platform"]
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          zernio_account_id?: string
        }
        Relationships: []
      }
      contact_identities: {
        Row: {
          contact_id: string
          created_at: string
          external_user_id: string
          handle: string | null
          id: string
          platform: Database["public"]["Enums"]["channel_platform"]
        }
        Insert: {
          contact_id: string
          created_at?: string
          external_user_id: string
          handle?: string | null
          id?: string
          platform: Database["public"]["Enums"]["channel_platform"]
        }
        Update: {
          contact_id?: string
          created_at?: string
          external_user_id?: string
          handle?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["channel_platform"]
        }
        Relationships: [
          {
            foreignKeyName: "contact_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          ai_enabled: boolean
          assigned_to: string | null
          created_at: string
          follow_up_at: string | null
          id: string
          last_message_at: string | null
          loss_reason: string | null
          name: string | null
          notes: string | null
          phone: string | null
          stage: Database["public"]["Enums"]["contact_stage"]
          stage_pending_review: boolean
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          assigned_to?: string | null
          created_at?: string
          follow_up_at?: string | null
          id?: string
          last_message_at?: string | null
          loss_reason?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          stage?: Database["public"]["Enums"]["contact_stage"]
          stage_pending_review?: boolean
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          assigned_to?: string | null
          created_at?: string
          follow_up_at?: string | null
          id?: string
          last_message_at?: string | null
          loss_reason?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          stage?: Database["public"]["Enums"]["contact_stage"]
          stage_pending_review?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_attending: boolean
          ai_attending_since: string | null
          ai_mode: Database["public"]["Enums"]["ai_mode"]
          ai_revived_message_id: string | null
          assigned_to: string | null
          channel_account_id: string
          contact_id: string
          created_at: string
          external_conversation_id: string
          external_post_id: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          post_permalink: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_attending?: boolean
          ai_attending_since?: string | null
          ai_mode?: Database["public"]["Enums"]["ai_mode"]
          ai_revived_message_id?: string | null
          assigned_to?: string | null
          channel_account_id: string
          contact_id: string
          created_at?: string
          external_conversation_id: string
          external_post_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          post_permalink?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_attending?: boolean
          ai_attending_since?: string | null
          ai_mode?: Database["public"]["Enums"]["ai_mode"]
          ai_revived_message_id?: string | null
          assigned_to?: string | null
          channel_account_id?: string
          contact_id?: string
          created_at?: string
          external_conversation_id?: string
          external_post_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          post_permalink?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          external_message_id: string | null
          id: string
          reply_to_external_id: string | null
          sender_profile_id: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          reply_to_external_id?: string | null
          sender_profile_id?: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          reply_to_external_id?: string | null
          sender_profile_id?: string | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          public_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id: string
          public_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          public_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          body: string
          id: string
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_events: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          evidence_message_id: string | null
          from_stage: Database["public"]["Enums"]["contact_stage"] | null
          id: string
          note: string | null
          source: Database["public"]["Enums"]["stage_source"]
          to_stage: Database["public"]["Enums"]["contact_stage"]
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          evidence_message_id?: string | null
          from_stage?: Database["public"]["Enums"]["contact_stage"] | null
          id?: string
          note?: string | null
          source: Database["public"]["Enums"]["stage_source"]
          to_stage: Database["public"]["Enums"]["contact_stage"]
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          evidence_message_id?: string | null
          from_stage?: Database["public"]["Enums"]["contact_stage"] | null
          id?: string
          note?: string | null
          source?: Database["public"]["Enums"]["stage_source"]
          to_stage?: Database["public"]["Enums"]["contact_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "stage_events_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_events_evidence_message_id_fkey"
            columns: ["evidence_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          zernio_event_id: string
        }
        Insert: {
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          zernio_event_id: string
        }
        Update: {
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          zernio_event_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ai_mode: "on" | "off" | "handoff"
      attachment_kind:
        | "payment_receipt"
        | "shipping_guide"
        | "product_photo"
        | "other"
      attachment_type:
        | "image"
        | "video"
        | "audio"
        | "file"
        | "sticker"
        | "other"
      channel_platform: "whatsapp" | "facebook" | "instagram" | "tiktok"
      channel_status: "connected" | "disconnected" | "error"
      contact_stage:
        | "new"
        | "advising"
        | "ready_for_seller"
        | "order_confirmed"
        | "payment_received"
        | "shipped"
        | "delivered"
        | "lost"
        | "no_response"
      conversation_kind: "dm" | "comment"
      conversation_status: "open" | "closed"
      delivery_status: "pending" | "sent" | "delivered" | "read" | "failed"
      message_direction: "inbound" | "outbound"
      sender_type: "customer" | "ai" | "agent"
      stage_source: "manual" | "ai"
      user_role: "admin" | "seller"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_mode: ["on", "off", "handoff"],
      attachment_kind: [
        "payment_receipt",
        "shipping_guide",
        "product_photo",
        "other",
      ],
      attachment_type: ["image", "video", "audio", "file", "sticker", "other"],
      channel_platform: ["whatsapp", "facebook", "instagram", "tiktok"],
      channel_status: ["connected", "disconnected", "error"],
      contact_stage: [
        "new",
        "advising",
        "ready_for_seller",
        "order_confirmed",
        "payment_received",
        "shipped",
        "delivered",
        "lost",
        "no_response",
      ],
      conversation_kind: ["dm", "comment"],
      conversation_status: ["open", "closed"],
      delivery_status: ["pending", "sent", "delivered", "read", "failed"],
      message_direction: ["inbound", "outbound"],
      sender_type: ["customer", "ai", "agent"],
      stage_source: ["manual", "ai"],
      user_role: ["admin", "seller"],
    },
  },
} as const
