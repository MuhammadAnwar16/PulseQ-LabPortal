import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../core/toast.service';
import { laboratoryPath } from '../../../shared/utils/portal-path.util';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="auth-wrap">
      <div class="pq-card auth-card">
        <div class="auth-head">
          <i class="pi pi-microscope"></i>
          <h1>PulseQ Laboratory</h1>
          <p class="pq-muted">Sign in to the lab portal</p>
        </div>

        <form (ngSubmit)="submit()" #f="ngForm">
          <label class="field">
            <span>Username</span>
            <input class="pq-input" [(ngModel)]="username" name="username" required autocomplete="username" />
          </label>
          <label class="field">
            <span>Password</span>
            <input
              class="pq-input"
              type="password"
              [(ngModel)]="password"
              name="password"
              required
              autocomplete="current-password"
            />
          </label>

          @if (error) {
            <div class="error">{{ error }}</div>
          }

          <button type="submit" [disabled]="loading" class="pq-btn pq-btn-primary block">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="hint pq-muted">
          Demo: <b>labtech</b> / <b>lab123</b> &nbsp;·&nbsp; <b>admin</b> / <b>admin123</b>
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--pq-blue-700), var(--pq-blue-500));
        padding: 1.5rem;
      }
      .auth-card {
        width: 380px;
        max-width: 100%;
        border-radius: 16px;
        box-shadow: var(--pq-shadow-md);
        background: var(--pq-surface);
      }
      .auth-head {
        text-align: center;
        margin-bottom: 1.25rem;
      }
      .auth-head i {
        font-size: 2.2rem;
        color: var(--pq-blue-600);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 1rem;
      }
      .field span {
        font-size: 0.85rem;
        color: var(--pq-slate-600);
        font-weight: 500;
      }
      .field input {
        width: 100%;
      }
      .block {
        width: 100%;
      }
      .error {
        background: #fef2f2;
        color: var(--pq-danger-600);
        border: 1px solid #fecaca;
        padding: 0.5rem 0.75rem;
        border-radius: 8px;
        font-size: 0.85rem;
        margin-bottom: 1rem;
      }
      .hint {
        text-align: center;
        font-size: 0.8rem;
        margin: 1.25rem 0 0;
      }
    `,
  ],
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error = '';

  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  constructor() {
    if (this.auth.isAuthed()) {
      this.router.navigate([laboratoryPath('dashboard')]);
    }
  }

  submit(): void {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = '';
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate([laboratoryPath('dashboard')]);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.detail || 'Login failed. Check your credentials.';
        this.toast.add({ severity: 'error', summary: 'Login failed', detail: this.error });
      },
    });
  }
}
