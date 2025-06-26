# Input Box Positioning Logic Requirements

## Current Flow
The input box positioning should follow this natural sequence:

1. **Screen display** - logs, streaming output, command results
2. **Save current position** - capture where the cursor is after output
3. **Draw box and user input cursor** - position input box at current location
4. **User typing** - redraw box and input using saved position
5. **Submit command** - user presses Enter
6. **Hide box and input** - clear the input area
7. **Show user message** - display what user typed
8. **Screen display** - command output, agent responses, streaming
9. **Back to step 2** - repeat the cycle

## Key Requirements

- Position capture should happen inside the draw box function
- No separate reset/positioning calls needed
- Input box appears naturally after output ends
- Consistent positioning during typing/editing
- Clean hide/show cycle for each interaction

## Implementation Notes

- Remove separate `resetInputBoxPosition()` calls
- Capture position when `isFirstDraw` is true inside `showInputPrompt()`
- Use current cursor location as the baseline for input box placement
- Maintain smooth flow from output → input → output
