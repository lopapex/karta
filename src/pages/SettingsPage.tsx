import { Desktop, Moon, Sun, type Icon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useTheme, type ThemePreference } from '../app/theme-context'
import { useToast } from '../app/toast'
import { BackupDialog } from '../components/BackupDialog'
import { api, errorMessage } from '../domain/api'
import { appPasswordSchema } from '../domain/schemas'

interface ThemeOption {
  value: ThemePreference
  label: string
  description: string
  icon: Icon
}

const themeOptions: ThemeOption[] = [
  {
    value: 'system',
    label: 'Podle systému',
    description: 'KARTA se přizpůsobí nastavení Windows.',
    icon: Desktop,
  },
  {
    value: 'light',
    label: 'Světlý',
    description: 'Světlé plochy pro práci během dne.',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Tmavý',
    description: 'Tlumené plochy pro méně osvětlené prostředí.',
    icon: Moon,
  },
]

export function SettingsPage() {
  const { preference, setPreference } = useTheme()
  const { showToast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    setPasswordError('')
    const validation = appPasswordSchema.safeParse(newPassword)
    if (!validation.success) {
      setPasswordError(validation.error.issues[0]?.message ?? 'Nové heslo není platné.')
      return
    }
    if (newPassword !== confirmation) {
      setPasswordError('Nová hesla se neshodují.')
      return
    }
    setChangingPassword(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      showToast('Heslo KARTA bylo změněno.')
    } catch (reason) {
      setPasswordError(errorMessage(reason))
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <section className="page" aria-labelledby="settings-title">
      <header className="page-header"><h1 id="settings-title">Nastavení</h1></header>

      <section className="settings-group" aria-labelledby="backup-title">
        <h2 id="backup-title">Databáze</h2>
        <div className="settings-rows">
          <div className="settings-row"><div><h3>Export databáze</h3><p>Vytvoří přenosnou šifrovanou zálohu.</p></div><BackupDialog mode="export" triggerLabel="Exportovat" /></div>
          <div className="settings-row"><div><h3>Obnovit ze zálohy</h3><p>Nahradí aktuální databázi vybranou zálohou.</p></div><BackupDialog mode="import" triggerLabel="Obnovit" onComplete={() => window.location.assign('#/clients')} /></div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="password-title">
        <h2 id="password-title">Přihlašovací heslo</h2>
        <form className="form-stack settings-form" onSubmit={changePassword}>
          <label className="field-label">
            Současné heslo
            <input className="text-input" type="password" autoComplete="current-password" value={currentPassword} minLength={6} maxLength={64} required onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label className="field-label">
            Nové heslo
            <input className="text-input" type="password" autoComplete="new-password" value={newPassword} minLength={6} maxLength={64} required onChange={(event) => setNewPassword(event.target.value)} />
            <span className="field-hint">6 až 64 znaků</span>
          </label>
          <label className="field-label">
            Nové heslo znovu
            <input className="text-input" type="password" autoComplete="new-password" value={confirmation} minLength={6} maxLength={64} required onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          {passwordError ? <p className="form-error" role="alert">{passwordError}</p> : null}
          <div><button className="button button--primary" type="submit" disabled={changingPassword}>{changingPassword ? 'Měním heslo…' : 'Změnit heslo'}</button></div>
        </form>
      </section>

      <fieldset className="settings-group">
        <legend>Vzhled</legend>
        <div className="theme-options">
          {themeOptions.map(({ value, label, description, icon: ThemeIcon }) => (
            <label className="theme-option" key={value}>
              <input type="radio" name="theme" value={value} checked={preference === value} onChange={() => setPreference(value)} />
              <span className="theme-option-icon" aria-hidden="true"><ThemeIcon size={18} weight="regular" /></span>
              <span className="theme-option-copy"><span className="theme-option-label">{label}</span><span className="theme-option-description">{description}</span></span>
              <span className="radio-indicator" aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
