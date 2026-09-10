import { Eye, EyeSlash, ShieldCheck } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { api, errorMessage } from '../domain/api'
import { appPasswordSchema } from '../domain/schemas'
import type { SecurityStatus } from '../domain/types'
import { BackupDialog } from '../components/BackupDialog'

export function SecurityGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.securityStatus().then(setStatus).catch((reason) => setError(errorMessage(reason)))
  }, [])

  if (status?.state === 'unlocked') return children

  const setup = status?.state === 'needsInitialization'
  const migration = status?.state === 'needsPasswordMigration'
  const creatingPassword = setup || migration
  const inconsistent = status?.state === 'inconsistent'

  async function authenticate(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const validation = appPasswordSchema.safeParse(password)
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Heslo není platné.')
      return
    }
    if (creatingPassword && password !== confirmation) {
      setError('Hesla se neshodují.')
      return
    }
    setBusy(true)
    try {
      setStatus(creatingPassword ? await api.initialize(password) : await api.unlock(password))
      setPassword('')
      setConfirmation('')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="lock-screen">
      <section className="lock-panel" aria-labelledby="lock-title">
        <img className="lock-logo" src="/karta-logo.png" alt="" />
        <p className="lock-wordmark">Karta</p>
        <h1 id="lock-title">
          {inconsistent
            ? 'Úložiště vyžaduje obnovu'
            : migration
                ? 'Vytvořte heslo'
              : setup
                ? 'Nastavte zabezpečení'
                : 'Karta je zamčená'}
        </h1>
        <p className="lock-description">
          {inconsistent
            ? 'Databáze nebo její lokální klíč chybí. Data můžete vrátit z přenosné zálohy.'
              : migration
              ? 'Nastavte heslo pro další přihlášení.'
              : creatingPassword
                ? 'Zvolte heslo o délce 6 až 64 znaků.'
                : 'Zadejte své heslo.'}
        </p>

        {!inconsistent ? (
          <form className="form-stack" onSubmit={authenticate}>
            <label className="field-label">
              {creatingPassword ? 'Nové heslo KARTA' : 'Heslo KARTA'}
              <span className="password-input-wrap">
                <input
                  className="text-input"
                  type={visible ? 'text' : 'password'}
                  autoComplete={creatingPassword ? 'new-password' : 'current-password'}
                  value={password}
                  minLength={6}
                  maxLength={64}
                  autoFocus
                  required
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button className="password-toggle" type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Skrýt heslo' : 'Zobrazit heslo'}>
                  {visible ? <EyeSlash size={19} /> : <Eye size={19} />}
                </button>
              </span>
            </label>
            {creatingPassword ? (
              <label className="field-label">
                Heslo znovu
                <input className="text-input" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} minLength={6} maxLength={64} required onChange={(event) => setConfirmation(event.target.value)} />
              </label>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button--primary lock-action" type="submit" disabled={busy}>
              {busy ? 'Ověřuji…' : creatingPassword ? 'Uložit heslo a pokračovat' : 'Odemknout'}
            </button>
          </form>
        ) : error ? <p className="form-error" role="alert">{error}</p> : null}

        {!creatingPassword ? (
          <BackupDialog mode="import" locked triggerLabel="Obnovit ze zálohy" onComplete={() => api.securityStatus().then(setStatus)} />
        ) : null}
        <p className="security-caption"><ShieldCheck size={15} aria-hidden="true" />Data zůstávají v tomto zařízení.</p>
      </section>
    </main>
  )
}
