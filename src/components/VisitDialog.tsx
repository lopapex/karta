import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import { Trash, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../domain/api'

const today = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

interface Props { clientId: string; visitId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onComplete: () => void | Promise<void> }

export function VisitDialog({ clientId, visitId, open, onOpenChange, onComplete }: Props) {
  const [visitDate, setVisitDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(Boolean(visitId))

  useEffect(() => {
    if (!open) return
    if (!visitId) return
    api.getVisit(clientId, visitId).then((visit) => { setVisitDate(visit.visitDate); setNotes(visit.notes) }).catch((reason) => setError(errorMessage(reason))).finally(() => setBusy(false))
  }, [clientId, open, visitId])

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (visitId) await api.updateVisit(clientId, visitId, visitDate, notes)
      else await api.createVisit(clientId, visitDate, notes)
      await onComplete(); onOpenChange(false)
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!visitId) return
    setBusy(true); setError('')
    try { await api.deleteVisit(clientId, visitId); await onComplete(); onOpenChange(false) }
    catch (reason) { setError(errorMessage(reason)); setBusy(false) }
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content dialog-content--visit" aria-describedby="visit-description">
    <div className="dialog-heading"><div><Dialog.Title>{visitId ? 'Záznam návštěvy' : 'Přidat záznam'}</Dialog.Title><Dialog.Description id="visit-description">Vyplňte datum a záznam návštěvy.</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Zavřít"><X size={18} /></Dialog.Close></div>
    {busy && visitId && !notes ? <p className="loading-state">Načítám záznam…</p> : <form className="form-stack" onSubmit={submit}>
      <label className="field-label">Datum návštěvy<input className="text-input visit-date-input" type="date" value={visitDate} required onChange={(event) => setVisitDate(event.target.value)} /></label>
      <label className="field-label">Záznam<textarea className="text-input textarea visit-notes" value={notes} required maxLength={100000} autoFocus={!visitId} onChange={(event) => setNotes(event.target.value)} /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions dialog-actions--split">
        <div>{visitId ? <AlertDialog.Root><AlertDialog.Trigger asChild><button className="button button--danger" type="button"><Trash size={17} />Smazat</button></AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay dialog-overlay--nested" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title>Smazat záznam návštěvy?</AlertDialog.Title><AlertDialog.Description>Tuto akci nelze vrátit zpět.</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="button button--quiet">Zrušit</AlertDialog.Cancel><AlertDialog.Action className="button button--danger" onClick={() => void remove()}>Trvale smazat</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root> : null}</div>
        <div className="dialog-actions"><Dialog.Close className="button button--quiet">Zrušit</Dialog.Close><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit záznam'}</button></div>
      </div>
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
