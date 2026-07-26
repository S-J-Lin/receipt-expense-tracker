export function normalizeProductAlias(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function aliasNeedsConfirmation(existingName: string | null | undefined, requestedName: string): boolean {
  return Boolean(existingName && existingName !== requestedName);
}
