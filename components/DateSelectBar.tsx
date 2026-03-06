"use client";

import { useState } from "react";
import Link from "next/link";

const VISIBLE_COUNT = 10; // 默认显示 10 个：当天 + 9 个其他日期

export interface DateSelectBarProps {
  /** 有数据的日期列表，已按倒序（最新在前） */
  dates: string[];
  /** 当前选中的日期，null 表示「当天/最新」 */
  currentDate: string | null;
  /** 链接基础路径，如 /trends/github 或 /trends/github/owner-repo */
  basePath: string;
  /** 语言，用于保留在链接中 */
  lang?: "zh" | "en";
}

function buildHref(basePath: string, date: string | null, lang?: string): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (lang) params.set("lang", lang);
  const q = params.toString();
  return q ? `${basePath}?${q}` : basePath;
}

/** 用户本地今天的 yyyy-mm-dd */
function getTodayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string, isZh: boolean): string {
  const todayLocal = getTodayLocal();
  if (dateStr === todayLocal) return isZh ? "今天" : "Today";
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dDay = new Date(d);
  dDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - dDay.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 1) return isZh ? "昨天" : "Yesterday";
  return dateStr;
}

export function DateSelectBar({
  dates,
  currentDate,
  basePath,
  lang = "en",
}: DateSelectBarProps) {
  const [expanded, setExpanded] = useState(false);
  const isZh = lang === "zh";

  // 第一个按钮：最新一天。仅当该日期真的是「今天」时才显示「今天」，否则显示实际日期（昨天 / 具体日期）
  const latestDate = dates[0];
  const todayLocal = getTodayLocal();
  const latestLabel = latestDate === todayLocal ? (isZh ? "今天" : "Today") : formatDateLabel(latestDate, isZh);
  const visibleDates = dates.slice(1, VISIBLE_COUNT); // 第 1 位是最新一天，再取 dates[1]..dates[9] 共 9 个
  const restDates = dates.slice(VISIBLE_COUNT);
  const hasMore = restDates.length > 0;

  const isLatestActive = currentDate === null || currentDate === dates[0];

  return (
    <section
      className="date-select-bar"
      aria-label={isZh ? "选择日期" : "Select date"}
    >
      <div className="date-select-bar-inner">
        <Link
          href={buildHref(basePath, null, lang)}
          className={`date-select-btn ${isLatestActive ? "active" : ""}`}
          aria-current={isLatestActive ? "date" : undefined}
        >
          {latestLabel}
        </Link>
        {(expanded ? dates : visibleDates).map((date) => {
          const isActive = currentDate === date;
          return (
            <Link
              key={date}
              href={buildHref(basePath, date, lang)}
              className={`date-select-btn ${isActive ? "active" : ""}`}
              aria-current={isActive ? "date" : undefined}
            >
              {formatDateLabel(date, isZh)}
            </Link>
          );
        })}
        {hasMore && (
          <button
            type="button"
            className="date-select-more"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            title={expanded ? (isZh ? "收起" : "Collapse") : (isZh ? "查看全部日期" : "View all dates")}
          >
            {expanded ? (
              <span className="date-select-arrow up" aria-hidden>▲</span>
            ) : (
              <span className="date-select-arrow" aria-hidden>▶</span>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
