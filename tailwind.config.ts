import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // A cooler grey scale for a more professional look.
        neutral: colors.slate,
        // Brand blue, taken from the app icon.
        brand: {
          50: "#eef4ff",
          100: "#dbe7ff",
          200: "#bcd2ff",
          300: "#8db3ff",
          400: "#5a8df5",
          500: "#2f6be0",
          600: "#1a52c4",
          700: "#0f3f9e",
          800: "#0c3180",
          900: "#0a2766",
          950: "#061744",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.08)",
        lift: "0 2px 4px rgb(15 23 42 / 0.05), 0 12px 28px -8px rgb(15 63 158 / 0.22)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: { "0%": { transform: "scale(0.82)", opacity: "0.4" }, "60%": { transform: "scale(1.08)" }, "100%": { transform: "scale(1)", opacity: "1" } },
        glow: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.45" } },
      },
      animation: {
        rise: "rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        fade: "fade 0.3s ease-out both",
        pop: "pop 0.3s ease-out",
        glow: "glow 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
