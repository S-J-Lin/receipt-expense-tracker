import { getExportDataset } from "@/lib/export-data";
import { EXPORT_FORMATS, exportContent, exportResponseHeaders, type ExportFormat } from "@/lib/export";
import { parseExportQuery } from "@/lib/export-query";
import { getAuthorization } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  const auth = await getAuthorization();
  if (auth.state !== "authorized") return Response.json({ error: auth.state === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: auth.state === "forbidden" ? 403 : 401, headers: { "Cache-Control": "no-store" } });
  const { format } = await params;
  if (!EXPORT_FORMATS.includes(format as ExportFormat)) return Response.json({ error: "Unsupported export format" }, { status: 404 });
  const url = new URL(request.url);
  const { filters } = parseExportQuery(url.searchParams);
  const result = await getExportDataset(filters);
  if (!result.data) return Response.json({ error: result.error }, { status: 500 });
  const exported = exportContent(format as ExportFormat, result.data, filters);
  return new Response(exported.body, { headers: { ...exportResponseHeaders(format as ExportFormat, filters), "Cache-Control": "private, no-store" } });
}
