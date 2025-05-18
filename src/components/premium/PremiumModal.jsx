import React, { useState } from 'react';
import { X, Check, Crown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const PremiumModal = ({ onClose }) => {
  const { upgradeSubscription } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const plans = {
    daily: {
      price: 9,
      label: 'Daily',
      save: '0%',
      features: [
        'Unlimited video chat',
        'No forced disconnections',
        'Premium badge'
      ]
    },
    weekly: {
      price: 49,
      label: 'Weekly',
      save: '22%',
      features: [
        'Unlimited video chat',
        'No forced disconnections',
        'Premium badge',
        'Priority matching'
      ]
    },
    monthly: {
      price: 149,
      label: 'Monthly',
      save: '45%',
      features: [
        'Unlimited video chat',
        'No forced disconnections', 
        'Premium badge',
        'Priority matching',
        'Video filters and effects'
      ]
    },
    yearly: {
      price: 999,
      label: 'Yearly',
      save: '70%',
      features: [
        'Unlimited video chat',
        'No forced disconnections',
        'Premium badge',
        'Priority matching',
        'Video filters and effects',
        'Exclusive features'
      ]
    }
  };
  
  const handleSubscribe = async () => {
    setIsProcessing(true);
    
    try {
      await upgradeSubscription(selectedPlan);
      onClose();
    } catch (error) {
      console.error('Subscription error:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleContinueFree = () => {
    onClose();
  };
  
  return (
    <div className="bluc-modal">
      <div className="bluc-modal-content slide-up max-w-lg">
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center">
              <Crown className="text-yellow-500 mr-2" size={24} />
              <h2 className="text-2xl font-bold">Trial Period Ended</h2>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>
          
          <p className="text-gray-600 text-center mb-8">
            Your premium trial has ended. Upgrade to continue using premium features or continue with free random chat!
          </p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            {Object.entries(plans).map(([planId, plan]) => (
              <div 
                key={planId}
                className={`border rounded-xl p-4 cursor-pointer transition-all ${
                  selectedPlan === planId 
                    ? 'border-blue-500 bg-blue-50 shadow-sm' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedPlan(planId)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{plan.label}</h3>
                    <p className="text-2xl font-bold text-blue-600">₹{plan.price}</p>
                  </div>
                  {plan.save !== '0%' && (
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded">
                      Save {plan.save}
                    </span>
                  )}
                </div>
                
                <ul className="text-sm text-gray-600 mt-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start mb-1">
                      <Check size={16} className="text-green-500 mr-1 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          
          <button
            onClick={handleSubscribe}
            className="bluc-btn-primary w-full mb-3"
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : `Get ${plans[selectedPlan].label} Pass (₹${plans[selectedPlan].price})`}
          </button>
          
          <button
            onClick={handleContinueFree}
            className="w-full py-2 text-gray-600 font-medium hover:text-gray-800"
          >
            Continue with Free Version
          </button>
        </div>
      </div>
    </div>
  );
};

export default PremiumModal;