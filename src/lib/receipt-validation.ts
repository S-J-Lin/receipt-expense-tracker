export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_BUCKET = "receipts";

const MIME_EXTENSIONS = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
  "application/pdf": ["pdf"],
} as const;

export type ReceiptMimeType = keyof typeof MIME_EXTENSIONS;

export type ValidatedReceipt = {
  extension: string;
  mimeType: ReceiptMimeType;
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function hasIsoBrand(bytes: Uint8Array, extension: string): boolean {
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") return false;
  const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
  const heicBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"];
  const heifBrands = ["mif1", "msf1"];
  return extension === "heic" ? heicBrands.includes(brand) : [...heicBrands, ...heifBrands].includes(brand);
}

export async function validateReceiptFile(file: File): Promise<
  { data: ValidatedReceipt; error: null } | { data: null; error: string }
> {
  if (!file.name || file.size === 0) return { data: null, error: "請選擇非空白的收據檔案。" };
  if (file.size > RECEIPT_MAX_BYTES) return { data: null, error: "檔案不可超過 10 MB。" };

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.type.toLowerCase() as ReceiptMimeType;
  const allowedExtensions = MIME_EXTENSIONS[mimeType];
  if (!allowedExtensions || !(allowedExtensions as readonly string[]).includes(extension)) {
    return { data: null, error: "只接受 JPEG、PNG、HEIC、HEIF 或 PDF，且格式與副檔名必須一致。" };
  }

  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const signatureMatches =
    (mimeType === "image/jpeg" && startsWith(bytes, [0xff, 0xd8, 0xff])) ||
    (mimeType === "image/png" && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (mimeType === "application/pdf" && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) ||
    (mimeType === "image/heic" && hasIsoBrand(bytes, "heic")) ||
    (mimeType === "image/heif" && hasIsoBrand(bytes, "heif"));

  if (!signatureMatches) return { data: null, error: "檔案內容與宣告格式不符，請重新選擇有效的收據檔案。" };
  return { data: { extension, mimeType }, error: null };
}

export function isValidReceiptPath(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^anonymous\/\d{4}\/\d{2}\/[0-9a-f-]{36}-\d{13}\.(jpg|jpeg|png|heic|heif|pdf)$/i.test(value),
  );
}

export function receiptKindFromPath(path: string): "image" | "pdf" | "heic" {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "heic" || extension === "heif") return "heic";
  return "image";
}

export function createReceiptObjectPath(extension: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `anonymous/${year}/${month}/${crypto.randomUUID()}-${now.getTime()}.${extension.toLowerCase()}`;
}
