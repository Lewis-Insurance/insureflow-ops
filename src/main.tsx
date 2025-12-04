import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeEnvironment } from "./config/validateEnv";

// Validate environment variables before starting the app
try {
  initializeEnvironment();
} catch (error) {
  console.error('Failed to initialize application:', error);
  // In production, show a user-friendly error page
  if (import.meta.env.PROD) {
    document.getElementById("root")!.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
        <div style="text-align: center; max-width: 500px; padding: 2rem;">
          <h1 style="color: #dc2626; margin-bottom: 1rem;">Configuration Error</h1>
          <p style="color: #6b7280;">The application is not properly configured. Please contact support.</p>
        </div>
      </div>
    `;
    throw error;
  }
}

createRoot(document.getElementById("root")!).render(<App />);
