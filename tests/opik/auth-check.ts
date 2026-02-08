
import { Opik } from 'opik';
import dotenv from 'dotenv';
dotenv.config();

console.log('Testing Opik connection...');
console.log('API Key:', process.env.OPIK_API_KEY ? process.env.OPIK_API_KEY.substring(0, 4) + '...' : 'MISSING');
console.log('Workspace:', process.env.OPIK_WORKSPACE);

const client = new Opik({
  apiKey: process.env.OPIK_API_KEY,
  workspaceName: process.env.OPIK_WORKSPACE,
  projectName: process.env.OPIK_PROJECT
});

async function test() {
  try {
    const trace = client.trace({
      name: 'Smoke Test',
    });
    const span = trace.span({
        name: 'test-span',
        input: { foo: 'bar' }
    });
    span.end();
    trace.end();
    console.log('Trace created. Flushing...');
    await client.flush();
    console.log('Flush complete.');
  } catch (e) {
    console.error('Test failed:', e);
  }
}

test();
