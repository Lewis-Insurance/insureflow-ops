import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Play, Pause, Clock, Trash2 } from 'lucide-react';
import { useTaskTimeTracking } from '@/hooks/useTaskTimeTracking';
import { format, formatDistanceToNow } from 'date-fns';

interface TaskTimeTrackerProps {
  taskId: string;
}

export function TaskTimeTracker({ taskId }: TaskTimeTrackerProps) {
  const {
    entries,
    loading,
    activeEntry,
    fetchEntries,
    startTimer,
    stopTimer,
    deleteEntry,
    getTotalTime,
  } = useTaskTimeTracking(taskId);
  
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');
  const [stopNotes, setStopNotes] = useState('');
  const [showStopDialog, setShowStopDialog] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Update timer display every second
  useEffect(() => {
    if (!activeEntry) {
      setTimerDisplay('00:00:00');
      return;
    }

    const updateTimer = () => {
      const start = new Date(activeEntry.started_at);
      const now = new Date();
      const diff = now.getTime() - start.getTime();
      
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      setTimerDisplay(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const handleStopClick = () => {
    setShowStopDialog(true);
  };

  const handleConfirmStop = async () => {
    await stopTimer(stopNotes);
    setShowStopDialog(false);
    setStopNotes('');
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const totalMinutes = getTotalTime();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <h4 className="font-medium">Time Tracking</h4>
          {totalMinutes > 0 && (
            <span className="text-sm text-muted-foreground">
              Total: {formatDuration(totalMinutes)}
            </span>
          )}
        </div>
      </div>

      {/* Active Timer */}
      {activeEntry ? (
        <Card className="border-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-mono font-bold">{timerDisplay}</div>
                <div className="text-sm text-muted-foreground">
                  Started {formatDistanceToNow(new Date(activeEntry.started_at), { addSuffix: true })}
                </div>
              </div>
              <Button onClick={handleStopClick} variant="destructive">
                <Pause className="h-4 w-4 mr-2" />
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={startTimer} className="w-full">
          <Play className="h-4 w-4 mr-2" />
          Start Timer
        </Button>
      )}

      {/* Stop Timer Dialog */}
      {showStopDialog && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="font-medium">Stop Timer</h4>
            <Textarea
              placeholder="Add notes about this time entry (optional)..."
              value={stopNotes}
              onChange={(e) => setStopNotes(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button onClick={handleConfirmStop} className="flex-1">
                Confirm
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowStopDialog(false);
                  setStopNotes('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Time Entries List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading time entries...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time entries yet</p>
      ) : (
        <div className="space-y-2">
          {entries.filter(e => e.ended_at).map((entry) => (
            <Card key={entry.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {entry.duration_minutes ? formatDuration(entry.duration_minutes) : 'N/A'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.started_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    {entry.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteEntry(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}