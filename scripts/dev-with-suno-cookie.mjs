import { spawn } from 'node:child_process';
import { ensureSunoCookie } from './ensure-suno-cookie.mjs';

const args = process.argv.slice(2);

try {
  await ensureSunoCookie();
} catch (error) {
  console.error('Cannot start dev server because SUNO_COOKIE is not usable.');
  console.error(error.message || error);
  process.exit(1);
}

const child = spawn('npm', ['run', 'dev', '--', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
