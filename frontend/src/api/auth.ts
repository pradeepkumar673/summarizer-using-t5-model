import api from "./client";

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type UserPublic = {
  id: string;
  email: string;
  created_at: string;
};

export async function registerUser(email: string, password: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/api/auth/register", { email, password });
  return res.data;
}

export async function loginUser(email: string, password: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/api/auth/login", { email, password });
  return res.data;
}

export async function fetchMe(): Promise<UserPublic> {
  const res = await api.get<UserPublic>("/api/auth/me");
  return res.data;
}
