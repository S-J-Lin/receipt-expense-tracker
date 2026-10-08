import { getExportDataset } from "@/lib/export-data";
import { EXPORT_FORMATS, exportContent, exportResponseHeaders, streamText, type ExportFormat } from "@/lib/export";
import { parseExportQuery } from "@/lib/export-query";
import { getAuthorization } from "@/lib/auth";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  const auth = await getAuthorization();
  if (auth.state !== "authorized") return Response.json({ error: auth.state === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: auth.state === "forbidden" ? 403 : 401, headers: noStore });
  const { format } = await params;
  if (!EXPORT_FORMATS.includes(format as ExportFormat)) return Response.json({ error: "Unsupported export format" }, { status: 404, headers: noStore });
  const { filters, error } = parseExportQuery(new URL(request.url).searchParams);
  if (error) return Response.json({ error }, { status: 400, headers: noStore });
  const result = await getExportDataset(filters);
  // Fail closed: never return a partial ledger as if it were a complete file.
  if (!result.data) return Response.json({ error: result.error ?? "匯出資料不完整，已停止下載。" }, { status: 503, headers: noStore });
  const exported = exportContent(format as ExportFormat, result.data, filters);
  return new Response(streamText(exported.body), { headers: { ...exportResponseHeaders(format as ExportFormat, filters), ...noStore } });
}
