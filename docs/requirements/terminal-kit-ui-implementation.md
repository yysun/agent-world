# Simplified Terminal-Kit UI Requirements

**Date**: June 23, 2025

## Core Layout Simplification

### Screen Division
- **Vertical split**: Divide the screen into two distinct areas
  - **Top part**: Scrollable content area (like original CLI)
  - **Bottom part**: User input area

### Top Area - Content Display
- Display all content exactly like the original CLI
- Scrollable area for viewing message history
- No complex widgets or special formatting - keep it simple
- Show agent responses as they stream in
- Maintain existing message display format

### Bottom Area - User Input
- **Bordered input box**: Clear visual boundary around input area
- **Fixed text positioning**: Text properly aligned within the box
- **Left margin implementation**: Proper text alignment with consistent spacing
- **Multiline support**: 
  - `\<enter>` or `shift+enter` for new lines within input
  - Regular `enter` to submit the message
- **Text editing capabilities**:
  - Cursor movement within the input box
  - Standard text editing (backspace, delete, arrow keys)
  - Edit text anywhere within the input area

## Design Principles
1. **Keep it simple**: No complex menus, forms, or advanced widgets
2. **Familiar experience**: Top area behaves like original CLI
3. **Enhanced input**: Only the input area gets special treatment
4. **Visual clarity**: Clear separation between content and input areas
5. **Consistent behavior**: Predictable text editing and submission

## Technical Requirements
- Use terminal-kit for the input box implementation
- Maintain all existing CLI functionality
- Preserve streaming message display
- Keep command system unchanged (/help, /agents, etc.)
- No breaking changes to existing behavior

## User Experience Goals
- Immediately familiar to existing CLI users
- Better text input experience with visual feedback
- Clear visual separation between reading and typing areas
- Multiline input capability for longer messages
- Professional appearance with minimal complexity
