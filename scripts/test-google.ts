
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function run() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("No GOOGLE_API_KEY found");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Test 1: List models (if available functionality in SDK, usually not exposed directly on client easily)
    // Actually the SDK doesn't expose listModels easily on the main class in some versions.
    
    // Test 2: Try gemini-1.5-flash
    console.log("Testing gemini-1.5-flash...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello?");
        console.log("gemini-1.5-flash Success:", result.response.text());
    } catch (e: any) {
        console.error("gemini-1.5-flash Failed:", e.message);
    }
    
     // Test 3: Try gemini-pro
    console.log("Testing gemini-pro...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello?");
        console.log("gemini-pro Success:", result.response.text());
    } catch (e: any) {
        console.error("gemini-pro Failed:", e.message);
    }

         // Test 4: Try models/gemini-1.5-flash
    console.log("Testing models/gemini-1.5-flash...");
    try {
        const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
        const result = await model.generateContent("Hello?");
        console.log("models/gemini-1.5-flash Success:", result.response.text());
    } catch (e: any) {
        console.error("models/gemini-1.5-flash Failed:", e.message);
    }
}

run();
