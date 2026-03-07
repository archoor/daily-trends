"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SOURCE_CONFIGS } from "@/config/sources";

const closeLabel = { en: "Close menu", zh: "关闭菜单" };

/**
 * 全局导航：Logo + 数据源菜单
 * 手机端（≤768px）：顶栏仅 Logo + 右上角汉堡按钮；点击后右侧滑出抽屉，内含趋势选单、右上角×关闭、最下角中英文切换
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

  const closeMenu = () => setMenuOpen(false);

  const t = {
    home: currentLang === "zh" ? "首页" : "Home",
    trendsLabel: currentLang === "zh" ? "趋势列表" : "Trends",
    langEn: "EN",
    langZh: "中文",
    close: currentLang === "zh" ? closeLabel.zh : closeLabel.en,
  };

  const langButtons = (
    <>
      <button
        type="button"
        className={currentLang === "en" ? "lang-btn active" : "lang-btn"}
        onClick={() => setLang("en")}
      >
        {t.langEn}
      </button>
      <button
        type="button"
        className={currentLang === "zh" ? "lang-btn active" : "lang-btn"}
        onClick={() => setLang("zh")}
      >
        {t.langZh}
      </button>
    </>
  );

  return (
    <>
      <div className="header-inner">
        <Link href="/" className="header-logo" aria-label="Daily Trends Home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
          </svg>
          Daily Trends
        </Link>
        <div className="header-right">
          <div className="lang-switch header-lang" aria-label="Language switch">
            {langButtons}
          </div>
          <button
            type="button"
            className="header-nav-toggle"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t.close : (currentLang === "zh" ? "打开菜单" : "Open menu")}
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
          <button
            type="button"
            className="nav-drawer-close"
            aria-label={t.close}
            onClick={closeMenu}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="nav-drawer-links">
            <Link
              href={currentLang === "zh" ? "/?lang=zh" : "/"}
              className={pathname === "/" ? "nav-link active" : "nav-link"}
              onClick={closeMenu}
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
                  onClick={closeMenu}
                >
                  {s.name}
                </Link>
              );
            })}
          </div>
          <div className="nav-drawer-footer" aria-label="Language switch">
            <div className="lang-switch">
              {langButtons}
            </div>
          </div>
        </nav>
      </div>
      {menuOpen && (
        <div
          className="nav-drawer-backdrop"
          aria-hidden
          onClick={closeMenu}
        />
      )}
    </>
  );
}
