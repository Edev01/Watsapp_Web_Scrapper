const BASE_URL = import.meta.env.VITE_SCRAPPER_URL;

export const API_ENDPOINTS = {
  adminSignup: `${BASE_URL}/api/auth/admin/signup`,
  login: `${BASE_URL}/api/auth/login`,
  resetPassword: `${BASE_URL}/api/auth/reset-password`,
  users: `${BASE_URL}/api/users`,
  qrLatest: `${BASE_URL}/api/qr/latest`,
};
