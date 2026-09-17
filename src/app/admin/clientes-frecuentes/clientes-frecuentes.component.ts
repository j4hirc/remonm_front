import { Component, DestroyRef, computed, inject, OnInit, OnDestroy, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { SwalComponent, SwalPortalDirective, SwalPortalTargets } from '@sweetalert2/ngx-sweetalert2';
import Swal, { SweetAlertOptions } from 'sweetalert2';
import { Cliente, ClienteRequest } from '../../core/models/cliente.model';
import { ClientesService } from '../../core/services/clientes.service';

declare const L: any;

@Component({
  selector: 'app-clientes-frecuentes-admin',
  standalone: true,
  imports: [ReactiveFormsModule, SwalComponent, SwalPortalDirective], // IMPORTANTE agregar imports de swal
  templateUrl: './clientes-frecuentes.component.html',
  styleUrl: './clientes-frecuentes.component.css'
})
export class ClientesFrecuentesAdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(ClientesService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // Elementos de SweetAlert
  readonly swalTargets = inject(SwalPortalTargets);
  private readonly editor = viewChild.required<SwalComponent>('editor');

  // Mapa
  private map: any = null;
  private marker: any = null;

  readonly clientes = signal<Cliente[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly editorOpen = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = 10;

  readonly filtered = computed(() => {
    const text = this.search().trim().toLocaleLowerCase();

    // 1. Filtramos por nombre, teléfono o dirección
    const listaFiltrada = this.clientes().filter(c =>
      `${c.clientName} ${c.clientPhone ?? ''} ${c.address}`.toLocaleLowerCase().includes(text)
    );

    // 2. Ordenamos alfabéticamente por el nombre del cliente
    return listaFiltrada.sort((a, b) => {
      const nombreA = a.clientName || '';
      const nombreB = b.clientName || '';
      return nombreA.localeCompare(nombreB, 'es'); // 'es' para que respete acentos y ñ
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly rows = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));

  readonly form = this.fb.group({
    clientName: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/\S/)]),
    clientPhone: this.fb.nonNullable.control(''),
    address: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/\S/)]),
    latitude: this.fb.control<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: this.fb.control<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)])
  });

  // Opciones del popup SweetAlert
  readonly editorOptions: SweetAlertOptions = {
    width: 600,
    showCancelButton: true,
    showCloseButton: true,
    confirmButtonText: 'Guardar Cliente',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#e65100',
    cancelButtonColor: '#2E3238',
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !this.busy(),
    allowEscapeKey: () => !this.busy(),
    preConfirm: () => this.persistClient()
  };

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (Swal.isVisible()) Swal.close();
    });
  }

  ngOnInit(): void { void this.load(); }
  ngOnDestroy(): void { this.destroyMap(); }

  // ========== MAPA ==========
  onEditorDidOpen(): void {
    this.waitForElement('.swal2-container #clientMap', 30, 50).then((host) => {
      if (host) this.buildMap(host);
    });
  }

  onEditorWillClose(): void {
    this.destroyMap();
  }

  private waitForElement(selector: string, maxTries = 30, intervalMs = 50): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) { resolve(el); return; }
        tries++;
        if (tries >= maxTries) { resolve(null); return; }
        requestAnimationFrame(() => setTimeout(tick, intervalMs));
      };
      tick();
    });
  }

  private buildMap(host: HTMLElement): void {
    if (this.map) { this.map.remove(); this.map = null; }
    if ((host as any)._leaflet_id) { (host as any)._leaflet_id = null; }
    host.innerHTML = '';

    // Coordenadas por defecto (Centro) si es un nuevo cliente
    const lat = this.form.controls.latitude.value ?? -2.900128;
    const lng = this.form.controls.longitude.value ?? -79.005896;

    this.map = L.map(host, { scrollWheelZoom: true }).setView([lat, lng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(this.map);

    this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);

    this.marker.on('dragend', () => {
      const pos = this.marker.getLatLng();
      this.form.controls.latitude.setValue(Number(pos.lat.toFixed(6)));
      this.form.controls.longitude.setValue(Number(pos.lng.toFixed(6)));
      this.reverseGeocode(pos.lat, pos.lng);
    });

    this.map.on('click', (e: any) => {
      this.marker.setLatLng(e.latlng);
      this.form.controls.latitude.setValue(Number(e.latlng.lat.toFixed(6)));
      this.form.controls.longitude.setValue(Number(e.latlng.lng.toFixed(6)));
      this.reverseGeocode(e.latlng.lat, e.latlng.lng);
    });

    requestAnimationFrame(() => {
      setTimeout(() => { this.map?.invalidateSize(true); }, 150);
    });
  }

  private destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
    }
  }

  private reverseGeocode(lat: number, lng: number): void {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es&addressdetails=1`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.address) return;
        const a = data.address;
        const calle = [a.house_number || '', a.road || a.pedestrian || ''].filter(Boolean).join(' ');
        const partes = [calle, a.city || a.town || a.village || a.municipality || '', a.state || ''].filter(Boolean);
        this.form.controls.address.setValue(partes.join(', '));
      })
      .catch(() => undefined);
  }

  searchAddressOnMap(): void {
    const texto = this.form.controls.address.value?.trim();
    if (!texto) return;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto)}&accept-language=es&limit=1`)
      .then((res) => res.json())
      .then((results) => {
        if (results && results.length > 0) {
          const latV = parseFloat(results[0].lat);
          const lngV = parseFloat(results[0].lon);
          this.form.controls.latitude.setValue(Number(latV.toFixed(6)));
          this.form.controls.longitude.setValue(Number(lngV.toFixed(6)));
          if (this.map && this.marker) {
            this.marker.setLatLng([latV, lngV]);
            this.map.setView([latV, lngV], 16);
          }
        }
      })
      .catch((err) => console.error('Error geocoding:', err));
  }

  onAddressKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.searchAddressOnMap();
    }
  }

  myLocation(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.form.controls.latitude.setValue(Number(lat.toFixed(6)));
        this.form.controls.longitude.setValue(Number(lng.toFixed(6)));
        if (this.map && this.marker) {
          this.map.setView([lat, lng], 16);
          this.marker.setLatLng([lat, lng]);
          this.map.invalidateSize(true);
        }
        this.reverseGeocode(lat, lng);
      },
      () => Swal.fire('Error', 'No se pudo obtener tu ubicación.', 'error'),
      { enableHighAccuracy: true }
    );
  }

  // ========== CRUD CLIENTES ==========
  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      this.clientes.set(await firstValueFrom(this.api.getAll().pipe(takeUntilDestroyed(this.destroyRef))));
      this.page.set(Math.min(this.page(), this.pageCount()));
    } catch (error) {
      if (!this.destroyRef.destroyed) Swal.fire('Error', this.errorMessage(error), 'error');
    } finally { this.loading.set(false); }
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  async open(cliente?: Cliente): Promise<void> {
    if (this.busy()) return;
    this.editingId.set(cliente?.id ?? null);
    this.form.reset({
      clientName: cliente?.clientName ?? '',
      clientPhone: cliente?.clientPhone ?? '',
      address: cliente?.address ?? '',
      latitude: cliente?.latitude ?? -2.900128,
      longitude: cliente?.longitude ?? -79.005896
    });

    this.editorOpen.set(true);
    try {
      const result = await this.editor().fire();
      if (result.isConfirmed && !this.destroyRef.destroyed) {
        await Swal.fire({
          icon: 'success',
          title: '¡Éxito!',
          text: cliente ? 'Cliente actualizado correctamente.' : 'Cliente creado correctamente.',
          confirmButtonColor: '#12CFF4'
        });
      }
    } finally {
      this.editorOpen.set(false);
      this.destroyMap();
    }
  }

  private async persistClient(): Promise<boolean> {
    if (this.busy()) return false;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    if (this.form.invalid || !Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) {
      Swal.showValidationMessage('Completa nombre, dirección y selecciona una ubicación en el mapa.');
      return false;
    }

    const data: ClienteRequest = {
      clientName: raw.clientName.trim(), clientPhone: raw.clientPhone.trim(),
      address: raw.address.trim(), latitude: raw.latitude!, longitude: raw.longitude!
    };

    this.busy.set(true);
    const id = this.editingId();
    try {
      const request = id === null ? this.api.create(data) : this.api.update(id, data);
      const saved = await firstValueFrom(request.pipe(takeUntilDestroyed(this.destroyRef)));
      this.clientes.update(list => id === null ? [saved, ...list] : list.map(c => c.id === id ? saved : c));
      this.search.set('');
      this.page.set(1);
      return true;
    } catch (error) {
      if (!this.destroyRef.destroyed) Swal.showValidationMessage(this.errorMessage(error));
      return false;
    } finally { this.busy.set(false); }
  }

  async remove(cliente: Cliente): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const result = await Swal.fire({
        title: '¿Eliminar cliente?', text: cliente.clientName, icon: 'warning',
        showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b42318'
      });
      if (!result.isConfirmed || this.destroyRef.destroyed) return;
      await firstValueFrom(this.api.delete(cliente.id).pipe(takeUntilDestroyed(this.destroyRef)));
      this.clientes.update(list => list.filter(c => c.id !== cliente.id));
      this.page.set(Math.min(this.page(), this.pageCount()));
      Swal.fire('¡Eliminado!', 'El cliente fue eliminado.', 'success');
    } catch (error) {
      if (!this.destroyRef.destroyed) Swal.fire('Error', this.errorMessage(error), 'error');
    } finally { this.busy.set(false); }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar con la API.';
      if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
      if (error.status === 403) return 'Tu usuario no tiene permiso.';
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join('. ');
    }
    return 'No se pudo completar la operación.';
  }
}