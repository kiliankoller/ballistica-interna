// Runs a Python script with whatever Python 3 the system has (python3 on macOS/Linux, python or py on Windows).
//   node scripts/py.mjs <script.py | -m module> [args…]
import { spawnSync } from 'node:child_process';

for (const cmd of ['python3', 'python', 'py']) {
  const probe = spawnSync(cmd, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], { stdio: 'ignore', shell: false });
  if (probe.status !== 0) continue;
  const run = spawnSync(cmd, process.argv.slice(2), { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
console.error('Python 3.9 or later not found (python3, python or py)');
process.exit(1);
