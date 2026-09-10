import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/global.css'

const rootElement = document.getElementById('root')

function showBootError(reason: unknown) {
  if (!rootElement) return
  const detail = reason instanceof Error ? reason.message : String(reason)
  rootElement.innerHTML = `
    <main class="boot-screen">
      <img class="boot-logo" src="/karta-logo.png" alt="" />
      <p class="boot-wordmark">Karta</p>
      <h1>Aplikaci se nepodařilo načíst</h1>
      <p>${detail.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!)}</p>
    </main>`
}

window.addEventListener('error', (event) => showBootError(event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => showBootError(event.reason))

void import('./app/App.tsx')
  .then(({ default: App }) => {
    if (!rootElement) throw new Error('Kořen aplikace nebyl nalezen.')
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch(showBootError)
