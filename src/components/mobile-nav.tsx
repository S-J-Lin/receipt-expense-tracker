"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isMobileNavItemActive, MOBILE_NAV_ITEMS } from "@/lib/pwa-config";
import { UiIcon, type UiIconName } from "@/components/ui-icon";

export function MobileNav() {
  const pathname = usePathname();
  return <nav aria-label="手機主要導覽" className="mobile-bottom-nav border-t border-slate-200 md:hidden">
    <div className="mobile-bottom-nav-content mx-auto grid max-w-lg grid-cols-5 px-1">{MOBILE_NAV_ITEMS.map((item) => {
      const active = isMobileNavItemActive(pathname, item.href);
      return <Link aria-current={active ? "page" : undefined} aria-label={item.label} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ${active ? "text-indigo-700" : "text-slate-600"}`} href={item.href} key={item.href}>
        <UiIcon className="h-5 w-5" name={item.icon as UiIconName} /><span>{item.label}</span>
      </Link>;
    })}</div>
  </nav>;
}
