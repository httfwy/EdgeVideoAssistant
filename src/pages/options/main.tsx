import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import OptionsApp from './OptionsApp'
import '../page.css'

const rootEl = document.getElementById('root')

if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <OptionsApp />
    </StrictMode>,
  )
}
