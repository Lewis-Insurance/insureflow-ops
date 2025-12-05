/**
 * Health check to diagnose production issues
 * This runs before the app initializes to catch configuration problems
 */

export function runHealthCheck(): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check 1: Supabase URL
  const supabaseUrl = 'https://lrqajzwcmdwahnjyidgv.supabase.co';
  if (!supabaseUrl || !supabaseUrl.startsWith('https://')) {
    errors.push('Invalid Supabase URL');
  }

  // Check 2: Supabase Key
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWFqendjbWR3YWhuanlpZGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyODk5OTksImV4cCI6MjA3Mjg2NTk5OX0.Pyob4fMYhHjHhVCxhP2UdSSMAv6i9eqmLD-lxavfV5s';
  if (!supabaseKey || supabaseKey.length < 100) {
    errors.push('Invalid Supabase publishable key');
  }

  // Check 3: DOM ready
  if (typeof document === 'undefined') {
    errors.push('Document not available (SSR?)');
  }

  // Check 4: Root element exists
  if (typeof document !== 'undefined' && !document.getElementById('root')) {
    errors.push('Root element not found');
  }

  // Check 5: localStorage available
  try {
    localStorage.setItem('health-check', 'ok');
    localStorage.removeItem('health-check');
  } catch (e) {
    errors.push('localStorage not available');
  }

  const success = errors.length === 0;

  if (!success) {
    console.error('❌ Health check failed:', errors);
  } else {
    console.log('✅ Health check passed');
  }

  return { success, errors };
}
