import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // @ts-ignore
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', fontFamily: 'sans-serif', textAlign: 'center', backgroundColor: '#f8fafc', color: '#1e293b', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px', color: '#dc2626' }}>Ocorreu um erro ao carregar o aplicativo</h2>
          <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '500px', marginBottom: '20px' }}>
            {/* @ts-ignore */}
            {this.state.error?.message || 'Sua aplicação encontrou um erro inesperado.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 20px', backgroundColor: '#0284c7', color: '#ffffff', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
          >
            Recarregar Aplicativo
          </button>
        </div>
      );
    }
    // @ts-ignore
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
