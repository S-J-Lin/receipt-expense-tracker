// Backups travel from the browser to Server Actions. Hosting platforms cap
// request bodies (Vercel Functions: 4.5 MB), so the client gzips the JSON text
// when the browser supports CompressionStream. The server decompresses with an
// output cap, so a compressed upload cannot expand past BACKUP_MAX_BYTES.

export type BackupTransport = { encoding: "gzip-base64"; data: string } | { encoding: "json"; data: string };

export async function encodeBackupForTransport(text: string): Promise<BackupTransport> {
  if (typeof CompressionStream === "undefined") return { encoding: "json", data: text };
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return { encoding: "gzip-base64", data: btoa(binary) };
  } catch {
    return { encoding: "json", data: text };
  }
}
