import React from 'react';
import {
  CheckCircle,
  Hourglass,
  Ban,
  Clock,
  RefreshCw,
  FileText,
  Send,
} from 'lucide-react';

interface InvoiceStatusBadgeProps {
  status: string;
}

const invoiceStatusConfig: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    className: string;
  }
> = {
  draft: {
    label: 'Draft',
    icon: <FileText size={14} className="ml-1 text-gray-500" />,
    className: 'bg-gray-100 text-gray-700',
  },
  pending: {
    label: 'Pending',
    icon: <Hourglass size={14} className="ml-1 text-yellow-600" />,
    className: 'bg-yellow-100 text-yellow-700',
  },
  unpaid: {
    label: 'Unpaid',
    icon: <Hourglass size={14} className="ml-1 text-yellow-600" />,
    className: 'bg-yellow-100 text-yellow-700',
  },
  paid: {
    label: 'Paid',
    icon: <CheckCircle size={14} className="ml-1 text-emerald-600" />,
    className: 'bg-emerald-100 text-emerald-700',
  },
  partially_paid: {
    label: 'Partially Paid',
    icon: <RefreshCw size={14} className="ml-1 text-indigo-600" />,
    className: 'bg-indigo-100 text-indigo-700',
  },
  overdue: {
    label: 'Overdue',
    icon: <Clock size={14} className="ml-1 text-red-600" />,
    className: 'bg-red-100 text-red-700',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <Ban size={14} className="ml-1 text-red-600" />,
    className: 'bg-red-100 text-red-700',
  },
  sent: {
    label: 'Sent',
    icon: <Send size={14} className="ml-1 text-blue-600" />,
    className: 'bg-blue-100 text-blue-700',
  },
  delivered: {
    label: 'Delivered',
    icon: <CheckCircle size={14} className="ml-1 text-green-600" />,
    className: 'bg-green-100 text-green-700',
  }
};

const InvoiceStatusBadge: React.FC<InvoiceStatusBadgeProps> = ({ status }) => {
  const key = status.toLowerCase();
  const config = invoiceStatusConfig[key] || {
    label: status,
    icon: <Clock size={14} className="ml-1 text-gray-600" />,
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

export default InvoiceStatusBadge;
