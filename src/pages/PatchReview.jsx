import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Loader2, CheckCircle, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/components/platformContext';
import PatchBundleCard from '@/components/selfheal/PatchBundleCard';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function PatchReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [patches, setPatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    base44.auth.me().then(u => {
      const role = (u?.role || u?.app_role || '').toLowerCase();
      if (role !== 'admin' && role !== 'owner') {
        navigate(createPageUrl('Home', location.search), { replace: true });
        return;
      }
      loadPatches();
    }).catch(() => {
      navigate(createPageUrl('Home', location.search), { replace: true });
    });
  }, [navigate, location.search]);

  const loadPatches = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await base44.functions.invoke('selfHeal', { action: 'get_incidents' });
      setPatches(res.data?.pending_patches || []);
    } catch (e) {
      console.error(e);
      setErrorMessage(e?.message || 'Failed to load patch proposals');
    }
    setLoading(false);
  };

  const approveP = async (id) => {
    try {
      await base44.functions.invoke('selfHeal', { action: 'approve_patch', patch_bundle_id: id });
      await loadPatches();
      setErrorMessage('');
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to approve patch proposal');
    }
  };
  const rejectP = async (id) => {
    try {
      await base44.functions.invoke('selfHeal', { action: 'reject_patch', patch_bundle_id: id });
      await loadPatches();
      setErrorMessage('');
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to reject patch proposal');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('SelfHealingCenter', location.search)} className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-violet-400" />
            <h1 className="text-xl font-bold text-slate-100">Patch Review</h1>
          </div>
        </div>
        {errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
            <p className="text-sm text-red-300">{errorMessage}</p>
          </div>
        )}

        {patches.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <p className="text-slate-300 text-lg font-semibold">No patches pending</p>
            <p className="text-slate-500 text-sm mt-1">All proposed fixes have been reviewed.</p>
            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700" onClick={() => window.history.back()}>
              Back to Center
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{patches.length} patch bundle(s) awaiting approval</p>
            {patches.map(p => (
              <PatchBundleCard key={p.id} patch={p} onApprove={approveP} onReject={rejectP} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
