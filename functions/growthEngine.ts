import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Growth Engine - App Store Domination System
 * Handles: Review requests, referrals, onboarding, experiments
 */

const REVIEW_COOLDOWN_DAYS = 30;
const MIN_SAVED_PROFIT_ALERTS = 3;
const MIN_ACCURACY_FOR_REVIEW = 85;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      // ============================================
      // REVIEW FLYWHEEL
      // ============================================
      case 'check_review_eligibility': {
        const { tenant_id } = params;

        // Check cooldown - no review prompts within 30 days
        const recentRequests = await base44.asServiceRole.entities.ReviewRequest.filter({
          tenant_id,
          shown_to_user: true
        });

        const lastShown = recentRequests
          .filter(r => r.shown_at)
          .sort((a, b) => new Date(b.shown_at) - new Date(a.shown_at))[0];

        if (lastShown) {
          const daysSinceLastShown = (Date.now() - new Date(lastShown.shown_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastShown < REVIEW_COOLDOWN_DAYS) {
            return Response.json({ 
              eligible: false, 
              reason: 'cooldown',
              days_remaining: Math.ceil(REVIEW_COOLDOWN_DAYS - daysSinceLastShown)
            });
          }
        }

        // Check conditions
        const conditions = [];

        // Condition 1: 3+ saved profit alerts
        const alerts = await base44.asServiceRole.entities.Alert.filter({
          tenant_id,
          type: 'low_margin'
        });
        const savedProfitAlerts = alerts.filter(a => a.status === 'resolved').length;
        if (savedProfitAlerts >= MIN_SAVED_PROFIT_ALERTS) {
          conditions.push({ type: 'saved_profit_3plus', value: savedProfitAlerts });
        }

        // Condition 2: Prevented chargeback
        const chargebacks = await base44.asServiceRole.entities.ChargebackOutcome.filter({
          tenant_id
        });
        const prevented = chargebacks.filter(c => c.outcome === 'won').length;
        if (prevented > 0) {
          conditions.push({ type: 'chargeback_prevented', value: prevented });
        }

        // Condition 3: High accuracy
        const roiMetrics = await base44.asServiceRole.entities.RiskROIMetric.filter({
          tenant_id
        });
        const latestROI = roiMetrics.sort((a, b) => 
          new Date(b.created_date) - new Date(a.created_date)
        )[0];
        if (latestROI?.ai_accuracy_percent >= MIN_ACCURACY_FOR_REVIEW) {
          conditions.push({ type: 'high_accuracy', value: latestROI.ai_accuracy_percent });
        }

        const eligible = conditions.length > 0;

        return Response.json({
          eligible,
          conditions,
          best_condition: conditions.sort((a, b) => b.value - a.value)[0] || null
        });
      }

      case 'create_review_request': {
        const { tenant_id, condition_triggered, condition_value, app_store = 'shopify' } = params;

        const request = await base44.asServiceRole.entities.ReviewRequest.create({
          tenant_id,
          triggered_at: new Date().toISOString(),
          condition_triggered,
          condition_value,
          app_store,
          shown_to_user: false
        });

        return Response.json({ success: true, request_id: request.id });
      }

      case 'record_review_response': {
        const { request_id, response, rating, feedback_text } = params;

        const updateData = {
          shown_to_user: true,
          shown_at: new Date().toISOString(),
          user_response: response
        };

        if (response === 'review') {
          updateData.review_submitted = true;
          updateData.rating = rating;
        } else if (response === 'feedback') {
          updateData.feedback_text = feedback_text;
        }

        await base44.asServiceRole.entities.ReviewRequest.update(request_id, updateData);

        return Response.json({ success: true });
      }

      // ============================================
      // REFERRAL ENGINE
      // ============================================
      case 'get_referral_link': {
        const { tenant_id } = params;

        // Check for existing referral code
        const existing = await base44.asServiceRole.entities.Referral.filter({
          referrer_tenant_id: tenant_id
        });

        let referralCode = existing.find(r => r.referral_code)?.referral_code;

        if (!referralCode) {
          // Generate unique code
          referralCode = `PS${tenant_id.slice(0, 6).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          
          // Create placeholder referral record
          await base44.asServiceRole.entities.Referral.create({
            referrer_tenant_id: tenant_id,
            referrer_email: user.email,
            referral_code: referralCode,
            status: 'invited'
          });
        }

        const baseUrl = 'https://apps.shopify.com/profitshield';
        const referralLink = `${baseUrl}?ref=${referralCode}`;

        return Response.json({ 
          success: true, 
          referral_code: referralCode,
          referral_link: referralLink
        });
      }

      case 'send_referral_invite': {
        const { tenant_id, invited_email, platform = 'shopify' } = params;

        // Get referral code
        const existing = await base44.asServiceRole.entities.Referral.filter({
          referrer_tenant_id: tenant_id
        });
        const referralCode = existing.find(r => r.referral_code)?.referral_code;

        if (!referralCode) {
          return Response.json({ error: 'No referral code found' }, { status: 400 });
        }

        // Create referral record
        const referral = await base44.asServiceRole.entities.Referral.create({
          referrer_tenant_id: tenant_id,
          referrer_email: user.email,
          referral_code: referralCode,
          invited_email,
          platform,
          status: 'invited',
          invited_at: new Date().toISOString()
        });

        // Send email
        const referralLink = `https://apps.shopify.com/profitshield?ref=${referralCode}`;
        
        await base44.integrations.Core.SendEmail({
          to: invited_email,
          subject: `${user.full_name || 'A fellow merchant'} thinks you'd love ProfitShield`,
          body: `
            <h2>You've been invited to ProfitShield!</h2>
            <p>${user.full_name || 'A fellow merchant'} is using ProfitShield to protect their profits and thinks you'd benefit too.</p>
            <p>Get 1 free month when you install using this link:</p>
            <p><a href="${referralLink}" style="background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Install ProfitShield Free</a></p>
            <p>ProfitShield uses AI to detect fraud, prevent chargebacks, and protect your profit margins.</p>
          `
        });

        return Response.json({ success: true, referral_id: referral.id });
      }

      case 'track_referral_click': {
        const { referral_code } = params;

        const referrals = await base44.asServiceRole.entities.Referral.filter({
          referral_code
        });

        if (referrals.length > 0) {
          // Update the most recent uninvited referral or create tracking record
          const toUpdate = referrals.find(r => r.status === 'invited' && !r.clicked_at);
          if (toUpdate) {
            await base44.asServiceRole.entities.Referral.update(toUpdate.id, {
              status: 'clicked',
              clicked_at: new Date().toISOString()
            });
          }
        }

        return Response.json({ success: true });
      }

      case 'complete_referral': {
        const { referral_code, new_tenant_id, new_store_domain } = params;

        const referrals = await base44.asServiceRole.entities.Referral.filter({
          referral_code,
          status: 'clicked'
        });

        if (referrals.length === 0) {
          // Try invited status
          const invited = await base44.asServiceRole.entities.Referral.filter({
            referral_code,
            status: 'invited'
          });
          if (invited.length > 0) {
            await base44.asServiceRole.entities.Referral.update(invited[0].id, {
              status: 'installed',
              installed_at: new Date().toISOString(),
              referred_tenant_id: new_tenant_id,
              invited_store_domain: new_store_domain
            });
          }
          return Response.json({ success: true, reward_pending: true });
        }

        const referral = referrals[0];
        await base44.asServiceRole.entities.Referral.update(referral.id, {
          status: 'installed',
          installed_at: new Date().toISOString(),
          referred_tenant_id: new_tenant_id,
          invited_store_domain: new_store_domain
        });

        return Response.json({ success: true, reward_pending: true });
      }

      case 'grant_referral_reward': {
        const { referral_id } = params;

        const referrals = await base44.asServiceRole.entities.Referral.filter({ id: referral_id });
        if (!referrals.length) {
          return Response.json({ error: 'Referral not found' }, { status: 404 });
        }

        const referral = referrals[0];
        if (referral.reward_granted) {
          return Response.json({ success: true, already_granted: true });
        }

        // Grant reward to referrer
        const tenants = await base44.asServiceRole.entities.Tenant.filter({
          id: referral.referrer_tenant_id
        });

        if (tenants.length > 0) {
          const tenant = tenants[0];
          const currentEndDate = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
          const newEndDate = new Date(Math.max(currentEndDate.getTime(), Date.now()));
          newEndDate.setMonth(newEndDate.getMonth() + 1);

          await base44.asServiceRole.entities.Tenant.update(tenant.id, {
            trial_ends_at: newEndDate.toISOString()
          });
        }

        await base44.asServiceRole.entities.Referral.update(referral_id, {
          status: 'activated',
          activated_at: new Date().toISOString(),
          reward_granted: true,
          reward_type: 'free_month',
          reward_granted_at: new Date().toISOString()
        });

        return Response.json({ success: true, reward_type: 'free_month' });
      }

      case 'get_referral_leaderboard': {
        const referrals = await base44.asServiceRole.entities.Referral.filter({
          status: 'activated'
        });

        // Group by referrer
        const leaderboard = {};
        for (const ref of referrals) {
          if (!leaderboard[ref.referrer_tenant_id]) {
            leaderboard[ref.referrer_tenant_id] = {
              tenant_id: ref.referrer_tenant_id,
              email: ref.referrer_email,
              count: 0,
              rewards_earned: 0
            };
          }
          leaderboard[ref.referrer_tenant_id].count++;
          if (ref.reward_granted) {
            leaderboard[ref.referrer_tenant_id].rewards_earned++;
          }
        }

        const sorted = Object.values(leaderboard)
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);

        return Response.json({ success: true, leaderboard: sorted });
      }

      // ============================================
      // ONBOARDING PROGRESS
      // ============================================
      case 'get_onboarding_progress': {
        const { tenant_id } = params;

        const progress = await base44.asServiceRole.entities.OnboardingProgress.filter({
          tenant_id
        });

        if (progress.length === 0) {
          // Create initial progress
          const newProgress = await base44.asServiceRole.entities.OnboardingProgress.create({
            tenant_id,
            steps_completed: [],
            current_step: 'store_connected',
            completion_percentage: 0,
            onboarding_started_at: new Date().toISOString()
          });
          return Response.json({ success: true, progress: newProgress });
        }

        return Response.json({ success: true, progress: progress[0] });
      }

      case 'complete_onboarding_step': {
        const { tenant_id, step, value } = params;

        const progress = await base44.asServiceRole.entities.OnboardingProgress.filter({
          tenant_id
        });

        if (progress.length === 0) {
          return Response.json({ error: 'Progress not found' }, { status: 404 });
        }

        const current = progress[0];
        const steps = current.steps_completed || [];

        // Check if already completed
        if (steps.some(s => s.step === step)) {
          return Response.json({ success: true, already_completed: true });
        }

        steps.push({
          step,
          completed_at: new Date().toISOString(),
          value
        });

        const allSteps = [
          'store_connected', 'first_sync', 'first_risk_detection',
          'first_alert', 'first_saved_profit', 'cost_mapping_setup',
          'alert_rules_configured', 'team_invited', 'first_week_active'
        ];

        const completionPct = Math.round((steps.length / allSteps.length) * 100);
        const isActivated = steps.some(s => s.step === 'first_saved_profit');

        // Calculate time to first value
        let timeToFirstValue = null;
        if (step === 'first_saved_profit' && current.onboarding_started_at) {
          const startTime = new Date(current.onboarding_started_at).getTime();
          timeToFirstValue = Math.round((Date.now() - startTime) / (1000 * 60 * 60));
        }

        const updateData = {
          steps_completed: steps,
          completion_percentage: completionPct,
          is_activated: isActivated,
          activation_score: Math.min(completionPct + (isActivated ? 20 : 0), 100)
        };

        if (timeToFirstValue) {
          updateData.time_to_first_value_hours = timeToFirstValue;
        }

        if (completionPct === 100) {
          updateData.onboarding_completed_at = new Date().toISOString();
        }

        // Determine next step
        const completedStepNames = steps.map(s => s.step);
        const nextStep = allSteps.find(s => !completedStepNames.includes(s));
        if (nextStep) {
          updateData.current_step = nextStep;
        }

        await base44.asServiceRole.entities.OnboardingProgress.update(current.id, updateData);

        return Response.json({ 
          success: true, 
          completion_percentage: completionPct,
          is_activated: isActivated,
          next_step: nextStep
        });
      }

      // ============================================
      // GROWTH METRICS
      // ============================================
      case 'calculate_growth_metrics': {
        if (user?.role !== 'admin') {
          return Response.json({ error: 'Admin required' }, { status: 403 });
        }

        const { period_type = 'weekly' } = params;

        const now = new Date();
        let period, startDate;

        if (period_type === 'weekly') {
          const weekNum = Math.ceil(now.getDate() / 7);
          period = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
        } else {
          period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // Gather data
        const tenants = await base44.asServiceRole.entities.Tenant.filter({});
        const periodTenants = tenants.filter(t => new Date(t.created_date) >= startDate);

        const reviewRequests = await base44.asServiceRole.entities.ReviewRequest.filter({});
        const periodReviews = reviewRequests.filter(r => new Date(r.created_date) >= startDate);

        const referrals = await base44.asServiceRole.entities.Referral.filter({});
        const periodReferrals = referrals.filter(r => new Date(r.created_date) >= startDate);

        const onboarding = await base44.asServiceRole.entities.OnboardingProgress.filter({});

        // Calculate metrics
        const metrics = {
          period,
          period_type,
          installs: {
            total: periodTenants.length,
            shopify: periodTenants.filter(t => t.platform === 'shopify').length,
            woocommerce: periodTenants.filter(t => t.platform === 'woocommerce').length,
            bigcommerce: periodTenants.filter(t => t.platform === 'bigcommerce').length
          },
          activations: {
            total: onboarding.filter(o => o.is_activated && new Date(o.updated_date) >= startDate).length,
            activation_rate: periodTenants.length > 0 
              ? onboarding.filter(o => o.is_activated).length / tenants.length 
              : 0,
            avg_time_to_activate_hours: onboarding
              .filter(o => o.time_to_first_value_hours)
              .reduce((s, o) => s + o.time_to_first_value_hours, 0) / 
              (onboarding.filter(o => o.time_to_first_value_hours).length || 1)
          },
          reviews: {
            requests_sent: periodReviews.filter(r => r.shown_to_user).length,
            reviews_submitted: periodReviews.filter(r => r.review_submitted).length,
            avg_rating: periodReviews.filter(r => r.rating)
              .reduce((s, r) => s + r.rating, 0) / 
              (periodReviews.filter(r => r.rating).length || 1),
            five_star_count: periodReviews.filter(r => r.rating === 5).length
          },
          referrals: {
            invites_sent: periodReferrals.filter(r => r.status !== 'invited' || r.invited_email).length,
            clicks: periodReferrals.filter(r => r.clicked_at).length,
            installs: periodReferrals.filter(r => r.status === 'installed' || r.status === 'activated').length,
            referral_rate: tenants.length > 0 
              ? referrals.filter(r => r.status === 'activated').length / tenants.length 
              : 0
          },
          conversions: {
            trial_starts: periodTenants.filter(t => t.subscription_tier === 'trial').length,
            trial_to_paid: tenants.filter(t => 
              t.subscription_tier !== 'trial' && 
              new Date(t.updated_date) >= startDate
            ).length,
            churns: tenants.filter(t => t.status === 'inactive').length
          },
          onboarding: {
            completion_rate: onboarding.length > 0
              ? onboarding.filter(o => o.completion_percentage === 100).length / onboarding.length
              : 0,
            avg_steps_completed: onboarding.reduce((s, o) => s + (o.steps_completed?.length || 0), 0) / 
              (onboarding.length || 1)
          }
        };

        // Calculate review boost score
        const eligibleForReview = tenants.filter(t => t.status === 'active').length;
        const recentReviews = periodReviews.filter(r => r.review_submitted && r.rating >= 4).length;
        metrics.review_boost_score = Math.min(
          (recentReviews / (eligibleForReview || 1)) * 100 + metrics.reviews.avg_rating * 10,
          100
        );

        // Save metrics
        const existing = await base44.asServiceRole.entities.GrowthMetric.filter({
          period,
          period_type
        });

        if (existing.length > 0) {
          await base44.asServiceRole.entities.GrowthMetric.update(existing[0].id, metrics);
        } else {
          await base44.asServiceRole.entities.GrowthMetric.create(metrics);
        }

        return Response.json({ success: true, metrics });
      }

      // ============================================
      // EXPERIMENT ENGINE
      // ============================================
      case 'get_experiment_variant': {
        const { tenant_id, experiment_name } = params;

        const experiments = await base44.asServiceRole.entities.RevenueExperiment.filter({
          experiment_name,
          status: 'running'
        });

        if (experiments.length === 0) {
          return Response.json({ variant: null, in_experiment: false });
        }

        const experiment = experiments[0];
        
        // Deterministic assignment based on tenant_id
        const hash = tenant_id.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        
        const bucket = Math.abs(hash) % 100;
        let cumulative = 0;
        let assignedVariant = experiment.control_variant;

        for (const variant of experiment.variants) {
          cumulative += variant.traffic_percent;
          if (bucket < cumulative) {
            assignedVariant = variant.variant_id;
            break;
          }
        }

        return Response.json({
          in_experiment: true,
          experiment_id: experiment.id,
          variant: assignedVariant,
          variant_value: experiment.variants.find(v => v.variant_id === assignedVariant)?.value
        });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Growth engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});