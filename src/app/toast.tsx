import * as Toast from '@radix-ui/react-toast'
import { X } from '@phosphor-icons/react'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface ToastContextValue {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const value = useMemo(
    () => ({
      showToast(nextMessage: string) {
        setOpen(false)
        window.setTimeout(() => {
          setMessage(nextMessage)
          setOpen(true)
        }, 0)
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider swipeDirection="right">
        {children}
        <Toast.Root className="toast" open={open} onOpenChange={setOpen} duration={5000}>
          <Toast.Description>{message}</Toast.Description>
          <Toast.Close className="icon-button" aria-label="Zavřít oznámení">
            <X size={16} aria-hidden="true" />
          </Toast.Close>
        </Toast.Root>
        <Toast.Viewport className="toast-viewport" />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}

// The hook intentionally shares the provider module so their private context cannot drift.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
