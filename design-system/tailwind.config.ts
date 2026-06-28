// Calm Command - Tailwind config wrapper
// Lewis Insurance Agency OS (InsureFlow CRM)
// The app is DARK ONLY. Add class="dark" to <html> and do not add a theme toggle.

import type { Config } from "tailwindcss";
import { calmCommandTheme } from "./tailwind.theme";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: calmCommandTheme, // already a { extend: {...} } object, do not double-nest
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
