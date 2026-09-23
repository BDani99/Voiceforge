import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary'
import './styles/theme.css'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

ReactDOM.createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
