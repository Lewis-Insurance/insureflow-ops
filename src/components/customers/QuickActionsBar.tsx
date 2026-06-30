import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  FileText,
  CheckSquare,
  DollarSign,
  FileUp,
  Phone,
  Shield,
  Star,
} from 'lucide-react';

interface QuickActionsBarProps {
  onAddNote: () => void;
  onAddTask: () => void;
  onAddPayment: () => void;
  onAddPolicy: () => void;
  onAddDocument: () => void;
  onAddCallLog: () => void;
  onRequestReview?: () => void;
}

export function QuickActionsBar({
  onAddNote,
  onAddTask,
  onAddPayment,
  onAddPolicy,
  onAddDocument,
  onAddCallLog,
  onRequestReview,
}: QuickActionsBarProps) {
  const actions = [
    {
      label: 'Add Note',
      icon: FileText,
      onClick: onAddNote,
      bgColor: 'bg-blue-600 hover:bg-blue-700',
      iconBg: 'bg-blue-500',
    },
    {
      label: 'Add Task',
      icon: CheckSquare,
      onClick: onAddTask,
      bgColor: 'bg-amber-600 hover:bg-amber-700',
      iconBg: 'bg-amber-500',
    },
    {
      label: 'Add Policy',
      icon: Shield,
      onClick: onAddPolicy,
      bgColor: 'bg-indigo-600 hover:bg-indigo-700',
      iconBg: 'bg-indigo-500',
    },
    {
      label: 'Add Document',
      icon: FileUp,
      onClick: onAddDocument,
      bgColor: 'bg-cyan-600 hover:bg-cyan-700',
      iconBg: 'bg-cyan-500',
    },
    {
      label: 'Log Call',
      icon: Phone,
      onClick: onAddCallLog,
      bgColor: 'bg-purple-600 hover:bg-purple-700',
      iconBg: 'bg-purple-500',
    },
    {
      // Money-green, sits right next to Log Call.
      label: 'Add Payment',
      icon: DollarSign,
      onClick: onAddPayment,
      bgColor: 'bg-emerald-700 hover:bg-emerald-800',
      iconBg: 'bg-emerald-600',
    },
    ...(onRequestReview
      ? [
          {
            label: 'Request Review',
            icon: Star,
            onClick: onRequestReview,
            bgColor: 'bg-yellow-600 hover:bg-yellow-700',
            iconBg: 'bg-yellow-500',
          },
        ]
      : []),
  ];

  return (
    <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700">
      <CardContent className="py-4">
        <div className="flex flex-wrap gap-3 justify-center md:justify-start">
          {actions.map((action) => (
            <Button
              key={action.label}
              onClick={action.onClick}
              className={`${action.bgColor} text-white font-semibold px-4 py-2 h-auto shadow-md hover:shadow-lg transition-all`}
            >
              <action.icon className="h-5 w-5 mr-2" />
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
