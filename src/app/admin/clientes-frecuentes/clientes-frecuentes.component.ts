import { findAddress } from '../../core/utils/address-search';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  OnInit,
  OnDestroy,
  signal,
  viewChild
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import {
  SwalComponent,
  SwalPortalDirective,
  SwalPortalTargets
} from '@sweetalert2/ngx-sweetalert2';
import Swal, { SweetAlertOptions } from 'sweetalert2';
import { Cliente, ClienteRequest } from '../../core/models/cliente.model';
import { ClientesService } from '../../core/services/clientes.service';

declare const L: any;

@Component({
  selector: 'app-clientes-frecuentes-admin',
  standalone: true,
  imports: [ReactiveFormsModule, SwalComponent, SwalPortalDirective],
  templateUrl: './clientes-frecuentes.component.html',
  styleUrl: './clientes-frecuentes.component.css'
})
export class ClientesFrecuentesAdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(ClientesService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly swalTargets = inject(SwalPortalTargets);
  private readonly editor = viewChild.required<SwalComponent>('editor');

  private map: any = null;
  private marker: any = null;
  readonly addressStatus = signal<{ kind: 'info' | 'warn'; text: string } | null>(null);
  readonly addressSearching = signal(false);
  private lastSearchedAddress = '';
  private confirmedAddress = '';
  private searchToken = 0;

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

  return this.clientes()
    .filter((cliente) => {
      const contenido = [
        cliente.clientName,
        cliente.companyName ?? '',
        cliente.contactName ?? '',
        cliente.clientPhone ?? '',
        cliente.address,
        cliente.codeBox ?? ''
      ]
        .join(' ')
        .toLocaleLowerCase();

      return contenido.includes(text);
    })
    .sort((a, b) =>
      (a.clientName || '').localeCompare(b.clientName || '', 'es')
    );
});

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.pageSize))
  );

  readonly rows = computed(() =>
    this.filtered().slice(
      (this.page() - 1) * this.pageSize,
      this.page() * this.pageSize
    )
  );

  readonly form = this.fb.group({
    clientName: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/\S/)
    ]),

    companyName: this.fb.nonNullable.control('', [
      Validators.maxLength(255)
    ]),

    contactName: this.fb.nonNullable.control('', [
      Validators.maxLength(255)
    ]),

    clientPhone: this.fb.nonNullable.control(''),

    address: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/\S/)
    ]),

    codeBox: this.fb.nonNullable.control('', [
      Validators.maxLength(255)
    ]),

    latitude: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(-90),
      Validators.max(90)
    ]),

    longitude: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(-180),
      Validators.max(180)
    ])
  });

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

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  // ========== MAPA ==========

  onEditorDidOpen(): void {
    this.initMapFromForm();
  }

  onEditorWillClose(): void {
    this.destroyMap();
  }

  private initMapFromForm(): void {
    this.waitForElement('.swal2-container #clientMap', 30, 50).then((host) => {
      if (!host) {
        console.warn(
          'No se encontró el contenedor del mapa en el modal (timeout).'
        );
        return;
      }
      this.buildMap(host);
    });
  }

  private waitForElement(
    selector: string,
    maxTries = 30,
    intervalMs = 50
  ): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          resolve(el);
          return;
        }
        tries++;
        if (tries >= maxTries) {
          resolve(null);
          return;
        }
        requestAnimationFrame(() => setTimeout(tick, intervalMs));
      };
      tick();
    });
  }

  private buildMap(host: HTMLElement): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    if ((host as any)._leaflet_id) {
      (host as any)._leaflet_id = null;
    }
    host.innerHTML = '';

    const lat = this.form.controls.latitude.value ?? -2.900128;
    const lng = this.form.controls.longitude.value ?? -79.005896;

    this.map = L.map(host, { scrollWheelZoom: true }).setView([lat, lng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
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
      setTimeout(() => {
        this.map?.invalidateSize(true);
      }, 150);
    });

    this.resetScrollInsideModal();
  }

  private resetScrollInsideModal(): void {
    const resetTodo = () => {
      const container = document.querySelector(
        '.swal2-container'
      ) as HTMLElement | null;
      const popup = document.querySelector('.swal2-popup') as HTMLElement | null;
      if (container) container.scrollTop = 0;
      if (popup) {
        popup.scrollTop = 0;
        popup.querySelectorAll('*').forEach((el) => {
          const node = el as HTMLElement;
          if (node.scrollHeight > node.clientHeight) {
            node.scrollTop = 0;
          }
        });
      }
    };

    requestAnimationFrame(resetTodo);
    setTimeout(resetTodo, 50);
    setTimeout(resetTodo, 300);
  }

  private destroyMap(): void {
    this.searchToken++;
    this.addressSearching.set(false);
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
    }
    const host = document.getElementById('clientMap');
    if (host) {
      if ((host as any)._leaflet_id) {
        (host as any)._leaflet_id = null;
      }
      host.innerHTML = '';
    }
  }

  onAddressInput(): void {
    this.searchToken++;
    this.lastSearchedAddress = '';
    this.confirmedAddress = '';
    this.addressSearching.set(false);
    this.addressStatus.set(null);
  }

  async searchAddressOnMap(force = false): Promise<void> {
    const original = this.form.controls.address.value?.trim() ?? '';
    if (!original || (!force && original === this.lastSearchedAddress)) return;
    if (this.addressSearching() && original === this.lastSearchedAddress) return;
    const token = ++this.searchToken;
    this.lastSearchedAddress = original;
    this.confirmedAddress = '';
    this.addressStatus.set(null);
    const coords = original.match(/^([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)$/);
    if (coords) {
      const lat = Number(coords[1]), lon = Number(coords[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        this.setMapPosition(lat, lon);
        this.confirmedAddress = original;
      } else {
        this.addressStatus.set({ kind: 'warn', text: 'Coordenadas fuera de rango.' });
      }
      return;
    }
    this.addressSearching.set(true);
    try {
      const found = await findAddress(original, () =>
        token === this.searchToken && !this.destroyRef.destroyed
      );
      if (token !== this.searchToken || this.destroyRef.destroyed) return;
      if (!found) {
        this.lastSearchedAddress = '';
        this.addressStatus.set({
          kind: 'warn',
          text: 'No se pudo verificar el número, la calle y la zona. El marcador no se actualizó. Selecciona el punto correcto en el mapa o pega sus coordenadas.'
        });
        return;
      }
      this.setMapPosition(found.lat, found.lon);
      this.confirmedAddress = original;
      this.addressStatus.set({
        kind: 'info',
        text: 'Se encontró una coincidencia de dirección. Revisa el marcador antes de guardar.'
      });
    } finally {
      if (token === this.searchToken) this.addressSearching.set(false);
    }
  }

  private setMapPosition(lat: number, lng: number, manual = false): void {
    this.form.controls.latitude.setValue(Number(lat.toFixed(6)));
    this.form.controls.longitude.setValue(Number(lng.toFixed(6)));
    this.marker?.setLatLng([lat, lng]);
    this.map?.setView([lat, lng], 17);
    setTimeout(() => this.map?.invalidateSize(true), 100);
    if (manual) this.reverseGeocode(lat, lng);
  }

  // Lo llaman los eventos click/dragend existentes del mapa.
  // Conserva el texto escrito, sin sustituirlo por una dirección vecina.
  private reverseGeocode(lat: number, lng: number): void {
    this.searchToken++;
    this.addressSearching.set(false);
    const address = this.form.controls.address.value?.trim() ||
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    this.form.controls.address.setValue(address);
    this.lastSearchedAddress = address;
    this.confirmedAddress = address;
    this.addressStatus.set({ kind: 'info', text: 'Ubicación seleccionada manualmente.' });
  }

  private validateAddressLocation(): boolean {
    const address = this.form.controls.address.value?.trim();
    if (this.addressSearching() || !address || address !== this.confirmedAddress) {
      Swal.showValidationMessage('Busca la dirección y verifica su ubicación, o selecciona el punto correcto en el mapa.');
      return false;
    }
    return true;
  }

  onAddressKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      void this.searchAddressOnMap(true);
    }
  }

  myLocation(): void {
    if (!navigator.geolocation) {
      this.addressStatus.set({ kind: 'warn', text: 'Tu navegador no soporta geolocalización.' });
      return;
    }
    const token = ++this.searchToken;
    this.addressSearching.set(false);
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (token !== this.searchToken || this.destroyRef.destroyed) return;
        this.setMapPosition(pos.coords.latitude, pos.coords.longitude, true);
      },
      () => {
        if (token === this.searchToken) this.addressStatus.set({ kind: 'warn', text: 'No se pudo obtener tu ubicación.' });
      },
      { enableHighAccuracy: true }
    );
  }

  // ========== CRUD CLIENTES ==========
  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      this.clientes.set(
        await firstValueFrom(
          this.api.getAll().pipe(takeUntilDestroyed(this.destroyRef))
        )
      );
      this.page.set(Math.min(this.page(), this.pageCount()));
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        void Swal.fire('Error', this.errorMessage(error), 'error');
      }
    } finally {
      this.loading.set(false);
    }
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
      companyName: cliente?.companyName ?? '',
      contactName: cliente?.contactName ?? '',
      clientPhone: cliente?.clientPhone ?? '',
      address: cliente?.address ?? '',
      codeBox: cliente?.codeBox ?? '',
      latitude: cliente?.latitude ?? -2.900128,
      longitude: cliente?.longitude ?? -79.005896
    });

    this.lastSearchedAddress = cliente?.address.trim() ?? '';
    this.confirmedAddress = this.lastSearchedAddress;
    this.addressStatus.set(null);
    this.editorOpen.set(true);
    try {
      const result = await this.editor().fire();
      if (result.isConfirmed && !this.destroyRef.destroyed) {
        await Swal.fire({
          icon: 'success',
          title: '¡Éxito!',
          text: cliente
            ? 'Cliente actualizado correctamente.'
            : 'Cliente creado correctamente.',
          confirmButtonColor: '#12CFF4'
        });
      }
    } finally {
      this.editorOpen.set(false);
      this.destroyMap();
    }
  }

  private async persistClient(): Promise<boolean> {
    if (!this.validateAddressLocation()) return false;
    if (this.busy()) return false;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    if (
      this.form.invalid ||
      !Number.isFinite(raw.latitude) ||
      !Number.isFinite(raw.longitude)
    ) {
      Swal.showValidationMessage(
        'Completa nombre, dirección y ubicación. Compañía, encargado y caja de código admiten hasta 255 caracteres.'
      );
      return false;
    }

    const data: ClienteRequest = {
      clientName: raw.clientName.trim(),
      companyName: raw.companyName.trim() || null,
      contactName: raw.contactName.trim() || null,
      clientPhone: raw.clientPhone.trim() || null,
      address: raw.address.trim(),
      codeBox: raw.codeBox.trim() || null,
      latitude: raw.latitude!,
      longitude: raw.longitude!
    };


    this.busy.set(true);
    const id = this.editingId();
    try {
      const request =
        id === null ? this.api.create(data) : this.api.update(id, data);
      const saved = await firstValueFrom(
        request.pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.clientes.update((list) =>
        id === null
          ? [saved, ...list]
          : list.map((c) => (c.id === id ? saved : c))
      );
      this.search.set('');
      this.page.set(1);
      return true;
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        Swal.showValidationMessage(this.errorMessage(error));
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async remove(cliente: Cliente): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const result = await Swal.fire({
        title: '¿Eliminar cliente?',
        text: cliente.clientName,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b42318'
      });
      if (!result.isConfirmed || this.destroyRef.destroyed) return;
      await firstValueFrom(
        this.api.delete(cliente.id).pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.clientes.update((list) => list.filter((c) => c.id !== cliente.id));
      this.page.set(Math.min(this.page(), this.pageCount()));
      void Swal.fire('¡Eliminado!', 'El cliente fue eliminado.', 'success');
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        void Swal.fire('Error', this.errorMessage(error), 'error');
      }
    } finally {
      this.busy.set(false);
    }
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