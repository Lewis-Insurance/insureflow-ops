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
    MessageSquare,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
    AI_RESULTS_EMAIL_DISABLED_REASON,
    AI_RESULTS_SMS_DISABLED_REASON,
    isAiResultsSmsActionEnabled,
} from '@/floor/legacyActionGate';
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

// ============================================================================
// UTILITY FUNCTIONS FOR FORMATTING
// ============================================================================

/**
 * Format a snake_case or camelCase key to Title Case
 */
function formatLabel(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Format a primitive value for display
 */
function formatPrimitiveValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';

    if (typeof value === 'number') {
        // Negative numbers (adjustments)
        if (value < 0) return `-$${Math.abs(value).toLocaleString()}`;
        // Large numbers likely money
        if (Math.abs(value) >= 100 && Number.isInteger(value)) {
            return `$${value.toLocaleString()}`;
        }
        // Decimals that look like rates
        if (value < 1 && value > 0) {
            return `${(value * 100).toFixed(2)}%`;
        }
        return value.toLocaleString();
    }

    if (typeof value === 'string') {
        // Money string patterns
        if (/^\$?[\d,]+\.?\d*$/.test(value) && value.length < 20) {
            const cleaned = value.replace(/[$,]/g, '');
            const num = parseFloat(cleaned);
            if (!isNaN(num) && num >= 100) {
                return `$${num.toLocaleString()}`;
            }
        }
        return value;
    }

    return String(value);
}

/**
 * Check if a value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if all items in an array are objects
 */
function isArrayOfObjects(arr: unknown[]): arr is Array<Record<string, unknown>> {
    return arr.length > 0 && arr.every(item => isPlainObject(item));
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

/**
 * Extract JSON from markdown code blocks
 */
function extractJsonFromMarkdown(text: string): Record<string, unknown> | null {
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
        try {
            const parsed = JSON.parse(jsonBlockMatch[1].trim());
            if (isPlainObject(parsed)) {
                return parsed;
            }
        } catch (e) {
            // Not valid JSON
        }
    }
    return null;
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
    const aiResultsSmsEnabled = isAiResultsSmsActionEnabled();

    // Get the actual data to process (handle JSON in markdown)
    const getProcessedResult = (): Record<string, unknown> => {
        const textContent =
            (result.response as string) ||
            (result.answer as string) ||
            (result.content as string) ||
            (result.text as string) ||
            '';

        if (typeof textContent === 'string' && textContent.includes('```')) {
            const extracted = extractJsonFromMarkdown(textContent);
            if (extracted) return extracted;
        }

        return result;
    };

    // Format result as readable text (for copy/notes)
    const formatResultAsText = (): string => {
        const processedResult = getProcessedResult();
        const lines: string[] = [];

        const formatValue = (value: unknown, indent = ''): string => {
            if (value === null || value === undefined) return '-';
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') {
                return formatPrimitiveValue(value);
            }
            if (Array.isArray(value)) {
                if (value.length === 0) return 'None';
                if (isArrayOfObjects(value)) {
                    return value.map((item, i) => {
                        const itemLines = Object.entries(item)
                            .map(([k, v]) => `${indent}    ${formatLabel(k)}: ${formatPrimitiveValue(v)}`)
                            .join('\n');
                        return `${indent}  [${i + 1}]\n${itemLines}`;
                    }).join('\n');
                }
                return value.map(v => `${indent}  • ${formatPrimitiveValue(v)}`).join('\n');
            }
            if (isPlainObject(value)) {
                return Object.entries(value)
                    .map(([k, v]) => {
                        if (isPlainObject(v) || Array.isArray(v)) {
                            return `${indent}  ${formatLabel(k)}:\n${formatValue(v, indent + '    ')}`;
                        }
                        return `${indent}  ${formatLabel(k)}: ${formatPrimitiveValue(v)}`;
                    })
                    .join('\n');
            }
            return String(value);
        };

        Object.entries(processedResult).forEach(([key, value]) => {
            if (key === 'format' || key === 'email_draft') return;
            lines.push(`\n## ${formatLabel(key)}\n`);
            lines.push(formatValue(value));
        });

        return `# ${title}\nGenerated: ${new Date().toLocaleDateString()}\n${lines.join('\n')}`;
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

        const processedResult = getProcessedResult();
        let htmlContent = '';

        const renderValue = (value: unknown): string => {
            if (value === null || value === undefined) return '<span style="color: #999;">-</span>';
            if (typeof value === 'boolean') {
                return value
                    ? '<span style="color: #22c55e; font-weight: 600;">Yes</span>'
                    : '<span style="color: #ef4444; font-weight: 600;">No</span>';
            }
            if (typeof value === 'number' || typeof value === 'string') {
                return formatPrimitiveValue(value);
            }
            if (Array.isArray(value)) {
                if (value.length === 0) return '<em>None</em>';
                if (isArrayOfObjects(value)) {
                    const headers = [...new Set(value.flatMap(obj => Object.keys(obj)))];
                    let table = '<table style="width: 100%; border-collapse: collapse; margin: 10px 0;">';
                    table += '<thead><tr style="background: #f3f4f6;">';
                    headers.forEach(h => {
                        table += `<th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px;">${formatLabel(h)}</th>`;
                    });
                    table += '</tr></thead><tbody>';
                    value.forEach((row, i) => {
                        table += `<tr style="background: ${i % 2 === 0 ? '#fff' : '#fafafa'};">`;
                        headers.forEach(h => {
                            table += `<td style="border: 1px solid #e5e7eb; padding: 8px; font-size: 11px;">${formatPrimitiveValue(row[h])}</td>`;
                        });
                        table += '</tr>';
                    });
                    table += '</tbody></table>';
                    return table;
                }
                return '<ul style="margin: 0; padding-left: 20px;">' +
                    value.map(v => `<li>${formatPrimitiveValue(v)}</li>`).join('') + '</ul>';
            }
            if (isPlainObject(value)) {
                let grid = '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 0;">';
                Object.entries(value).forEach(([k, v]) => {
                    if (isPlainObject(v) || Array.isArray(v)) {
                        grid += `</div><div style="margin: 10px 0;"><strong style="font-size: 12px; color: #666;">${formatLabel(k)}:</strong>${renderValue(v)}</div><div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">`;
                    } else {
                        grid += `<div style="padding: 8px; background: #f9fafb; border-radius: 4px;"><span style="font-size: 10px; color: #666; display: block;">${formatLabel(k)}</span><span style="font-weight: 500;">${formatPrimitiveValue(v)}</span></div>`;
                    }
                });
                grid += '</div>';
                return grid;
            }
            return String(value);
        };

        Object.entries(processedResult).forEach(([key, value]) => {
            if (key === 'format' || key === 'email_draft') return;
            htmlContent += `<section style="margin-bottom: 24px;">
                <h2 style="font-size: 16px; color: #1f2937; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;">${formatLabel(key)}</h2>
                ${typeof value === 'string' && !isPlainObject(value)
                    ? `<p style="color: #4b5563; line-height: 1.6;">${value}</p>`
                    : renderValue(value)}
            </section>`;
        });

        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            padding: 40px; 
            max-width: 900px; 
            margin: 0 auto;
            color: #1f2937;
            line-height: 1.5;
        }
        h1 { 
            color: #111827; 
            font-size: 24px;
            margin-bottom: 8px;
        }
        .meta {
            color: #6b7280;
            font-size: 12px;
            margin-bottom: 32px;
        }
        @media print { 
            body { padding: 20px; }
            section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <p class="meta">Generated: ${new Date().toLocaleString()}</p>
    ${htmlContent}
</body>
</html>`);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 250);
    };

    // =========================================================================
    // PROFESSIONAL PDF GENERATION
    // =========================================================================
    const handleDownloadPdf = () => {
        try {
            const processedResult = getProcessedResult();
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const maxWidth = pageWidth - margin * 2;
            let yPos = margin;

            // Colors
            const colors = {
                primary: [30, 64, 175] as [number, number, number],     // Blue
                secondary: [75, 85, 99] as [number, number, number],    // Gray
                light: [243, 244, 246] as [number, number, number],     // Light gray bg
                border: [229, 231, 235] as [number, number, number],    // Border gray
                text: [31, 41, 55] as [number, number, number],         // Dark text
                success: [34, 197, 94] as [number, number, number],     // Green
                muted: [107, 114, 128] as [number, number, number],     // Muted text
            };

            // Check if we need a new page
            const checkPage = (neededHeight: number = 20) => {
                if (yPos + neededHeight > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                    return true;
                }
                return false;
            };

            // Draw header with brand styling
            const drawHeader = () => {
                // Header background
                doc.setFillColor(...colors.primary);
                doc.rect(0, 0, pageWidth, 35, 'F');

                // Title
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.text(title, margin, 22);

                // Date
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 30);

                yPos = 50;
                doc.setTextColor(...colors.text);
            };

            // Draw section header
            const drawSectionHeader = (label: string) => {
                checkPage(25);

                // Section underline
                doc.setDrawColor(...colors.primary);
                doc.setLineWidth(0.5);

                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...colors.primary);
                doc.text(label, margin, yPos);

                doc.line(margin, yPos + 2, margin + doc.getTextWidth(label), yPos + 2);

                yPos += 10;
                doc.setTextColor(...colors.text);
            };

            // Draw key-value pair
            const drawKeyValue = (key: string, value: string, indentLevel: number = 0) => {
                checkPage(10);

                const indent = margin + (indentLevel * 10);
                const keyWidth = 55 - (indentLevel * 5);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...colors.muted);
                doc.text(formatLabel(key).toUpperCase(), indent, yPos);

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...colors.text);

                const valueLines = doc.splitTextToSize(value, maxWidth - keyWidth - indent + margin);
                doc.text(valueLines, indent + keyWidth, yPos);

                yPos += Math.max(valueLines.length * 5, 6);
            };

            // Draw a data grid (for objects with simple values)
            const drawDataGrid = (data: Record<string, unknown>, indentLevel: number = 0) => {
                const entries = Object.entries(data);
                const simpleEntries: [string, unknown][] = [];
                const complexEntries: [string, unknown][] = [];

                entries.forEach(([k, v]) => {
                    if (isPlainObject(v) || Array.isArray(v)) {
                        complexEntries.push([k, v]);
                    } else {
                        simpleEntries.push([k, v]);
                    }
                });

                // Draw simple entries in a 2-column grid
                if (simpleEntries.length > 0) {
                    const colWidth = (maxWidth - 10) / 2;
                    let col = 0;
                    let rowStartY = yPos;

                    simpleEntries.forEach(([key, value], idx) => {
                        if (col === 0) {
                            checkPage(15);
                            rowStartY = yPos;
                        }

                        const xPos = margin + (col * (colWidth + 10));

                        // Background box
                        doc.setFillColor(...colors.light);
                        doc.roundedRect(xPos, yPos - 4, colWidth, 14, 2, 2, 'F');

                        // Label
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...colors.muted);
                        doc.text(formatLabel(key).toUpperCase(), xPos + 3, yPos);

                        // Value
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...colors.text);
                        const valueText = formatPrimitiveValue(value);
                        const truncated = valueText.length > 30 ? valueText.substring(0, 27) + '...' : valueText;
                        doc.text(truncated, xPos + 3, yPos + 6);

                        col++;
                        if (col >= 2) {
                            col = 0;
                            yPos += 18;
                        }
                    });

                    if (col !== 0) yPos += 18; // Complete partial row
                    yPos += 4;
                }

                // Draw complex entries
                complexEntries.forEach(([key, value]) => {
                    checkPage(15);

                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...colors.secondary);
                    doc.text(formatLabel(key), margin + (indentLevel * 10), yPos);
                    yPos += 6;

                    renderValue(value, indentLevel + 1);
                });
            };

            // Draw a table (for arrays of objects)
            const drawTable = (data: Array<Record<string, unknown>>) => {
                if (data.length === 0) return;

                const headers = [...new Set(data.flatMap(obj => Object.keys(obj)))];
                const colCount = Math.min(headers.length, 5); // Max 5 columns
                const displayHeaders = headers.slice(0, colCount);
                const colWidth = maxWidth / colCount;
                const rowHeight = 8;

                checkPage(rowHeight * 3);

                // Table header
                doc.setFillColor(...colors.primary);
                doc.rect(margin, yPos - 4, maxWidth, rowHeight + 2, 'F');

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);

                displayHeaders.forEach((header, i) => {
                    const truncatedHeader = formatLabel(header).substring(0, 15);
                    doc.text(truncatedHeader, margin + (i * colWidth) + 2, yPos);
                });

                yPos += rowHeight;

                // Table rows
                doc.setFont('helvetica', 'normal');
                data.forEach((row, rowIdx) => {
                    checkPage(rowHeight + 2);

                    // Alternating row background
                    if (rowIdx % 2 === 0) {
                        doc.setFillColor(...colors.light);
                        doc.rect(margin, yPos - 4, maxWidth, rowHeight, 'F');
                    }

                    doc.setTextColor(...colors.text);
                    doc.setFontSize(7);

                    displayHeaders.forEach((header, i) => {
                        const cellValue = formatPrimitiveValue(row[header]);
                        const truncated = cellValue.length > 20 ? cellValue.substring(0, 17) + '...' : cellValue;
                        doc.text(truncated, margin + (i * colWidth) + 2, yPos);
                    });

                    yPos += rowHeight;
                });

                // Table border
                doc.setDrawColor(...colors.border);
                doc.setLineWidth(0.1);
                doc.rect(margin, yPos - (rowHeight * (data.length + 1)) - 4, maxWidth, rowHeight * (data.length + 1) + 2);

                yPos += 8;
            };

            // Draw bullet list (for arrays of primitives)
            const drawBulletList = (items: unknown[]) => {
                items.forEach(item => {
                    checkPage(7);

                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...colors.text);

                    // Bullet point
                    doc.setFillColor(...colors.success);
                    doc.circle(margin + 2, yPos - 1.5, 1.5, 'F');

                    const text = formatPrimitiveValue(item);
                    const lines = doc.splitTextToSize(text, maxWidth - 15);
                    doc.text(lines, margin + 8, yPos);

                    yPos += lines.length * 5 + 2;
                });
                yPos += 4;
            };

            // Main value renderer
            const renderValue = (value: unknown, indentLevel: number = 0) => {
                if (value === null || value === undefined) {
                    drawKeyValue('Value', '-', indentLevel);
                    return;
                }

                if (typeof value === 'string') {
                    // Long text block
                    if (value.length > 100) {
                        checkPage(30);
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...colors.secondary);
                        const lines = doc.splitTextToSize(value, maxWidth - (indentLevel * 10));
                        lines.forEach((line: string) => {
                            checkPage(6);
                            doc.text(line, margin + (indentLevel * 10), yPos);
                            yPos += 5;
                        });
                        yPos += 4;
                    } else {
                        drawKeyValue('', formatPrimitiveValue(value), indentLevel);
                    }
                    return;
                }

                if (typeof value === 'number' || typeof value === 'boolean') {
                    drawKeyValue('', formatPrimitiveValue(value), indentLevel);
                    return;
                }

                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        doc.setFontSize(9);
                        doc.setTextColor(...colors.muted);
                        doc.text('None', margin + (indentLevel * 10), yPos);
                        yPos += 6;
                        return;
                    }

                    if (isArrayOfObjects(value)) {
                        drawTable(value);
                    } else {
                        drawBulletList(value);
                    }
                    return;
                }

                if (isPlainObject(value)) {
                    drawDataGrid(value, indentLevel);
                    return;
                }

                // Fallback
                doc.setFontSize(9);
                doc.setTextColor(...colors.text);
                doc.text(String(value), margin + (indentLevel * 10), yPos);
                yPos += 6;
            };

            // ============= BUILD THE PDF =============

            drawHeader();

            // Process each section
            Object.entries(processedResult).forEach(([key, value]) => {
                if (key === 'format' || key === 'email_draft') return;

                drawSectionHeader(formatLabel(key));
                renderValue(value, 0);
                yPos += 8;
            });

            // Footer on each page
            const totalPages = doc.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(...colors.muted);
                doc.text(
                    `Page ${i} of ${totalPages}`,
                    pageWidth / 2,
                    pageHeight - 10,
                    { align: 'center' }
                );
                doc.text(
                    'Lewis Insurance • AI Analysis Report',
                    margin,
                    pageHeight - 10
                );
            }

            doc.save(`${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);

            toast({
                title: 'Downloaded!',
                description: 'Professional PDF saved to your downloads',
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
        } catch (error: unknown) {
            console.error('Error saving note:', error);
            toast({
                title: 'Error',
                description: errorMessage(error, 'Failed to save note'),
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
        } catch (error: unknown) {
            console.error('Error creating task:', error);
            toast({
                title: 'Error',
                description: errorMessage(error, 'Failed to create task'),
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className={cn(
                'flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/50 border',
                className
            )}>
                {/* Primary Export Actions */}
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

                {/* Divider */}
                <div className="h-6 w-px bg-border mx-1" />

                {/* CRM Actions - More Visible */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNoteDialog(true)}
                    disabled={!accountId}
                    title={!accountId ? 'Link to account first' : 'Save to account notes'}
                >
                    <StickyNote className="h-4 w-4 mr-1.5" />
                    Add Note
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTaskDialog(true)}
                >
                    <ListTodo className="h-4 w-4 mr-1.5" />
                    Create Task
                </Button>

                {/* More Actions Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                            <MoreHorizontal className="h-4 w-4 mr-1.5" />
                            Share
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            disabled={!aiResultsSmsEnabled}
                            onSelect={(event) => {
                                if (!aiResultsSmsEnabled) {
                                    event.preventDefault();
                                    toast({
                                        title: 'SMS gated by the Floor',
                                        description: AI_RESULTS_SMS_DISABLED_REASON,
                                        variant: 'destructive',
                                    });
                                    return;
                                }

                                toast({
                                    title: 'SMS gated by the Floor',
                                    description: AI_RESULTS_SMS_DISABLED_REASON,
                                    variant: 'destructive',
                                });
                            }}
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            SMS gated by Floor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled
                            onSelect={(event) => {
                                event.preventDefault();
                                toast({
                                    title: 'Email gated by the Floor',
                                    description: AI_RESULTS_EMAIL_DISABLED_REASON,
                                    variant: 'destructive',
                                });
                            }}
                        >
                            <Mail className="h-4 w-4 mr-2" />
                            Email gated by Floor
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
