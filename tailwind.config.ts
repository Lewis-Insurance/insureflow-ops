import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          primary: "hsl(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "hsl(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
        },
        // Lewis Insurance brand colors
        lewis: {
          blue: "hsl(var(--lewis-blue) / <alpha-value>)",
          orange: "hsl(var(--lewis-orange) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          foreground: "hsl(var(--info-foreground) / <alpha-value>)",
        },
        // ----- Calm Command brand scale (bg-cc-surface, text-cc-text-muted, etc.) -----
        // color-mix wrapper: the cc vars are hex, so a plain var() silently DROPS
        // every /opacity modifier (Tailwind emits no rule at all for bg-cc-accent/90).
        // With no modifier <alpha-value> is 1 -> calc(100%) -> identical color.
        cc: {
          bg: "color-mix(in srgb, var(--cc-bg) calc(<alpha-value> * 100%), transparent)",
          surface: "color-mix(in srgb, var(--cc-surface) calc(<alpha-value> * 100%), transparent)",
          "surface-raised": "color-mix(in srgb, var(--cc-surface-raised) calc(<alpha-value> * 100%), transparent)",
          "surface-overlay": "color-mix(in srgb, var(--cc-surface-overlay) calc(<alpha-value> * 100%), transparent)",
          "border-subtle": "color-mix(in srgb, var(--cc-border-subtle) calc(<alpha-value> * 100%), transparent)",
          "border-strong": "color-mix(in srgb, var(--cc-border-strong) calc(<alpha-value> * 100%), transparent)",
          "border-interactive": "color-mix(in srgb, var(--cc-border-interactive) calc(<alpha-value> * 100%), transparent)",
          "text-primary": "color-mix(in srgb, var(--cc-text-primary) calc(<alpha-value> * 100%), transparent)",
          "text-secondary": "color-mix(in srgb, var(--cc-text-secondary) calc(<alpha-value> * 100%), transparent)",
          "text-muted": "color-mix(in srgb, var(--cc-text-muted) calc(<alpha-value> * 100%), transparent)",
          "text-faint": "color-mix(in srgb, var(--cc-text-faint) calc(<alpha-value> * 100%), transparent)",
          accent: "color-mix(in srgb, var(--cc-accent) calc(<alpha-value> * 100%), transparent)",
          "accent-hover": "color-mix(in srgb, var(--cc-accent-hover) calc(<alpha-value> * 100%), transparent)",
          "accent-deep": "color-mix(in srgb, var(--cc-accent-deep) calc(<alpha-value> * 100%), transparent)",
          "accent-muted": "color-mix(in srgb, var(--cc-accent-muted) calc(<alpha-value> * 100%), transparent)",
          "accent-glow": "color-mix(in srgb, var(--cc-accent-glow) calc(<alpha-value> * 100%), transparent)",
          "on-accent": "color-mix(in srgb, var(--cc-on-accent) calc(<alpha-value> * 100%), transparent)",
          success: "color-mix(in srgb, var(--cc-success) calc(<alpha-value> * 100%), transparent)",
          warning: "color-mix(in srgb, var(--cc-warning) calc(<alpha-value> * 100%), transparent)",
          danger: "color-mix(in srgb, var(--cc-danger) calc(<alpha-value> * 100%), transparent)",
          info: "color-mix(in srgb, var(--cc-info) calc(<alpha-value> * 100%), transparent)",
          "on-semantic": "color-mix(in srgb, var(--cc-on-semantic) calc(<alpha-value> * 100%), transparent)",
          "danger-pill-text": "color-mix(in srgb, var(--cc-danger-pill-text) calc(<alpha-value> * 100%), transparent)",
          link: "color-mix(in srgb, var(--cc-link) calc(<alpha-value> * 100%), transparent)",
          "link-hover": "color-mix(in srgb, var(--cc-link-hover) calc(<alpha-value> * 100%), transparent)",
          "skeleton-base": "color-mix(in srgb, var(--cc-skeleton-base) calc(<alpha-value> * 100%), transparent)",
          "skeleton-sheen": "color-mix(in srgb, var(--cc-skeleton-sheen) calc(<alpha-value> * 100%), transparent)",
          "chart-1": "color-mix(in srgb, var(--cc-chart-1) calc(<alpha-value> * 100%), transparent)",
          "chart-2": "color-mix(in srgb, var(--cc-chart-2) calc(<alpha-value> * 100%), transparent)",
          "chart-3": "color-mix(in srgb, var(--cc-chart-3) calc(<alpha-value> * 100%), transparent)",
          "chart-4": "color-mix(in srgb, var(--cc-chart-4) calc(<alpha-value> * 100%), transparent)",
          "chart-5": "color-mix(in srgb, var(--cc-chart-5) calc(<alpha-value> * 100%), transparent)",
          "chart-6": "color-mix(in srgb, var(--cc-chart-6) calc(<alpha-value> * 100%), transparent)",
          "chart-grid": "color-mix(in srgb, var(--cc-chart-grid) calc(<alpha-value> * 100%), transparent)",
          "chart-axis": "color-mix(in srgb, var(--cc-chart-axis) calc(<alpha-value> * 100%), transparent)",
          "chart-track": "color-mix(in srgb, var(--cc-chart-track) calc(<alpha-value> * 100%), transparent)",
        },
      },
      borderRadius: {
        // shadcn contract: stock components stay on --radius
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // brand radii (namespaced so they never repurpose the shadcn keys)
        "cc-sm": "var(--cc-radius-sm)",
        "cc-md": "var(--cc-radius-md)",
        "cc-lg": "var(--cc-radius-lg)",
        "cc-xl": "var(--cc-radius-xl)",
        "cc-2xl": "var(--cc-radius-2xl)",
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
        // new brand key only; default scale left intact for the rest of the app
        label: ["11px", { lineHeight: "1.25", letterSpacing: "var(--cc-tracking-label)" }],
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
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
