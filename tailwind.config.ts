import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Playfair Display", "Georgia", "serif"],
        body: ["Inter", "Segoe UI", "sans-serif"]
      },
      colors: {
        baize: {
          50: "#e7fff1",
          100: "#c5f4d8",
          500: "#1f8f63",
          700: "#14624a",
          900: "#073629"
        },
        ivory: "#fffaf0",
        ink: "#141414",
        ruby: "#c51f35",
        club: "#151516"
      },
      boxShadow: {
        card: "0 18px 35px rgba(0, 0, 0, 0.25), inset 0 0 0 1px rgba(255,255,255,0.55)",
        felt: "inset 0 0 80px rgba(0,0,0,0.32)"
      }
    }
  },
  plugins: []
} satisfies Config;
