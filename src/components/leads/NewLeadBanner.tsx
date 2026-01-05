import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUnacknowledgedLeads, UnacknowledgedLead } from '@/hooks/useUnacknowledgedLeads';
import { cn } from '@/lib/utils';

export function NewLeadBanner() {
  const navigate = useNavigate();
  const { leads, loading, acknowledgeLead, acknowledgeAllLeads, hasUnacknowledgedLeads } = useUnacknowledgedLeads();

  // Handle clicking on a specific lead
  const handleLeadClick = async (lead: UnacknowledgedLead) => {
    // First acknowledge the lead
    await acknowledgeLead(lead.id);

    // Navigate to the lead detail page (or account if linked)
    if (lead.account_id) {
      navigate(`/customers/${lead.account_id}`);
    } else {
      navigate(`/leads/${lead.id}`);
    }
  };

  // Handle dismissing all leads
  const handleDismissAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await acknowledgeAllLeads();
  };

  // Don't render if loading or no leads
  if (loading || !hasUnacknowledgedLeads) {
    return null;
  }

  const leadCount = leads.length;
  const firstLead = leads[0];
  const displayName = `${firstLead.first_name} ${firstLead.last_name}`.trim();

  return (
    <div className="w-full bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 animate-pulse-subtle">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Main content - clickable area */}
          <button
            onClick={() => handleLeadClick(firstLead)}
            className="flex-1 flex items-center gap-3 text-left text-white hover:opacity-90 transition-opacity"
          >
            {/* Bell icon with pulse animation */}
            <div className="relative">
              <Bell className="h-5 w-5 animate-bounce" />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-white rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-white rounded-full" />
            </div>

            {/* Lead info */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded">
                NEW LEAD
              </span>
              <span className="font-semibold text-base">
                {displayName || 'New Customer'}
              </span>
              {leadCount > 1 && (
                <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded text-sm">
                  <Users className="h-3 w-3" />
                  +{leadCount - 1} more
                </span>
              )}
            </div>

            {/* Arrow indicator */}
            <ChevronRight className="h-5 w-5 ml-auto" />
          </button>

          {/* Dismiss button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismissAll}
            className="text-white hover:bg-white/20 hover:text-white h-8 w-8 p-0"
            title="Mark all as seen"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Show additional leads if there are more than one */}
        {leadCount > 1 && leadCount <= 3 && (
          <div className="flex flex-wrap gap-2 mt-2 pl-8">
            {leads.slice(1).map((lead) => (
              <button
                key={lead.id}
                onClick={() => handleLeadClick(lead)}
                className="text-xs bg-white/20 text-white px-2 py-1 rounded hover:bg-white/30 transition-colors"
              >
                {lead.first_name} {lead.last_name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Add custom animation to tailwind config if needed
// This is a subtle pulse that's less aggressive than the default
const customStyles = `
@keyframes pulse-subtle {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.95;
  }
}

.animate-pulse-subtle {
  animation: pulse-subtle 3s ease-in-out infinite;
}
`;
