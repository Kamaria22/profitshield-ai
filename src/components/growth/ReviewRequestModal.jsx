import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Shield, Heart, ExternalLink, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const APP_STORE_URLS = {
  shopify: 'https://apps.shopify.com/profitshield/reviews',
  woocommerce: 'https://wordpress.org/support/plugin/profitshield/reviews/',
  bigcommerce: 'https://www.bigcommerce.com/apps/profitshield/'
};

export default function ReviewRequestModal({ 
  isOpen, 
  onClose, 
  tenantId: _tenantId, 
  platform = 'shopify',
  condition,
  requestId 
}) {
  const [step, setStep] = useState('ask'); // ask, rating, feedback, thanks
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  const recordResponseMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('growthEngine', {
      action: 'record_review_response',
      request_id: requestId,
      ...data
    })
  });

  const handleRatingSelect = (rating) => {
    setSelectedRating(rating);
    
    if (rating >= 4) {
      // High rating - redirect to app store
      recordResponseMutation.mutate({ response: 'review', rating });
      setStep('redirect');
    } else {
      // Low rating - collect feedback internally
      setStep('feedback');
    }
  };

  const handleFeedbackSubmit = () => {
    recordResponseMutation.mutate({ 
      response: 'feedback', 
      rating: selectedRating,
      feedback_text: feedback 
    });
    setStep('thanks');
  };

  const handleDismiss = () => {
    recordResponseMutation.mutate({ response: 'dismissed' });
    onClose();
  };

  const handleLater = () => {
    recordResponseMutation.mutate({ response: 'later' });
    onClose();
  };

  const openAppStore = () => {
    window.open(APP_STORE_URLS[platform] || APP_STORE_URLS.shopify, '_blank', 'noopener,noreferrer');
    setStep('thanks');
  };

  const getConditionMessage = () => {
    switch (condition?.type) {
      case 'saved_profit_3plus':
        return `You've protected your profits ${condition.value}+ times!`;
      case 'chargeback_prevented':
        return `Amazing! You've prevented ${condition.value} chargeback${condition.value > 1 ? 's' : ''}!`;
      case 'high_accuracy':
        return `Our AI is ${condition.value}% accurate for your store!`;
      default:
        return "You're getting great results with ProfitShield!";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {step === 'ask' && (
            <motion.div
              key="ask"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Shield className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {getConditionMessage()}
              </h3>
              
              <p className="text-slate-500 mb-6">
                We'd love to hear about your experience. Your feedback helps us improve and helps other merchants discover ProfitShield.
              </p>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => setStep('rating')}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                >
                  <Star className="w-4 h-4 mr-2" />
                  Rate Your Experience
                </Button>
                <Button variant="ghost" onClick={handleLater}>
                  Maybe Later
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'rating' && (
            <motion.div
              key="rating"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-4"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                How would you rate ProfitShield?
              </h3>
              <p className="text-slate-500 mb-6">
                Tap a star to rate
              </p>

              <div className="flex justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => handleRatingSelect(star)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star 
                      className={`w-10 h-10 transition-colors ${
                        star <= (hoverRating || selectedRating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <Button variant="ghost" onClick={handleDismiss}>
                Not Now
              </Button>
            </motion.div>
          )}

          {step === 'redirect' && (
            <motion.div
              key="redirect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Heart className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Thank you! 🎉
              </h3>
              
              <p className="text-slate-500 mb-6">
                We're thrilled you're having a great experience! Would you mind sharing your feedback on the {platform === 'shopify' ? 'Shopify App Store' : 'app store'}?
              </p>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={openAppStore}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Leave a Review
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Maybe Later
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'feedback' && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="py-4"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <MessageSquare className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">
                We'd love your feedback
              </h3>
              
              <p className="text-slate-500 mb-4 text-center">
                How can we make ProfitShield better for you?
              </p>

              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tell us what could be improved..."
                className="mb-4 min-h-[100px]"
              />

              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleFeedbackSubmit}
                  disabled={!feedback.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Send Feedback
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'thanks' && (
            <motion.div
              key="thanks"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg"
              >
                <Heart className="w-10 h-10 text-white" />
              </motion.div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Thank you! 💚
              </h3>
              
              <p className="text-slate-500 mb-6">
                Your feedback means the world to us and helps us build a better product.
              </p>

              <Button onClick={onClose}>
                Close
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
