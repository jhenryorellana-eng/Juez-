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
        // Sistema iOS
        label: {
          DEFAULT: "#1c1c1e",
          secondary: "#6b6b70",
          tertiary: "#a1a1a8",
        },
        sys: {
          bg: "#f2f2f7", // grouped background
          card: "#ffffff",
          sep: "rgba(60,60,67,0.10)",
        },
        blue: "#007aff",
        indigo: "#5e5ce6",
        green: "#34c759",
        orange: "#ff9500",
        red: "#ff3b30",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "var(--font-sans)",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 10px 30px rgba(0,0,0,0.06)",
        phone: "0 50px 100px -20px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.04)",
        btn: "0 4px 16px rgba(0,122,255,0.32)",
      },
      borderRadius: {
        ios: "1.25rem",
        ios2: "1.75rem",
        phone: "2.75rem",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.6" },
          "70%": { transform: "scale(1.35)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        "bounce-dot": {
          "0%,80%,100%": { transform: "translateY(0)", opacity: "0.4" },
          "40%": { transform: "translateY(-4px)", opacity: "1" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.22,1,0.36,1) infinite",
        "bounce-dot": "bounce-dot 1.2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
