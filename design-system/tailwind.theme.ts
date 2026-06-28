// Calm Command - Tailwind theme extension (v2)
// Lewis Insurance Agency OS (InsureFlow CRM)
// Consumes the CSS variables in design-tokens.css.
// shadcn colors read hsl(var(--x)); brand tokens read the cc- variables directly.
// Imported by tailwind.config.ts as `theme`.

import type { Config } from "tailwindcss";

export const calmCommandTheme: NonNullable<Config["theme"]> = {
  extend: {
    colors: {
      // ----- shadcn base (keep these names exact) -----
      border: "hsl(var(--border))",
      input: "hsl(var(--input))",
      ring: "hsl(var(--ring))",
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      primary: {
        DEFAULT: "hsl(var(--primary))",
        foreground: "hsl(var(--primary-foreground))",
      },
      secondary: {
        DEFAULT: "hsl(var(--secondary))",
        foreground: "hsl(var(--secondary-foreground))",
      },
      destructive: {
        DEFAULT: "hsl(var(--destructive))",
        foreground: "hsl(var(--destructive-foreground))",
      },
      muted: {
        DEFAULT: "hsl(var(--muted))",
        foreground: "hsl(var(--muted-foreground))",
      },
      accent: {
        DEFAULT: "hsl(var(--accent))",
        foreground: "hsl(var(--accent-foreground))",
      },
      popover: {
        DEFAULT: "hsl(var(--popover))",
        foreground: "hsl(var(--popover-foreground))",
      },
      card: {
        DEFAULT: "hsl(var(--card))",
        foreground: "hsl(var(--card-foreground))",
      },

      // ----- Calm Command brand scale (bg-cc-surface, text-cc-text-muted, etc.) -----
      cc: {
        bg: "var(--cc-bg)",
        surface: "var(--cc-surface)",
        "surface-raised": "var(--cc-surface-raised)",
        "surface-overlay": "var(--cc-surface-overlay)",
        "border-subtle": "var(--cc-border-subtle)",
        "border-strong": "var(--cc-border-strong)",
        "border-interactive": "var(--cc-border-interactive)",
        "text-primary": "var(--cc-text-primary)",
        "text-secondary": "var(--cc-text-secondary)",
        "text-muted": "var(--cc-text-muted)",
        "text-faint": "var(--cc-text-faint)",
        accent: "var(--cc-accent)",
        "accent-hover": "var(--cc-accent-hover)",
        "accent-deep": "var(--cc-accent-deep)",
        "accent-muted": "var(--cc-accent-muted)",
        "accent-glow": "var(--cc-accent-glow)",
        "on-accent": "var(--cc-on-accent)",
        success: "var(--cc-success)",
        warning: "var(--cc-warning)",
        danger: "var(--cc-danger)",
        info: "var(--cc-info)",
        "on-semantic": "var(--cc-on-semantic)",
        "danger-pill-text": "var(--cc-danger-pill-text)",
        link: "var(--cc-link)",
        "link-hover": "var(--cc-link-hover)",
        "skeleton-base": "var(--cc-skeleton-base)",
        "skeleton-sheen": "var(--cc-skeleton-sheen)",
        "chart-1": "var(--cc-chart-1)",
        "chart-2": "var(--cc-chart-2)",
        "chart-3": "var(--cc-chart-3)",
        "chart-4": "var(--cc-chart-4)",
        "chart-5": "var(--cc-chart-5)",
        "chart-6": "var(--cc-chart-6)",
        "chart-grid": "var(--cc-chart-grid)",
        "chart-axis": "var(--cc-chart-axis)",
        "chart-track": "var(--cc-chart-track)",
      },
    },

    borderRadius: {
      // shadcn contract: stock components use these, keep them on --radius
      lg: "var(--radius)",
      md: "calc(var(--radius) - 2px)",
      sm: "calc(var(--radius) - 4px)",
      // brand radii (namespaced so they never repurpose the shadcn keys)
      "cc-sm": "var(--cc-radius-sm)",   //  8px
      "cc-md": "var(--cc-radius-md)",   // 12px  buttons, inputs, chips
      "cc-lg": "var(--cc-radius-lg)",   // 16px
      "cc-xl": "var(--cc-radius-xl)",   // 20px  cards
      "cc-2xl": "var(--cc-radius-2xl)", // 24px
      pill: "var(--cc-radius-pill)",
    },

    boxShadow: {
      card: "var(--cc-shadow-card)",
      lift: "var(--cc-shadow-lift)",
      glow: "var(--cc-shadow-glow)",
    },

    fontFamily: {
      sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      mono: ["Geist Mono", "ui-monospace", "monospace"],
    },

    fontSize: {
      // [size, lineHeight]
      label: ["var(--cc-text-label)", { lineHeight: "1.25", letterSpacing: "var(--cc-tracking-label)" }],
      xs: ["var(--cc-text-xs)", { lineHeight: "1.4" }],
      sm: ["var(--cc-text-sm)", { lineHeight: "1.45" }],
      base: ["var(--cc-text-base)", { lineHeight: "1.5" }],
      lg: ["var(--cc-text-lg)", { lineHeight: "1.4" }],
      xl: ["var(--cc-text-xl)", { lineHeight: "1.3" }],
      "2xl": ["var(--cc-text-2xl)", { lineHeight: "1.2" }],
      "3xl": ["var(--cc-text-3xl)", { lineHeight: "1.15" }],
    },

    letterSpacing: {
      label: "var(--cc-tracking-label)",
    },

    zIndex: {
      base: "0",
      sticky: "10",
      rail: "20",
      dropdown: "30",
      overlay: "40",
      modal: "50",
      toast: "60",
      tooltip: "70",
    },

    transitionTimingFunction: {
      glide: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      snap: "cubic-bezier(0.4, 0, 0.2, 1)",
    },

    transitionDuration: {
      fast: "120ms",
      base: "180ms",
      slow: "240ms",
      slower: "320ms",
    },
  },
};

export default calmCommandTheme;

// NOTE on spacing: the 4pt --cc-space-* scale matches Tailwind's default spacing
// (p-1 = 4px ... p-16 = 64px), so use Tailwind's built-in scale. The cc-space-*
// vars are the canonical reference. Do not hardcode pixel padding in styles.
