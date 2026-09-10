import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const perl = join(
  projectDirectory,
  '.tools',
  'strawberry-perl-5.42.3.1',
  'perl',
  'bin',
  'perl.exe',
)
const tauriCli = join(projectDirectory, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

if (!existsSync(perl)) {
  console.error(
    `Strawberry Perl nebyl nalezen v ${perl}. ` +
      'Použijte projektovou portable instalaci popsanou v README.',
  )
  process.exit(1)
}

const child = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  cwd: projectDirectory,
  env: { ...process.env, OPENSSL_SRC_PERL: perl },
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(`Tauri se nepodařilo spustit: ${error.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
