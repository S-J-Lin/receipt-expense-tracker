export const APP_NAME = "Receipt Tracker";
export const APP_DESCRIPTION = "個人收據與消費記帳工具";
export const THEME_COLOR = "#121212";
export const BACKGROUND_COLOR = "#121212";
export const OFFLINE_MESSAGE = "目前離線，無法讀取或儲存資料。請恢復網路後再試。";
export const ONLINE_AGAIN_MESSAGE = "網路已恢復，可以重新操作。";
export const CLIPBOARD_DENIED_MESSAGE = "無法自動讀取剪貼簿，請長按輸入框並選擇貼上。";

export const PWA_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" as const },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" as const },
];

export const MOBILE_NAV_ITEMS = [
  { href: "/", label: "首頁", icon: "home" },
  { href: "/expenses/new", label: "新增", icon: "plus" },
  { href: "/import/chatgpt", label: "匯入", icon: "import" },
  { href: "/export", label: "匯出", icon: "export" },
  { href: "/expenses", label: "更多", icon: "more" },
] as const;

export function isMobileNavItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/expenses/new") return pathname === href;
  if (href === "/import/chatgpt" || href === "/export") return pathname.startsWith(href);
  if (href === "/expenses") {
    return (pathname.startsWith("/expenses") && pathname !== "/expenses/new")
      || pathname.startsWith("/import/backup")
      || pathname.startsWith("/items")
      || pathname.startsWith("/receipts");
  }
  return false;
}

export function canSubmitOnline(online: boolean) {
  return online ? null : OFFLINE_MESSAGE;
}
