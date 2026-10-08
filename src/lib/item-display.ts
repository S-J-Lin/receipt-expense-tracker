/** Presentation-only defaults: never persist these values back to the ledger. */
export const itemBrand = (value: string | null | undefined): string => value?.trim() || "N/A";
export const itemProductGroup = (value: string | null | undefined): string => value?.trim() || "其他";
export const optionalItemText = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return !text || text === "N/A" ? null : text;
};
