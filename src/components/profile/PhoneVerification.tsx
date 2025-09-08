import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Phone, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export function PhoneVerification() {
  const { user, profile } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    if (profile) {
      setPhoneNumber(profile.phone || '');
      setIsVerified(profile.phone_verified || false);
      if (profile.phone && !profile.phone_verified) {
        setStep('verify');
      }
    }
  }, [profile]);

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digit characters
    const cleaned = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX for US numbers
    if (cleaned.length >= 6) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    } else if (cleaned.length >= 3) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else {
      return cleaned;
    }
  };

  const sendVerificationCode = async () => {
    if (!user || !phoneNumber) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('phone-verification', {
        body: { 
          action: 'send_code',
          phone_number: phoneNumber
        }
      });

      if (error) throw error;

      setCodeSent(true);
      setStep('verify');
      
      toast({
        title: "Verification code sent",
        description: "Please check your phone for the verification code.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to send verification code",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyPhoneCode = async () => {
    if (!user || !verificationCode) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('phone-verification', {
        body: { 
          action: 'verify_code',
          phone_number: phoneNumber,
          code: verificationCode
        }
      });

      if (error) throw error;

      setIsVerified(true);
      
      toast({
        title: "Phone number verified",
        description: "Your phone number has been successfully verified.",
      });
    } catch (error: any) {
      toast({
        title: "Invalid verification code",
        description: "Please check the code and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePhoneNumber = async () => {
    if (!user || !phoneNumber) return;

    setLoading(true);
    try {
      // Normalize phone number to E.164 format
      const { data: normalizedPhone, error: normalizeError } = await supabase
        .rpc('normalize_phone_number', { phone_input: phoneNumber });

      if (normalizeError) throw normalizeError;

      const { error } = await supabase
        .from('profiles')
        .update({ 
          phone: normalizedPhone,
          phone_verified: false 
        })
        .eq('id', user.id);

      if (error) throw error;

      setPhoneNumber(normalizedPhone);
      setIsVerified(false);
      setStep('verify');
      
      toast({
        title: "Phone number updated",
        description: "Please verify your new phone number.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating phone number",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Phone Verification
        </CardTitle>
        <CardDescription>
          Verify your phone number for SMS notifications and account recovery
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isVerified && (
          <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Phone Verified</span>
            </div>
            <Badge variant="default" className="bg-success text-success-foreground">
              Verified
            </Badge>
          </div>
        )}

        {!isVerified && phoneNumber && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your phone number is not verified. Please complete verification to enable SMS features.
            </AlertDescription>
          </Alert>
        )}

        {step === 'input' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={formatPhoneNumber(phoneNumber)}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter your phone number in US format
              </p>
            </div>

            <div className="flex gap-2">
              {phoneNumber && !isVerified && (
                <Button onClick={sendVerificationCode} disabled={loading}>
                  {loading ? "Sending..." : "Send Verification Code"}
                </Button>
              )}
              {phoneNumber && phoneNumber !== profile?.phone && (
                <Button 
                  variant="outline" 
                  onClick={updatePhoneNumber} 
                  disabled={loading}
                >
                  Update Phone Number
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
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
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code sent to {phoneNumber}
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={verifyPhoneCode} 
                disabled={loading || verificationCode.length !== 6}
              >
                {loading ? "Verifying..." : "Verify Phone"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setStep('input');
                  setVerificationCode('');
                }}
                disabled={loading}
              >
                Change Number
              </Button>
              {codeSent && (
                <Button 
                  variant="ghost" 
                  onClick={sendVerificationCode} 
                  disabled={loading}
                  size="sm"
                >
                  Resend Code
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}