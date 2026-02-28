import React, { useEffect, useState } from 'react';
import AutomatedBuildRunner from '@/components/appstore/AutomatedBuildRunner';
import { base44 } from '@/api/base44Client';

export default function NativeBuildGuide() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">Access restricted to admins.</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AutomatedBuildRunner />
    </div>
  );
}