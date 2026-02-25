/**
 * Safe Entity Logger - Ensures all entity writes with level/message requirements have defaults
 * Prevents 500 errors from missing required fields in logging entities
 */

/**
 * Safely create a ClientTelemetry log entry with guaranteed defaults
 * @param {Object} base44 - Base44 SDK instance
 * @param {Object} data - Log data (level, message, context_json, etc.)
 * @returns {Promise} Created telemetry record
 */
export async function safeLogTelemetry(base44, data = {}) {
  // Ensure required fields with safe defaults
  const safeData = {
    level: data.level || 'info',
    message: data.message || 'No message provided',
    timestamp: data.timestamp || new Date().toISOString(),
    ...data
  };
  
  // Validate level is one of the allowed enum values
  const validLevels = ['info', 'warn', 'error', 'invariant'];
  if (!validLevels.includes(safeData.level)) {
    // Invalid level - store in metadata and default to info
    safeData.context_json = safeData.context_json || {};
    safeData.context_json.invalid_level = safeData.level;
    safeData.level = 'info';
  }
  
  return await base44.asServiceRole.entities.ClientTelemetry.create(safeData);
}

/**
 * Safely create an AuditLog entry with guaranteed defaults
 * @param {Object} base44 - Base44 SDK instance  
 * @param {Object} data - Audit log data
 * @returns {Promise} Created audit log record
 */
export async function safeLogAudit(base44, data = {}) {
  const safeData = {
    tenant_id: data.tenant_id,
    action: data.action || 'unknown_action',
    performed_by: data.performed_by || 'system',
    ...data
  };
  
  // Ensure tenant_id is present
  if (!safeData.tenant_id) {
    throw new Error('tenant_id is required for audit logs');
  }
  
  return await base44.asServiceRole.entities.AuditLog.create(safeData);
}