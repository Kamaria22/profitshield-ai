import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Shopify App Bridge requires the PUBLIC API key (Client ID)
window.__SHOPIFY_API_KEY__ = '67be6ef7574f3a32bf9a218ad4582c68'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)