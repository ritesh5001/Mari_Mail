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
        // Canonical tokens (indigo-blue scale approximating MariBiz #4F6DFF)
        accent: {
          300: "#B4C5FF",
          400: "#7B90FF",
          500: "#4F6DFF",
          600: "#3B4FE6",
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
