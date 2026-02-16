import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook to manage review prompts
 * Checks eligibility and manages state for showing review modal
 */
export function useReviewPrompt(tenantId, platform = 'shopify') {
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRequest, setReviewRequest] = useState(null);
  const [eligibility, setEligibility] = useState(null);

  const checkEligibility = useCallback(async () => {
    if (!tenantId) return;

    try {
      const result = await base44.functions.invoke('growthEngine', {
        action: 'check_review_eligibility',
        tenant_id: tenantId
      });

      const data = result.data;
      setEligibility(data);

      if (data?.eligible && data?.best_condition) {
        // Create review request
        const createResult = await base44.functions.invoke('growthEngine', {
          action: 'create_review_request',
          tenant_id: tenantId,
          condition_triggered: data.best_condition.type,
          condition_value: data.best_condition.value,
          app_store: platform
        });

        if (createResult.data?.request_id) {
          setReviewRequest({
            id: createResult.data.request_id,
            condition: data.best_condition
          });
          setShowReviewModal(true);
        }
      }
    } catch (error) {
      console.error('Error checking review eligibility:', error);
    }
  }, [tenantId, platform]);

  // Check on mount and when tenant changes
  useEffect(() => {
    // Small delay to avoid showing immediately on page load
    const timer = setTimeout(() => {
      checkEligibility();
    }, 5000);

    return () => clearTimeout(timer);
  }, [checkEligibility]);

  const closeReviewModal = useCallback(() => {
    setShowReviewModal(false);
  }, []);

  const triggerReviewPrompt = useCallback(() => {
    checkEligibility();
  }, [checkEligibility]);

  return {
    showReviewModal,
    reviewRequest,
    eligibility,
    closeReviewModal,
    triggerReviewPrompt
  };
}

export default useReviewPrompt;