import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly toast = inject(ToastService);

  getIcon(severity: string): string {
    switch (severity) {
      case 'success': return 'pi-check-circle';
      case 'error': return 'pi-exclamation-circle';
      case 'warn': return 'pi-exclamation-triangle';
      default: return 'pi-info-circle';
    }
  }
}
