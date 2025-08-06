/**
 * Error Formatting Utilities
 * 
 * Functions to format API errors with detailed validation information
 * for better user experience in forms and modals.
 */

export interface ValidationError {
  code: string;
  expected?: string;
  received?: string;
  path: string[];
  message: string;
}

/**
 * Formats an error object into a user-friendly message with details
 */
export function formatErrorMessage(error: any): string {
  if (!error) return 'Unknown error occurred';

  let message = error.message || 'Unknown error occurred';

  // If the error has validation details, format them nicely
  if (error.details && Array.isArray(error.details)) {
    const details = error.details as ValidationError[];
    if (details.length > 0) {
      message += '\n\nValidation errors:';
      details.forEach((detail, index) => {
        const fieldPath = detail.path.length > 0 ? detail.path.join('.') : 'unknown field';
        message += `\n${index + 1}. ${fieldPath}: ${detail.message}`;

        // Add expected vs received info if available
        if (detail.expected && detail.received) {
          message += ` (expected ${detail.expected}, received ${detail.received})`;
        }
      });
    }
  }

  return message;
}

/**
 * Formats validation errors as a structured HTML-friendly format
 */
export function formatErrorAsHtml(error: any): { message: string; details?: ValidationError[] } {
  if (!error) return { message: 'Unknown error occurred' };

  const baseMessage = error.message || 'Unknown error occurred';

  if (error.details && Array.isArray(error.details)) {
    return {
      message: baseMessage,
      details: error.details as ValidationError[]
    };
  }

  return { message: baseMessage };
}

/**
 * Formats a single validation error for display
 */
export function formatValidationError(detail: ValidationError): string {
  const fieldPath = detail.path.length > 0 ? detail.path.join('.') : 'unknown field';
  let message = `${fieldPath}: ${detail.message}`;

  if (detail.expected && detail.received) {
    message += ` (expected ${detail.expected}, received ${detail.received})`;
  }

  return message;
}
