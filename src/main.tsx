import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeEnvironment } from "./config/validateEnv";
import { runHealthCheck } from "./health-check";

// Run health check first
console.log('🏥 Running health check...');
const healthCheck = runHealthCheck();

if (!healthCheck.success) {
  console.error('❌ Health check failed:', healthCheck.errors);
  const rootEl = document.getElementById("root");
  if (rootEl) {
    rootEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; background: #f9fafb;">
        <div style="text-align: center; max-width: 600px; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h1 style="color: #dc2626; margin-bottom: 1rem;">⚠️ Configuration Error</h1>
          <p style="color: #6b7280; margin-bottom: 1rem;">The application failed health checks:</p>
          <ul style="color: #ef4444; text-align: left; margin: 0 auto; max-width: 400px;">
            ${healthCheck.errors.map(err => `<li>${err}</li>`).join('')}
          </ul>
          <p style="color: #9ca3af; margin-top: 1.5rem; font-size: 0.875rem;">Please check browser console for details.</p>
        </div>
      </div>
    `;
  }
  throw new Error('Health check failed: ' + healthCheck.errors.join(', '));
}

// Validate environment variables before starting the app
try {
  console.log('🔧 Initializing environment...');
  initializeEnvironment();
  console.log('✅ Environment initialized');
} catch (error) {
  console.error('❌ Failed to initialize application:', error);
  // In production, show a user-friendly error page
  if (import.meta.env.PROD) {
    const rootEl = document.getElementById("root");
    if (rootEl) {
      rootEl.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; background: #f9fafb;">
          <div style="text-align: center; max-width: 500px; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h1 style="color: #dc2626; margin-bottom: 1rem;">⚠️ Initialization Error</h1>
            <p style="color: #6b7280;">The application failed to start. Please contact support.</p>
            <p style="color: #9ca3af; margin-top: 1rem; font-size: 0.875rem;">Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      `;
    }
    throw error;
  }
}

console.log('🚀 Starting React app...');
try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error('Root element not found');
  }
  createRoot(rootElement).render(<App />);
  console.log('✅ React app rendered');
} catch (error) {
  console.error('❌ Failed to render React app:', error);
  throw error;
}
