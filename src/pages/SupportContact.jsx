import React from 'react';
import MerchantSupportForm from '@/components/support/MerchantSupportForm';

export default function SupportContact() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Contact Support</h1>
        <p className="text-slate-400 text-sm mt-1">
          Submit a support message and monitor ticket status from this page.
        </p>
      </div>
      <MerchantSupportForm />
    </div>
  );
}
