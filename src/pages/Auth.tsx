import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { Shield, AlertCircle } from 'lucide-react';

// Feature flags
const ENABLE_SIGNUP = true; // Set to false for invite-only organizations
const REQUIRE_MFA = false; // Set to true if MFA is mandatory
const REQUIRE_PHONE_VERIFICATION = false; // Set to true if phone verification is mandatory
const MIN_PASSWORD_LENGTH = 8;

export default function Auth() {
  const { signIn, signUp, loading, isAuthenticated, user, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  // Error states for inline validation
  const [signInErrors, setSignInErrors] = useState<{[key: string]: string}>({});
  const [signUpErrors, setSignUpErrors] = useState<{[key: string]: string}>({});

  const [signInData, setSignInData] = useState({
    email: '',
    password: ''
  });

  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    fullName: ''
  });

  // Check if authenticated user needs additional setup
  if (isAuthenticated && user && profile) {
    const needsMfaSetup = REQUIRE_MFA && !profile.mfa_enabled;
    const needsPhoneVerification = REQUIRE_PHONE_VERIFICATION && !profile.phone_verified;
    
    if (needsMfaSetup || needsPhoneVerification) {
      return <Navigate to="/profile?tab=security" replace />;
    }
    
    return <Navigate to="/" replace />;
  }

  const validateSignInForm = () => {
    const errors: {[key: string]: string} = {};
    
    if (!signInData.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(signInData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!signInData.password) {
      errors.password = 'Password is required';
    }
    
    setSignInErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignUpForm = () => {
    const errors: {[key: string]: string} = {};
    
    if (!signUpData.fullName.trim()) {
      errors.fullName = 'Full name is required';
    }
    
    if (!signUpData.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(signUpData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!signUpData.password) {
      errors.password = 'Password is required';
    } else if (signUpData.password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
    }
    
    setSignUpErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLoading || !validateSignInForm()) return;
    
    setIsLoading(true);
    setSignInErrors({});
    
    const result = await signIn(signInData.email, signInData.password);
    
    if (result.error) {
      setSignInErrors({ general: result.error.message });
    }
    
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLoading || !validateSignUpForm()) return;
    
    setIsLoading(true);
    setSignUpErrors({});
    
    const result = await signUp(signUpData.email, signUpData.password, signUpData.fullName);
    
    if (result.error) {
      setSignUpErrors({ general: result.error.message });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <img 
            src="/lovable-uploads/638e588a-8405-4da7-8119-439f406132da.png" 
            alt="Lewis Insurance"
            className="h-48 w-auto"
            width="192"
            height="192"
          />
          <p className="text-muted-foreground text-center">
            Agency Management System
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Authentication Required</CardTitle>
            </div>
            <CardDescription>
              Sign in to access the agency management system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className={`grid w-full ${ENABLE_SIGNUP ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                {ENABLE_SIGNUP && <TabsTrigger value="signup">Sign Up</TabsTrigger>}
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  {signInErrors.general && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{signInErrors.general}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="Enter your email"
                      autoComplete="email"
                      value={signInData.email}
                      onChange={(e) => {
                        setSignInData({ ...signInData, email: e.target.value });
                        if (signInErrors.email) {
                          setSignInErrors({ ...signInErrors, email: '' });
                        }
                      }}
                      aria-invalid={!!signInErrors.email}
                      aria-describedby={signInErrors.email ? "signin-email-error" : undefined}
                      required
                    />
                    {signInErrors.email && (
                      <p id="signin-email-error" className="text-sm text-destructive">
                        {signInErrors.email}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      value={signInData.password}
                      onChange={(e) => {
                        setSignInData({ ...signInData, password: e.target.value });
                        if (signInErrors.password) {
                          setSignInErrors({ ...signInErrors, password: '' });
                        }
                      }}
                      aria-invalid={!!signInErrors.password}
                      aria-describedby={signInErrors.password ? "signin-password-error" : undefined}
                      required
                    />
                    {signInErrors.password && (
                      <p id="signin-password-error" className="text-sm text-destructive">
                        {signInErrors.password}
                      </p>
                    )}
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading || loading}
                    aria-busy={isLoading || loading}
                  >
                    {isLoading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>
              
              {ENABLE_SIGNUP && (
                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    {signUpErrors.general && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{signUpErrors.general}</AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Enter your full name"
                        autoComplete="name"
                        value={signUpData.fullName}
                        onChange={(e) => {
                          setSignUpData({ ...signUpData, fullName: e.target.value });
                          if (signUpErrors.fullName) {
                            setSignUpErrors({ ...signUpErrors, fullName: '' });
                          }
                        }}
                        aria-invalid={!!signUpErrors.fullName}
                        aria-describedby={signUpErrors.fullName ? "signup-name-error" : undefined}
                        required
                      />
                      {signUpErrors.fullName && (
                        <p id="signup-name-error" className="text-sm text-destructive">
                          {signUpErrors.fullName}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="Enter your email"
                        autoComplete="email"
                        value={signUpData.email}
                        onChange={(e) => {
                          setSignUpData({ ...signUpData, email: e.target.value });
                          if (signUpErrors.email) {
                            setSignUpErrors({ ...signUpErrors, email: '' });
                          }
                        }}
                        aria-invalid={!!signUpErrors.email}
                        aria-describedby={signUpErrors.email ? "signup-email-error" : undefined}
                        required
                      />
                      {signUpErrors.email && (
                        <p id="signup-email-error" className="text-sm text-destructive">
                          {signUpErrors.email}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Create a password"
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        value={signUpData.password}
                        onChange={(e) => {
                          setSignUpData({ ...signUpData, password: e.target.value });
                          if (signUpErrors.password) {
                            setSignUpErrors({ ...signUpErrors, password: '' });
                          }
                        }}
                        aria-invalid={!!signUpErrors.password}
                        aria-describedby={signUpErrors.password ? "signup-password-error" : undefined}
                        required
                      />
                      {signUpErrors.password && (
                        <p id="signup-password-error" className="text-sm text-destructive">
                          {signUpErrors.password}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Password must be at least {MIN_PASSWORD_LENGTH} characters long
                      </p>
                    </div>
                    
                    <div className="bg-muted/50 p-3 rounded-md">
                      <p className="text-sm text-muted-foreground">
                        <strong>Note:</strong> New accounts will be created with customer role. 
                        Contact an administrator to request role changes if needed.
                      </p>
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isLoading || loading}
                      aria-busy={isLoading || loading}
                    >
                      {isLoading ? 'Creating Account...' : 'Create Account'}
                    </Button>
                  </form>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}