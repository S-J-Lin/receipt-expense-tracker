import type { Expense, ExpenseInsert, ExpenseUpdate } from "@/types/expense";

export type Database = {
  public: {
    Tables: {
      expenses: {
        Row: Expense;
        Insert: ExpenseInsert;
        Update: ExpenseUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
