#!/usr/bin/env node
/**
 * Push DATABASE_URL and DIRECT_URL from .env to GitHub Actions secrets.
 * Requires: gh auth login, admin on the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const envPath = path.join(repoRoot, '.env');

function parseEnvFile(filePath) {
  const out = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i);
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function ghSecretSet(name, value, repo) {
  const args = ['secret', 'set', name];
  if (repo) args.push('--repo', repo);
  execFileSync('gh', args, { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
}

function main() {
  const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (auth.status !== 0) {
    console.error(
      'GitHub CLI is not logged in. Run:\n  gh auth login --hostname github.com --git-protocol https --web\nThen run again:\n  npm run secrets:github-db'
    );
    process.exit(1);
  }

  if (!fs.existsSync(envPath)) {
    console.error('Missing .env at', envPath);
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  }).trim();
  const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  const repo = m ? m[1] : undefined;

  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = env[name]?.trim();
    if (!value) {
      console.error(`Missing or empty ${name} in .env`);
      process.exit(1);
    }
    ghSecretSet(name, value, repo);
    console.log(`Set Actions secret ${name}${repo ? ` on ${repo}` : ''}.`);
  }
}

main();
