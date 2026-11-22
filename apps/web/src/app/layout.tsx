import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  style: "normal",
  axes: ["opsz"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: "variable",
  style: "normal",
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "VeilBrief | Private contract intelligence",
  description:
    "Run on-device contract analysis, shield sensitive fields, and escalate only scrubbed prompts to cloud models.",
  icons: {
    icon: "/icon.png",
  },
};

const themeBootstrap = `
  (function () {
    try {
      var stored = localStorage.getItem("veilbrief-theme");
      var dark = stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    } catch (_) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
