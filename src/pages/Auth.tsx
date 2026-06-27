import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, AlertCircle, ArrowRight, Lock, ArrowUp, CheckCircle2 } from 'lucide-react';
import '../styles/auth-login.css';

// Feature flags via environment variables with safe defaults
const ENABLE_SIGNUP = (import.meta.env.VITE_ENABLE_SIGNUP ?? 'false') === 'true';
const REQUIRE_MFA = (import.meta.env.VITE_REQUIRE_MFA ?? 'false') === 'true';
const REQUIRE_PHONE_VERIFICATION = (import.meta.env.VITE_REQUIRE_PHONE ?? 'false') === 'true';
const MIN_PASSWORD_LENGTH = Number(import.meta.env.VITE_MIN_PW_LEN ?? 12);

/* InsureFlow mark — vector stand-in for the official logo.
   TODO(brand): replace with the vectorized official logo (full-color + reversed). */
function IFLogo({ variant, sm }: { variant: 'color' | 'reversed'; sm?: boolean }) {
  const waves = variant === 'reversed' ? '#FFFFFF' : '#143A5E';
  return (
    <span className={`if-logo${sm ? ' sm' : ''}`}>
      <svg className="if-emblem" viewBox="0 0 64 64" aria-hidden="true" fill="none">
        <path d="M22 10C16 11 12 13 12 16L12 34C12 46 22 54 32 58C42 54 52 46 52 34L52 16C52 13 48 11 42 10"
          stroke="#E8772E" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="14" r="2.6" fill="#E8772E" />
        <path d="M16 30C21.5 26 26.5 34 32 30C37.5 26 42.5 34 48 30" stroke={waves} strokeWidth="4.4" strokeLinecap="round" />
        <path d="M16 38C21.5 34 26.5 42 32 38C37.5 34 42.5 42 48 38" stroke={waves} strokeWidth="4.4" strokeLinecap="round" />
      </svg>
      <span className="if-wordmark"><b>Insure<span className="o">Flow</span></b></span>
    </span>
  );
}

const WAVE_BACK = 'M0,62 q120,-30 240,0 q120,30 240,0 q120,-30 240,0 q120,30 240,0 q120,-30 240,0 q120,30 240,0 q120,-30 240,0 q120,30 240,0 q120,-30 240,0 q120,30 240,0 q120,-30 240,0 q120,30 240,0 L2880,160 L0,160 Z';
const WAVE_MID = 'M0,96 q120,-26 240,0 q120,26 240,0 q120,-26 240,0 q120,26 240,0 q120,-26 240,0 q120,26 240,0 q120,-26 240,0 q120,26 240,0 q120,-26 240,0 q120,26 240,0 q120,-26 240,0 q120,26 240,0 L2880,160 L0,160 Z';
const WAVE_FRONT = 'M0,120 q120,-22 240,0 q120,22 240,0 q120,-22 240,0 q120,22 240,0 q120,-22 240,0 q120,22 240,0 q120,-22 240,0 q120,22 240,0 q120,-22 240,0 q120,22 240,0 q120,-22 240,0 q120,22 240,0 L2880,160 L0,160 Z';

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
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading…</p>
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
    <div className="if-auth">
      {/* ---------- brand panel ---------- */}
      <section className="if-brand">
        <div className="if-tide" aria-hidden="true">
          <div className="if-wave back"><svg viewBox="0 0 2880 160" preserveAspectRatio="none"><path d={WAVE_BACK} fill="#11314F" /></svg></div>
          <div className="if-wave mid"><svg viewBox="0 0 2880 160" preserveAspectRatio="none"><path d={WAVE_MID} fill="#0C2742" /></svg></div>
          <div className="if-wave front"><svg viewBox="0 0 2880 160" preserveAspectRatio="none"><path d={WAVE_FRONT} fill="#08203A" /></svg></div>
        </div>
        <div className="if-horizon" aria-hidden="true" />
        <div className="if-glow" aria-hidden="true" />
        <div className="if-grain" aria-hidden="true" />
        <svg className="if-watermark" viewBox="0 0 64 64" aria-hidden="true" fill="none">
          <path d="M22 10C16 11 12 13 12 16L12 34C12 46 22 54 32 58C42 54 52 46 52 34L52 16C52 13 48 11 42 10" stroke="currentColor" strokeWidth="2.4" />
          <path d="M16 30C21.5 26 26.5 34 32 30C37.5 26 42.5 34 48 30" stroke="currentColor" strokeWidth="3" />
          <path d="M16 38C21.5 34 26.5 42 32 38C37.5 34 42.5 42 48 38" stroke="currentColor" strokeWidth="3" />
        </svg>

        <div className="if-reveal" style={{ animationDelay: '.05s' }}><IFLogo variant="reversed" /></div>

        <div className="if-mid if-reveal" style={{ animationDelay: '.12s' }}>
          <div className="if-eyebrow">Agency Operating System</div>
          <h2 className="if-headline">Every client, in one current.</h2>
          <p className="if-sub">Where every policy, quote, and renewal keeps moving, and stays protected.</p>
        </div>

        <div className="if-anchor if-reveal" style={{ animationDelay: '.18s' }}>
          <span>by Lewis Insurance</span><span className="if-dot" /><span>Lake City, FL</span><span className="if-dot" /><span>Since 1981</span>
        </div>
      </section>

      {/* ---------- auth column ---------- */}
      <section className="if-col">
        <div className="if-inner">
          <div className="if-collogo if-reveal" style={{ animationDelay: '.10s' }}><IFLogo variant="color" sm /></div>

          {mode === 'signin' ? (
            <>
              <h1 className="if-title if-reveal" style={{ animationDelay: '.16s' }}>Welcome back</h1>
              <p className="if-subtitle if-reveal" style={{ animationDelay: '.20s' }}>Sign in to your InsureFlow workspace</p>

              {notice && (
                <div className={`if-banner if-reveal${notice.type === 'ok' ? ' ok' : ''}`} role="status" aria-live="polite" style={{ marginTop: 22 }}>
                  {notice.type === 'ok' ? <CheckCircle2 /> : <AlertCircle />}<span>{notice.text}</span>
                </div>
              )}
              {signInErrors.general && (
                <div className="if-banner if-reveal" role="alert" aria-live="polite" style={{ marginTop: 22 }}>
                  <AlertCircle /><span>{signInErrors.general}</span>
                </div>
              )}

              <form onSubmit={handleSignIn} noValidate style={{ marginTop: 22 }}>
                <div className="if-field if-reveal" style={{ animationDelay: '.26s' }}>
                  <label className="if-label" htmlFor="signin-email">Email</label>
                  <div className="if-control">
                    <input
                      id="signin-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                      autoComplete="email" placeholder="you@lewisinsurance.com" autoFocus
                      className={`if-input${signInErrors.email ? ' invalid' : ''}`}
                      value={signInData.email}
                      onChange={(e) => { setSignInData({ ...signInData, email: e.target.value }); if (signInErrors.email) { const n = { ...signInErrors }; delete n.email; setSignInErrors(n); } }}
                      aria-invalid={!!signInErrors.email}
                      aria-describedby={signInErrors.email ? 'signin-email-error' : undefined}
                      required
                    />
                  </div>
                  {signInErrors.email && <p id="signin-email-error" className="if-fielderror"><AlertCircle />{signInErrors.email}</p>}
                </div>

                <div className="if-field if-haspw if-reveal" style={{ animationDelay: '.30s' }}>
                  <label className="if-label" htmlFor="signin-password">Password</label>
                  <div className="if-control">
                    <input
                      id="signin-password" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                      placeholder="Enter your password"
                      className={`if-input${signInErrors.password ? ' invalid' : ''}`}
                      value={signInData.password}
                      onKeyUp={onPwKey} onKeyDown={onPwKey} onBlur={() => setCapsOn(false)}
                      onChange={(e) => { setSignInData({ ...signInData, password: e.target.value }); if (signInErrors.password) { const n = { ...signInErrors }; delete n.password; setSignInErrors(n); } }}
                      aria-invalid={!!signInErrors.password}
                      aria-describedby={signInErrors.password ? 'signin-password-error' : undefined}
                      required
                    />
                    <button type="button" className="if-pwtoggle" aria-pressed={showPw}
                      aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((s) => !s)}>
                      {showPw ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {capsOn && <p className="if-caps"><ArrowUp />Caps Lock is on</p>}
                  {signInErrors.password && <p id="signin-password-error" className="if-fielderror"><AlertCircle />{signInErrors.password}</p>}
                </div>

                <div className="if-row if-reveal" style={{ animationDelay: '.34s' }}>
                  <button type="button" className="if-link" onClick={handleForgot}>Forgot password?</button>
                </div>

                <button type="submit" className="if-btn if-reveal" style={{ animationDelay: '.38s' }} disabled={isLoading} aria-busy={isLoading}>
                  {isLoading ? (<><span className="if-spinner" />Signing in…</>) : (<>Sign in<ArrowRight className="if-arrow" width={17} height={17} /></>)}
                </button>
              </form>

              {ENABLE_SIGNUP && (
                <p className="if-toggle if-reveal" style={{ animationDelay: '.44s' }}>
                  Need an account? <button type="button" className="if-link" onClick={() => { setMode('signup'); setNotice(null); }}>Create one</button>
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="if-title">Create your account</h1>
              <p className="if-subtitle">New accounts start with customer access. An admin grants staff roles.</p>

              {signUpErrors.general && (
                <div className="if-banner" role="alert" aria-live="polite" style={{ marginTop: 22 }}>
                  <AlertCircle /><span>{signUpErrors.general}</span>
                </div>
              )}

              <form onSubmit={handleSignUp} noValidate style={{ marginTop: 22 }}>
                <div className="if-field">
                  <label className="if-label" htmlFor="signup-name">Full name</label>
                  <div className="if-control">
                    <input id="signup-name" type="text" autoComplete="name" placeholder="Your full name"
                      className={`if-input${signUpErrors.fullName ? ' invalid' : ''}`} value={signUpData.fullName}
                      onChange={(e) => { setSignUpData({ ...signUpData, fullName: e.target.value }); if (signUpErrors.fullName) { const n = { ...signUpErrors }; delete n.fullName; setSignUpErrors(n); } }}
                      aria-invalid={!!signUpErrors.fullName} required />
                  </div>
                  {signUpErrors.fullName && <p className="if-fielderror"><AlertCircle />{signUpErrors.fullName}</p>}
                </div>
                <div className="if-field">
                  <label className="if-label" htmlFor="signup-email">Email</label>
                  <div className="if-control">
                    <input id="signup-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                      autoComplete="email" placeholder="you@lewisinsurance.com"
                      className={`if-input${signUpErrors.email ? ' invalid' : ''}`} value={signUpData.email}
                      onChange={(e) => { setSignUpData({ ...signUpData, email: e.target.value }); if (signUpErrors.email) { const n = { ...signUpErrors }; delete n.email; setSignUpErrors(n); } }}
                      aria-invalid={!!signUpErrors.email} required />
                  </div>
                  {signUpErrors.email && <p className="if-fielderror"><AlertCircle />{signUpErrors.email}</p>}
                </div>
                <div className="if-field if-haspw">
                  <label className="if-label" htmlFor="signup-password">Password</label>
                  <div className="if-control">
                    <input id="signup-password" type={showPw ? 'text' : 'password'} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
                      placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                      className={`if-input${signUpErrors.password ? ' invalid' : ''}`} value={signUpData.password}
                      onKeyUp={onPwKey} onKeyDown={onPwKey} onBlur={() => setCapsOn(false)}
                      onChange={(e) => { setSignUpData({ ...signUpData, password: e.target.value }); if (signUpErrors.password) { const n = { ...signUpErrors }; delete n.password; setSignUpErrors(n); } }}
                      aria-invalid={!!signUpErrors.password} required />
                    <button type="button" className="if-pwtoggle" aria-pressed={showPw} aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((s) => !s)}>
                      {showPw ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {capsOn && <p className="if-caps"><ArrowUp />Caps Lock is on</p>}
                  {signUpErrors.password && <p className="if-fielderror"><AlertCircle />{signUpErrors.password}</p>}
                </div>
                <button type="submit" className="if-btn" disabled={isLoading} aria-busy={isLoading} style={{ marginTop: 4 }}>
                  {isLoading ? (<><span className="if-spinner" />Creating account…</>) : (<>Create account<ArrowRight className="if-arrow" width={17} height={17} /></>)}
                </button>
              </form>

              <p className="if-toggle">
                Already have an account? <button type="button" className="if-link" onClick={() => { setMode('signin'); setSignUpErrors({}); }}>Sign in</button>
              </p>
            </>
          )}

          <p className="if-foot if-reveal" style={{ animationDelay: '.5s' }}>
            <span className="lock"><Lock />Authorized staff only · Encrypted connection</span><br />
            <b>InsureFlow</b> · by Lewis Insurance · Since 1981
          </p>
        </div>
      </section>
    </div>
  );
}
