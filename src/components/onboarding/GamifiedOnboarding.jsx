import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { 
  Trophy, 
  Star, 
  Zap, 
  Target, 
  Award,
  CheckCircle2,
  Lock,
  Sparkles,
  TrendingUp,
  Users,
  DollarSign,
  Shield
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const achievements = [
  { id: 'first_connection', name: 'Store Connected', icon: Shield, points: 100, description: 'Connected your first store' },
  { id: 'first_sync', name: 'Data Synced', icon: Zap, points: 50, description: 'Synced your first batch of orders' },
  { id: 'first_analysis', name: 'Profit Analyzed', icon: TrendingUp, points: 75, description: 'Completed your first profit analysis' },
  { id: 'first_alert', name: 'Alert Created', icon: Target, points: 25, description: 'Set up your first alert rule' },
  { id: 'ai_insights', name: 'AI Unlocked', icon: Sparkles, points: 150, description: 'Activated AI-powered insights', tier: 'growth' },
  { id: 'automation', name: 'Automation Master', icon: Zap, points: 200, description: 'Enabled full automation', tier: 'pro' },
  { id: '100_orders', name: 'Century Mark', icon: Trophy, points: 100, description: 'Analyzed 100+ orders' },
  { id: '1000_orders', name: 'Profit Guardian', icon: Award, points: 500, description: 'Analyzed 1,000+ orders' }
];

export default function GamifiedOnboarding({ tenantId, currentTier = 'trial' }) {
  const [unlockedAchievements, setUnlockedAchievements] = useState([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [showUnlock, setShowUnlock] = useState(null);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    if (tenantId) {
      loadProgress();
      checkAchievements();
    }
  }, [tenantId]);

  const loadProgress = async () => {
    try {
      const progress = await base44.entities.OnboardingProgress.filter({ tenant_id: tenantId });
      if (progress.length > 0) {
        const unlocked = progress[0].achievements_unlocked || [];
        setUnlockedAchievements(unlocked);
        
        const points = unlocked.reduce((sum, id) => {
          const achievement = achievements.find(a => a.id === id);
          return sum + (achievement?.points || 0);
        }, 0);
        setTotalPoints(points);
        setLevel(Math.floor(points / 300) + 1);
      }
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
  };

  const checkAchievements = async () => {
    try {
      const [orders, alerts, tenant] = await Promise.all([
        base44.entities.Order.filter({ tenant_id: tenantId }),
        base44.entities.Alert.filter({ tenant_id: tenantId }),
        base44.entities.Tenant.filter({ id: tenantId }).then(t => t[0])
      ]);

      const newAchievements = [];

      // Check order count achievements
      if (orders.length >= 100 && !unlockedAchievements.includes('100_orders')) {
        newAchievements.push('100_orders');
      }
      if (orders.length >= 1000 && !unlockedAchievements.includes('1000_orders')) {
        newAchievements.push('1000_orders');
      }

      // Check tier-based achievements
      if (currentTier === 'growth' && !unlockedAchievements.includes('ai_insights')) {
        newAchievements.push('ai_insights');
      }
      if (currentTier === 'pro' && !unlockedAchievements.includes('automation')) {
        newAchievements.push('automation');
      }

      if (newAchievements.length > 0) {
        await unlockAchievements(newAchievements);
      }
    } catch (e) {
      console.error('Failed to check achievements:', e);
    }
  };

  const unlockAchievements = async (achievementIds) => {
    const updated = [...unlockedAchievements, ...achievementIds];
    setUnlockedAchievements(updated);

    // Save to database
    const progress = await base44.entities.OnboardingProgress.filter({ tenant_id: tenantId });
    if (progress.length > 0) {
      await base44.entities.OnboardingProgress.update(progress[0].id, {
        achievements_unlocked: updated
      });
    }

    // Show unlock animation for each
    for (const id of achievementIds) {
      const achievement = achievements.find(a => a.id === id);
      if (achievement) {
        setShowUnlock(achievement);
        triggerConfetti();
        await new Promise(r => setTimeout(r, 3000));
        setShowUnlock(null);
      }
    }

    await loadProgress();
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10B981', '#06B6D4', '#8B5CF6']
    });
  };

  const pointsToNextLevel = (level * 300) - totalPoints;
  const progressToNextLevel = ((totalPoints % 300) / 300) * 100;

  return (
    <>
      {/* Achievement Unlock Overlay */}
      <AnimatePresence>
        {showUnlock && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowUnlock(null)}
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.5, rotate: 10 }}
              transition={{ type: 'spring', stiffness: 200 }}
              className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 rounded-3xl shadow-2xl text-white text-center max-w-md"
            >
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6 }}
                className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                {React.createElement(showUnlock.icon, { className: "w-10 h-10" })}
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">Achievement Unlocked!</h2>
              <p className="text-xl font-semibold mb-1">{showUnlock.name}</p>
              <p className="text-sm opacity-90 mb-4">{showUnlock.description}</p>
              <Badge className="bg-white/20 text-white text-lg px-4 py-2">
                +{showUnlock.points} points
              </Badge>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Progress Card */}
      <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-violet-600" />
              <div>
                <p className="font-semibold text-sm">Level {level}</p>
                <p className="text-xs text-slate-500">{totalPoints} points</p>
              </div>
            </div>
            <Badge className="bg-violet-100 text-violet-700">
              {unlockedAchievements.length}/{achievements.length}
            </Badge>
          </div>
          <Progress value={progressToNextLevel} className="h-2 mb-1" />
          <p className="text-xs text-slate-500 text-center">
            {pointsToNextLevel} points to Level {level + 1}
          </p>

          {/* Achievement Grid */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {achievements.slice(0, 8).map((achievement) => {
              const isUnlocked = unlockedAchievements.includes(achievement.id);
              const isLocked = achievement.tier && achievement.tier !== currentTier && 
                             (achievement.tier === 'growth' && currentTier === 'trial') ||
                             (achievement.tier === 'pro' && ['trial', 'starter', 'growth'].includes(currentTier));
              const Icon = achievement.icon;
              
              return (
                <motion.div
                  key={achievement.id}
                  whileHover={{ scale: 1.05 }}
                  className={`aspect-square rounded-lg flex items-center justify-center transition-colors ${
                    isUnlocked ? 'bg-emerald-100' : isLocked ? 'bg-slate-50' : 'bg-slate-100'
                  }`}
                  title={achievement.name}
                >
                  {isLocked ? (
                    <Lock className="w-4 h-4 text-slate-300" />
                  ) : (
                    <Icon className={`w-4 h-4 ${isUnlocked ? 'text-emerald-600' : 'text-slate-400'}`} />
                  )}
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// Hook to trigger achievement unlocks
export function useTriggerAchievement() {
  return async (tenantId, achievementId) => {
    try {
      const progress = await base44.entities.OnboardingProgress.filter({ tenant_id: tenantId });
      if (progress.length > 0) {
        const current = progress[0].achievements_unlocked || [];
        if (!current.includes(achievementId)) {
          await base44.entities.OnboardingProgress.update(progress[0].id, {
            achievements_unlocked: [...current, achievementId]
          });
          return true;
        }
      }
    } catch (e) {
      console.error('Failed to trigger achievement:', e);
    }
    return false;
  };
}