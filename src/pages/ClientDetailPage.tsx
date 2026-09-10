import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Archive, ArrowCounterClockwise, ArrowLeft, CalendarPlus, DotsThree, Trash, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useToast } from '../app/toast'
import { VisitDialog } from '../components/VisitDialog'
import { api, errorMessage } from '../domain/api'
import { formatLocalDate } from '../domain/dates'
import type { CardField, ClientRecord, VisitSummary } from '../domain/types'

function displayValue(field: CardField) {
  if (field.value === undefined || field.value === null || field.value === '') return 'Nevyplněno'
  if (field.fieldType === 'checkbox') return field.value ? 'Ano' : 'Ne'
  if (field.fieldType === 'select') return field.options.find((option) => option.id === field.value)?.label ?? 'Neznámá možnost'
  if (field.fieldType === 'date') return formatLocalDate(String(field.value))
  return String(field.value)
}

export function ClientDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [error, setError] = useState('')
  const [visits, setVisits] = useState<VisitSummary[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const loadVisits = useCallback(async () => {
    try { setVisits(await api.listVisits(id)) }
    catch (reason) { setError(errorMessage(reason)) }
  }, [id])

  useEffect(() => {
    api.getClient(id).then(setClient).catch((reason) => setError(errorMessage(reason)))
    api.listVisits(id).then(setVisits).catch((reason) => setError(errorMessage(reason)))
  }, [id])

  async function toggleArchive() {
    if (!client) return
    try {
      if (client.archivedAt) await api.restoreClient(client.id)
      else await api.archiveClient(client.id)
      showToast(client.archivedAt ? 'Klient byl obnoven z archivu.' : 'Klient byl archivován.')
      navigate('/clients')
    } catch (reason) { setError(errorMessage(reason)) }
  }

  async function deleteClient(event: React.FormEvent) {
    event.preventDefault()
    if (!client || deleteConfirmation !== client.title) return
    setDeleting(true)
    setError('')
    try {
      await api.deleteClient(client.id, deleteConfirmation)
      showToast('Klient byl trvale smazán.')
      navigate('/clients')
    } catch (reason) {
      setError(errorMessage(reason))
      setDeleting(false)
    }
  }

  if (error && !client) return <div className="inline-notice inline-notice--error" role="alert">{error}</div>
  if (!client) return <p className="loading-state">Načítám kartu…</p>

  return (
    <section className="page" aria-labelledby="client-title">
      <Link className="back-link" to="/clients"><ArrowLeft size={16} />Klienti</Link>
      <header className="page-header page-header--actions">
        <div><h1 id="client-title">{client.title}</h1><p className="client-updated">Upraveno {new Date(client.updatedAt).toLocaleDateString('cs-CZ')}</p></div>
        <div className="header-actions"><Link className="button button--secondary" to={`/clients/${client.id}/edit`}>Upravit</Link><DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="icon-button menu-trigger" aria-label="Další akce"><DotsThree size={21} weight="bold" /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end" sideOffset={6}><DropdownMenu.Item className="dropdown-item" onSelect={() => setArchiveOpen(true)}>{client.archivedAt ? <ArrowCounterClockwise size={16} /> : <Archive size={16} />}{client.archivedAt ? 'Obnovit' : 'Archivovat'}</DropdownMenu.Item><DropdownMenu.Separator className="dropdown-separator" /><DropdownMenu.Item className="dropdown-item dropdown-item--danger" onSelect={() => { setDeleteConfirmation(''); setDeleteOpen(true) }}><Trash size={16} />Smazat</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
      </header>
      {error ? <div className="inline-notice inline-notice--error" role="alert">{error}</div> : null}
      <dl className="detail-fields">
        {client.fields.length ? client.fields.map((field) => (
          <div className="detail-row" key={field.id}><dt>{field.label}</dt><dd className={field.value === undefined || field.value === null || field.value === '' ? 'muted-copy' : ''}>{displayValue(field)}</dd></div>
        )) : <div className="empty-inline">Nejsou vyplněné žádné další údaje.</div>}
      </dl>
      <section className="visits-section" aria-labelledby="visits-title">
        <div className="section-heading"><h2 id="visits-title">Návštěvy</h2><button className="button button--primary" type="button" onClick={() => { setSelectedVisitId(null); setVisitOpen(true) }}><CalendarPlus size={17} />Přidat záznam</button></div>
        {visits.length === 0 ? <div className="empty-inline">Zatím tu není žádný záznam návštěvy.</div> : <div className="visit-list">{visits.map((visit) => <button className="visit-row" type="button" key={visit.id} onClick={() => { setSelectedVisitId(visit.id); setVisitOpen(true) }}><time dateTime={visit.visitDate}>{formatLocalDate(visit.visitDate, { day: 'numeric', month: 'long', year: 'numeric' })}</time><span className="visit-preview">{visit.notesPreview}</span><span className="visit-updated">Upraveno {new Date(visit.updatedAt).toLocaleDateString('cs-CZ')}</span></button>)}</div>}
      </section>
      <AlertDialog.Root open={archiveOpen} onOpenChange={setArchiveOpen}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="dialog-content"><div className="dialog-heading"><div><AlertDialog.Title>{client.archivedAt ? 'Obnovit klienta?' : 'Archivovat klienta?'}</AlertDialog.Title><AlertDialog.Description>{client.archivedAt ? 'Klient se vrátí mezi aktivní záznamy.' : 'Klienta můžete později z archivu obnovit.'}</AlertDialog.Description></div><AlertDialog.Cancel className="icon-button" aria-label="Zavřít dialog"><X size={18} /></AlertDialog.Cancel></div><div className="dialog-actions"><AlertDialog.Cancel className="button button--quiet">Zrušit</AlertDialog.Cancel><AlertDialog.Action className="button button--primary" onClick={() => void toggleArchive()}>{client.archivedAt ? 'Obnovit' : 'Archivovat'}</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><div className="dialog-heading"><div><Dialog.Title>Smazat klienta?</Dialog.Title><Dialog.Description>Odstraní se také všechny záznamy návštěv. Napište přesně <strong>{client.title}</strong>.</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Zavřít dialog"><X size={18} /></Dialog.Close></div><form className="form-stack" onSubmit={deleteClient}><label className="field-label">Jméno klienta<input className="text-input" value={deleteConfirmation} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><div className="dialog-actions"><Dialog.Close className="button button--quiet">Zrušit</Dialog.Close><button className="button button--danger" type="submit" disabled={deleteConfirmation !== client.title || deleting}>{deleting ? 'Mažu…' : 'Trvale smazat'}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
      {visitOpen ? <VisitDialog clientId={client.id} visitId={selectedVisitId} open onOpenChange={setVisitOpen} onComplete={loadVisits} /> : null}
    </section>
  )
}
