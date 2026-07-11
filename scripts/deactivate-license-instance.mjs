#!/usr/bin/env node

// Usage:
//   npm run license:deactivate -- --license-key <LicenseKey> --instance-id <lki_instance_id> --proxy http://127.0.0.1:7897
//   npm run license:deactivate -- --license-key <LicenseKey> --activation-name <dashboard_uuid> --proxy http://127.0.0.1:7897
//
// Notes:
//   - Use instances[].id from Creem license details. It starts with "lki_".
//   - Do not pass license.id. It starts with "lk_" and cannot deactivate a single device.
//   - --activation-name is the UUID shown in Creem's activation list; the script can try to recover the real lki_ id from it.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_WORKER_URL = 'https://bookmarknest-license.usetoolmint.com';

function usage() {
  console.log(`Usage:
  npm run license:deactivate -- --license-key <key> --activation-name <uuid> [--proxy http://127.0.0.1:7897]
  npm run license:deactivate -- --license-key <key> --instance-id <creem-instance-id> [--proxy http://127.0.0.1:7897]

Options:
  --license-key       Creem License Key.
  --activation-name   Activation name shown in Creem dashboard. In BookmarkNest this is the extension-generated UUID.
  --instance-id       Creem instance id if you already have it.
  --worker-url        License Worker base URL. Defaults to VITE_LICENSE_WORKER_URL from .env.local.
  --proxy             Optional curl proxy, for example http://127.0.0.1:7897.
  --help              Show this help.

The script first tries to deactivate the supplied id directly. If that fails and
--activation-name was provided, it calls /license/activate with the same name to
try to recover Creem's real instance id, then deactivates that id.`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

async function readEnvWorkerUrl() {
  try {
    const env = await readFile('.env.local', 'utf8');
    const match = env.match(/^VITE_LICENSE_WORKER_URL=(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function normalizeWorkerUrl(url) {
  return (url || DEFAULT_WORKER_URL).replace(/\/$/, '');
}

async function postJson({ workerUrl, path, body, proxy }) {
  const curlArgs = ['--silent', '--show-error', '--location'];

  if (proxy) {
    curlArgs.push('--proxy', proxy);
  }

  curlArgs.push(
    '--request',
    'POST',
    '--url',
    `${workerUrl}${path}`,
    '--header',
    'Content-Type: application/json',
    '--data',
    JSON.stringify(body),
    '--write-out',
    '\n%{http_code}'
  );

  const { stdout, stderr } = await execFileAsync('curl', curlArgs, {
    maxBuffer: 1024 * 1024
  });

  const output = stdout.trim();
  const lineBreak = output.lastIndexOf('\n');
  const responseBody = lineBreak >= 0 ? output.slice(0, lineBreak) : output;
  const statusText = lineBreak >= 0 ? output.slice(lineBreak + 1) : '000';
  const status = Number(statusText);

  let data;
  try {
    data = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    data = { raw: responseBody };
  }

  if (stderr.trim()) {
    data.stderr = stderr.trim();
  }

  return { ok: status >= 200 && status < 300, status, data };
}

async function deactivate({ workerUrl, licenseKey, instanceId, proxy }) {
  return postJson({
    workerUrl,
    path: '/license/deactivate',
    proxy,
    body: {
      licenseKey,
      instanceId
    }
  });
}

async function activate({ workerUrl, licenseKey, activationName, proxy }) {
  return postJson({
    workerUrl,
    path: '/license/activate',
    proxy,
    body: {
      licenseKey,
      instanceId: activationName
    }
  });
}

function describeError(result) {
  if (!result) return 'Unknown error';
  if (result.data?.error) return result.data.error;
  if (result.data?.message) return result.data.message;
  if (result.data?.raw) return result.data.raw;
  return `HTTP ${result.status}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const licenseKey = args['license-key'];
  const activationName = args['activation-name'];
  const instanceId = args['instance-id'] || activationName;
  const proxy = args.proxy;
  const workerUrl = normalizeWorkerUrl(args['worker-url'] || (await readEnvWorkerUrl()));

  if (!licenseKey) {
    throw new Error('Missing --license-key');
  }

  if (!instanceId) {
    throw new Error('Pass --activation-name with the UUID shown in Creem, or pass --instance-id if you already have Creem instance.id');
  }

  console.log(`Worker: ${workerUrl}`);
  if (proxy) {
    console.log(`Proxy: ${proxy}`);
  }

  console.log(`Trying direct deactivate for instance id/name: ${instanceId}`);
  const direct = await deactivate({ workerUrl, licenseKey, instanceId, proxy });

  if (direct.ok) {
    console.log('Deactivated successfully.');
    console.log(JSON.stringify(direct.data, null, 2));
    return;
  }

  console.log(`Direct deactivate failed (${direct.status}): ${describeError(direct)}`);

  if (!activationName) {
    throw new Error('Direct deactivate failed and no --activation-name was provided to try instance id recovery.');
  }

  console.log(`Trying to recover Creem instance id by activating with instance_name: ${activationName}`);
  const activation = await activate({ workerUrl, licenseKey, activationName, proxy });

  if (!activation.ok) {
    console.log(`Recovery activate failed (${activation.status}): ${describeError(activation)}`);
    throw new Error('Could not recover Creem instance id. Open Creem Dashboard Network details or contact Creem support to get the real instance.id.');
  }

  const recoveredInstanceId = activation.data?.instanceId;
  console.log('Activate response:');
  console.log(JSON.stringify(activation.data, null, 2));

  if (!recoveredInstanceId) {
    throw new Error('Activate response did not include instanceId.');
  }

  if (recoveredInstanceId === instanceId) {
    throw new Error('Recovered instanceId is the same value that failed. The dashboard value is probably only instance_name, and Creem did not return the internal instance.id.');
  }

  console.log(`Trying deactivate with recovered Creem instance id: ${recoveredInstanceId}`);
  const recovered = await deactivate({ workerUrl, licenseKey, instanceId: recoveredInstanceId, proxy });

  if (!recovered.ok) {
    throw new Error(`Recovered deactivate failed (${recovered.status}): ${describeError(recovered)}`);
  }

  console.log('Deactivated successfully with recovered instance id.');
  console.log(JSON.stringify(recovered.data, null, 2));
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
