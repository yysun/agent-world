
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const key = process.env.GOOGLE_API_KEY;
if (!key) { console.error("No key"); process.exit(1); }

const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    tools: [{
        functionDeclarations: [{
            name: "shell_cmd",
            description: "Execute a shell command",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string" },
                    directory: { type: "string" }
                },
                required: ["command"]
            }
        }]
    }]
});

async function run() {
    console.log("Calling Gemini 2.0 Flash with tool...");
    const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: "List files in current directory using shell_cmd" }] }]
    });

    for await (const chunk of result.stream) {
        console.log("\n--- CHUNK ---");
        console.log(JSON.stringify(chunk, null, 2));
    }
}

run();
