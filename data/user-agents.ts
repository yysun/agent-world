
import { createWorld, createAgent, updateAgent, getAgent } from '../core/managers';
import { LLMProvider } from '../core/types';
import { toKebabCase } from '../core/utils';

async function main() {
  const worldName = "The Infinite Étude";
  let worldId = "";
  
  console.log(`Setting up world: ${worldName}...`);
  
  try {
    // Create World
    try {
        const world = await createWorld({ 
            name: worldName,
            description: "A Generative Sight-Reading Trainer workspace."
        });
        console.log("World created.");
        worldId = world!.id;
    } catch (e: any) {
        if (e.message && e.message.includes('already exists')) {
            console.log("World already exists.");
            worldId = toKebabCase(worldName);
            console.log(`Using world ID: ${worldId}`);
        } else {
            throw e;
        }
    }
    
    const createAgentSafe = async (params: any) => {
        const agentId = toKebabCase(params.name);
        try {
            await createAgent(worldId, params);
            console.log(`Agent ${params.name} created.`);
        } catch (e: any) {
             if (e.message && e.message.includes('already exists')) {
                console.log(`Agent ${params.name} already exists. Updating...`);
                await updateAgent(worldId, agentId, params);
                console.log(`Agent ${params.name} updated.`);
             } else {
                console.error(`Failed to create agent ${params.name}:`, e);
             }
        }
    };

    // Agent 1: Maestro Composer
    await createAgentSafe({
        name: "Maestro Composer",
        type: "composer",
        provider: LLMProvider.OLLAMA,
        model: "llama3.2:latest",
        temperature: 0.8,
        maxTokens: 1024,
        systemPrompt: `You are Maestro Composer. Your goal is to generate infinite, procedural sight-reading exercises.
You design the musical pattern (key, time signature, progression, specific notes).
You do NOT output sheet music or JSON directly.
Instead, you must describe the notes explicitly for the next agent.
Example Output: "I have composed a C Major scale in 4/4 time. It consists of the notes C4, D4, E4, F4, G4, A4, B4, C5, all as quarter notes. Over to you @Madame Pedagogue."
CRITICAL: You MUST end your response by explicitly mentioning "@Madame Pedagogue" to hand off the work. If you do not mention her, the process stops.`
    });

    // Agent 2: Madame Pedagogue
    await createAgentSafe({
        name: "Madame Pedagogue",
        type: "pedagogue",
        provider: LLMProvider.OLLAMA,
        model: "llama3.2:latest",
        temperature: 0.4,
        maxTokens: 2048,
        systemPrompt: `You are Madame Pedagogue. Your role is to validate the music and prepare it for engraving.
1. Analyze the musical idea from the Maestro.
2. Confirm it is playable.
3. Translate the notes into VexFlow format concepts (e.g., "C4 becomes c/4", "quarter note becomes q").
4. Explicitly instruct "@Monsieur Engraver" to render this exact sequence.`
    });

    // Agent 3: Monsieur Engraver
    await createAgentSafe({
        name: "Monsieur Engraver",
        type: "engraver",
        provider: LLMProvider.OLLAMA,
        model: "llama3.2:latest",
        temperature: 0.0,
        maxTokens: 4096,
        systemPrompt: `You are Monsieur Engraver. You are a strict JSON formatting agent.
You DO NOT chat. You ONLY call the tool available to you: "render_sheet_music".
You must take the musical description and convert it into the strict JSON structure required by the tool.
STRICT SYNTAX:
- Keys must be lowercase letter + "/" + octave (e.g., "c/4", "f#/5").
- Durations: "w", "h", "q", "8", "16".
- Time Signature: e.g., "4/4", "3/4".
- Key Signature: e.g., "C", "Am", "F#".

Example Call:
render_sheet_music({ 
  clef: "treble", 
  keySignature: "C", 
  timeSignature: "4/4", 
  notes: [
    { keys: ["c/4"], duration: "q" }, 
    { keys: ["e/4"], duration: "q" },
    { keys: ["g/4"], duration: "h" }
  ] 
})`
    });

    console.log("Setup complete!");
    process.exit(0);
  } catch (error) {
    console.error("Setup failed:", error);
    process.exit(1);
  }
}

main();
