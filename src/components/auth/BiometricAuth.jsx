import React, { useState, useEffect } from 'react';
import { Fingerprint, Scan, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import HolographicCard from '@/components/quantum/HolographicCard';

const BIOMETRIC_STORAGE_KEY = 'ps_biometric_enabled';
const BIOMETRIC_CREDENTIAL_KEY = 'ps_biometric_credential_id';

export function BiometricAuthToggle({ onToggle }) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    // Check WebAuthn / biometric support
    const checkSupport = async () => {
      if (window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setSupported(available);
          const stored = localStorage.getItem(BIOMETRIC_STORAGE_KEY);
          setEnabled(stored === 'true' && available);
        } catch {
          setSupported(false);
        }
      }
    };
    checkSupport();
  }, []);

  const handleToggle = async (val) => {
    if (val) {
      setStatus('registering');
      try {
        // Generate a challenge (in production, get from server)
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const userId = crypto.getRandomValues(new Uint8Array(16));

        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'ProfitShield AI', id: window.location.hostname },
            user: {
              id: userId,
              name: 'user@profitshield',
              displayName: 'ProfitShield User'
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' },
              { alg: -257, type: 'public-key' }
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required'
            },
            timeout: 60000
          }
        });

        if (credential) {
          localStorage.setItem(BIOMETRIC_STORAGE_KEY, 'true');
          localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, credential.id);
          setEnabled(true);
          setStatus('enabled');
          onToggle?.(true);
        }
      } catch (err) {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } else {
      localStorage.removeItem(BIOMETRIC_STORAGE_KEY);
      localStorage.removeItem(BIOMETRIC_CREDENTIAL_KEY);
      setEnabled(false);
      setStatus('idle');
      onToggle?.(false);
    }
  };

  if (!supported) return null;

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
          <Fingerprint className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="font-medium text-slate-900 text-sm">Biometric Authentication</p>
          <p className="text-xs text-slate-500">Face ID / Touch ID / Fingerprint</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === 'error' && (
          <span className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        )}
        {status === 'enabled' && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Active
          </span>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={status === 'registering'}
        />
      </div>
    </div>
  );
}

export async function verifyBiometric() {
  const credentialId = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  if (!credentialId || !window.PublicKeyCredential) return false;

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [],
      userVerification: 'required',
      timeout: 60000
    }
  });

  return !!assertion;
}

export function BiometricLoginPrompt({ onSuccess, onFallback }) {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const biometricEnabled = localStorage.getItem(BIOMETRIC_STORAGE_KEY) === 'true';
    if (biometricEnabled) {
      triggerBiometric();
    }
  }, []);

  const triggerBiometric = async () => {
    setStatus('verifying');
    try {
      const ok = await verifyBiometric();
      if (ok) {
        setStatus('success');
        onSuccess?.();
      } else {
        setStatus('failed');
      }
    } catch {
      setStatus('failed');
    }
  };

  return (
    <HolographicCard glow className="p-8 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
        {status === 'verifying' ? (
          <Scan className="w-8 h-8 text-cyan-400 animate-pulse" />
        ) : (
          <Fingerprint className="w-8 h-8 text-cyan-400" />
        )}
      </div>
      <h3 className="text-xl font-bold text-white mb-2">Biometric Login</h3>
      <p className="text-sm text-slate-400 mb-6">
        {status === 'verifying' ? 'Verifying...' : 'Use Face ID or fingerprint to unlock'}
      </p>
      <Button onClick={triggerBiometric} disabled={status === 'verifying'} className="w-full mb-3">
        <Fingerprint className="w-4 h-4 mr-2" />
        Authenticate
      </Button>
      <button onClick={onFallback} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
        Use password instead
      </button>
    </HolographicCard>
  );
}