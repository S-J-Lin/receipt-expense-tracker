import { z } from "zod";
import { chatGPTImportAdjustmentSchema, chatGPTImportItemSchema } from "@/lib/chatgpt-import-schema";
import { EXPENSE_CATEGORIES } from "@/types/expense";

export const itemizedExpenseEditSchema = z.strictObject({
  merchant: z.string().trim().min(1),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  total_amount: z.number().finite().positive(),
  category: z.enum(EXPENSE_CATEGORIES),
  payment_method: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(chatGPTImportItemSchema),
  adjustments: z.array(chatGPTImportAdjustmentSchema),
  aliases: z.array(z.strictObject({
    alias: z.string().trim().min(1),
    normalized_name: z.string().trim().min(1),
    product_group: z.string().trim().optional(),
    category: z.enum(EXPENSE_CATEGORIES),
    brand: z.string().trim().min(1).default("N/A"),
    overwrite: z.boolean().default(false),
  })),
});
