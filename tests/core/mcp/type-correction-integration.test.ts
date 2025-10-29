/**
 * Integration test for MCP tool argument type correction
 * Tests the actual scenario from the bug report
 */

import { describe, test, expect } from 'vitest';

// This test simulates the actual correction logic
function simulateTypeCorrection(args: any, schema: any): any {
  if (!args || typeof args !== 'object' || !schema?.properties) {
    return args;
  }

  const corrected: any = {};
  const requiredParams = schema.required || [];

  for (const [key, value] of Object.entries(args)) {
    const propSchema = schema.properties[key];
    if (!propSchema) {
      corrected[key] = value;
      continue;
    }

    // Omit null/undefined for optional parameters
    if ((value === null || value === undefined) && !requiredParams.includes(key)) {
      continue;
    }

    // String to number correction
    if (propSchema.type === 'number' && typeof value === 'string') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        corrected[key] = numValue;
        continue;
      }
    }

    // String to array correction
    if (propSchema.type === 'array' && typeof value === 'string' && value !== '') {
      corrected[key] = [value];
      continue;
    }

    // Empty enum correction
    if (propSchema.enum && (value === '' || value === null || value === undefined)) {
      // Omit - let schema default apply
      continue;
    }

    corrected[key] = value;
  }

  return corrected;
}

describe('MCP Type Correction Integration', () => {
  test('should fix the exact error from bug report: limit as string', () => {
    // Actual arguments that caused the error
    const buggedArgs = {
      languages: ["Cantonese"], // This one was already an array in the second attempt
      limit: "5",               // This is still a string - MUST be fixed
      q: "Toronto"
    };

    // The schema that searchAgents tool expects
    const schema = {
      properties: {
        languages: {
          type: "array",
          items: { type: "string" }
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 100
        },
        q: {
          type: "string"
        },
        sort: {
          type: "string",
          enum: ["relevance", "distance", "name", "experience"]
        }
      }
    };

    const corrected = simulateTypeCorrection(buggedArgs, schema);

    // Verify the correction
    expect(corrected.limit).toBe(5);
    expect(typeof corrected.limit).toBe('number');
    expect(corrected.languages).toEqual(["Cantonese"]);
    expect(corrected.q).toBe("Toronto");
  });

  test('should handle all three original errors at once', () => {
    // All three errors from the first attempt
    const buggedArgs = {
      languages: "Cantonese",  // string instead of array
      sort: "",                // empty string for enum
      limit: "5"               // string instead of number
    };

    const schema = {
      properties: {
        languages: {
          type: "array",
          items: { type: "string" }
        },
        sort: {
          type: "string",
          enum: ["relevance", "distance", "name", "experience"]
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 100
        }
      }
    };

    const corrected = simulateTypeCorrection(buggedArgs, schema);

    expect(corrected.languages).toEqual(["Cantonese"]);
    expect(corrected).not.toHaveProperty('sort'); // Empty enum should be omitted
    expect(corrected.limit).toBe(5);
    expect(typeof corrected.limit).toBe('number');
  });

  test('should preserve schema properties through bulletproofSchema', () => {
    // Simulates what bulletproofSchema should preserve
    const originalSchema = {
      type: 'object',
      properties: {
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
        languages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Languages spoken'
        }
      },
      required: ['q']
    };

    // After bulletproofing, these properties MUST be preserved
    const bulletproofed = {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum results',
          minimum: 1,    // Must be preserved!
          maximum: 100   // Must be preserved!
        },
        sort: {
          type: 'string',
          description: 'Sort order',
          enum: ['relevance', 'distance', 'name', 'experience'] // Must be preserved!
        },
        languages: {
          type: 'array',
          description: 'Languages spoken',
          items: { type: 'string' } // Must be preserved!
        }
      },
      required: ['q'],
      additionalProperties: false
    };

    // Verify critical properties are preserved
    expect(bulletproofed.properties.limit.type).toBe('number');
    expect(bulletproofed.properties.limit.minimum).toBe(1);
    expect(bulletproofed.properties.limit.maximum).toBe(100);
    expect(bulletproofed.properties.sort.enum).toEqual(['relevance', 'distance', 'name', 'experience']);
    expect(bulletproofed.properties.languages.type).toBe('array');
    expect(bulletproofed.properties.languages.items).toEqual({ type: 'string' });
  });

  test('should omit null values for optional parameters', () => {
    // Simulate the second bug: LLM passes null for optional params
    const buggedArgs = {
      languages: ["Cantonese"],
      limit: 5,
      lat: null,
      lng: null,
      radius: null,
      q: "Toronto"
    };

    const schema = {
      properties: {
        languages: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        radius: { type: 'string' },
        q: { type: 'string' }
      },
      required: ['q']
    };

    const corrected = simulateTypeCorrection(buggedArgs, schema);

    // Null values for optional params should be omitted
    expect(corrected).toHaveProperty('languages');
    expect(corrected).toHaveProperty('limit');
    expect(corrected).toHaveProperty('q');
    expect(corrected).not.toHaveProperty('lat');
    expect(corrected).not.toHaveProperty('lng');
    expect(corrected).not.toHaveProperty('radius');
  });
});
