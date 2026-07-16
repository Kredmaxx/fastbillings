import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { initializeAuth, logout } from './store/auth/authSlice';
import { store } from './store';
import { Provider } from 'react-redux';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

store.dispatch(initializeAuth());

// Global 401 handler: a stale/invalid session (e.g. the token's user no longer
// exists) should cleanly log the user out and bounce to login, rather than
// surfacing confusing errors inside forms. Skip when already on the login page.
const LOGIN_PATH = '/admin/login';
axios.interceptors.request.use((config) => {
  const token = store.getState().auth.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error?.response?.status === 401 &&
      !window.location.pathname.startsWith(LOGIN_PATH)
    ) {
      store.dispatch(logout());
      window.location.assign(LOGIN_PATH);
    }
    return Promise.reject(error);
  }
);

const queryClient = new QueryClient();
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <HelmetProvider>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </HelmetProvider>
        </LocalizationProvider>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
