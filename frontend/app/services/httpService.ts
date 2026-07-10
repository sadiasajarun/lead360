import axios from 'axios';

// Axios orchestrator. httpOnly cookies carry the JWT (withCredentials), so no manual token header.
// Domain services in httpServices/ use the httpMethods/ factories (added in D7-integrate).
export const httpService = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
