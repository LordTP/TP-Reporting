import { apiClient } from '@/lib/api-client'

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  full_name: string
  organization_name: string
}

export interface User {
  id: string
  email: string
  full_name: string
  role: string
  organization_id: string
  client_id: string | null
  client_ids: string[] | null
  is_active: boolean
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface RefreshTokenResponse {
  access_token: string
  token_type: string
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return apiClient.post('/auth/login', credentials)
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    return apiClient.post('/auth/register', data)
  },

  refreshToken: async (refreshToken: string): Promise<RefreshTokenResponse> => {
    return apiClient.post('/auth/refresh', { refresh_token: refreshToken })
  },

  logout: async (): Promise<void> => {
    return apiClient.post('/auth/logout')
  },
}
