import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Enable code splitting for better performance
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal loading
        manualChunks: (id) => {
          // Vendor chunks - split by package
          if (id.includes('node_modules')) {
            // React ecosystem - split further
            if (id.includes('react-dom')) {
              return 'react-dom-vendor';
            }
            if (id.includes('react-router')) {
              return 'react-router-vendor';
            }
            if (id.includes('react') && !id.includes('react-dom') && !id.includes('react-router')) {
              return 'react-vendor';
            }

            // Query & state management
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor';
            }

            // Chart libraries (often large)
            if (id.includes('recharts')) {
              return 'charts-vendor';
            }

            // Icon libraries
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }

            // Date utilities
            if (id.includes('date-fns')) {
              return 'date-vendor';
            }

            // Form libraries
            if (id.includes('react-hook-form') || id.includes('zod')) {
              return 'forms-vendor';
            }

            // Supabase
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }

            // Shadcn/ui components (Radix)
            if (id.includes('@radix-ui')) {
              return 'radix-vendor';
            }

            // Table libraries
            if (id.includes('@tanstack/react-table')) {
              return 'table-vendor';
            }

            // DnD libraries
            if (id.includes('@dnd-kit') || id.includes('dnd')) {
              return 'dnd-vendor';
            }

            // Other node_modules
            return 'vendor';
          }

          // Feature-based chunks
          if (id.includes('/src/components/crm/')) {
            return 'crm-features';
          }
          if (id.includes('/src/components/ai/')) {
            return 'ai-features';
          }
          if (id.includes('/src/components/communications/')) {
            return 'communications-features';
          }
          if (id.includes('/src/components/predictive/')) {
            return 'predictive-features';
          }
          if (id.includes('/src/components/tasks/')) {
            return 'tasks-features';
          }
          if (id.includes('/src/components/quotes/')) {
            return 'quotes-features';
          }
          if (id.includes('/src/components/renewals/')) {
            return 'renewals-features';
          }
          if (id.includes('/src/components/ao-renewals/')) {
            return 'ao-renewals-features';
          }
          if (id.includes('/src/components/leads/')) {
            return 'leads-features';
          }
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (can disable for smaller builds)
    sourcemap: mode === 'production' ? false : true,
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove console logs in production
        drop_debugger: mode === 'production',
        passes: 2, // Multiple passes for better compression
      },
      mangle: {
        safari10: true, // Safari 10 compatibility
      },
    },
    // Target modern browsers for smaller bundle
    target: 'es2020',
    // CSS code splitting
    cssCodeSplit: true,
    // Asset inlining threshold
    assetsInlineLimit: 4096, // 4kb - inline smaller assets as base64
  },
  // Asset optimization
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.webp'],
  // Image optimization
  esbuild: {
    legalComments: 'none', // Remove comments in production
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@supabase/supabase-js',
    ],
  },
}));
