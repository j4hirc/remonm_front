import { Component, ElementRef, computed, inject, input } from '@angular/core';
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

  // report() con los jobs de cada empleado ordenados por fecha (ascendente),
  // parseando el string "MM/DD/YYYY" que ya viene formateado en job.date.
  readonly sortedReport = computed<PayrollReport>(() => {
    const r = this.report();
    return {
      ...r,
      employees: r.employees.map(employee => ({
        ...employee,
        jobs: [...employee.jobs].sort(
          (a, b) => this.parseUsDate(a.date).getTime() - this.parseUsDate(b.date).getTime()
        )
      }))
    };
  });

  private parseUsDate(value: string): Date {
    // Espera "MM/DD/YYYY"; si no matchea, cae a new Date() como respaldo.
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value?.trim() ?? '');
    if (!match) return new Date(value);
    const [, month, day, year] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
}