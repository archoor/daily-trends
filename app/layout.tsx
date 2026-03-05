import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getBaseUrl } from "@/lib/seo";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const baseUrl = getBaseUrl();
const siteName = "Daily Trends";
const defaultDescription =
  "Multi-source AI and product trends in one place. Rankings from Toolify, GitHub, Product Hunt, and Google Trends.";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: siteName, template: "%s | Daily Trends" },
  description: defaultDescription,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName,
    title: siteName,
    description: defaultDescription,
    url: baseUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: baseUrl },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        <header role="banner">
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
        </header>
        <main id="main-content" role="main">
          {children}
        </main>
      </body>
    </html>
  );
}
