import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, AlertCircle, Lock, ArrowUp, CheckCircle2 } from 'lucide-react';

// Feature flags via environment variables with safe defaults
const ENABLE_SIGNUP = (import.meta.env.VITE_ENABLE_SIGNUP ?? 'false') === 'true';
const REQUIRE_MFA = (import.meta.env.VITE_REQUIRE_MFA ?? 'false') === 'true';
const REQUIRE_PHONE_VERIFICATION = (import.meta.env.VITE_REQUIRE_PHONE ?? 'false') === 'true';
const MIN_PASSWORD_LENGTH = Number(import.meta.env.VITE_MIN_PW_LEN ?? 12);

// Field classes shared by every input on this surface (cc Input spec).
const INPUT_BASE =
  'h-10 w-full rounded-cc-md border bg-cc-surface-raised px-3 text-cc-text-primary placeholder:text-cc-text-muted';

export default function Auth() {
  const { signIn, signUp, loading, isAuthenticated, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [signInErrors, setSignInErrors] = useState<Record<string, string>>({});
  const [signUpErrors, setSignUpErrors] = useState<Record<string, string>>({});
  const [signInData, setSignInData] = useState({ email: '', password: '' });
  const [signUpData, setSignUpData] = useState({ email: '', password: '', fullName: '' });

  // Prevent redirect flicker while auth is loading
  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-cc-bg p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-cc-border-subtle border-t-cc-accent" />
          <p className="text-cc-text-muted">Loading</p>
        </div>
      </div>
    );
  }

  // Authenticated users: enforce security setup, else go home
  if (isAuthenticated) {
    const needsMfaSetup = REQUIRE_MFA && !profile?.mfa_enabled;
    const needsPhoneVerification = REQUIRE_PHONE_VERIFICATION && !profile?.phone_verified;
    if (needsMfaSetup || needsPhoneVerification) {
      return <Navigate to="/profile?tab=security" replace />;
    }
    return <Navigate to="/" replace />;
  }

  const validateSignInForm = () => {
    const errors: Record<string, string> = {};
    if (!signInData.email) errors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(signInData.email)) errors.email = 'Please enter a valid email address';
    if (!signInData.password) errors.password = 'Password is required';
    setSignInErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignUpForm = () => {
    const errors: Record<string, string> = {};
    if (!signUpData.fullName.trim()) errors.fullName = 'Full name is required';
    if (!signUpData.email) errors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(signUpData.email)) errors.email = 'Please enter a valid email address';
    if (!signUpData.password) errors.password = 'Password is required';
    else if (signUpData.password.length < MIN_PASSWORD_LENGTH) errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
    setSignUpErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !validateSignInForm()) return;
    setIsLoading(true);
    setSignInErrors({});
    setNotice(null);
    try {
      const email = signInData.email.trim().toLowerCase();
      const password = signInData.password; // Don't trim passwords
      const result = await signIn(email, password);
      if (result.error) {
        // Generic message to avoid auth enumeration
        setSignInErrors({ general: "That email or password didn't match. Try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !validateSignUpForm()) return;
    setIsLoading(true);
    setSignUpErrors({});
    setNotice(null);
    try {
      const email = signUpData.email.trim().toLowerCase();
      const password = signUpData.password;
      const fullName = signUpData.fullName.trim();
      const result = await signUp(email, password, fullName);
      if (result.error) {
        const msg = result.error.message.toLowerCase().includes('already registered')
          ? 'An account with this email already exists.'
          : 'Unable to create account. Please try again.';
        setSignUpErrors({ general: msg });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Sends a Supabase reset email. (Reset-completion page is a documented follow-up.)
  const handleForgot = async () => {
    const email = signInData.email.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setSignInErrors((p) => ({ ...p, email: 'Enter your email above first, then tap reset.' }));
      return;
    }
    try {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` });
    } catch {
      /* no-op: never reveal whether an email exists */
    }
    setNotice({ type: 'ok', text: 'If that email is registered, a reset link is on its way.' });
  };

  const onPwKey = (e: React.KeyboardEvent) => {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'));
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-cc-bg p-4">
      <main className="w-full max-w-[400px] rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-8 shadow-card">
        {/* Real Lewis Insurance logo, reused from AppLayout. Never a fabricated mark. */}
        <div className="flex justify-center">
          <img
            src="/lovable-uploads/638e588a-8405-4da7-8119-439f406132da.png"
            alt="Lewis Insurance"
            className="h-16 w-auto"
          />
        </div>

        {mode === 'signin' ? (
          <>
            <h1 className="mt-6 text-center text-2xl font-semibold text-cc-text-primary">Welcome back</h1>
            <p className="mt-1 text-center text-sm text-cc-text-muted">Sign in to your workspace</p>

            {notice && (
              <div
                className={`mt-6 flex items-start gap-2 rounded-cc-md border px-3 py-2.5 text-sm ${
                  notice.type === 'ok'
                    ? 'border-cc-border-subtle bg-cc-surface-raised text-cc-text-secondary'
                    : 'border-cc-danger bg-cc-surface-raised text-cc-danger'
                }`}
                role="status"
                aria-live="polite"
              >
                {notice.type === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
            )}
            {signInErrors.general && (
              <div
                className="mt-6 flex items-start gap-2 rounded-cc-md border border-cc-danger bg-cc-surface-raised px-3 py-2.5 text-sm text-cc-danger"
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{signInErrors.general}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} noValidate className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-cc-text-secondary" htmlFor="signin-email">
                  Email
                </label>
                <input
                  id="signin-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  placeholder="you@lewisinsurance.com"
                  autoFocus
                  className={`${INPUT_BASE} ${signInErrors.email ? 'border-cc-danger' : 'border-cc-border-interactive'}`}
                  value={signInData.email}
                  onChange={(e) => { setSignInData({ ...signInData, email: e.target.value }); if (signInErrors.email) { const n = { ...signInErrors }; delete n.email; setSignInErrors(n); } }}
                  aria-invalid={!!signInErrors.email}
                  aria-describedby={signInErrors.email ? 'signin-email-error' : undefined}
                  required
                />
                {signInErrors.email && (
                  <p id="signin-email-error" className="mt-1.5 flex items-center gap-1.5 text-sm text-cc-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {signInErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-cc-text-secondary" htmlFor="signin-password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signin-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className={`${INPUT_BASE} pr-11 ${signInErrors.password ? 'border-cc-danger' : 'border-cc-border-interactive'}`}
                    value={signInData.password}
                    onKeyUp={onPwKey}
                    onKeyDown={onPwKey}
                    onBlur={() => setCapsOn(false)}
                    onChange={(e) => { setSignInData({ ...signInData, password: e.target.value }); if (signInErrors.password) { const n = { ...signInErrors }; delete n.password; setSignInErrors(n); } }}
                    aria-invalid={!!signInErrors.password}
                    aria-describedby={signInErrors.password ? 'signin-password-error' : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-cc-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                    aria-pressed={showPw}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((s) => !s)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {capsOn && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-cc-text-secondary">
                    <ArrowUp className="h-4 w-4 shrink-0" />
                    Caps Lock is on
                  </p>
                )}
                {signInErrors.password && (
                  <p id="signin-password-error" className="mt-1.5 flex items-center gap-1.5 text-sm text-cc-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {signInErrors.password}
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-cc-link hover:text-cc-link-hover"
                  onClick={handleForgot}
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                data-primary
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
              >
                {isLoading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-cc-on-accent/40 border-t-cc-on-accent" />
                    Signing in
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            {ENABLE_SIGNUP && (
              <p className="mt-6 text-center text-sm text-cc-text-muted">
                Need an account?{' '}
                <button
                  type="button"
                  className="text-cc-link hover:text-cc-link-hover"
                  onClick={() => { setMode('signup'); setNotice(null); }}
                >
                  Create one
                </button>
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-6 text-center text-2xl font-semibold text-cc-text-primary">Create your account</h1>
            <p className="mt-1 text-center text-sm text-cc-text-muted">
              New accounts start with customer access. An admin grants staff roles.
            </p>

            {signUpErrors.general && (
              <div
                className="mt-6 flex items-start gap-2 rounded-cc-md border border-cc-danger bg-cc-surface-raised px-3 py-2.5 text-sm text-cc-danger"
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{signUpErrors.general}</span>
              </div>
            )}

            <form onSubmit={handleSignUp} noValidate className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-cc-text-secondary" htmlFor="signup-name">
                  Full name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your full name"
                  className={`${INPUT_BASE} ${signUpErrors.fullName ? 'border-cc-danger' : 'border-cc-border-interactive'}`}
                  value={signUpData.fullName}
                  onChange={(e) => { setSignUpData({ ...signUpData, fullName: e.target.value }); if (signUpErrors.fullName) { const n = { ...signUpErrors }; delete n.fullName; setSignUpErrors(n); } }}
                  aria-invalid={!!signUpErrors.fullName}
                  required
                />
                {signUpErrors.fullName && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-cc-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {signUpErrors.fullName}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-cc-text-secondary" htmlFor="signup-email">
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  placeholder="you@lewisinsurance.com"
                  className={`${INPUT_BASE} ${signUpErrors.email ? 'border-cc-danger' : 'border-cc-border-interactive'}`}
                  value={signUpData.email}
                  onChange={(e) => { setSignUpData({ ...signUpData, email: e.target.value }); if (signUpErrors.email) { const n = { ...signUpErrors }; delete n.email; setSignUpErrors(n); } }}
                  aria-invalid={!!signUpErrors.email}
                  required
                />
                {signUpErrors.email && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-cc-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {signUpErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-cc-text-secondary" htmlFor="signup-password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    className={`${INPUT_BASE} pr-11 ${signUpErrors.password ? 'border-cc-danger' : 'border-cc-border-interactive'}`}
                    value={signUpData.password}
                    onKeyUp={onPwKey}
                    onKeyDown={onPwKey}
                    onBlur={() => setCapsOn(false)}
                    onChange={(e) => { setSignUpData({ ...signUpData, password: e.target.value }); if (signUpErrors.password) { const n = { ...signUpErrors }; delete n.password; setSignUpErrors(n); } }}
                    aria-invalid={!!signUpErrors.password}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-cc-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                    aria-pressed={showPw}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((s) => !s)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {capsOn && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-cc-text-secondary">
                    <ArrowUp className="h-4 w-4 shrink-0" />
                    Caps Lock is on
                  </p>
                )}
                {signUpErrors.password && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-cc-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {signUpErrors.password}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                data-primary
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
              >
                {isLoading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-cc-on-accent/40 border-t-cc-on-accent" />
                    Creating account
                  </>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-cc-text-muted">
              Already have an account?{' '}
              <button
                type="button"
                className="text-cc-link hover:text-cc-link-hover"
                onClick={() => { setMode('signin'); setSignUpErrors({}); }}
              >
                Sign in
              </button>
            </p>
          </>
        )}

        <div className="mt-8 border-t border-cc-border-subtle pt-4 text-center text-xs text-cc-text-muted">
          <p className="flex items-center justify-center gap-1.5">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Authorized staff only · Encrypted connection
          </p>
          <p className="mt-1">by Lewis Insurance · Since 1981</p>
        </div>
      </main>
    </div>
  );
}
