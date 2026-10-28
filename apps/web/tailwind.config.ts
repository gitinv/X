import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F7F3EE",
        ink: "#1C1412",
        bark: "#8C8279",
        line: "#E6DFD6",
        wine: "#4A1219",
        gold: "#C4A484",
        "gold-deep": "#6B3A12",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 50px rgba(74, 18, 25, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
