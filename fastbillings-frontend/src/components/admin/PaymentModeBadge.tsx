import React from 'react';
import {
  DollarSign,
  CreditCard,
  Banknote,
  HelpCircle,
} from 'lucide-react';
import UPI from '@assets/images/upi.svg';
interface PaymentModeBadgeProps {
  mode: string;
}

const modeConfig: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    className: string;
  }
> = {
  cash: {
    label: 'Cash',
    icon: <DollarSign size={14} className="ml-1 text-green-600" />,
    className: 'bg-green-100 text-green-700',
  },
  cheque: {
    label: 'Cheque',
    icon: <CreditCard size={14} className="ml-1 text-purple-600" />,
    className: 'bg-purple-100 text-purple-600',
  },
  bank: {
    label: 'Bank',
    icon: <Banknote size={14} className="ml-1 text-blue-600" />,
    className: 'bg-blue-100 text-blue-700',
  },
  upi: {
    label: 'UPI',
    icon: <img src={UPI} alt="UPI" className="h-4 ml-1" />,
    className: 'bg-blue-100 text-blue-700',
  },
  'bank deposit': {
    label: 'Bank Deposit',
    icon: <Banknote size={14} className="ml-1 text-blue-600" />,
    className: 'bg-blue-100 text-blue-700',
  },
  'bank transfer': {
    label: 'Bank Transfer',
    icon: <Banknote size={14} className="ml-1 text-blue-600" />,
    className: 'bg-blue-100 text-blue-700',
  },
  'petty cash': {
    label: 'Petty Cash',
    icon: <Banknote size={14} className="ml-1 text-blue-600" />,
    className: 'bg-blue-100 text-blue-700',
  },
};

const PaymentModeBadge: React.FC<PaymentModeBadgeProps> = ({ mode }) => {
  const normalized = mode.toLowerCase().trim();
  const config = modeConfig[normalized] || {
    label: mode,
    icon: <HelpCircle size={14} className="ml-1 text-gray-600" />,
    className: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ${config.className}`}
    >
      {config.label}
      {config.icon}
    </span>
  );
};

export default PaymentModeBadge;
