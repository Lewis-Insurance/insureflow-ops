import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Copy, Check, AlertTriangle, Key } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface MFASetupProps {
  isStaff: boolean;
}

export function MFASetup({ isStaff }: MFASetupProps) {
  const { user, profile } = useAuth();
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'setup' | 'verify' | 'complete'>('setup');
  const [copiedCodes, setCopiedCodes] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (profile?.mfa_enabled) {
      setMfaEnabled(true);
      setStep('complete');
    }
  }, [profile?.mfa_enabled]);

  const generateMFASecret = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Generate TOTP secret
      const { data, error } = await supabase.functions.invoke('setup-mfa', {
        body: { action: 'generate_secret' }
      });

      if (error) throw error;

      setSecret(data.secret);
      setQrCode(data.qr_code);
      setStep('verify');
    } catch (error: any) {
      toast({
        title: "Error generating MFA secret",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyMFA = async () => {
    if (!user || !verificationCode) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-mfa', {
        body: { 
          action: 'verify_setup',
          secret,
          code: verificationCode
        }
      });

      if (error) throw error;

      setBackupCodes(data.backup_codes);
      setMfaEnabled(true);
      setStep('complete');

      toast({
        title: "MFA enabled successfully",
        description: "Please save your backup codes in a secure location.",
      });
    } catch (error: any) {
      toast({
        title: "Invalid verification code",
        description: "Please check your authenticator app and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const disableMFA = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('setup-mfa', {
        body: { action: 'disable' }
      });

      if (error) throw error;

      setMfaEnabled(false);
      setStep('setup');
      setSecret('');
      setQrCode('');
      setBackupCodes([]);

      toast({
        title: "MFA disabled",
        description: "Two-factor authentication has been disabled for your account.",
      });
    } catch (error: any) {
      toast({
        title: "Error disabling MFA",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCodes(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedCodes(prev => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy the code manually.",
        variant: "destructive",
      });
    }
  };

  if (mfaEnabled && step === 'complete') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-success" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            MFA is enabled and protecting your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-success text-success-foreground">
                Enabled
              </Badge>
              <span className="text-sm text-muted-foreground">
                Your account is protected with TOTP
              </span>
            </div>
            <Button 
              variant="outline" 
              onClick={disableMFA}
              disabled={loading}
              size="sm"
            >
              Disable MFA
            </Button>
          </div>

          {backupCodes.length > 0 && (
            <Alert>
              <Key className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Backup Recovery Codes</p>
                  <p className="text-sm">
                    Save these codes in a secure location. Each can only be used once.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {backupCodes.map((code, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {code}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(code, `backup-${index}`)}
                          className="h-6 w-6 p-0"
                        >
                          {copiedCodes[`backup-${index}`] ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          {isStaff 
            ? "MFA is required for all staff members" 
            : "Add an extra layer of security to your account"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isStaff && !mfaEnabled && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>MFA Required:</strong> You must enable two-factor authentication to access staff features.
            </AlertDescription>
          </Alert>
        )}

        {step === 'setup' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Set up two-factor authentication using an authenticator app like Google Authenticator, 
              Authy, or 1Password.
            </p>
            <Button onClick={generateMFASecret} disabled={loading}>
              {loading ? "Generating..." : "Set Up MFA"}
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app:
              </p>
              {qrCode && (
                <div className="flex justify-center">
                  <img 
                    src={qrCode} 
                    alt="MFA QR Code" 
                    className="border rounded-lg"
                  />
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Or enter this secret manually:</p>
                <div className="flex items-center gap-2 justify-center">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                    {secret}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(secret, 'secret')}
                    className="h-6 w-6 p-0"
                  >
                    {copiedCodes['secret'] ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification-code">Verification Code</Label>
              <Input
                id="verification-code"
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={verifyMFA} 
                disabled={loading || verificationCode.length !== 6}
              >
                {loading ? "Verifying..." : "Verify & Enable"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setStep('setup')}
                disabled={loading}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}