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
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'ui-vendor': ['lucide-react', 'date-fns', 'recharts'],
          'supabase-vendor': ['@supabase/supabase-js'],

          // Feature chunks (lazy loaded pages will be separate)
          'crm-features': [
            './src/components/crm/AccountList.tsx',
            './src/components/crm/LeadList.tsx',
            './src/components/crm/GlobalSearch.tsx',
          ],
          'ai-features': [
            './src/components/ai/AIAssistantChat.tsx',
            './src/components/ai/AIAssistantModal.tsx',
            './src/components/ai/AIAssistantSidebar.tsx',
          ],
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
      },
    },
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
