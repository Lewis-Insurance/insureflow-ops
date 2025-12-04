import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubmitAIFeedback } from "@/hooks/useAIFeedback";

interface AIFeedbackButtonsProps {
  messageId?: string;
  conversationId?: string;
  query: string;
  response: string;
  contextType?: string;
  contextMetadata?: any;
  responseTimeMs?: number;
  wasCached?: boolean;
  tokenCount?: number;
  onFeedbackSubmitted?: (helpful: boolean) => void;
}

export function AIFeedbackButtons({
  messageId,
  conversationId,
  query,
  response,
  contextType,
  contextMetadata,
  responseTimeMs,
  wasCached,
  tokenCount,
  onFeedbackSubmitted,
}: AIFeedbackButtonsProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null);
  const [showDetailedFeedback, setShowDetailedFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [issueCategory, setIssueCategory] = useState("");
  const [suggestedImprovement, setSuggestedImprovement] = useState("");

  const submitFeedback = useSubmitAIFeedback();

  const handleQuickFeedback = (helpful: boolean) => {
    setFeedbackGiven(helpful);

    submitFeedback.mutate({
      conversationId,
      messageId,
      query,
      response,
      helpful,
      contextType,
      contextMetadata,
      responseTimeMs,
      wasCached,
      tokenCount,
    });

    onFeedbackSubmitted?.(helpful);

    // If not helpful, open detailed feedback dialog
    if (!helpful) {
      setShowDetailedFeedback(true);
    }
  };

  const handleDetailedFeedback = () => {
    if (feedbackGiven === null) return;

    submitFeedback.mutate({
      conversationId,
      messageId,
      query,
      response,
      helpful: feedbackGiven,
      feedbackText: feedbackText || undefined,
      issueCategory: issueCategory || undefined,
      suggestedImprovement: suggestedImprovement || undefined,
      contextType,
      contextMetadata,
      responseTimeMs,
      wasCached,
      tokenCount,
    });

    setShowDetailedFeedback(false);
    setFeedbackText("");
    setIssueCategory("");
    setSuggestedImprovement("");
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {feedbackGiven === null ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleQuickFeedback(true)}
              className="text-muted-foreground hover:text-green-600 hover:bg-green-50"
            >
              <ThumbsUp className="h-4 w-4 mr-1" />
              Helpful
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleQuickFeedback(false)}
              className="text-muted-foreground hover:text-red-600 hover:bg-red-50"
            >
              <ThumbsDown className="h-4 w-4 mr-1" />
              Not Helpful
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            {feedbackGiven ? (
              <div className="flex items-center text-green-600">
                <ThumbsUp className="h-4 w-4 mr-1" />
                <span>Marked as helpful</span>
              </div>
            ) : (
              <div className="flex items-center text-red-600">
                <ThumbsDown className="h-4 w-4 mr-1" />
                <span>Marked as not helpful</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetailedFeedback(true)}
              className="text-muted-foreground"
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              Add details
            </Button>
          </div>
        )}
      </div>

      {/* Detailed Feedback Dialog */}
      <Dialog open={showDetailedFeedback} onOpenChange={setShowDetailedFeedback}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {feedbackGiven
                ? "Tell us what was helpful"
                : "Help us improve this response"}
            </DialogTitle>
            <DialogDescription>
              Your feedback helps us make AI responses more accurate and useful.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!feedbackGiven && (
              <div className="space-y-2">
                <Label htmlFor="issue_category">What was the issue?</Label>
                <Select value={issueCategory} onValueChange={setIssueCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an issue category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inaccurate">
                      Inaccurate Information
                    </SelectItem>
                    <SelectItem value="incomplete">
                      Incomplete Response
                    </SelectItem>
                    <SelectItem value="irrelevant">
                      Irrelevant to My Question
                    </SelectItem>
                    <SelectItem value="formatting">
                      Poor Formatting
                    </SelectItem>
                    <SelectItem value="outdated">
                      Outdated Information
                    </SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="feedback_text">
                {feedbackGiven
                  ? "What made this response helpful?"
                  : "Please describe the issue"}
              </Label>
              <Textarea
                id="feedback_text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={
                  feedbackGiven
                    ? "This response was helpful because..."
                    : "The response could be improved by..."
                }
                rows={4}
              />
            </div>

            {!feedbackGiven && (
              <div className="space-y-2">
                <Label htmlFor="suggested_improvement">
                  Suggested Improvement (Optional)
                </Label>
                <Textarea
                  id="suggested_improvement"
                  value={suggestedImprovement}
                  onChange={(e) => setSuggestedImprovement(e.target.value)}
                  placeholder="What would make this response better?"
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDetailedFeedback(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleDetailedFeedback} disabled={submitFeedback.isPending}>
              {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
