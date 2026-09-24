// Preset payloads for the console. Each one is something a judge can click and
// watch: the benign ones prove real work runs, the adversarial ones prove each
// control catches what it claims to. The expectation string is what the
// interface can say *before* the run, and the result panel then shows what the
// host actually did with it.

export type PresetKind = 'benign' | 'adversarial'

export interface SandboxPreset {
  id: string
  label: string
  kind: PresetKind
  // The control this payload probes, or the work it does.
  expectation: string
  code: string
}

export const SANDBOX_PRESETS: SandboxPreset[] = [
  {
    id: 'arithmetic',
    label: 'Arithmetic',
    kind: 'benign',
    expectation: 'Runs to completion; exit 0.',
    code: 'print(2 + 2)\nprint(sum(range(1000)))\n',
  },
  {
    id: 'corrosion-rate',
    label: 'Corrosion-rate calculation',
    kind: 'benign',
    expectation: 'Runs to completion; a real remaining-life figure.',
    code: [
      '# Wall-loss corrosion rate and remaining life for a pressure vessel.',
      'nominal_mm = 12.0',
      'measured_mm = 9.4',
      'minimum_mm = 6.0',
      'interval_years = 4.0',
      '',
      'rate_mm_per_year = (nominal_mm - measured_mm) / interval_years',
      'remaining_life_years = (measured_mm - minimum_mm) / rate_mm_per_year',
      '',
      "print(f'corrosion rate: {rate_mm_per_year:.4f} mm/year')",
      "print(f'remaining life: {remaining_life_years:.2f} years')",
      '',
    ].join('\n'),
  },
  {
    id: 'socket-connect',
    label: 'Socket connect',
    kind: 'adversarial',
    expectation: 'Rejected before execution: socket is not on the allow-list.',
    code: [
      'import socket',
      "s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)",
      "s.connect(('10.0.0.1', 443))",
      "print('connected')",
      '',
    ].join('\n'),
  },
  {
    id: 'os-system',
    label: 'os.system escape',
    kind: 'adversarial',
    expectation: "Rejected before execution: process escape 'os.system()'.",
    code: "import os\nos.system('whoami')\n",
  },
  {
    id: 'subprocess-escape',
    label: 'subprocess escape',
    kind: 'adversarial',
    expectation: 'Rejected before execution: subprocess is denied.',
    code: [
      'import subprocess',
      "subprocess.run(['cmd', '/c', 'dir'])",
      '',
    ].join('\n'),
  },
  {
    id: 'getattr-indirection',
    label: 'getattr indirection',
    kind: 'adversarial',
    expectation: "Rejected before execution: constructed name defeats no check.",
    code: "import os\ngetattr(os, 'sys' + 'tem')('whoami')\n",
  },
  {
    id: 'spawn-bomb',
    label: 'Process spawn bomb',
    kind: 'adversarial',
    expectation: 'Rejected before execution: subprocess is denied. (The OS active-process cap is the backstop — see the self-test.)',
    code: [
      'import subprocess, sys',
      'while True:',
      "    subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])",
      '',
    ].join('\n'),
  },
  {
    id: 'memory-bomb',
    label: 'Memory bomb',
    kind: 'adversarial',
    expectation: 'Runs, then the memory cap refuses the commit; peak stays below the cap.',
    code: [
      '# Request one block far larger than the per-process memory cap. The cap',
      '# refuses the commit outright, so the process fails without the host ever',
      '# holding the memory - peak stays low, which is the point.',
      'block = bytearray(1400 * 1024 * 1024)  # 1.4 GB, past the cap',
      "print('allocated', len(block) // (1024 * 1024), 'MB')",
      '',
    ].join('\n'),
  },
  {
    id: 'infinite-loop',
    label: 'Infinite loop',
    kind: 'adversarial',
    expectation: 'Runs until the CPU-time cap (or wall timeout) terminates it — this one takes the full CPU budget, so expect a wait.',
    code: 'x = 0\nwhile True:\n    x += 1\n',
  },
  {
    id: 'write-outside-workspace',
    label: 'Write outside the workspace',
    kind: 'adversarial',
    expectation: 'Runs, then the write guard refuses the path outside the workspace.',
    code: [
      '# The audit log lives two directories above the run workspace.',
      "with open('../../logs/audit.jsonl', 'a') as handle:",
      "    handle.write('tampered\\n')",
      "print('wrote outside')",
      '',
    ].join('\n'),
  },
]
