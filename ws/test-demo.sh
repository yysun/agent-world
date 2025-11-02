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

# First, wait for the "Sent" confirmation
expect {
    -re {\[Sent\] Message ID:} {
        puts "\n=== Message sent successfully ==="
    }
    timeout {
        puts "\n=== ERROR: Message send timeout ==="
        exit 1
    }
}

# Now wait for agent responses (they come asynchronously through WebSocket events)
# Don't look for the prompt - look for agent messages
set agent_responded 0
set timeout 60

# Agent responses will appear as text on stdout from the event handlers
expect {
    -re {\[a1\]:} {
        puts "\n=== ✓ Agent a1 response detected ==="
        set agent_responded 1
        exp_continue
    }
    -re {\[a2\]:} {
        puts "\n=== ✓ Agent a2 response detected ==="
        set agent_responded 1
        exp_continue
    }
    -re {\[PROCESSING\]} {
        puts "\n=== Message being processed ==="
        exp_continue
    }
    -re {\[COMPLETED\]} {
        puts "\n=== ✓ Processing completed ==="
        # Wait a bit more for any remaining output
        sleep 1
        if {$agent_responded == 1} {
            puts "\n=== Test passed - agents responded ==="
        } else {
            puts "\n=== ERROR: Processing completed but no agent response seen ==="
            exit 1
        }
    }
    timeout {
        if {$agent_responded == 1} {
            puts "\n=== Test passed - at least one agent responded (timeout waiting for more) ==="
        } else {
            puts "\n=== ERROR: No agent response within 60 seconds ==="
            exit 1
        }
    }
}

# Exit gracefully
puts "\n=== Test complete - exiting ==="
send "exit\r"

expect eof
puts "\n=== ✓ Test passed - agent responded successfully ==="
exit 0
EOF
