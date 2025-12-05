import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Query & state management
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor';
            }
            // UI libraries
            if (id.includes('lucide-react') || id.includes('date-fns') || id.includes('recharts')) {
              return 'ui-vendor';
            }
            // Supabase
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            // Shadcn/ui components
            if (id.includes('@radix-ui')) {
              return 'radix-vendor';
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
