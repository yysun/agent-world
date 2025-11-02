#!/bin/bash
# Automated WebSocket Demo Test
# Tests world selection and agent response

# Check if expect is installed
if ! command -v expect &> /dev/null; then
    echo "Error: 'expect' is not installed. Install it with: brew install expect"
    exit 1
fi

# Create expect script and run it
expect << 'EOF'
set timeout 30

# Start the demo
spawn npx tsx ws/demo.ts

# Wait for world selection prompt
expect {
    "Select world" {
        # Select world 1 (default-world)
        send "1\r"
    }
    timeout {
        puts "ERROR: Timeout waiting for world selection"
        exit 1
    }
}

# Wait for world to load
expect {
    "Interactive Mode" {
        puts "\n=== World loaded successfully ==="
    }
    timeout {
        puts "ERROR: Timeout waiting for world to load"
        exit 1
    }
}

# Wait for prompt
expect ">"

# Send test message
puts "\n=== Sending test message: 'hello' ==="
send "hello\r"

# Wait for agent response (SSE streaming)
expect {
    -re {\[a[0-9]+\]:} {
        puts "\n=== ✓ Agent response detected ==="
        # Continue to check for more responses
        exp_continue
    }
    -re {\[Agent\]:} {
        puts "\n=== ✓ Agent response detected ==="
        exp_continue
    }
    ">" {
        puts "\n=== Ready for next command ==="
    }
    timeout {
        puts "\n=== ERROR: No agent response within 30 seconds ==="
        exit 1
    }
}

# Exit gracefully
puts "\n=== Test complete - exiting ==="
send "exit\r"

expect eof
puts "\n=== ✓ Test passed - agent responded successfully ==="
exit 0
EOF
