import axios from 'axios';

// Backend API URL (default localhost:8000 for local dev)
const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

// API Helper
const api = axios.create({ 
  baseURL: API_URL, 
  headers: { 'Content-Type': 'application/json' } 
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export { API_URL, api };
export default api;
