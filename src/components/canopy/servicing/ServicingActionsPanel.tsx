// ============================================================================
// SERVICING ACTIONS PANEL
// ============================================================================
// Displays available servicing actions for a policy based on carrier capabilities.
// Allows users to add vehicles/drivers, request documents, and make policy changes.
// ============================================================================

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Car,
  User,
  FileText,
  Shield,
  MapPin,
  Loader2,
  Check,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Edit,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import {
  useServicingActions,
  useCarrierCapabilities,
  type ServicingActionType,
} from '@/hooks/useCanopyServicing';
import { formatDistanceToNow } from 'date-fns';

interface ServicingActionsPanelProps {
  pullId: string;
  canopyPullId?: string;
  onAddVehicle?: () => void;
  onAddDriver?: () => void;
  onRequestIdCard?: () => void;
  onRequestDeclarations?: () => void;
}

type ActionCategory = 'vehicle' | 'driver' | 'documents' | 'policy';

interface ActionConfig {
  type: ServicingActionType;
  label: string;
  description: string;
  icon: React.ElementType;
  category: ActionCategory;
  capability: string;
}

const ACTION_CONFIGS: ActionConfig[] = [
  {
    type: 'add_vehicle',
    label: 'Add Vehicle',
    description: 'Add a new vehicle to the policy',
    icon: Plus,
    category: 'vehicle',
    capability: 'add_vehicle',
  },
  {
    type: 'remove_vehicle',
    label: 'Remove Vehicle',
    description: 'Remove a vehicle from the policy',
    icon: Trash2,
    category: 'vehicle',
    capability: 'remove_vehicle',
  },
  {
    type: 'update_vehicle',
    label: 'Update Vehicle',
    description: 'Update vehicle information',
    icon: Edit,
    category: 'vehicle',
    capability: 'update_vehicle',
  },
  {
    type: 'add_driver',
    label: 'Add Driver',
    description: 'Add a new driver to the policy',
    icon: Plus,
    category: 'driver',
    capability: 'add_driver',
  },
  {
    type: 'remove_driver',
    label: 'Remove Driver',
    description: 'Remove a driver from the policy',
    icon: Trash2,
    category: 'driver',
    capability: 'remove_driver',
  },
  {
    type: 'update_driver',
    label: 'Update Driver',
    description: 'Update driver information',
    icon: Edit,
    category: 'driver',
    capability: 'update_driver',
  },
  {
    type: 'request_id_card',
    label: 'Request ID Card',
    description: 'Get insurance ID cards emailed',
    icon: CreditCard,
    category: 'documents',
    capability: 'request_id_card',
  },
  {
    type: 'request_declarations',
    label: 'Request Declarations',
    description: 'Get declaration pages emailed',
    icon: FileText,
    category: 'documents',
    capability: 'request_declarations',
  },
  {
    type: 'update_coverages',
    label: 'Update Coverages',
    description: 'Modify policy coverages',
    icon: Shield,
    category: 'policy',
    capability: 'update_coverages',
  },
  {
    type: 'update_address',
    label: 'Update Address',
    description: 'Change the policy address',
    icon: MapPin,
    category: 'policy',
    capability: 'update_address',
  },
];

const CATEGORY_INFO: Record<ActionCategory, { label: string; icon: React.ElementType }> = {
  vehicle: { label: 'Vehicle Actions', icon: Car },
  driver: { label: 'Driver Actions', icon: User },
  documents: { label: 'Document Requests', icon: FileText },
  policy: { label: 'Policy Changes', icon: Shield },
};

export function ServicingActionsPanel({
  pullId,
  canopyPullId,
  onAddVehicle,
  onAddDriver,
  onRequestIdCard,
  onRequestDeclarations,
}: ServicingActionsPanelProps) {
  const { data: capabilities, isLoading: capabilitiesLoading } = useCarrierCapabilities(
    pullId,
    canopyPullId
  );
  const { data: actionsData, isLoading: actionsLoading } = useServicingActions(pullId);

  const availableCapabilities = capabilities?.capabilities || [];
  const carrierName = capabilities?.carrier_name || 'Unknown Carrier';
  const recentActions = actionsData?.actions || [];

  const getActionHandler = (type: ServicingActionType) => {
    switch (type) {
      case 'add_vehicle':
        return onAddVehicle;
      case 'add_driver':
        return onAddDriver;
      case 'request_id_card':
        return onRequestIdCard;
      case 'request_declarations':
        return onRequestDeclarations;
      default:
        return undefined;
    }
  };

  const isActionAvailable = (capability: string) => {
    return availableCapabilities.includes(capability);
  };

  const groupedActions = ACTION_CONFIGS.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {} as Record<ActionCategory, ActionConfig[]>);

  if (capabilitiesLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Policy Servicing
            </CardTitle>
            <CardDescription className="mt-1">
              Make changes to this {carrierName} policy
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {availableCapabilities.length} actions available
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Available Actions by Category */}
        {Object.entries(groupedActions).map(([category, actions]) => {
          const categoryInfo = CATEGORY_INFO[category as ActionCategory];
          const CategoryIcon = categoryInfo.icon;
          const availableInCategory = actions.filter((a) => isActionAvailable(a.capability));

          if (availableInCategory.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">{categoryInfo.label}</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableInCategory.map((action) => {
                  const ActionIcon = action.icon;
                  const handler = getActionHandler(action.type);
                  const hasHandler = !!handler;

                  return (
                    <Button
                      key={action.type}
                      variant="outline"
                      className="justify-start h-auto py-3 px-4"
                      onClick={handler}
                      disabled={!hasHandler}
                    >
                      <ActionIcon className="w-4 h-4 mr-3 text-muted-foreground" />
                      <div className="text-left">
                        <p className="text-sm font-medium">{action.label}</p>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {availableCapabilities.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No servicing actions available for this carrier</p>
            <p className="text-xs mt-1">This carrier may not support self-service changes</p>
          </div>
        )}

        {/* Recent Actions */}
        {recentActions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recent Actions
              </h4>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {recentActions.map((action) => (
                    <RecentActionItem key={action.id} action={action} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Sub-component for recent action items
function RecentActionItem({ action }: { action: any }) {
  const getStatusBadge = () => {
    switch (action.status) {
      case 'completed':
        return (
          <Badge className="bg-green-500 text-xs">
            <Check className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case 'pending':
      case 'submitted':
        return (
          <Badge variant="secondary" className="text-xs">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'waiting_confirmation':
        return (
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
            <Clock className="w-3 h-3 mr-1" />
            Needs Confirmation
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="text-xs">
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-xs">{action.status}</Badge>;
    }
  };

  const getActionLabel = (type: string) => {
    const config = ACTION_CONFIGS.find((c) => c.type === type);
    return config?.label || type.replace(/_/g, ' ');
  };

  return (
    <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="text-sm">
          <p className="font-medium">{getActionLabel(action.action_type)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(action.requested_at), { addSuffix: true })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {getStatusBadge()}
        {action.status === 'waiting_confirmation' && action.confirmation_url && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => window.open(action.confirmation_url, '_blank')}
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default ServicingActionsPanel;
