import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta institucional del Estado de Utah
        navy: {
          DEFAULT: "#012d6a",
          dark: "#011f4b",
          soft: "#1a4a8f",
          ring: "#3d6bb0",
        },
        gold: {
          DEFAULT: "#ffc323",
          soft: "#ffd45e",
          deep: "#e0a800",
        },
        ink: {
          DEFAULT: "#0b1e3b", // texto principal (navy casi negro), alto contraste
          soft: "#3a4a63",
          muted: "#6b7891",
          faint: "#9aa4ba",
        },
        surface: {
          DEFAULT: "#f4f7fc",
          card: "#ffffff",
        },
        good: "#1c9253",
        warn: "#e0a800",
        bad: "#e51837",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 1px 1px rgba(1,45,106,0.04), 0 12px 40px rgba(1,45,106,0.10)",
        lift: "0 2px 4px rgba(1,45,106,0.05), 0 24px 60px rgba(1,45,106,0.14)",
        gold: "0 8px 30px rgba(255,195,35,0.35)",
        navy: "0 10px 30px rgba(1,45,106,0.30)",
      },
      borderRadius: {
        xl2: "1.25rem",
        xl3: "1.75rem",
        xl4: "2.25rem",
      },
      keyframes: {
        "glow-drift": {
          "0%,100%": { transform: "translate(0,0) scale(1)", opacity: "0.55" },
          "50%": { transform: "translate(4%,-3%) scale(1.08)", opacity: "0.8" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "70%": { transform: "scale(1.4)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        "bounce-dot": {
          "0%,80%,100%": { transform: "translateY(0)", opacity: "0.4" },
          "40%": { transform: "translateY(-5px)", opacity: "1" },
        },
      },
      animation: {
        "glow-drift": "glow-drift 14s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.22,1,0.36,1) infinite",
        "bounce-dot": "bounce-dot 1.2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
