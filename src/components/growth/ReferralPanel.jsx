import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Gift, 
  Copy, 
  Check, 
  Send, 
  Users, 
  Trophy,
  Loader2,
  Share2,
  Mail
} from 'lucide-react';
import { toast } from 'sonner';

export default function ReferralPanel({ tenantId }) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const { data: referralData, isLoading } = useQuery({
    queryKey: ['referralLink', tenantId],
    queryFn: async () => {
      const result = await base44.functions.invoke('growthEngine', {
        action: 'get_referral_link',
        tenant_id: tenantId
      });
      return result.data;
    },
    enabled: !!tenantId
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['referralLeaderboard'],
    queryFn: async () => {
      const result = await base44.functions.invoke('growthEngine', {
        action: 'get_referral_leaderboard'
      });
      return result.data?.leaderboard || [];
    }
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (email) => {
      const result = await base44.functions.invoke('growthEngine', {
        action: 'send_referral_invite',
        tenant_id: tenantId,
        invited_email: email
      });
      return result.data;
    },
    onSuccess: () => {
      toast.success('Invitation sent!');
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
    onError: () => toast.error('Failed to send invitation')
  });

  const handleCopy = async () => {
    if (referralData?.referral_link) {
      await navigator.clipboard.writeText(referralData.referral_link);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendInvite = () => {
    if (inviteEmail && inviteEmail.includes('@')) {
      sendInviteMutation.mutate(inviteEmail);
    }
  };

  const handleShare = async () => {
    if (navigator.share && referralData?.referral_link) {
      try {
        await navigator.share({
          title: 'Try ProfitShield',
          text: 'I\'m using ProfitShield to protect my store\'s profits. You should try it too!',
          url: referralData.referral_link
        });
      } catch (err) {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-600" />
            Give a Month, Get a Month
          </CardTitle>
          <CardDescription>
            Share ProfitShield with fellow merchants. When they install, you both get 1 free month!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Referral Link */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Your Referral Link
            </label>
            <div className="flex gap-2">
              <Input
                value={referralData?.referral_link || ''}
                readOnly
                className="bg-white"
              />
              <Button onClick={handleCopy} variant="outline">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button onClick={handleShare} className="bg-purple-600 hover:bg-purple-700">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Invite by Email */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Or Invite by Email
            </label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@store.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
              />
              <Button 
                onClick={handleSendInvite}
                disabled={sendInviteMutation.isPending || !inviteEmail}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {sendInviteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Referral Code */}
          <div className="pt-2 border-t border-purple-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Your Referral Code</span>
              <Badge variant="outline" className="font-mono text-purple-700 border-purple-300">
                {referralData?.referral_code}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Top Referrers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leaderboard.slice(0, 5).map((entry, index) => (
                <div 
                  key={entry.tenant_id}
                  className={`
                    flex items-center justify-between p-2 rounded-lg
                    ${index === 0 ? 'bg-amber-50' : index === 1 ? 'bg-slate-100' : index === 2 ? 'bg-orange-50' : 'bg-white'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className={`
                      w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
                      ${index === 0 ? 'bg-amber-400 text-white' : index === 1 ? 'bg-slate-400 text-white' : index === 2 ? 'bg-orange-400 text-white' : 'bg-slate-200'}
                    `}>
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {entry.email?.split('@')[0] || 'Merchant'}***
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      <Users className="w-3 h-3 mr-1" />
                      {entry.count} referrals
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}