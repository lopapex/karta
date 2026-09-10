import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDown, ArrowUp, X } from '@phosphor-icons/react'
import { useState } from 'react'
import { api, errorMessage } from '../domain/api'
import { appPasswordSchema, backupPasswordSchema } from '../domain/schemas'
import { useToast } from '../app/toast'

interface BackupDialogProps {
  mode: 'export' | 'import'
  triggerLabel: string
  onComplete?: () => void | Promise<void>
  locked?: boolean
}

export function BackupDialog({ mode, triggerLabel, onComplete, locked = false }: BackupDialogProps) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [appConfirmation, setAppConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const exporting = mode === 'export'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const validation = backupPasswordSchema.safeParse(password)
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Heslo zálohy není platné.')
      return
    }
    if (exporting && password !== confirmation) {
      setError('Hesla se neshodují.')
      return
    }
    if (!exporting) {
      const appValidation = appPasswordSchema.safeParse(appPassword)
      if (!appValidation.success) {
        setError(appValidation.error.issues[0]?.message ?? 'Heslo KARTA není platné.')
        return
      }
      if (locked && appPassword !== appConfirmation) {
        setError('Nová hesla KARTA se neshodují.')
        return
      }
    }
    setBusy(true)
    try {
      const result = exporting
        ? await api.exportDatabase(password)
        : await api.importDatabase(password, locked ? undefined : appPassword, locked ? appPassword : undefined)
      showToast(
        exporting
          ? `Záloha ${result.fileName} byla uložena.`
          : `Záloha ${result.fileName} byla obnovena.`,
      )
      setOpen(false)
      setPassword('')
      setConfirmation('')
      setAppPassword('')
      setAppConfirmation('')
      await onComplete?.()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="button button--secondary" type="button">
          {exporting ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby="backup-description">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{exporting ? 'Exportovat databázi' : 'Importovat databázi'}</Dialog.Title>
              <Dialog.Description id="backup-description">
                {exporting
                  ? 'Zvolte silné heslo pouze pro tuto přenosnou zálohu. Heslo KARTA neukládá.'
                  : locked
                    ? 'Vyberte přenosnou zálohu, zadejte její heslo a nastavte nové heslo KARTA.'
                    : 'Zadejte heslo zálohy a současné heslo KARTA. Ověřená záloha nahradí aktuální databázi.'}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zavřít dialog">
              <X size={18} />
            </Dialog.Close>
          </div>
          <form className="form-stack" onSubmit={submit}>
            <label className="field-label">
              Heslo zálohy
              <input
                className="text-input"
                type="password"
                autoComplete="off"
                value={password}
                minLength={12}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
              <span className="field-hint">Nejméně 12 znaků. Bez něj zálohu nelze obnovit.</span>
            </label>
            {exporting ? (
              <label className="field-label">
                Heslo znovu
                <input
                  className="text-input"
                  type="password"
                  autoComplete="off"
                  value={confirmation}
                  minLength={12}
                  required
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
            ) : null}
            {!exporting ? (
              <>
                <label className="field-label">
                  {locked ? 'Nové heslo KARTA' : 'Současné heslo KARTA'}
                  <input className="text-input" type="password" autoComplete={locked ? 'new-password' : 'current-password'} value={appPassword} minLength={6} maxLength={64} required onChange={(event) => setAppPassword(event.target.value)} />
                  {locked ? <span className="field-hint">6 až 64 znaků. Tímto heslem budete databázi odemykat.</span> : null}
                </label>
                {locked ? (
                  <label className="field-label">
                    Nové heslo KARTA znovu
                    <input className="text-input" type="password" autoComplete="new-password" value={appConfirmation} minLength={6} maxLength={64} required onChange={(event) => setAppConfirmation(event.target.value)} />
                  </label>
                ) : null}
              </>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button className="button button--quiet" type="button">Zrušit</button>
              </Dialog.Close>
              <button className="button button--primary" type="submit" disabled={busy}>
                {busy ? 'Pracuji…' : exporting ? 'Vybrat umístění a exportovat' : 'Vybrat soubor a obnovit ze zálohy'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
