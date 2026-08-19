import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TasksApp from './TasksApp'
import '../page.css'

const rootEl = document.getElementById('root')

if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <TasksApp />
    </StrictMode>,
  )
}
