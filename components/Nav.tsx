"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SOURCE_CONFIGS } from "@/config/sources";

/**
 * 全局导航：Logo + 数据源菜单
 * 手机端（≤768px）：自动折叠为汉堡菜单，点击展开/收起
 */
export function Nav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const currentLang = searchParams.get("lang") === "zh" ? "zh" : "en";

  // 手机端：路由变化后自动收起菜单
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const setLang = (lang: "en" | "zh") => {
    const params = new URLSearchParams(searchParams.toString());
    if (lang === "en") {
      params.delete("lang");
    } else {
      params.set("lang", "zh");
    }
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router.push(href);
  };

  const t = {
    home: currentLang === "zh" ? "首页" : "Home",
    trendsLabel: currentLang === "zh" ? "趋势列表" : "Trends",
    langEn: "EN",
    langZh: "中文",
  };

  return (
    <div className="header-inner">
      <Link href="/" className="header-logo" aria-label="Daily Trends Home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
        </svg>
        Daily Trends
      </Link>
      <div className="header-right">
        <div className="lang-switch" aria-label="Language switch">
          <button
            type="button"
            className={
              currentLang === "en" ? "lang-btn active" : "lang-btn"
            }
            onClick={() => setLang("en")}
          >
            {t.langEn}
          </button>
          <button
            type="button"
            className={
              currentLang === "zh" ? "lang-btn active" : "lang-btn"
            }
            onClick={() => setLang("zh")}
          >
            {t.langZh}
          </button>
        </div>
        <button
          type="button"
          className="header-nav-toggle"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? (currentLang === "zh" ? "关闭菜单" : "Close menu") : (currentLang === "zh" ? "打开菜单" : "Open menu")}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>
      <nav className={`nav-links ${menuOpen ? "is-open" : ""}`} aria-label={t.trendsLabel}>
        <Link
          href={currentLang === "zh" ? "/?lang=zh" : "/"}
          className={pathname === "/" ? "nav-link active" : "nav-link"}
        >
          {t.home}
        </Link>
        {SOURCE_CONFIGS.map((s) => {
          const href = `/trends/${s.slug}`;
          const hrefWithLang = currentLang === "zh" ? `${href}?lang=zh` : href;
          const isActive =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={s.slug}
              href={hrefWithLang}
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
