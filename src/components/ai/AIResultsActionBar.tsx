/**
 * AI Results Action Bar
 * 
 * Sticky action bar for AI analysis results.
 * Actions: Download PDF, Copy, Email, Print, Save as Note, Create Task
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Download,
    Copy,
    Mail,
    Printer,
    StickyNote,
    ListTodo,
    Check,
    MoreHorizontal,
    Loader2,
    Building2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';

interface AIResultsActionBarProps {
    result: Record<string, unknown>;
    title?: string;
    accountId?: string;
    accountName?: string;
    moduleSlug?: string;
    documentIds?: string[];
    className?: string;
    onFollowUp?: () => void;
}

export function AIResultsActionBar({
    result,
    title = 'AI Analysis Results',
    accountId,
    accountName,
    moduleSlug,
    documentIds = [],
    className,
    onFollowUp,
}: AIResultsActionBarProps) {
    const { toast } = useToast();
    const { createTask } = useTasks(accountId);

    const [copied, setCopied] = useState(false);
    const [showNoteDialog, setShowNoteDialog] = useState(false);
    const [showTaskDialog, setShowTaskDialog] = useState(false);
    const [noteContent, setNoteContent] = useState('');
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDescription, setTaskDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Format result as readable text
    const formatResultAsText = (): string => {
        const lines: string[] = [];

        const formatValue = (value: unknown, indent = ''): string => {
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') return value;
            if (typeof value === 'number') return value.toLocaleString();
            if (typeof value === 'boolean') return value ? 'Yes' : 'No';
            if (Array.isArray(value)) {
                return value.map(v => formatValue(v, indent + '  ')).join('\n');
            }
            if (typeof value === 'object') {
                return Object.entries(value)
                    .map(([k, v]) => `${indent}${formatLabel(k)}: ${formatValue(v, indent + '  ')}`)
                    .join('\n');
            }
            return String(value);
        };

        const formatLabel = (key: string): string => {
            return key
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
        };

        Object.entries(result).forEach(([key, value]) => {
            if (key === 'format' || key === 'email_draft') return;
            lines.push(`\n## ${formatLabel(key)}\n`);
            lines.push(formatValue(value));
        });

        return `# ${title}\n${lines.join('\n')}`;
    };

    // Copy to clipboard
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(formatResultAsText());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast({
                title: 'Copied!',
                description: 'Results copied to clipboard',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to copy to clipboard',
                variant: 'destructive',
            });
        }
    };

    // Print
    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast({
                title: 'Error',
                description: 'Please allow popups to print',
                variant: 'destructive',
            });
            return;
        }

        const content = formatResultAsText()
            .replace(/\n/g, '<br>')
            .replace(/## /g, '<h2>')
            .replace(/<br><h2>/g, '</p><h2>')
            .replace(/<h2>(.+?)(<br>|$)/g, '<h2>$1</h2><p>');

        printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #1a1a1a; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px; }
            h2 { color: #333; margin-top: 24px; margin-bottom: 8px; }
            p { color: #666; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            th, td { border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; }
            th { background: #f5f5f5; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${content}
        </body>
      </html>
    `);
        printWindow.document.close();
        printWindow.print();
    };

    // Download PDF
    const handleDownloadPdf = () => {
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;
            const maxWidth = pageWidth - margin * 2;
            let yPosition = 20;

            // Title
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin, yPosition);
            yPosition += 15;

            // Date
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(128, 128, 128);
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPosition);
            yPosition += 15;

            doc.setTextColor(0, 0, 0);

            const addSection = (label: string, value: unknown) => {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }

                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text(label, margin, yPosition);
                yPosition += 7;

                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');

                const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
                const lines = doc.splitTextToSize(text, maxWidth);

                lines.forEach((line: string) => {
                    if (yPosition > 280) {
                        doc.addPage();
                        yPosition = 20;
                    }
                    doc.text(line, margin, yPosition);
                    yPosition += 5;
                });

                yPosition += 8;
            };

            Object.entries(result).forEach(([key, value]) => {
                if (key === 'format' || key === 'email_draft') return;
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                addSection(label, value);
            });

            doc.save(`${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);

            toast({
                title: 'Downloaded!',
                description: 'PDF saved to your downloads',
            });
        } catch (error) {
            console.error('PDF generation error:', error);
            toast({
                title: 'Error',
                description: 'Failed to generate PDF',
                variant: 'destructive',
            });
        }
    };

    // Save as Note - creates a task with the analysis attached
    const handleSaveNote = async () => {
        if (!accountId) {
            toast({
                title: 'No account linked',
                description: 'Please link this analysis to an account first',
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            // Save as a task with 'service' category (acts as a note)
            await createTask({
                account_id: accountId,
                title: `AI Analysis: ${title}`,
                description: noteContent || 'AI-generated analysis saved as note',
                notes: formatResultAsText(),
                category: 'service',
                priority: 'low',
                status: 'completed', // Mark as completed since it's just a note
                metadata: {
                    source: 'ai_analysis_note',
                    module_slug: moduleSlug,
                    document_ids: documentIds,
                    result_summary: result,
                },
            });

            toast({
                title: 'Note saved!',
                description: `Added to ${accountName || 'account'} records`,
            });
            setShowNoteDialog(false);
            setNoteContent('');
        } catch (error: any) {
            console.error('Error saving note:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to save note',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Create Task
    const handleCreateTask = async () => {
        setIsSaving(true);
        try {
            await createTask({
                account_id: accountId || undefined,
                title: taskTitle || `Follow-up: ${title}`,
                description: taskDescription || undefined,
                notes: formatResultAsText(),
                category: 'general',
                priority: 'medium',
                metadata: {
                    source: 'ai_analysis',
                    module_slug: moduleSlug,
                    document_ids: documentIds,
                    result_summary: result,
                },
            });

            toast({
                title: 'Task created!',
                description: 'View in your task list',
            });
            setShowTaskDialog(false);
            setTaskTitle('');
            setTaskDescription('');
        } catch (error: any) {
            console.error('Error creating task:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to create task',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className={cn(
                'flex items-center gap-2 p-3 rounded-lg bg-muted/50 border',
                className
            )}>
                {/* Primary Actions */}
                <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                    <Download className="h-4 w-4 mr-1.5" />
                    PDF
                </Button>

                <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                        <Check className="h-4 w-4 mr-1.5 text-green-500" />
                    ) : (
                        <Copy className="h-4 w-4 mr-1.5" />
                    )}
                    {copied ? 'Copied!' : 'Copy'}
                </Button>

                <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Print
                </Button>

                {/* More Actions Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                            <MoreHorizontal className="h-4 w-4 mr-1.5" />
                            More
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setShowNoteDialog(true)}>
                            <StickyNote className="h-4 w-4 mr-2" />
                            Save as Note
                            {accountName && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                    {accountName}
                                </Badge>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowTaskDialog(true)}>
                            <ListTodo className="h-4 w-4 mr-2" />
                            Create Task
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {/* TODO: Email modal */ }}>
                            <Mail className="h-4 w-4 mr-2" />
                            Email Results
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Linked Account Badge */}
                {accountName && (
                    <Badge variant="secondary" className="ml-auto">
                        <Building2 className="h-3 w-3 mr-1" />
                        {accountName}
                    </Badge>
                )}
            </div>

            {/* Save as Note Dialog */}
            <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save as Note</DialogTitle>
                        <DialogDescription>
                            Add this analysis to {accountName || 'the account'}'s activity timeline
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="note-content">Additional Notes (optional)</Label>
                            <Textarea
                                id="note-content"
                                value={noteContent}
                                onChange={(e) => setNoteContent(e.target.value)}
                                placeholder="Add any additional context or notes..."
                                rows={4}
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            The full analysis results will be attached automatically.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Cancel</Button>
                        <Button onClick={handleSaveNote} disabled={isSaving || !accountId}>
                            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Save Note
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Task Dialog */}
            <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Task</DialogTitle>
                        <DialogDescription>
                            Create a follow-up task with this analysis attached
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="task-title">Task Title</Label>
                            <Input
                                id="task-title"
                                value={taskTitle}
                                onChange={(e) => setTaskTitle(e.target.value)}
                                placeholder={`Follow-up: ${title}`}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="task-description">Description (optional)</Label>
                            <Textarea
                                id="task-description"
                                value={taskDescription}
                                onChange={(e) => setTaskDescription(e.target.value)}
                                placeholder="What needs to be done?"
                                rows={3}
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            The full analysis will be saved in the task notes.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowTaskDialog(false)}>Cancel</Button>
                        <Button onClick={handleCreateTask} disabled={isSaving}>
                            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Create Task
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default AIResultsActionBar;
