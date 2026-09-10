import { HashRouter } from 'react-router'
import { AppRouter } from './router'
import { SecurityGate } from './security'
import { ThemeProvider } from './theme'
import { ToastProvider } from './toast'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SecurityGate>
          <HashRouter>
            <AppRouter />
          </HashRouter>
        </SecurityGate>
      </ToastProvider>
    </ThemeProvider>
  )
}
