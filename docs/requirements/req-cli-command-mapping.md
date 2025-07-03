# CLI Command Mapping System Requirements

## Overview
Enhance the CLI command handling system to provide a more direct command execution path and clear separation between commands and messages.

## Requirements

### 1. Command Mapping
- Create a command map where `/command` maps directly to `command` (e.g., `/clear` maps to `clear`)
- Support all existing CLI commands with their parameters
- Handle command aliases for common operations (e.g., `/help` for `/commands`)

### 2. Command Processing
- Direct execution of commands starting with `/` without going through system event
- Extract command parameters for specific commands
- Validate command parameters before execution
- Provide informative error messages for invalid commands

### 3. Message Handling
- Send inputs not starting with `/` directly to the message event
- Keep existing functionality for pipeline and interactive modes
- Support proper streaming for both commands and messages

### 4. Implementation Details
- Update `processCLIInput` function to handle the direct mapping
- Maintain backward compatibility with existing command handling
- Ensure proper error handling for both command and message failures
- Keep the same output format for consistency

### 5. User Experience
- Commands will be executed directly without system event overhead
- Messages will be sent to the world without unnecessary system event processing
- Same CLI output format maintained for backward compatibility
- No change to user interface required - transparent improvement

## Benefits
- Cleaner separation of command and message processing
- More efficient command execution path
- Improved maintainability with clearer code organization
- Better error handling with specific command validation
