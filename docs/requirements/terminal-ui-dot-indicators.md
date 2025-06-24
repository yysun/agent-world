# Terminal UI Dot Indicators Requirements

## Visual Indicators
- ✅ Replace `ℹ️  System: ` with a blue ASCII dot `\x1b[34m●\x1b[0m`
- ✅ Replace `🤖 ` with a green ASCII dot `\x1b[32m●\x1b[0m`  
- ✅ Print user's input in the main area with an orange ASCII dot `\x1b[38;5;208m●\x1b[0m`

## Startup Behavior
- ✅ Do not console.log to list agents when starting
- ✅ Instead, invoke `/agents` command automatically in gray color

## Implementation Details

### Changes Made:
1. **Updated terminal-kit-ui.ts:**
   - Changed `displaySystem()` to use blue ASCII `●` instead of `🔵`
   - Changed `displayMessage()` to use green ASCII `●` instead of `🟢`
   - Added `displayUserInput()` function to show user input with orange ASCII `●`
   - Added proper input area clearing to prevent text mixing
   - Enhanced timing and screen clearing to fix input display issues

2. **Updated index-tui.ts:**
   - Modified `onInput` handler to call `ui.displayUserInput()` before broadcasting
   - Removed direct console.log agent listing from `loadAgents()`
   - Updated `/agents` command to use gray color for all output
   - Added automatic `/agents` command execution after UI initialization

3. **Updated colors.ts:**
   - Added orange color definition for user input

### Technical Fixes:
- **Input Mixing Issue Fixed:** Added proper input area clearing with `term.eraseLineAfter()` and enhanced `drawInputArea()` with area clearing
- **Timing Improvements:** Reduced setTimeout delays and added proper screen redraw sequencing
- **Screen Management:** Enhanced screen clearing and redraw logic to prevent text overlap

### Result:
- ✅ System messages appear with blue ASCII dots (`●`)
- ✅ Agent responses appear with green ASCII dots (`●`)  
- ✅ User input appears with orange ASCII dots (`● You: <message>`)
- ✅ Agent list automatically shown in gray on startup
- ✅ No more text mixing or display issues
- ✅ Clean, consistent ASCII-based visual indicators
- ✅ Real-time streaming with ●/○ indicators working perfectly
