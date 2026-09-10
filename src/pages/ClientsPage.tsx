import { CaretRight, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, errorMessage } from '../domain/api'
import type { ClientSummary } from '../domain/types'

export function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setError('')
      api.listClients(query, archived)
        .then(setClients)
        .catch((reason) => setError(errorMessage(reason)))
        .finally(() => setLoading(false))
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [query, archived])

  return (
    <section className="page page--wide" aria-labelledby="clients-title">
      <header className="page-header page-header--actions">
        <h1 id="clients-title">Klienti</h1>
        <Link className="button button--primary" to="/clients/new"><Plus size={17} />Nový klient</Link>
      </header>
      <div className="list-toolbar">
        <label className="search-field"><MagnifyingGlass size={17} aria-hidden="true" /><span className="visually-hidden">Hledat klienta</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat klienta…" /></label>
        <div className="archive-filter" role="group" aria-label="Stav klientů"><button className={!archived ? 'archive-filter__option archive-filter__option--active' : 'archive-filter__option'} type="button" aria-pressed={!archived} onClick={() => setArchived(false)}>Aktivní</button><button className={archived ? 'archive-filter__option archive-filter__option--active' : 'archive-filter__option'} type="button" aria-pressed={archived} onClick={() => setArchived(true)}>Archivovaní</button></div>
      </div>
      {error ? <div className="inline-notice inline-notice--error" role="alert">{error}</div> : null}
      {loading ? <p className="loading-state" role="status">Načítám karty…</p> : null}
      {!loading && clients.length === 0 ? (
        <div className="empty-state">
          <div><h2>{query ? 'Žádný klient neodpovídá hledání' : archived ? 'Žádní archivovaní klienti' : 'Žádní klienti'}</h2><p>{query ? 'Zkuste jiný výraz.' : archived ? 'Archivované záznamy se zobrazí zde.' : 'Zatím zde nejsou žádní klienti.'}</p></div>
        </div>
      ) : null}
      <div className="record-list">
        {clients.map((client) => (
          <Link className="record-row record-row--link" to={`/clients/${client.id}`} key={client.id}>
            <div className="record-copy"><h2>{client.title}</h2></div>
            <span className="record-meta">Upraveno {new Date(client.updatedAt).toLocaleDateString('cs-CZ')}</span>
            <CaretRight className="record-caret" size={16} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  )
}
