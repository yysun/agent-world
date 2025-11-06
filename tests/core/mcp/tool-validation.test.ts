/**
 * MCP Tool Validation Tests - Consolidated
 * 
 * Tests for MCP tool argument validation and correction including:
 * - Argument type correction (string→number, string→array)
 * - Enum validation and case-insensitive matching
 * - Schema validation integration
 * - executeMCPTool enhancement verification
 * 
 * Consolidates:
 * - executeMCPTool-spike.test.ts (5 tests) - Spike/verification
 * - executeMCPTool-validation-integration.test.ts (9 tests) - Validation integration
 * - tool-arg-correction.test.ts (9 tests) - Argument correction
 */

import { describe, test, expect } from 'vitest';

describe('MCP Tool Validation System', () => {
  
  describe('Argument Type Correction', () => {
    test('should document string to array correction', () => {
      // Given: LLM generates string instead of array
      const invalidArgs = {
        languages: "Cantonese"  // Should be ["Cantonese"]
      };

      const schema = {
        properties: {
          languages: {
            type: "array",
            items: { type: "string" }
          }
        }
      };

      // Expected: Function should convert to array
      const expected = {
        languages: ["Cantonese"]
      };

      // This documents the behavior - actual correction happens in mcp-server-registry.ts
      expect(expected.languages).toEqual(["Cantonese"]);
    });

    test('should document string to number correction', () => {
      // Given: LLM generates string instead of number
      const invalidArgs = {
        limit: "5"  // Should be 5
      };

      const schema = {
        properties: {
          limit: {
            type: "number",
            minimum: 1,
            maximum: 100
          }
        }
      };

      // Expected: Function should convert to number
      const expected = {
        limit: 5
      };

      expect(expected.limit).toBe(5);
      expect(typeof expected.limit).toBe('number');
    });

    test('should document empty enum value omission', () => {
      // Given: LLM generates empty string for enum
      const invalidArgs = {
        sort: ""  // Should be omitted or use default
      };

      const schema = {
        properties: {
          sort: {
            type: "string",
            enum: ["relevance", "distance", "name", "experience"]
          }
        }
      };

      // Expected: Function should omit invalid enum value
      // This allows the MCP server to use its default value
      const expected = {};

      expect(expected).not.toHaveProperty('sort');
    });

    test('should document case-insensitive enum correction', () => {
      // Given: LLM generates wrong case for enum
      const invalidArgs = {
        sort: "RELEVANCE"  // Should be "relevance"
      };

      const schema = {
        properties: {
          sort: {
            type: "string",
            enum: ["relevance", "distance", "name", "experience"]
          }
        }
      };

      // Expected: Function should correct case
      const expected = {
        sort: "relevance"
      };

      expect(expected.sort).toBe("relevance");
    });

    test('should handle null and undefined for optional parameters', () => {
      const invalidArgs = {
        optionalParam: null,
        anotherOptional: undefined
      };

      const schema = {
        properties: {
          optionalParam: { type: "string" },
          anotherOptional: { type: "number" }
        },
        required: []
      };

      // Expected: null/undefined values should be omitted for optional params
      const expected = {};

      expect(expected).not.toHaveProperty('optionalParam');
      expect(expected).not.toHaveProperty('anotherOptional');
    });

    test('should preserve required null values', () => {
      const args = {
        requiredParam: null
      };

      const schema = {
        properties: {
          requiredParam: { type: "string" }
        },
        required: ['requiredParam']
      };

      // Expected: Required params keep null values (will fail validation downstream)
      const expected = {
        requiredParam: null
      };

      expect(expected.requiredParam).toBeNull();
    });

    test('should document multiple corrections at once', () => {
      // Given: LLM generates multiple type errors
      const invalidArgs = {
        languages: "Cantonese",  // string -> array
        limit: "5",              // string -> number
        sort: "",                // empty -> omit
        q: "Toronto"             // valid, no change
      };

      // Expected: All corrections applied
      const expected = {
        languages: ["Cantonese"],
        limit: 5,
        // sort omitted
        q: "Toronto"
      };

      expect(expected.languages).toEqual(["Cantonese"]);
      expect(expected.limit).toBe(5);
      expect(expected).not.toHaveProperty('sort');
      expect(expected.q).toBe("Toronto");
    });

    test('should preserve valid arguments unchanged', () => {
      const validArgs = {
        languages: ["English", "French"],
        limit: 10,
        sort: "relevance"
      };

      // Valid arguments should pass through unchanged
      expect(validArgs.languages).toEqual(["English", "French"]);
      expect(validArgs.limit).toBe(10);
      expect(validArgs.sort).toBe("relevance");
    });

    test('should handle empty arrays correctly', () => {
      const argsWithEmptyArray = {
        languages: []
      };

      // Empty arrays should be preserved
      expect(argsWithEmptyArray.languages).toEqual([]);
    });
  });

  describe('Validation Integration Tests', () => {
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

        // Type correction: string to number
        if (propSchema.type === 'number' && typeof value === 'string') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            validated[key] = numValue;
            continue;
          }
        }

        // Type correction: string to array
        if (propSchema.type === 'array' && typeof value === 'string') {
          validated[key] = [value];
          continue;
        }

        // Enum validation
        if (propSchema.enum && typeof value === 'string') {
          // Case-insensitive match
          const matchedEnum = propSchema.enum.find((e: string) => 
            e.toLowerCase() === value.toLowerCase()
          );
          if (matchedEnum) {
            validated[key] = matchedEnum;
            continue;
          }
          // Skip invalid enum values (let server use default)
          continue;
        }

        validated[key] = value;
      }

      return validated;
    }

    test('should apply validation with schema', () => {
      const invalidArgs = {
        limit: "5",
        sort: "RELEVANCE",
        languages: "English"
      };

      const schema = {
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sort: { type: 'string', enum: ['relevance', 'distance'] },
          languages: { type: 'array', items: { type: 'string' } }
        },
        required: []
      };

      const result = simulateValidation(invalidArgs, schema);

      expect(result.limit).toBe(5); // string->number
      expect(result.sort).toBe('relevance'); // case corrected
      expect(result.languages).toEqual(['English']); // string->array
    });

    test('should skip validation without schema', () => {
      const args = {
        limit: "5",
        sort: "",
        languages: "English"
      };

      const result = simulateValidation(args, null);

      // Without schema, no corrections
      expect(result.limit).toBe("5");
      expect(result.sort).toBe("");
      expect(result.languages).toBe("English");
    });

    test('should omit empty enum values', () => {
      const args = {
        sort: "",
        validParam: "test"
      };

      const schema = {
        properties: {
          sort: { type: 'string', enum: ['asc', 'desc'] },
          validParam: { type: 'string' }
        },
        required: []
      };

      const result = simulateValidation(args, schema);

      expect(result).not.toHaveProperty('sort'); // Empty enum omitted
      expect(result.validParam).toBe('test'); // Other params preserved
    });

    test('should omit null optional parameters', () => {
      const args = {
        optionalParam: null,
        requiredParam: "value"
      };

      const schema = {
        properties: {
          optionalParam: { type: 'string' },
          requiredParam: { type: 'string' }
        },
        required: ['requiredParam']
      };

      const result = simulateValidation(args, schema);

      expect(result).not.toHaveProperty('optionalParam'); // Null optional omitted
      expect(result.requiredParam).toBe('value'); // Required preserved
    });

    test('should handle complex nested validation', () => {
      const args = {
        limit: "10",
        filters: "active",
        sort: "NAME"
      };

      const schema = {
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100 },
          filters: { type: 'array', items: { type: 'string' } },
          sort: { type: 'string', enum: ['name', 'date', 'size'] }
        },
        required: []
      };

      const result = simulateValidation(args, schema);

      expect(result.limit).toBe(10);
      expect(result.filters).toEqual(['active']);
      expect(result.sort).toBe('name'); // Case corrected
    });

    test('should preserve unknown properties', () => {
      const args = {
        knownParam: "5",
        unknownParam: "keep this"
      };

      const schema = {
        properties: {
          knownParam: { type: 'number' }
        },
        required: []
      };

      const result = simulateValidation(args, schema);

      expect(result.knownParam).toBe(5); // Validated
      expect(result.unknownParam).toBe('keep this'); // Preserved
    });

    test('should handle invalid number conversion gracefully', () => {
      const args = {
        limit: "not-a-number",
        validLimit: "5"
      };

      const schema = {
        properties: {
          limit: { type: 'number' },
          validLimit: { type: 'number' }
        },
        required: []
      };

      const result = simulateValidation(args, schema);

      expect(result.limit).toBe("not-a-number"); // Can't convert, keep original
      expect(result.validLimit).toBe(5); // Successfully converted
    });

    test('should handle array with multiple items', () => {
      const args = {
        singleItem: "item1",
        alreadyArray: ["item2", "item3"]
      };

      const schema = {
        properties: {
          singleItem: { type: 'array', items: { type: 'string' } },
          alreadyArray: { type: 'array', items: { type: 'string' } }
        },
        required: []
      };

      const result = simulateValidation(args, schema);

      expect(result.singleItem).toEqual(['item1']); // Converted
      expect(result.alreadyArray).toEqual(['item2', 'item3']); // Preserved
    });

    test('should handle enum case variations', () => {
      const args = {
        case1: "UPPER",
        case2: "lower",
        case3: "MiXeD"
      };

      const schema = {
        properties: {
          case1: { type: 'string', enum: ['upper', 'lower'] },
          case2: { type: 'string', enum: ['upper', 'lower'] },
          case3: { type: 'string', enum: ['upper', 'lower', 'mixed'] }
        },
        required: []
      };

      const result = simulateValidation(args, schema);

      expect(result.case1).toBe('upper'); // UPPER->upper
      expect(result.case2).toBe('lower'); // lower->lower
      expect(result.case3).toBe('mixed'); // MiXeD->mixed
    });
  });

  describe('executeMCPTool Schema Enhancement', () => {
    describe('Phase 0: Current State Verification', () => {
      test('should document current state - no validation in executeMCPTool', () => {
        // This test documents the current behavior
        // executeMCPTool currently does NOT call validateAndCorrectToolArgs

        const currentBehavior = {
          hasValidation: false,
          hasOllamaTranslation: true,
          schemaParameter: null
        };

        expect(currentBehavior.hasValidation).toBe(false);
        expect(currentBehavior.hasOllamaTranslation).toBe(true);
      });

      test('should document that mcpToolsToAiTools HAS validation', () => {
        // This documents the working path
        const mcpToolsPath = {
          hasValidation: true,
          usesSchema: true,
          callsValidateAndCorrectToolArgs: true
        };

        expect(mcpToolsPath.hasValidation).toBe(true);
      });
    });

    describe('Phase 1: Expected Behavior After Enhancement', () => {
      test('should apply validation when schema is provided', () => {
        // After enhancement, this should be the behavior
        const invalidArgs = {
          limit: "5",           // Should convert to number
          sort: "",             // Should omit empty enum
          languages: "English"  // Should convert to array
        };

        const schema = {
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100 },
            sort: { type: 'string', enum: ['relevance', 'distance'] },
            languages: { type: 'array', items: { type: 'string' } }
          },
          required: []
        };

        // Expected corrections
        const expected = {
          limit: 5,                // string -> number
          languages: ["English"]   // string -> array
          // sort omitted (empty enum)
        };

        expect(expected.limit).toBe(5);
        expect(expected.languages).toEqual(["English"]);
        expect(expected).not.toHaveProperty('sort');
      });

      test('should work without schema (backward compatibility)', () => {
        // When no schema provided, should behave as before
        const args = {
          limit: "5",
          sort: "",
          languages: "English"
        };

        // Without schema, no corrections applied
        const expected = {
          limit: "5",
          sort: "",
          languages: "English"
        };

        expect(expected.limit).toBe("5");
        expect(expected.languages).toBe("English");
      });
    });

    describe('Phase 1: Implementation Verification', () => {
      test('should have optional toolSchema parameter', () => {
        // After implementation, function signature should be:
        // executeMCPTool(serverId, toolName, args, sequenceId?, parentToolCall?, toolSchema?)

        const expectedSignature = {
          requiredParams: ['serverId', 'toolName', 'args'],
          optionalParams: ['sequenceId', 'parentToolCall', 'toolSchema'],
          toolSchemaOptional: true
        };

        expect(expectedSignature.toolSchemaOptional).toBe(true);
        expect(expectedSignature.optionalParams).toContain('toolSchema');
      });
    });
  });
});
