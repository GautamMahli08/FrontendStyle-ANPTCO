'use client';

import StatusBadge from './StatusBadge';

interface ApprovalAction {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'success' | 'danger';
}

export default function ApprovalCard({
  title,
  description,
  status,
  metadata,
  actions,
}: {
  title: string;
  description: string;
  status: any;
  metadata?: { label: string; value: string }[];
  actions?: ApprovalAction[];
}) {
  const buttonVariants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 mb-3">{description}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {metadata && metadata.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
          {metadata.map((item, index) => (
            <div key={index} className="flex justify-between text-sm">
              <span className="text-gray-600">{item.label}:</span>
              <span className="font-medium text-gray-900">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {actions && actions.length > 0 && (
        <div className="flex gap-3">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${buttonVariants[action.variant]}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
