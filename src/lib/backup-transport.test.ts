import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BACKUP_TRANSPORT_MAX_BYTES, BACKUP_TRANSPORT_SIZE_ERROR, backupTransportError, encodeBackupForTransport } from "@/lib/backup-transport";

describe("backup request body guard", () => {
  it("accepts payloads at the conservative limit", () => expect(backupTransportError({ encoding: "gzip-base64", data: "a".repeat(BACKUP_TRANSPORT_MAX_BYTES) })).toBeNull());
  it("rejects oversized compressed and uncompressed payloads", () => {
    for (const encoding of ["gzip-base64", "json"] as const) expect(backupTransportError({ encoding, data: "a".repeat(BACKUP_TRANSPORT_MAX_BYTES + 1) })).toBe(BACKUP_TRANSPORT_SIZE_ERROR);
  });
  it("counts UTF-8 bytes rather than JavaScript string length", () => expect(backupTransportError({ encoding: "json", data: "備".repeat(1_400_000) })).toBe(BACKUP_TRANSPORT_SIZE_ERROR));
  it("checks the actual encoded payload, allowing highly compressible backups", async () => expect(backupTransportError(await encodeBackupForTransport("a".repeat(5_000_000)))).toBeNull());
  it("checks before contacting the preview action and clears blocked transport", () => {
    const source = readFileSync("src/components/backup-restore-form.tsx", "utf8");
    expect(source.indexOf("backupTransportError(transport.current)")).toBeLessThan(source.indexOf("previewBackupAction(transport.current)"));
    expect(source).toContain("if (sizeError) { transport.current = null; setError(sizeError); return; }");
  });
});
