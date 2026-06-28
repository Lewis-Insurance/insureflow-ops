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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Lewis Insurance brand colors
        lewis: {
          blue: "hsl(var(--lewis-blue))",
          orange: "hsl(var(--lewis-orange))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
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
