import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';

import { API_BASE } from './api.constants';
import { AuthUser } from './models/laboratory.models';

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

/** SSR-safe localStorage access. */
function read(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function write(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
}
function clear(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Holds the authenticated lab user + JWT. Token is stored in localStorage so it
 * survives reloads; the authGuard consults isAuthed() before route activation.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'pq_lab_token';
  private readonly userKey = 'pq_lab_user';

  readonly user = signal<AuthUser | null>(this.loadUser());

  constructor(private http: HttpClient) {}

  get token(): string | null {
    return read(this.tokenKey);
  }

  isAuthed(): boolean {
    return !!this.token;
  }

  hasRole(...roles: string[]): boolean {
    const u = this.user();
    return !!u && roles.includes(u.role);
  }

  login(username: string, password: string): Observable<AuthUser> {
    return this.http
      .post<any>(`${API_BASE}/auth/login`, { username, password })
      .pipe(
        map((envelope) => {
          if (envelope && envelope.success !== undefined && envelope.data) {
            return envelope.data;
          }
          return envelope;
        }),
        tap((res: LoginResponse) => {
          write(this.tokenKey, res.access_token);
          write(this.userKey, JSON.stringify(res.user));
          this.user.set(res.user);
        }),
        map((res: LoginResponse) => res.user),
      );
  }

  logout(): void {
    clear(this.tokenKey);
    clear(this.userKey);
    this.user.set(null);
  }

  private loadUser(): AuthUser | null {
    const raw = read(this.userKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
