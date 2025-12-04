/**
 * UI Component Type Definitions
 *
 * Centralized type definitions for UI components to avoid 'as any' casts
 */

// Badge component variants
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// Button component variants (from shadcn/ui)
export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

// Button sizes
export type ButtonSize = "default" | "sm" | "lg" | "icon";

// Alert variants
export type AlertVariant = "default" | "destructive";

// Toast variants
export type ToastVariant = "default" | "destructive";

// Common status types
export type Status =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

// Priority levels
export type Priority = "low" | "medium" | "high" | "urgent";

// Lead/Customer status
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

// Policy status
export type PolicyStatus =
  | "draft"
  | "active"
  | "expired"
  | "cancelled"
  | "pending";

// Renewal status
export type RenewalStatus =
  | "upcoming"
  | "in_progress"
  | "completed"
  | "lost";

// Task status
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

// Ticket status
export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "resolved"
  | "closed";

// Generic form field types
export type FieldType =
  | "text"
  | "email"
  | "number"
  | "tel"
  | "url"
  | "password"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "date"
  | "datetime-local"
  | "file";

// Sort direction
export type SortDirection = "asc" | "desc";

// Data table column alignment
export type ColumnAlignment = "left" | "center" | "right";

// Modal/Dialog sizes
export type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

// Color scheme/theme
export type ColorScheme = "light" | "dark" | "system";

// Notification types
export type NotificationType = "info" | "success" | "warning" | "error";
