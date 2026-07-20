import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MariMail",
  description: "Marine ETA-triggered email intelligence",
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
