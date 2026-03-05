"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SOURCE_CONFIGS } from "@/config/sources";

/**
 * 全局导航：Logo + 数据源菜单
 */
export function Nav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentLang = searchParams.get("lang") === "zh" ? "zh" : "en";

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
      <nav className="nav-links" aria-label={t.trendsLabel}>
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
    </div>
  );
}
