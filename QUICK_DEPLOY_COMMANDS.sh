#!/bin/bash
# Quick deployment script for Prism API
# Run these commands one by one, replacing the placeholder values

echo "🚀 Deploying Prism API Edge Function..."
supabase functions deploy prism-api --project-ref lrqajzwcmdwahnjyidgv

echo ""
echo "🔑 Setting PRISM_SYSTEM_API_KEY..."
echo "⚠️  Replace 'sk_prism_your_actual_key_here' with your real API key!"
supabase secrets set PRISM_SYSTEM_API_KEY=sk_prism_your_actual_key_here --project-ref lrqajzwcmdwahnjyidgv

echo ""
echo "🌐 Setting PRISM_SERVICE_URL..."
echo "⚠️  Replace 'https://your-prism-service.com' with your real Prism service URL!"
supabase secrets set PRISM_SERVICE_URL=https://your-prism-service.com --project-ref lrqajzwcmdwahnjyidgv

echo ""
echo "✅ Verifying secrets..."
supabase secrets list --project-ref lrqajzwcmdwahnjyidgv

echo ""
echo "🎉 Deployment complete! Test at /prism-ai in your app."

