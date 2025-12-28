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
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunking for optimal caching and loading
          if (id.includes('node_modules')) {
            // PDF libraries - large, rarely used (load on demand)
            if (id.includes('jspdf') || id.includes('pdf-lib') || id.includes('html2canvas')) {
              return 'vendor-pdf';
            }
            // Chart libraries (recharts + d3)
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
              return 'vendor-charts';
            }
            // Drag and drop
            if (id.includes('dnd') || id.includes('beautiful-dnd')) {
              return 'vendor-dnd';
            }
            // Date utilities
            if (id.includes('date-fns') || id.includes('dayjs') || id.includes('moment')) {
              return 'vendor-dates';
            }
            // TanStack (React Query, Table) - before react check
            if (id.includes('@tanstack')) {
              return 'vendor-tanstack';
            }
            // Radix UI components
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }
            // Icons (Lucide)
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Form handling
            if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
              return 'vendor-forms';
            }
            // Supabase
            if (id.includes('@supabase') || id.includes('supabase')) {
              return 'vendor-supabase';
            }
            // Editor / Rich text
            if (id.includes('tiptap') || id.includes('prosemirror') || id.includes('lexical')) {
              return 'vendor-editor';
            }
            // Animation
            if (id.includes('framer-motion') || id.includes('react-spring')) {
              return 'vendor-animation';
            }
            // Validation / Schema
            if (id.includes('yup') || id.includes('ajv') || id.includes('joi')) {
              return 'vendor-validation';
            }
            // HTTP / API clients
            if (id.includes('axios') || id.includes('ky') || id.includes('got')) {
              return 'vendor-http';
            }
            // State management
            if (id.includes('zustand') || id.includes('jotai') || id.includes('recoil') || id.includes('redux')) {
              return 'vendor-state';
            }
            // Markdown / Syntax highlighting
            if (id.includes('marked') || id.includes('highlight') || id.includes('prism')) {
              return 'vendor-markdown';
            }
            // Core React (just react and react-dom)
            if (id.includes('/react@') || id.includes('/react-dom@') || id.includes('react-dom/')) {
              return 'vendor-react-core';
            }
            // React Router
            if (id.includes('react-router') || id.includes('@remix-run/router')) {
              return 'vendor-router';
            }
            // Other React ecosystem (react-* packages)
            if (id.includes('react-')) {
              return 'vendor-react-ecosystem';
            }
            // Utility libraries
            if (id.includes('lodash') || id.includes('ramda') || id.includes('immer')) {
              return 'vendor-utils';
            }
            // Everything else
            return 'vendor-misc';
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
