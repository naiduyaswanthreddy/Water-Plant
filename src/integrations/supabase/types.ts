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
      bottles: {
        Row: {
          bottle_number: string
          bottle_type: Database["public"]["Enums"]["bottle_type"] | null
          created_at: string | null
          current_customer_id: string | null
          id: string
          is_returned: boolean | null
          updated_at: string | null
        }
        Insert: {
          bottle_number: string
          bottle_type?: Database["public"]["Enums"]["bottle_type"] | null
          created_at?: string | null
          current_customer_id?: string | null
          id?: string
          is_returned?: boolean | null
          updated_at?: string | null
        }
        Update: {
          bottle_number?: string
          bottle_type?: Database["public"]["Enums"]["bottle_type"] | null
          created_at?: string | null
          current_customer_id?: string | null
          id?: string
          is_returned?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bottles_current_customer_id_fkey"
            columns: ["current_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number | null
          created_at: string | null
          customer_type: Database["public"]["Enums"]["customer_type"] | null
          delivery_type: Database["public"]["Enums"]["delivery_type"] | null
          deposit_amount: number | null
          id: string
          name: string
          phone: string | null
          pin: string
          route_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          balance?: number | null
          created_at?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"] | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"] | null
          deposit_amount?: number | null
          id?: string
          name: string
          phone?: string | null
          pin: string
          route_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          balance?: number | null
          created_at?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"] | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"] | null
          deposit_amount?: number | null
          id?: string
          name?: string
          phone?: string | null
          pin?: string
          route_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_customers_route"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      function_orders: {
        Row: {
          amount_paid: number | null
          bottles_returned: number | null
          bottles_supplied: number | null
          created_at: string | null
          customer_id: string
          event_date: string | null
          event_name: string | null
          id: string
          is_settled: boolean | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          bottles_returned?: number | null
          bottles_supplied?: number | null
          created_at?: string | null
          customer_id: string
          event_date?: string | null
          event_name?: string | null
          id?: string
          is_settled?: boolean | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          bottles_returned?: number | null
          bottles_supplied?: number | null
          created_at?: string | null
          customer_id?: string
          event_date?: string | null
          event_name?: string | null
          id?: string
          is_settled?: boolean | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "function_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      function_order_bottles: {
        Row: {
          id: string
          order_id: string
          bottle_id: string | null
          bottle_number: string
          bottle_type: Database["public"]["Enums"]["bottle_type"]
          delivered_at: string
          received: boolean
          received_at: string | null
          owner_user_id: string | null
        }
        Insert: {
          id?: string
          order_id: string
          bottle_id?: string | null
          bottle_number: string
          bottle_type: Database["public"]["Enums"]["bottle_type"]
          delivered_at?: string | null
          received?: boolean
          received_at?: string | null
          owner_user_id?: string | null
        }
        Update: {
          id?: string
          order_id?: string
          bottle_id?: string | null
          bottle_number?: string
          bottle_type?: Database["public"]["Enums"]["bottle_type"]
          delivered_at?: string | null
          received?: boolean
          received_at?: string | null
          owner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "function_order_bottles_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "function_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "function_order_bottles_bottle_id_fkey"
            columns: ["bottle_id"]
            isOneToOne: false
            referencedRelation: "bottles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing: {
        Row: {
          bottle_type: Database["public"]["Enums"]["bottle_type"]
          created_at: string | null
          customer_type: Database["public"]["Enums"]["customer_type"]
          id: string
          price: number
          updated_at: string | null
        }
        Insert: {
          bottle_type: Database["public"]["Enums"]["bottle_type"]
          created_at?: string | null
          customer_type: Database["public"]["Enums"]["customer_type"]
          id?: string
          price: number
          updated_at?: string | null
        }
        Update: {
          bottle_type?: Database["public"]["Enums"]["bottle_type"]
          created_at?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          id?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      routes: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          order_sequence: number[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          order_sequence?: number[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          order_sequence?: number[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"] | null
          route_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"] | null
          route_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"] | null
          route_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number | null
          bottle_numbers: string[] | null
          bottle_type: Database["public"]["Enums"]["bottle_type"] | null
          created_at: string | null
          customer_id: string
          id: string
          notes: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          quantity: number | null
          staff_id: string | null
          transaction_date: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount?: number | null
          bottle_numbers?: string[] | null
          bottle_type?: Database["public"]["Enums"]["bottle_type"] | null
          created_at?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          quantity?: number | null
          staff_id?: string | null
          transaction_date?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number | null
          bottle_numbers?: string[] | null
          bottle_type?: Database["public"]["Enums"]["bottle_type"] | null
          created_at?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          quantity?: number | null
          staff_id?: string | null
          transaction_date?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_unique_pin: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      bottle_type: "normal" | "cool"
      customer_type: "household" | "shop" | "function" | "hotel"
      delivery_type: "daily" | "alternate" | "weekly"
      payment_type: "cash" | "online" | "credit"
      staff_role: "owner" | "delivery" | "counter"
      transaction_type: "delivery" | "return" | "payment"
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
      bottle_type: ["normal", "cool"],
      customer_type: ["household", "shop", "function", "hotel"],
      delivery_type: ["daily", "alternate", "weekly"],
      payment_type: ["cash", "online", "credit"],
      staff_role: ["owner", "delivery", "counter"],
      transaction_type: ["delivery", "return", "payment"],
    },
  },
} as const
