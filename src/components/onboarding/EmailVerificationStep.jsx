import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, Shield, CheckCircle, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function EmailVerificationStep({ user, onComplete }) {
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('collect'); // collect, verify, 2fa_setup, 2fa_verify
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAMethod, setTwoFAMethod] = useState('email'); // email or sms
  const [isLoading, setIsLoading] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const sendVerificationCode = async (type = 'email') => {
    setIsLoading(true);
    try {
      // In production, this would call a backend function to send the code
      const target = type === 'email' ? email : phone;
      
      // Simulate sending verification code
      await base44.integrations.Core.SendEmail({
        to: type === 'email' ? email : user?.email,
        subject: 'ProfitShield Verification Code',
        body: `Your verification code is: ${generateCode()}. This code expires in 10 minutes.`
      });
      
      setCodeExpiry(Date.now() + 10 * 60 * 1000); // 10 minutes
      setResendCooldown(60); // 60 second cooldown
      toast.success(`Verification code sent to ${type === 'email' ? email : phone}`);
      
      if (step === 'collect') {
        setStep('verify');
      } else if (step === '2fa_setup') {
        setStep('2fa_verify');
      }
    } catch (error) {
      toast.error('Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateCode = () => {
    // Generate a 6-digit code (in production, this would be on the backend)
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const verifyCode = async () => {
    setIsLoading(true);
    try {
      // In production, verify against backend
      // For now, simulate verification
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (verificationCode.length === 6) {
        toast.success('Email verified successfully!');
        setStep('2fa_setup');
        setVerificationCode('');
      } else {
        toast.error('Invalid verification code');
      }
    } catch (error) {
      toast.error('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const setup2FA = async () => {
    if (twoFAMethod === 'sms' && !phone) {
      toast.error('Please enter your phone number');
      return;
    }
    sendVerificationCode(twoFAMethod);
  };

  const verify2FA = async () => {
    setIsLoading(true);
    try {
      // In production, verify against backend and save 2FA settings
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (twoFACode.length === 6) {
        // Save 2FA settings to user
        await base44.auth.updateMe({
          two_factor_enabled: true,
          two_factor_method: twoFAMethod,
          verified_email: email,
          verified_phone: twoFAMethod === 'sms' ? phone : null
        });
        
        toast.success('Two-factor authentication enabled!');
        onComplete({ email, phone: twoFAMethod === 'sms' ? phone : null, twoFAMethod });
      } else {
        toast.error('Invalid verification code');
      }
    } catch (error) {
      toast.error('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhone = (value) => {
    // Basic US phone formatting
    const cleaned = value.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (match) {
      return [match[1], match[2], match[3]].filter(Boolean).join('-');
    }
    return value;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card className="max-w-md mx-auto">
        <CardContent className="p-6">
          {/* Step 1: Collect Email */}
          {step === 'collect' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Verify Your Email</h2>
                <p className="text-slate-500 text-sm">
                  Enter your email address to start your free trial and secure your account
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="mt-1"
                    required
                  />
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => sendVerificationCode('email')}
                  disabled={!email || !email.includes('@') || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Send Verification Code
                </Button>

                <p className="text-xs text-slate-400 text-center">
                  By continuing, you agree to our Terms of Service and Privacy Policy
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Verify Email */}
          {step === 'verify' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Enter Verification Code</h2>
                <p className="text-slate-500 text-sm">
                  We sent a 6-digit code to <span className="font-medium">{email}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="code">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="mt-1 text-center text-2xl tracking-widest font-mono"
                    maxLength={6}
                  />
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={verifyCode}
                  disabled={verificationCode.length !== 6 || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Verify Email
                </Button>

                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => sendVerificationCode('email')}
                    disabled={resendCooldown > 0 || isLoading}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                  </Button>
                </div>

                <button
                  className="text-sm text-slate-500 hover:text-slate-700 w-full text-center"
                  onClick={() => setStep('collect')}
                >
                  Change email address
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 2FA Setup */}
          {step === '2fa_setup' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Set Up Two-Factor Authentication</h2>
                <p className="text-slate-500 text-sm">
                  Add an extra layer of security to your account
                </p>
                <Badge className="mt-2 bg-amber-100 text-amber-700">Required for all accounts</Badge>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      twoFAMethod === 'email'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setTwoFAMethod('email')}
                  >
                    <Mail className={`w-6 h-6 mx-auto mb-2 ${twoFAMethod === 'email' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <p className="font-medium text-sm">Email</p>
                    <p className="text-xs text-slate-500">Receive codes via email</p>
                  </button>
                  <button
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      twoFAMethod === 'sms'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setTwoFAMethod('sms')}
                  >
                    <Phone className={`w-6 h-6 mx-auto mb-2 ${twoFAMethod === 'sms' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <p className="font-medium text-sm">SMS</p>
                    <p className="text-xs text-slate-500">Receive codes via text</p>
                  </button>
                </div>

                {twoFAMethod === 'sms' && (
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      placeholder="555-123-4567"
                      className="mt-1"
                    />
                  </div>
                )}

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={setup2FA}
                  disabled={isLoading || (twoFAMethod === 'sms' && !phone)}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Verify 2FA */}
          {step === '2fa_verify' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Verify Your {twoFAMethod === 'email' ? 'Email' : 'Phone'}</h2>
                <p className="text-slate-500 text-sm">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-medium">
                    {twoFAMethod === 'email' ? email : phone}
                  </span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="2fa-code">Verification Code</Label>
                  <Input
                    id="2fa-code"
                    type="text"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="mt-1 text-center text-2xl tracking-widest font-mono"
                    maxLength={6}
                  />
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={verify2FA}
                  disabled={twoFACode.length !== 6 || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Enable Two-Factor Authentication
                </Button>

                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => sendVerificationCode(twoFAMethod)}
                    disabled={resendCooldown > 0 || isLoading}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                  </Button>
                </div>

                <button
                  className="text-sm text-slate-500 hover:text-slate-700 w-full text-center"
                  onClick={() => setStep('2fa_setup')}
                >
                  Change verification method
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}