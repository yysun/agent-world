
import 'dotenv/config';

async function run() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("No GOOGLE_API_KEY found");
        return;
    }

    console.log("Listing models via REST API...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            console.error(`List models failed: ${response.status} ${response.statusText}`);
            console.error(await response.text());
        } else {
            const data: any = await response.json();
            console.log("Available models:");
            if (data.models) {
                // Filter for gemini models
                const geminiModels = data.models.filter((m: any) => m.name.includes('gemini'));
                geminiModels.forEach((m: any) => console.log(`- ${m.name}`));
            } else {
                console.log("No models returned in list.");
            }
        }
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

run();
