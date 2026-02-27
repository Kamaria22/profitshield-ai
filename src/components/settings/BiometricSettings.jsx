import React from 'react';
import { BiometricAuthToggle } from '@/components/auth/BiometricAuth';

export default function BiometricSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">Biometric Authentication</h3>
        <p className="text-sm text-slate-500 mb-3">
          Use Face ID, Touch ID, or fingerprint to unlock the app on supported devices.
        </p>
        <BiometricAuthToggle />
      </div>
    </div>
  );
}