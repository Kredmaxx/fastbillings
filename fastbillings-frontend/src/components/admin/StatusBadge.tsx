import React from 'react';
import {
  CheckCircle,
  Hourglass,
  Ban,
  Clock,
  RefreshCw,
  PlusCircle,
} from 'lucide-react'; // Icon set

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    className: string;
  }
> = {
  paid: {
    label: 'Paid',
    icon: <CheckCircle size={14} className="ml-1 text-emerald-600" />,
    className: 'bg-emerald-100 text-emerald-700',
  },
  pending: {
    label: 'Pending',
    icon: <Hourglass size={14} className="ml-1 text-yellow-600" />,
    className: 'bg-yellow-100 text-yellow-700',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <Ban size={14} className="ml-1 text-red-600" />,
    className: 'bg-red-100 text-red-700',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle size={14} className="ml-1 text-green-600" />,
    className: 'bg-green-100 text-green-700',
  },
  partially_paid: {
    label: 'Partially Paid',
    icon: <RefreshCw size={14} className="ml-1 text-indigo-600" />,
    className: 'bg-indigo-100 text-indigo-700',
  },
  new: {
    label: 'New',
    icon: <PlusCircle size={14} className="ml-1 text-blue-600" />,
    className: 'bg-blue-100 text-blue-700',
  },
  unpaid: {
    label: 'Unpaid',
    icon: <Hourglass size={14} className="ml-1 text-yellow-600" />,
    className: 'bg-yellow-100 text-yellow-700',
  },
  active: {
    label: 'Active',
    icon: <CheckCircle size={14} className="ml-1 text-green-600" />,
    className: 'bg-green-100 text-green-700',
  },
  inactive: {
    label: 'Inactive',
    icon: <Ban size={14} className="ml-1 text-red-600" />,
    className: 'bg-red-100 text-red-700',
  },
  draft: {
    label: 'Draft',
    icon: <Clock size={14} className="ml-1 text-gray-600" />,
    className: 'bg-gray-100 text-gray-700',
  },
  sent: {
    label: 'Sent',
    icon: <CheckCircle size={14} className="ml-1 text-green-600" />,
    className: 'bg-green-100 text-green-700',
  },
  declined: {
    label: 'Declined',
    icon: <Ban size={14} className="ml-1 text-red-600" />,
    className: 'bg-red-100 text-red-700',
  },
  accepted: {
    label: 'Accepted',
    icon: <CheckCircle size={14} className="ml-1 text-green-600" />,
    className: 'bg-green-100 text-green-700',
  }
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = statusConfig[status.toLowerCase()] || {
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

export default StatusBadge;
