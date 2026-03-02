"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SOURCE_CONFIGS } from "@/config/sources";

/**
 * 全局导航：Logo + 数据源菜单
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <div className="header-inner">
      <Link href="/" className="header-logo" aria-label="Daily Trends Home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
        </svg>
        Daily Trends
      </Link>
      <nav className="nav-links">
        <Link
          href="/"
          className={pathname === "/" ? "nav-link active" : "nav-link"}
        >
          Home
        </Link>
        {SOURCE_CONFIGS.map((s) => {
          const href = `/trends/${s.slug}`;
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={s.slug}
              href={href}
              className={isActive ? "nav-link active" : "nav-link"}
            >
              {s.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
