export type ReceiptUploadSessionStatus = "pending" | "processing" | "completed" | "cancelled";

export type ReceiptUploadSession = {
  id: string;
  receipt_image_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: ReceiptUploadSessionStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  merchant: string | null;
  expense_date: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
  payment_method: string | null;
  notes: string | null;
  analysis_status: string;
  analysis_warnings: unknown[];
  expense_id: string | null;
};
