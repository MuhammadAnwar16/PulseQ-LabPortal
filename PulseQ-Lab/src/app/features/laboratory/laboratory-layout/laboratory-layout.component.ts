import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { LaboratorySidebar } from '../../../shared/components/laboratory-sidebar/laboratory-sidebar.component';

@Component({
  selector: 'app-laboratory-layout',
  standalone: true,
  imports: [RouterOutlet, LaboratorySidebar],
  template: `
    <div class="layout">
      <app-laboratory-sidebar />
      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .layout {
        display: flex;
        min-height: 100vh;
        background: var(--pq-bg);
      }
      .content {
        flex: 1;
        min-width: 0;
      }
      @media (max-width: 860px) {
        .layout {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class LaboratoryLayout {}
