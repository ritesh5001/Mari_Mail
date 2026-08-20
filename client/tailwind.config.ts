import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // MariBiz brand palette — the marine app inherits the marketing site's
        // royal-blue so the two products read as one system.
        navy: "var(--navy)",     // dark surface / heading background
        ocean: "var(--ocean)",   // brand blue accent
        gold: "var(--gold)",     // darker variant for hover / deep accents
        // Canonical brand scale (indigo-blue, anchored on MariBiz #4F6DFF).
        //
        // This is THE accent of the product — active nav, links, primary
        // buttons, selected states, focus rings. There is deliberately no
        // second blue: `sky-*` used to do half this job, which is why the
        // light theme read cyan while dark read indigo.
        //
        // 300–600 are the original values, unchanged, so the ~450 existing
        // usages render exactly as before. The rest of the ramp is new —
        // 50, 200 and 700 were already being referenced by components while
        // undefined here, so those classes were emitting no CSS at all.
        accent: {
          50: "#F0F3FF",
          100: "#E0E7FF",
          200: "#C8D4FF",
          300: "#B4C5FF",
          400: "#7B90FF",
          500: "#4F6DFF",
          600: "#3B4FE6",
          700: "#2F3EBF",
          800: "#26318F",
          900: "#1E2668",
          950: "#121740",
        },
        ink: {
          950: "#050507",
          900: "#0A0A0C",
          800: "#101013",
          700: "#17171C",
          600: "#1F1F26",
          500: "#2A2A33",
          400: "#3F3F4A",
        },
        mist: {
          400: "#8A8A95",
          500: "#A3A3AE",
          600: "#C7C7CF",
        },
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
      },
      boxShadow: {
        shell: "0 10px 30px rgba(0, 0, 0, 0.35)",
        glow: "0 0 90px rgba(7, 89, 133, 0.32)",
      },
    },
  },
  plugins: [],
}
export default config
