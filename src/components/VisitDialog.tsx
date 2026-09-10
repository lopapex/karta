import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import { Trash, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../domain/api'
import { todayLocalIso } from '../domain/dates'

interface Props { clientId: string; visitId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onComplete: () => void | Promise<void> }

export function VisitDialog({ clientId, visitId, open, onOpenChange, onComplete }: Props) {
  const [visitDate, setVisitDate] = useState(todayLocalIso())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(Boolean(visitId))
  const [initial, setInitial] = useState({ visitDate: todayLocalIso(), notes: '' })
  const [discardOpen, setDiscardOpen] = useState(false)
  const dirty = visitDate !== initial.visitDate || notes !== initial.notes

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setError('')
      if (!visitId) {
        const date = todayLocalIso()
        setVisitDate(date); setNotes(''); setInitial({ visitDate: date, notes: '' }); setBusy(false)
        return
      }
      setBusy(true)
      api.getVisit(clientId, visitId).then((visit) => { if (!cancelled) { setVisitDate(visit.visitDate); setNotes(visit.notes); setInitial({ visitDate: visit.visitDate, notes: visit.notes }) } }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)) }).finally(() => { if (!cancelled) setBusy(false) })
    })
    return () => { cancelled = true }
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
  function requestClose() {
    if (dirty && !busy) setDiscardOpen(true)
    else onOpenChange(false)
  }
  async function remove() {
    if (!visitId) return
    setBusy(true); setError('')
    try { await api.deleteVisit(clientId, visitId); await onComplete(); onOpenChange(false) }
    catch (reason) { setError(errorMessage(reason)); setBusy(false) }
  }

  return <><Dialog.Root open={open} onOpenChange={(next) => { if (!next) requestClose() }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content dialog-content--visit" aria-describedby="visit-description" onEscapeKeyDown={(event) => { if (dirty) { event.preventDefault(); setDiscardOpen(true) } }} onPointerDownOutside={(event) => { if (dirty) { event.preventDefault(); setDiscardOpen(true) } }}>
    <div className="dialog-heading"><div><Dialog.Title>{visitId ? 'Záznam návštěvy' : 'Přidat záznam'}</Dialog.Title><Dialog.Description id="visit-description">Datum a průběh návštěvy.</Dialog.Description></div><button type="button" className="icon-button" aria-label="Zavřít" onClick={requestClose}><X size={18} /></button></div>
    {busy && visitId && !notes ? <p className="loading-state">Načítám záznam…</p> : <form className="visit-form" onSubmit={submit}>
      <label className="field-label">Datum návštěvy<input className="text-input visit-date-input" type="date" value={visitDate} required onChange={(event) => setVisitDate(event.target.value)} /></label>
      <label className="field-label">Záznam<textarea className="text-input textarea visit-notes" value={notes} required maxLength={100000} autoFocus={!visitId} onChange={(event) => setNotes(event.target.value)} /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions dialog-actions--split">
        <div>{visitId ? <AlertDialog.Root><AlertDialog.Trigger asChild><button className="button button--danger" type="button"><Trash size={17} />Smazat</button></AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay dialog-overlay--nested" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title>Smazat záznam návštěvy?</AlertDialog.Title><AlertDialog.Description>Tuto akci nelze vrátit zpět.</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="button button--quiet">Zrušit</AlertDialog.Cancel><AlertDialog.Action className="button button--danger" onClick={() => void remove()}>Trvale smazat</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root> : null}</div>
        <div className="dialog-actions"><button className="button button--quiet" type="button" onClick={requestClose}>Zrušit</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit záznam'}</button></div>
      </div>
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>
  <AlertDialog.Root open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay dialog-overlay--nested" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title>Zahodit rozepsané změny?</AlertDialog.Title><AlertDialog.Description>Neuložený text záznamu se ztratí.</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="button button--quiet">Pokračovat v psaní</AlertDialog.Cancel><AlertDialog.Action className="button button--danger" onClick={() => { setDiscardOpen(false); onOpenChange(false) }}>Zahodit změny</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root></>
}
