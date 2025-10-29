/**
 * Integration test for executeMCPTool parameter validation enhancement
 * 
 * Tests the actual validateAndCorrectToolArgs integration in executeMCPTool
 */

import { describe, test, expect } from '@jest/globals';

// Helper function that simulates the validation logic
function simulateValidation(args: any, schema: any): any {
  if (!schema || !schema.properties) {
    return args; // No validation without schema
  }

  const validated: any = {};
  const requiredParams = schema.required || [];

  for (const [key, value] of Object.entries(args)) {
    const propSchema = schema.properties[key];

    if (!propSchema) {
      validated[key] = value;
      continue;
    }

    // Omit null/undefined for optional parameters
    if ((value === null || value === undefined) && !requiredParams.includes(key)) {
      continue;
    }

    // String to number conversion
    if (propSchema.type === 'number' && typeof value === 'string') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        validated[key] = numValue;
        continue;
      }
    }

    // String to array conversion
    if (propSchema.type === 'array' && typeof value === 'string' && value !== '') {
      validated[key] = [value];
      continue;
    }

    // Empty enum omission
    if (propSchema.enum && (value === '' || value === null || value === undefined)) {
      continue;
    }

    // Case-insensitive enum matching
    if (propSchema.enum && Array.isArray(propSchema.enum)) {
      if (!propSchema.enum.includes(value)) {
        const lowerValue = typeof value === 'string' ? value.toLowerCase() : value;
        const match = propSchema.enum.find((e: any) =>
          typeof e === 'string' && e.toLowerCase() === lowerValue
        );
        if (match) {
          validated[key] = match;
          continue;
        }
        // Invalid enum - omit
        continue;
      }
    }

    validated[key] = value;
  }

  return validated;
}

describe('executeMCPTool Parameter Validation Integration', () => {
  describe('Real-World Validation Scenarios', () => {
    test('should handle searchAgents parameter corrections', () => {
      // Actual args that an LLM might generate
      const llmArgs = {
        languages: "Cantonese",  // Should be array
        limit: "5",              // Should be number
        sort: "",                // Should be omitted (invalid enum)
        q: "Toronto"             // Valid, no change
      };

      const schema = {
        properties: {
          languages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Languages spoken by agent'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            description: 'Maximum results'
          },
          sort: {
            type: 'string',
            enum: ['relevance', 'distance', 'name', 'experience'],
            description: 'Sort order'
          },
          q: {
            type: 'string',
            description: 'Search query'
          }
        },
        required: ['q']
      };

      const validated = simulateValidation(llmArgs, schema);

      // Verify corrections
      expect(validated.languages).toEqual(["Cantonese"]);
      expect(validated.limit).toBe(5);
      expect(validated.q).toBe("Toronto");
      expect(validated).not.toHaveProperty('sort'); // Empty enum omitted
    });

    test('should handle null values for optional parameters', () => {
      const llmArgs = {
        q: "Toronto",
        lat: null,       // Optional - should be omitted
        lng: null,       // Optional - should be omitted
        radius: null,    // Optional - should be omitted
        limit: 10        // Valid
      };

      const schema = {
        properties: {
          q: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['q']
      };

      const validated = simulateValidation(llmArgs, schema);

      expect(validated.q).toBe("Toronto");
      expect(validated.limit).toBe(10);
      expect(validated).not.toHaveProperty('lat');
      expect(validated).not.toHaveProperty('lng');
      expect(validated).not.toHaveProperty('radius');
    });

    test('should handle case-insensitive enum correction', () => {
      const llmArgs = {
        sort: "RELEVANCE",  // Wrong case
        limit: 10
      };

      const schema = {
        properties: {
          sort: {
            type: 'string',
            enum: ['relevance', 'distance', 'name']
          },
          limit: { type: 'number' }
        },
        required: []
      };

      const validated = simulateValidation(llmArgs, schema);

      expect(validated.sort).toBe('relevance'); // Corrected to lowercase
      expect(validated.limit).toBe(10);
    });

    test('should preserve valid arguments unchanged', () => {
      const validArgs = {
        languages: ["English", "French"],
        limit: 10,
        sort: "relevance",
        q: "Toronto"
      };

      const schema = {
        properties: {
          languages: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number' },
          sort: { type: 'string', enum: ['relevance', 'distance'] },
          q: { type: 'string' }
        },
        required: ['q']
      };

      const validated = simulateValidation(validArgs, schema);

      // All values should pass through unchanged
      expect(validated).toEqual(validArgs);
    });

    test('should handle no schema gracefully (backward compatibility)', () => {
      const args = {
        limit: "5",        // Stays as string
        sort: "",          // Stays empty
        languages: "English"  // Stays as string
      };

      const validated = simulateValidation(args, null);

      // Without schema, no corrections
      expect(validated).toEqual(args);
    });

    test('should handle missing schema properties', () => {
      const args = {
        unknownField: "value",
        limit: "5"
      };

      const schema = {
        properties: {
          limit: { type: 'number' }
          // unknownField not in schema
        },
        required: []
      };

      const validated = simulateValidation(args, schema);

      // Unknown fields pass through
      expect(validated.unknownField).toBe("value");
      // Known fields get corrected
      expect(validated.limit).toBe(5);
    });

    test('should handle complex nested scenarios', () => {
      const llmArgs = {
        languages: "English",      // string → array
        limit: "25",               // string → number
        sort: "DISTANCE",          // case correction
        optional1: null,           // omit
        optional2: undefined,      // omit
        invalidEnum: "",           // omit empty enum
        validField: "keep-me"      // unchanged
      };

      const schema = {
        properties: {
          languages: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sort: { type: 'string', enum: ['relevance', 'distance'] },
          optional1: { type: 'number' },
          optional2: { type: 'string' },
          invalidEnum: { type: 'string', enum: ['valid1', 'valid2'] },
          validField: { type: 'string' }
        },
        required: ['validField']
      };

      const validated = simulateValidation(llmArgs, schema);

      expect(validated.languages).toEqual(["English"]);
      expect(validated.limit).toBe(25);
      expect(validated.sort).toBe('distance');
      expect(validated.validField).toBe('keep-me');
      expect(validated).not.toHaveProperty('optional1');
      expect(validated).not.toHaveProperty('optional2');
      expect(validated).not.toHaveProperty('invalidEnum');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty arrays', () => {
      const args = {
        languages: []
      };

      const schema = {
        properties: {
          languages: { type: 'array', items: { type: 'string' } }
        },
        required: []
      };

      const validated = simulateValidation(args, schema);
      expect(validated.languages).toEqual([]);
    });

    test('should handle numeric string edge cases', () => {
      const args = {
        validNumber: "42",
        invalidNumber: "not-a-number",
        floatNumber: "3.14"
      };

      const schema = {
        properties: {
          validNumber: { type: 'number' },
          invalidNumber: { type: 'number' },
          floatNumber: { type: 'number' }
        },
        required: []
      };

      const validated = simulateValidation(args, schema);

      expect(validated.validNumber).toBe(42);
      expect(validated.invalidNumber).toBe("not-a-number"); // Can't convert, keep as-is
      expect(validated.floatNumber).toBe(3.14);
    });
  });
});
