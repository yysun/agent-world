
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const key = process.argv[2] || process.env.GOOGLE_API_KEY;

if (!key) {
    console.error("Please provide an API key as an argument or set GOOGLE_API_KEY in .env");
    process.exit(1);
}

console.log(`Testing Google API Key: ${key.substring(0, 8)}...`);


async function test() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    console.log("Fetching models list...");
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
        console.log("Success! Available models:");
        console.log((data as any).models.map((m: any) => m.name).join("\n"));
    } else {
        console.error("API Error:");
        console.error(JSON.stringify(data, null, 2));
    }
}


test();
