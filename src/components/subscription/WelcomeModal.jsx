import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import QuantumButton from '@/components/quantum/QuantumButton';
import { Sparkles, Zap, Shield, TrendingUp } from 'lucide-react';

/**
 * WELCOME MODAL
 * Shows once after first login
 */
export default function WelcomeModal({ open, onClose, userId }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  const completeMutation = useMutation({
    mutationFn: async () => {
      // Mark onboarding as completed
      const profiles = await base44.entities.UserProfile.filter({ user_id: userId });
      if (profiles.length > 0) {
        await base44.entities.UserProfile.update(profiles[0].id, {
          onboarding_completed_at: new Date().toISOString(),
          has_seen_welcome: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['user-profile']);
      onClose();
    }
  });

  const steps = [
    {
      icon: Sparkles,
      title: 'Welcome to ProfitShield AI',
      description: 'Protect your profits with quantum-powered fraud detection and real-time risk intelligence.',
      color: 'text-cyan-400'
    },
    {
      icon: Shield,
      title: 'Advanced Threat Detection',
      description: 'Our neural network analyzes every transaction across 6 dimensional layers to stop fraud before it happens.',
      color: 'text-emerald-400'
    },
    {
      icon: TrendingUp,
      title: '3-Day Free Trial',
      description: "You're on a 3-day free trial. Explore all features and upgrade anytime to continue protecting your business.",
      color: 'text-purple-400'
    }
  ];

  const currentStep = steps[step];
  const Icon = currentStep.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl bg-slate-900 border-cyan-500/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-cyan-400">
            {currentStep.title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-8">
          <div className="flex flex-col items-center text-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
              <Icon className={`w-10 h-10 ${currentStep.color}`} />
            </div>
            <p className="text-lg text-slate-300 max-w-md">
              {currentStep.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i === step ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {step < steps.length - 1 ? (
              <QuantumButton onClick={() => setStep(step + 1)}>
                Next
              </QuantumButton>
            ) : (
              <QuantumButton
                onClick={() => completeMutation.mutate()}
                loading={completeMutation.isPending}
              >
                Get Started
              </QuantumButton>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}