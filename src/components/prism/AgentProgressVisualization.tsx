/**
 * Agent Progress Visualization Component
 * 
 * Shows an animated visualization of the Prism multi-agent reasoning process
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  Compass, 
  Lightbulb, 
  GitBranch, 
  Shield,
  CheckCircle,
  Loader2,
  Circle,
  Sparkles
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// Agent definitions
const AGENTS = [
  {
    id: 'architect',
    name: 'Architect',
    role: 'Structures the problem',
    icon: Compass,
    color: 'from-blue-500 to-cyan-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    activeColor: 'text-blue-400',
    thinkingMessages: [
      'Analyzing problem structure...',
      'Identifying key components...',
      'Building conceptual framework...',
      'Mapping relationships...',
    ],
  },
  {
    id: 'lateral',
    name: 'Lateral Thinker',
    role: 'Explores alternatives',
    icon: Lightbulb,
    color: 'from-amber-500 to-yellow-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    activeColor: 'text-amber-400',
    thinkingMessages: [
      'Exploring unconventional angles...',
      'Generating creative alternatives...',
      'Challenging assumptions...',
      'Finding hidden connections...',
    ],
  },
  {
    id: 'logic',
    name: 'Logic Engine',
    role: 'Validates reasoning',
    icon: GitBranch,
    color: 'from-emerald-500 to-green-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    activeColor: 'text-emerald-400',
    thinkingMessages: [
      'Validating logical consistency...',
      'Testing hypotheses...',
      'Verifying conclusions...',
      'Checking for fallacies...',
    ],
  },
  {
    id: 'auditor',
    name: 'Auditor',
    role: 'Quality assurance',
    icon: Shield,
    color: 'from-purple-500 to-violet-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    activeColor: 'text-purple-400',
    thinkingMessages: [
      'Reviewing analysis quality...',
      'Ensuring completeness...',
      'Synthesizing insights...',
      'Preparing final output...',
    ],
  },
];

interface AgentProgressVisualizationProps {
  isRunning: boolean;
  cyclesCompleted: number;
  totalCycles: number;
  status: 'idle' | 'pending' | 'running' | 'complete' | 'failed';
  depth: 'insight' | 'synthesis' | 'mastery';
}

export function AgentProgressVisualization({
  isRunning,
  cyclesCompleted,
  totalCycles,
  status,
  depth,
}: AgentProgressVisualizationProps) {
  const [currentAgentIndex, setCurrentAgentIndex] = useState(0);
  const [thinkingMessage, setThinkingMessage] = useState('');
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Calculate progress based on cycles and current agent
  const progressPerCycle = 100 / totalCycles;
  const progressPerAgent = progressPerCycle / 4;
  const overallProgress = status === 'complete' 
    ? 100 
    : (cyclesCompleted * progressPerCycle) + (currentAgentIndex * progressPerAgent);

  // Rotate through agents while running
  useEffect(() => {
    if (!isRunning || status === 'complete' || status === 'failed') return;

    const interval = setInterval(() => {
      setCurrentAgentIndex((prev) => (prev + 1) % AGENTS.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [isRunning, status]);

  // Rotate through thinking messages
  useEffect(() => {
    if (!isRunning || status === 'complete' || status === 'failed') return;

    const agent = AGENTS[currentAgentIndex];
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % agent.thinkingMessages.length);
    }, 1800);

    return () => clearInterval(interval);
  }, [isRunning, currentAgentIndex, status]);

  // Update thinking message when agent or message index changes
  useEffect(() => {
    const agent = AGENTS[currentAgentIndex];
    setThinkingMessage(agent.thinkingMessages[messageIndex]);
  }, [currentAgentIndex, messageIndex]);

  // Track elapsed time
  useEffect(() => {
    if (!isRunning || status === 'complete' || status === 'failed') return;

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, status]);

  // Reset when not running
  useEffect(() => {
    if (!isRunning && status !== 'running' && status !== 'pending') {
      setCurrentAgentIndex(0);
      setMessageIndex(0);
      setElapsedTime(0);
    }
  }, [isRunning, status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDepthLabel = () => {
    switch (depth) {
      case 'insight': return '1 Cycle';
      case 'synthesis': return '2 Cycles';
      case 'mastery': return '3 Cycles';
    }
  };

  if (status === 'idle') return null;

  return (
    <Card className="overflow-hidden border-0 bg-cc-surface">
      <CardContent className="p-6">
        {/* Header with status */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              status === 'running' || status === 'pending' 
                ? "bg-gradient-to-br from-indigo-500 to-purple-600 animate-pulse" 
                : status === 'complete' 
                  ? "bg-gradient-to-br from-emerald-500 to-green-600"
                  : "bg-gradient-to-br from-red-500 to-rose-600"
            )}>
              {status === 'running' || status === 'pending' ? (
                <Sparkles className="h-5 w-5 text-white" />
              ) : status === 'complete' ? (
                <CheckCircle className="h-5 w-5 text-white" />
              ) : (
                <Circle className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-cc-text-primary">
                {status === 'running' || status === 'pending'
                  ? 'Multi-Agent Reasoning in Progress'
                  : status === 'complete'
                    ? 'Analysis Complete'
                    : 'Analysis Failed'}
              </h3>
              <p className="text-sm text-cc-text-muted">
                {getDepthLabel()} • {status === 'running' || status === 'pending' ? formatTime(elapsedTime) : 'Finished'}
              </p>
            </div>
          </div>
          
          {(status === 'running' || status === 'pending') && (
            <div className="text-right">
              <div className="text-2xl font-bold text-cc-text-primary">
                {Math.round(overallProgress)}%
              </div>
              <div className="text-xs text-cc-text-muted">
                Cycle {Math.min(cyclesCompleted + 1, totalCycles)} of {totalCycles}
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative h-2 bg-cc-surface-overlay rounded-full overflow-hidden mb-8">
          <div 
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
          {(status === 'running' || status === 'pending') && (
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 animate-shimmer"
              style={{ width: `${overallProgress}%` }}
            />
          )}
        </div>

        {/* Agent cards */}
        <div className="grid grid-cols-4 gap-3">
          {AGENTS.map((agent, index) => {
            const Icon = agent.icon;
            const isActive = (status === 'running' || status === 'pending') && index === currentAgentIndex;
            const isCompleted = status === 'complete' || 
              (status === 'running' && index < currentAgentIndex);
            
            return (
              <div
                key={agent.id}
                className={cn(
                  "relative p-4 rounded-xl border transition-all duration-500",
                  isActive
                    ? `${agent.bgColor} ${agent.borderColor} scale-105 shadow-lg`
                    : isCompleted
                      ? "bg-cc-surface-raised border-cc-border-subtle"
                      : "bg-cc-surface-raised/50 border-cc-border-subtle"
                )}
              >
                {/* Active glow effect */}
                {isActive && (
                  <div className={cn(
                    "absolute inset-0 rounded-xl opacity-30 blur-xl",
                    `bg-gradient-to-r ${agent.color}`
                  )} />
                )}
                
                <div className="relative">
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-all duration-300",
                    isActive
                      ? `bg-gradient-to-br ${agent.color}`
                      : isCompleted
                        ? "bg-cc-surface-overlay"
                        : "bg-cc-surface-overlay/50"
                  )}>
                    {isActive ? (
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    ) : isCompleted ? (
                      <CheckCircle className="h-5 w-5 text-success" />
                    ) : (
                      <Icon className="h-5 w-5 text-cc-text-muted" />
                    )}
                  </div>

                  {/* Agent info */}
                  <h4 className={cn(
                    "font-semibold text-sm mb-1 transition-colors duration-300",
                    isActive ? agent.activeColor : isCompleted ? "text-cc-text-secondary" : "text-cc-text-muted"
                  )}>
                    {agent.name}
                  </h4>
                  <p className={cn(
                    "text-xs transition-colors duration-300",
                    isActive ? "text-cc-text-secondary" : "text-cc-text-muted"
                  )}>
                    {agent.role}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Current thinking message */}
        {(status === 'running' || status === 'pending') && (
          <div className="mt-6 p-4 bg-cc-surface-raised rounded-xl border border-cc-border-subtle">
            <div className="flex items-center gap-3">
              <div className="flex space-x-1">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm text-cc-text-secondary animate-fade-in">
                {thinkingMessage}
              </p>
            </div>
          </div>
        )}

        {/* Cycle progress indicators */}
        {totalCycles > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            {Array.from({ length: totalCycles }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-300",
                  i < cyclesCompleted
                    ? "bg-success"
                    : i === cyclesCompleted && (status === 'running' || status === 'pending')
                      ? "bg-info animate-pulse"
                      : "bg-cc-surface-overlay"
                )}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

