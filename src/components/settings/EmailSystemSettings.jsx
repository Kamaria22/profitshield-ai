import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';

export default function EmailSystemSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-indigo-400" />
          Email System Settings
        </CardTitle>
        <CardDescription>
          Configure support email routing and outbound email automation defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-400">
          Email settings are available in the admin center and applied at tenant level.
        </p>
      </CardContent>
    </Card>
  );
}
