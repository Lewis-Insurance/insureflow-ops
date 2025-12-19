// ============================================
// ACORD Form Versioning System
// Manages template versions and form migrations
// ============================================

import { supabase } from '@/integrations/supabase/client';
import type { AcordTemplate, AcordForm } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: string;
  formNumber: string;
  formName: string;
  effectiveDate: string | null;
  sunsetDate: string | null;
  isCurrent: boolean;
  changesSummary: VersionChange[];
  fieldCount: number;
  createdAt: string;
}

export interface VersionChange {
  type: 'added' | 'removed' | 'modified' | 'renamed';
  fieldName: string;
  oldValue?: any;
  newValue?: any;
  description: string;
}

export interface MigrationPlan {
  fromVersion: string;
  toVersion: string;
  formId: string;
  affectedFields: FieldMigration[];
  canAutoMigrate: boolean;
  requiresReview: string[];
  estimatedDataLoss: number; // percentage
}

export interface FieldMigration {
  fieldName: string;
  action: 'keep' | 'transform' | 'drop' | 'manual';
  currentValue: any;
  newFieldName?: string;
  transformedValue?: any;
  notes?: string;
}

export interface MigrationResult {
  success: boolean;
  migratedFormId?: string;
  fieldsMigrated: number;
  fieldsDropped: number;
  warnings: string[];
  errors: string[];
}

// ============================================
// VERSION MANAGEMENT
// ============================================

/**
 * Get all versions of a template by form number
 */
export async function getTemplateVersions(formNumber: string): Promise<TemplateVersion[]> {
  try {
    const { data, error } = await supabase
      .from('acord_templates')
      .select('*')
      .eq('form_number', formNumber)
      .order('effective_date', { ascending: false });

    if (error) throw error;

    return (data || []).map(t => ({
      id: t.id,
      templateId: t.id,
      version: t.version,
      formNumber: t.form_number,
      formName: t.form_name,
      effectiveDate: t.effective_date,
      sunsetDate: t.sunset_date,
      isCurrent: t.is_current,
      changesSummary: [], // Would be populated from version diff
      fieldCount: t.field_inventory?.length || 0,
      createdAt: t.created_at,
    }));
  } catch (error) {
    console.error('Failed to get template versions:', error);
    return [];
  }
}

/**
 * Get the current active version of a template
 */
export async function getCurrentVersion(formNumber: string): Promise<TemplateVersion | null> {
  try {
    const { data, error } = await supabase
      .from('acord_templates')
      .select('*')
      .eq('form_number', formNumber)
      .eq('is_current', true)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      templateId: data.id,
      version: data.version,
      formNumber: data.form_number,
      formName: data.form_name,
      effectiveDate: data.effective_date,
      sunsetDate: data.sunset_date,
      isCurrent: true,
      changesSummary: [],
      fieldCount: data.field_inventory?.length || 0,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('Failed to get current version:', error);
    return null;
  }
}

/**
 * Compare two template versions and identify changes
 */
export function compareVersions(
  oldTemplate: AcordTemplate,
  newTemplate: AcordTemplate
): VersionChange[] {
  const changes: VersionChange[] = [];

  const oldFields = new Map(oldTemplate.field_inventory.map(f => [f.name, f]));
  const newFields = new Map(newTemplate.field_inventory.map(f => [f.name, f]));

  // Find removed fields
  for (const [name, field] of oldFields) {
    if (!newFields.has(name)) {
      changes.push({
        type: 'removed',
        fieldName: name,
        oldValue: field,
        description: `Field "${name}" was removed in the new version`,
      });
    }
  }

  // Find added fields
  for (const [name, field] of newFields) {
    if (!oldFields.has(name)) {
      changes.push({
        type: 'added',
        fieldName: name,
        newValue: field,
        description: `Field "${name}" was added in the new version`,
      });
    }
  }

  // Find modified fields
  for (const [name, newField] of newFields) {
    const oldField = oldFields.get(name);
    if (oldField) {
      const modifications: string[] = [];

      if (oldField.type !== newField.type) {
        modifications.push(`type changed from ${oldField.type} to ${newField.type}`);
      }
      if (oldField.required !== newField.required) {
        modifications.push(`required changed from ${oldField.required} to ${newField.required}`);
      }
      if (oldField.maxLength !== newField.maxLength) {
        modifications.push(`maxLength changed from ${oldField.maxLength} to ${newField.maxLength}`);
      }

      if (modifications.length > 0) {
        changes.push({
          type: 'modified',
          fieldName: name,
          oldValue: oldField,
          newValue: newField,
          description: `Field "${name}": ${modifications.join(', ')}`,
        });
      }
    }
  }

  return changes;
}

/**
 * Set a version as the current active version
 */
export async function setCurrentVersion(
  formNumber: string,
  versionId: string
): Promise<boolean> {
  try {
    // First, unset current flag on all versions
    const { error: unsetError } = await supabase
      .from('acord_templates')
      .update({ is_current: false })
      .eq('form_number', formNumber);

    if (unsetError) throw unsetError;

    // Set the new current version
    const { error: setError } = await supabase
      .from('acord_templates')
      .update({ is_current: true })
      .eq('id', versionId);

    if (setError) throw setError;

    return true;
  } catch (error) {
    console.error('Failed to set current version:', error);
    return false;
  }
}

// ============================================
// MIGRATION PLANNING
// ============================================

/**
 * Create a migration plan for a form from one version to another
 */
export async function createMigrationPlan(
  formId: string,
  targetVersionId: string
): Promise<MigrationPlan | null> {
  try {
    // Get the form and its current template
    const { data: form, error: formError } = await supabase
      .from('acord_forms')
      .select('*, template:template_id(*)')
      .eq('id', formId)
      .single();

    if (formError) throw formError;

    // Get the target template
    const { data: targetTemplate, error: targetError } = await supabase
      .from('acord_templates')
      .select('*')
      .eq('id', targetVersionId)
      .single();

    if (targetError) throw targetError;

    const currentTemplate = form.template as AcordTemplate;
    const fieldValues = form.field_values || {};

    // Compare versions
    const changes = compareVersions(currentTemplate, targetTemplate);

    // Build field migrations
    const affectedFields: FieldMigration[] = [];
    const requiresReview: string[] = [];
    let droppedFieldsWithData = 0;

    // Check removed fields
    const removedFields = changes.filter(c => c.type === 'removed');
    for (const change of removedFields) {
      const currentValue = fieldValues[change.fieldName];
      if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        droppedFieldsWithData++;
        requiresReview.push(
          `Field "${change.fieldName}" will be removed but contains data: "${currentValue}"`
        );
      }
      affectedFields.push({
        fieldName: change.fieldName,
        action: 'drop',
        currentValue,
        notes: 'Field removed in new version',
      });
    }

    // Check modified fields
    const modifiedFields = changes.filter(c => c.type === 'modified');
    for (const change of modifiedFields) {
      const currentValue = fieldValues[change.fieldName];
      const needsTransform = change.oldValue?.type !== change.newValue?.type;

      if (needsTransform && currentValue) {
        requiresReview.push(
          `Field "${change.fieldName}" type changed - value may need transformation`
        );
      }

      affectedFields.push({
        fieldName: change.fieldName,
        action: needsTransform ? 'transform' : 'keep',
        currentValue,
        transformedValue: needsTransform ? transformFieldValue(currentValue, change.newValue?.type) : currentValue,
        notes: change.description,
      });
    }

    // Add new fields (will be empty)
    const addedFields = changes.filter(c => c.type === 'added');
    for (const change of addedFields) {
      if (change.newValue?.required) {
        requiresReview.push(`New required field "${change.fieldName}" needs to be filled`);
      }
      affectedFields.push({
        fieldName: change.fieldName,
        action: 'manual',
        currentValue: null,
        notes: 'New field in target version',
      });
    }

    // Calculate data loss percentage
    const totalFieldsWithData = Object.keys(fieldValues).filter(
      k => fieldValues[k] !== undefined && fieldValues[k] !== null && fieldValues[k] !== ''
    ).length;
    const estimatedDataLoss = totalFieldsWithData > 0
      ? Math.round((droppedFieldsWithData / totalFieldsWithData) * 100)
      : 0;

    return {
      fromVersion: currentTemplate.version,
      toVersion: targetTemplate.version,
      formId,
      affectedFields,
      canAutoMigrate: requiresReview.length === 0 && estimatedDataLoss === 0,
      requiresReview,
      estimatedDataLoss,
    };
  } catch (error) {
    console.error('Failed to create migration plan:', error);
    return null;
  }
}

/**
 * Transform a field value to a new type
 */
function transformFieldValue(value: any, newType: string): any {
  if (value === null || value === undefined) return null;

  switch (newType) {
    case 'text':
      return String(value);
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    case 'checkbox':
      return value === 'true' || value === true || value === '1' || value === 1;
    case 'date':
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
    default:
      return value;
  }
}

// ============================================
// MIGRATION EXECUTION
// ============================================

/**
 * Execute a migration plan
 */
export async function executeMigration(
  plan: MigrationPlan,
  options: {
    createCopy?: boolean; // If true, creates new form instead of updating
    preserveOriginal?: boolean; // If true, keeps old form as archived
  } = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    fieldsMigrated: 0,
    fieldsDropped: 0,
    warnings: [],
    errors: [],
  };

  try {
    // Get the original form
    const { data: originalForm, error: formError } = await supabase
      .from('acord_forms')
      .select('*')
      .eq('id', plan.formId)
      .single();

    if (formError) throw formError;

    // Get target template
    const { data: targetTemplate, error: templateError } = await supabase
      .from('acord_templates')
      .select('*')
      .eq('version', plan.toVersion)
      .single();

    if (templateError) throw templateError;

    // Build new field values
    const newFieldValues: Record<string, any> = {};
    const oldFieldValues = originalForm.field_values || {};

    for (const field of plan.affectedFields) {
      switch (field.action) {
        case 'keep':
          newFieldValues[field.fieldName] = field.currentValue;
          result.fieldsMigrated++;
          break;
        case 'transform':
          newFieldValues[field.fieldName] = field.transformedValue;
          result.fieldsMigrated++;
          if (field.currentValue !== field.transformedValue) {
            result.warnings.push(
              `Field "${field.fieldName}" transformed: ${field.currentValue} → ${field.transformedValue}`
            );
          }
          break;
        case 'drop':
          result.fieldsDropped++;
          if (field.currentValue) {
            result.warnings.push(
              `Field "${field.fieldName}" dropped with value: ${field.currentValue}`
            );
          }
          break;
        case 'manual':
          // New fields, leave empty
          break;
      }
    }

    // Also keep fields that weren't in the migration plan (unchanged fields)
    for (const [key, value] of Object.entries(oldFieldValues)) {
      if (!plan.affectedFields.find(f => f.fieldName === key)) {
        newFieldValues[key] = value;
        result.fieldsMigrated++;
      }
    }

    if (options.createCopy) {
      // Create a new form with migrated data
      const { data: newForm, error: createError } = await supabase
        .from('acord_forms')
        .insert({
          account_id: originalForm.account_id,
          template_id: targetTemplate.id,
          intake_submission_id: originalForm.intake_submission_id,
          field_values: newFieldValues,
          has_addendum: originalForm.has_addendum,
          cloned_from: originalForm.id,
          signature_status: 'unsigned',
          submission_status: 'draft',
          created_by: originalForm.created_by,
          row_version: 1,
        })
        .select()
        .single();

      if (createError) throw createError;
      result.migratedFormId = newForm.id;

      if (options.preserveOriginal) {
        // Mark original as archived (would need archive flag in schema)
        result.warnings.push('Original form preserved');
      }
    } else {
      // Update existing form
      const { error: updateError } = await supabase
        .from('acord_forms')
        .update({
          template_id: targetTemplate.id,
          field_values: newFieldValues,
          row_version: originalForm.row_version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.formId);

      if (updateError) throw updateError;
      result.migratedFormId = plan.formId;
    }

    // Log the migration in audit
    await logMigrationAudit(plan.formId, result, plan);

    result.success = true;
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Migration failed');
    return result;
  }
}

/**
 * Log migration to audit trail
 */
async function logMigrationAudit(
  formId: string,
  result: MigrationResult,
  plan: MigrationPlan
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('acord_field_audit').insert({
      acord_form_id: formId,
      field_name: '__migration__',
      old_value: plan.fromVersion,
      new_value: plan.toVersion,
      is_encrypted: false,
      changed_by: user?.id,
      change_source: 'api',
    });
  } catch (error) {
    console.error('Failed to log migration audit:', error);
  }
}

// ============================================
// BATCH MIGRATION
// ============================================

/**
 * Find all forms using an outdated template version
 */
export async function findFormsNeedingMigration(formNumber: string): Promise<{
  formId: string;
  accountId: string;
  currentVersion: string;
  latestVersion: string;
}[]> {
  try {
    // Get current version
    const currentVersion = await getCurrentVersion(formNumber);
    if (!currentVersion) return [];

    // Find forms using older versions
    const { data: forms, error } = await supabase
      .from('acord_forms')
      .select(`
        id,
        account_id,
        template:template_id(version, form_number)
      `)
      .neq('template_id', currentVersion.id);

    if (error) throw error;

    return (forms || [])
      .filter(f => (f.template as any)?.form_number === formNumber)
      .map(f => ({
        formId: f.id,
        accountId: f.account_id,
        currentVersion: (f.template as any)?.version || 'unknown',
        latestVersion: currentVersion.version,
      }));
  } catch (error) {
    console.error('Failed to find forms needing migration:', error);
    return [];
  }
}

/**
 * Batch migrate multiple forms
 */
export async function batchMigrate(
  formIds: string[],
  targetVersionId: string,
  options?: { createCopy?: boolean }
): Promise<{
  totalForms: number;
  successCount: number;
  failedCount: number;
  results: Map<string, MigrationResult>;
}> {
  const results = new Map<string, MigrationResult>();
  let successCount = 0;
  let failedCount = 0;

  for (const formId of formIds) {
    const plan = await createMigrationPlan(formId, targetVersionId);
    if (!plan) {
      results.set(formId, {
        success: false,
        fieldsMigrated: 0,
        fieldsDropped: 0,
        warnings: [],
        errors: ['Failed to create migration plan'],
      });
      failedCount++;
      continue;
    }

    const result = await executeMigration(plan, options);
    results.set(formId, result);

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  return {
    totalForms: formIds.length,
    successCount,
    failedCount,
    results,
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  getTemplateVersions,
  getCurrentVersion,
  compareVersions,
  setCurrentVersion,
  createMigrationPlan,
  executeMigration,
  findFormsNeedingMigration,
  batchMigrate,
};
