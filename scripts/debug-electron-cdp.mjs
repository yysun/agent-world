const cdpPort = String(process.argv[2] || process.env.AGENT_WORLD_ELECTRON_CDP_PORT || '9222').trim();
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const pageTarget = targets.find((target) => target.type === 'page');
if (!pageTarget?.webSocketDebuggerUrl) {
  throw new Error(`No Electron page target found on CDP port ${cdpPort}.`);
}

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const events = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function logEvent(kind, payload) {
  events.push({ kind, payload });
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(`${request.method}: ${JSON.stringify(message.error)}`));
      return;
    }
    request.resolve(message);
    return;
  }

  if (message.method === 'Runtime.exceptionThrown') {
    logEvent('exception', message.params);
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    logEvent('console', message.params);
  }
  if (message.method === 'Log.entryAdded') {
    logEvent('log', message.params);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 1500));

const evaluation = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    href: location.href,
    title: document.title,
    hasBridge: typeof window.agentWorldDesktop,
    rootChildren: document.getElementById('root')?.childElementCount ?? null,
    rootHtmlLength: document.getElementById('root')?.innerHTML?.length ?? null,
    bodyClass: document.body.className
  })`,
  returnByValue: true,
  awaitPromise: true,
});

console.log(JSON.stringify({
  evaluation: evaluation.result.result.value,
  events,
}, null, 2));

ws.close();
setTimeout(() => process.exit(0), 50);
