/**
 * Modal — accessible dialog: Esc and backdrop close, focus moves in on open
 * and returns to the trigger on close, body scroll locked. Bottom sheet on
 * small screens, centred card from sm up.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from '@phosphor-icons/react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** Block closing while a transaction is in flight. */
  locked?: boolean
}

export default function Modal({ open, onClose, title, children, locked = false }: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  // Latest close handler / lock, read from refs so the open effect below runs
  // only on open/close (re-running it mid-transaction would move focus).
  const onCloseRef = useRef(onClose)
  const lockedRef = useRef(locked)
  useEffect(() => { onCloseRef.current = onClose; lockedRef.current = locked }, [onClose, locked])

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input, button:not([data-close]), [tabindex="0"]')?.focus()
    }, 50)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !lockedRef.current) onCloseRef.current()
      if (e.key === 'Tab' && panelRef.current) {
        // Keep keyboard focus inside the dialog.
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (f.length === 0) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      lastFocus.current?.focus?.()
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={() => { if (!locked) onClose() }}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full sm:max-w-[440px] max-h-[92dvh] overflow-y-auto rounded-t-[22px] sm:rounded-[22px] border border-[var(--color-border)] bg-[var(--color-elevated)] shadow-[var(--shadow-pop)]"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 34 } }}
            exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.14 } }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[var(--color-elevated)] px-5 pt-5 pb-3">
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              <button
                data-close
                onClick={onClose}
                disabled={locked}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-base cursor-pointer disabled:opacity-40"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
