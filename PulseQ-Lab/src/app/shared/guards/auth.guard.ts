import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { laboratoryPath } from '../utils/portal-path.util';

/** Blocks unauthenticated users and redirects them to the lab login screen. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthed()) {
    return true;
  }
  return router.createUrlTree([laboratoryPath('auth/login')]);
};
