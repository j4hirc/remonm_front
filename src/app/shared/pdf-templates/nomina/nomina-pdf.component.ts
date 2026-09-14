import { Component, ElementRef, inject, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { PayrollReport } from '../../../core/models/reports.model';
@Component({
  selector: 'app-nomina-pdf', standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './nomina-pdf.component.html',
  styleUrl: './nomina-pdf.component.css'
})
export class PayrollPdfComponent {
  readonly report = input.required<PayrollReport>();
  readonly generatedAt = input('');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  get nativeElement(): HTMLElement { return this.element.nativeElement; }
}
