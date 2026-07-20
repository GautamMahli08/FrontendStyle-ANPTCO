interface TimelineProps {
  order: any;
}

export default function WorkflowTimeline({ order }: TimelineProps) {
  if (!order) return null;

  const steps = [
    {
      id: 'placed',
      label: 'Order Placed',
      icon: '📦',
      statuses: ['PLACED', 'ASSIGNED_TO_TSP', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'],
    },
    {
      id: 'assigned',
      label: 'Driver Assigned',
      icon: '👤',
      statuses: ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'],
    },
    {
      id: 'en_route',
      label: 'En Route',
      icon: '🚛',
      statuses: ['EN_ROUTE', 'ARRIVED', 'COMPLETED'],
    },
    {
      id: 'arrived',
      label: 'Arrived',
      icon: '📍',
      statuses: ['ARRIVED', 'COMPLETED'],
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: '✅',
      statuses: ['COMPLETED'],
    },
  ];

  const currentStep = steps.findIndex(step => step.statuses.includes(order.status));

  return (
    <div className="py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = step.statuses.includes(order.status);
          const isCurrent = currentStep === index;
          const isPast = index < currentStep;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                    isCompleted || isPast
                      ? 'bg-green-600 text-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white animate-pulse'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {step.icon}
                </div>
                <p
                  className={`text-xs mt-2 text-center ${
                    isCompleted || isPast || isCurrent
                      ? 'text-gray-900 font-medium'
                      : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-all ${
                    isPast ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
