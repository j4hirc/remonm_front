import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PwaComponent } from './shared/pwa/pwa.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    PwaComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('remonm_front');
}