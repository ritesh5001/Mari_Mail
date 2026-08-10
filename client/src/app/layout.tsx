import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MariMail",
  description: "AI-powered marine sales email automation",
  // app/icon.png and app/apple-icon.png are picked up by filename convention;
  // these entries are the explicit fallback for crawlers and older browsers
  // that ignore the generated <link> tags.
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  // Social preview uses the FULL lockup, not the mark: link unfurls render on
  // the sharing app's own card background, where a bare ship reads as nothing
  // in particular. The lockup carries the name and the tagline.
  openGraph: {
    title: "MariMail",
    description: "AI-powered marine sales email automation",
    images: [{ url: "/logo.png", width: 1448, height: 1086, alt: "MariMail" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MariMail",
    description: "AI-powered marine sales email automation",
    images: ["/logo.png"],
  },
};

// Runs synchronously in <head> before body renders. Picks the theme from
// (1) localStorage, (2) a marimail-theme cookie (survives storage clears +
// lets any future server render read the same value), (3) system pref, and
// applies the class before first paint so refreshing never briefly shows the
// wrong theme.
const themeBootstrap = `(() => {
  var theme = null;
  try {
    theme = localStorage.getItem("marimail-theme");
  } catch (e) {}
  if (theme !== "light" && theme !== "dark") {
    try {
      var match = document.cookie.match(/(?:^|; )marimail-theme=([^;]+)/);
      if (match) theme = decodeURIComponent(match[1]);
    } catch (e) {}
  }
  if (theme !== "light" && theme !== "dark") {
    try {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    } catch (e) { theme = "dark"; }
  }
  var root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
