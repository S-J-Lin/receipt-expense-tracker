/** Regression fixture: six complete lines, including optional product metadata. */
export const dmReceipt = {
  merchant: "dm", expense_date: "2026-10-06", currency: "EUR", total_amount: 8.15, payment_method: "Card", warnings: [],
  items: [
    { name_original: "Mivolis Mints Pfefferminze 35g", name_normalized: "薄荷糖", english_name: "Peppermint mints", brand: "Mivolis", product_group: "零食", category: "食品雜貨", quantity: 1, amount: 1.25, confidence: 0.99, unit: "g", unit_quantity: 35, notes: "薄荷口味" },
    { name_original: "3x 0,50 Sportness EnergRgl HIm", name_normalized: "能量棒", english_name: "Energy bar", brand: "Sportness", product_group: "零食", category: "食品雜貨", quantity: 3, amount: 1.5, confidence: 0.94, unit: "N/A", unit_quantity: 1, notes: "每條 0.50 EUR，共 3 條；口味縮寫 HIm 無法完全確認" },
    { name_original: "taxofit Vitamin B-Komplex 40St", name_normalized: "維生素B群", english_name: "Vitamin B complex", brand: "taxofit", product_group: "保健用品", category: "醫療", quantity: 1, amount: 2.65, confidence: 0.99, unit: "St", unit_quantity: 40, notes: "40 錠" },
    { name_original: "Mivolis Immun Fit Brausetabl.", name_normalized: "免疫保健發泡錠", english_name: "Immune support effervescent tablets", brand: "Mivolis", product_group: "保健用品", category: "醫療", quantity: 1, amount: 1.25, confidence: 0.98, unit: "N/A", unit_quantity: 1, notes: "免疫保健用發泡錠" },
    { name_original: "Balea Cremedusche Pure Softn.", name_normalized: "沐浴乳", english_name: "Shower cream", brand: "Balea", product_group: "個人清潔", category: "日用品", quantity: 1, amount: 0.55, confidence: 0.98, unit: "N/A", unit_quantity: 1, notes: "Pure Softness 系列" },
    { name_original: "Balea Shampoo Family", name_normalized: "洗髮精", english_name: "Shampoo", brand: "Balea", product_group: "個人清潔", category: "日用品", quantity: 1, amount: 0.95, confidence: 0.99, unit: "N/A", unit_quantity: 1, notes: "Family 系列" },
  ], adjustments: [],
};
export const dmMarkdownEscaped = JSON.stringify(dmReceipt, null, 2).replaceAll("_", "\\_").replace(/[\[\]{}]/g, (character) => "\\" + character);
