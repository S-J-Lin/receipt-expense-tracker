import type { Expense, ExpenseAdjustment, ExpenseInsert, ExpenseItem, ExpenseUpdate, ProductAlias } from "@/types/expense";
import type { ChatGPTImportAdjustment, ChatGPTImportItem } from "@/types/chatgpt-import";
import type { ReceiptUploadSession } from "@/types/receipt-upload-session";
import type { NormalizedManualExpense } from "@/lib/manual-expense-schema";

export type Database = {
  public: {
    Tables: {
      expenses: {
        Row: Expense;
        Insert: ExpenseInsert;
        Update: ExpenseUpdate;
        Relationships: [];
      };
      expense_items: {
        Row: ExpenseItem;
        Insert: Omit<ExpenseItem, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<ExpenseItem, "id" | "expense_id">>;
        Relationships: [];
      };
      expense_adjustments: {
        Row: ExpenseAdjustment;
        Insert: Omit<ExpenseAdjustment, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<ExpenseAdjustment, "id" | "expense_id">>;
        Relationships: [];
      };
      product_aliases: {
        Row: ProductAlias;
        Insert: Omit<ProductAlias, "id" | "alias_normalized" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<ProductAlias, "id" | "alias_normalized">>;
        Relationships: [];
      };
      receipt_upload_sessions: {
        Row: ReceiptUploadSession & { access_token_hash: string };
        Insert: Partial<ReceiptUploadSession> & Pick<ReceiptUploadSession, "receipt_image_path" | "original_filename" | "mime_type" | "size_bytes"> & { access_token_hash: string };
        Update: Partial<ReceiptUploadSession & { access_token_hash: string }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_receipt_upload_session: {
        Args: { p_receipt_image_path: string; p_original_filename: string; p_mime_type: string; p_size_bytes: number; p_access_token_hash: string };
        Returns: string;
      };
      get_receipt_upload_session: {
        Args: { p_session_id: string; p_access_token_hash: string };
        Returns: ReceiptUploadSession[];
      };
      confirm_receipt_upload_session: {
        Args: { p_session_id: string; p_access_token_hash: string; p_merchant: string; p_expense_date: string; p_amount: number; p_currency: string; p_category: string; p_payment_method: string; p_notes: string };
        Returns: string;
      };
      replace_receipt_upload_session_file: {
        Args: { p_session_id: string; p_access_token_hash: string; p_receipt_image_path: string; p_original_filename: string; p_mime_type: string; p_size_bytes: number };
        Returns: string;
      };
      delete_receipt_upload_session: {
        Args: { p_session_id: string; p_access_token_hash: string };
        Returns: boolean;
      };
      create_chatgpt_import: {
        Args: {
          p_idempotency_key: string;
          p_merchant: string;
          p_expense_date: string;
          p_currency: string;
          p_total_amount: number;
          p_category: string;
          p_payment_method: string | null;
          p_warnings: string[];
          p_items: ChatGPTImportItem[];
          p_adjustments: ChatGPTImportAdjustment[];
        };
        Returns: string;
      };
      update_itemized_expense: {
        Args: {
          p_expense_id: string;
          p_idempotency_key: string;
          p_merchant: string;
          p_expense_date: string;
          p_currency: string;
          p_total_amount: number;
          p_category: string;
          p_payment_method: string | null;
          p_notes: string | null;
          p_items: ChatGPTImportItem[];
          p_adjustments: ChatGPTImportAdjustment[];
        };
        Returns: string;
      };
      create_manual_expense: {
        Args: {
          p_idempotency_key: string;
          p_merchant: string;
          p_expense_date: string;
          p_currency: string;
          p_total_amount: number;
          p_category: string;
          p_payment_method: string | null;
          p_notes: string | null;
          p_items: NormalizedManualExpense["items"];
          p_adjustments: NormalizedManualExpense["adjustments"];
        };
        Returns: string;
      };
      restore_receipt_tracker_backup: {
        Args: {
          p_restore_key: string;
          p_mode: "skip" | "merge" | "replace";
          p_backup: Record<string, unknown>;
          p_replace_confirmation: string | null;
          p_missing_attachments: string[];
        };
        Returns: Record<string, unknown>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
