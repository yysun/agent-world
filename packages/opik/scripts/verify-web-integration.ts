
import 'dotenv/config';
import { OpikClient } from '../src/client.js';

async function verify() {
    console.log("Creating verification trace in Opik...");
    const client = OpikClient.getInstance();
    
    if (!client) {
        console.error("Failed to initialize Opik client. Check OPIK_API_KEY.");
        return;
    }

    try {
        const trace = client.trace({
            name: "Manual Verification Check",
            input: { 
                note: "User requested verification of web dashboard connectivity.",
                timestamp: new Date().toISOString()
            },
            output: {
                status: "Success",
                message: "If you see this, Opik integration is fully operational."
            },
            usage: {
                prompt_tokens: 15,
                completion_tokens: 28,
                total_tokens: 43
            },
            tags: ["verification", "user-check", "phase-4-confirmed"]
        });
        
        // Add a span to simulate a tool
        const span = trace.span({
            name: "verification_check",
            type: "tool",
            input: { check: "database_connectivity" },
            output: { result: "connected" }
        });
        span.end();
        trace.end();

        console.log("Trace created!");
        console.log("👉 Go to your Opik Dashboard and look for a trace named 'Manual Verification Check'.");
        
        await client.flush();
        console.log("Flushed.");
    } catch (e) {
        console.error("Error sending trace:", e);
    }
}

verify();
