import { Component, ElementRef, inject, input } from '@angular/core';
import { WarehouseReport } from '../../../core/models/reports.model';
@Component({
  selector: 'app-bodega-pdf', standalone: true,
  imports: [],
  templateUrl: './bodega-pdf.component.html',
  styleUrl: './bodega-pdf.component.css'
})
export class WarehousePdfComponent {
  readonly report = input.required<WarehouseReport>();
  readonly generatedAt = input('');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  get nativeElement(): HTMLElement { return this.element.nativeElement; }
}
