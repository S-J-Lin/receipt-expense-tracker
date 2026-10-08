"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isMobileNavItemActive, MOBILE_NAV_ITEMS } from "@/lib/pwa-config";
import { UiIcon, type UiIconName } from "@/components/ui-icon";

export function MobileNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return <nav aria-label="主要導覽" className="mobile-bottom-nav border-t md:hidden">
    <ul className="mobile-bottom-nav-content mx-auto grid max-w-lg grid-cols-5 px-1">{MOBILE_NAV_ITEMS.map((item) => {
      const active = isMobileNavItemActive(pathname, item.href);
      return <li className="min-w-0" key={item.href}><Link aria-current={active ? "page" : undefined} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${active ? "font-bold text-indigo-700" : "font-medium text-slate-600"}`} href={item.href}>
        {active && <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--accent)]" />}
        <UiIcon className="h-5 w-5" name={item.icon as UiIconName} /><span className="max-w-full truncate">{item.label}</span>
      </Link></li>;
    })}</ul>
  </nav>;
}
