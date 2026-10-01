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
  selector: 'app-clientes-frecuentes-jefe',
  standalone: true,
  imports: [ReactiveFormsModule, SwalComponent, SwalPortalDirective],
  templateUrl: './clientes-frecuentes.component.html',
  styleUrl: './clientes-frecuentes.component.css'
})
export class ClientesFrecuentesJefeComponent implements OnInit, OnDestroy {
  private readonly api = inject(ClientesService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly swalTargets = inject(SwalPortalTargets);
  private readonly editor = viewChild.required<SwalComponent>('editor');

  private map: any = null;
  private marker: any = null;
  private searchingAddress = false;

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

  private reverseGeocode(lat: number, lng: number): void {
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es&addressdetails=1`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!data?.address) return;
        const a = data.address;
        const calle = [a.house_number || '', a.road || a.pedestrian || '']
          .filter(Boolean)
          .join(' ');
        const partes = [
          calle,
          a.city || a.town || a.village || a.municipality || '',
          a.state || a.province || '',
          a.country || ''
        ].filter(Boolean);
        this.form.controls.address.setValue(partes.join(', '));
      })
      .catch(() => undefined);
  }

  // ======================================================
  // BÚSQUEDA DE DIRECCIONES (igual que Trabajos)
  // ======================================================

  searchAddressOnMap(): void {
    const textoOriginal = this.form.controls.address.value?.trim();
    if (!textoOriginal) return;

    // 1. Coordenadas pegadas (lat, lng)
    const regexCoords = /^[-+]?\d+(\.\d+)?\s*,\s*[-+]?\d+(\.\d+)?$/;
    if (regexCoords.test(textoOriginal)) {
      const [latStr, lngStr] = textoOriginal.split(',');
      const latV = parseFloat(latStr.trim());
      const lngV = parseFloat(lngStr.trim());
      if (!isNaN(latV) && !isNaN(lngV)) {
        this.setMapPosition(latV, lngV, false);
      }
      return;
    }

    // 2. Normalizar y buscar
    const texto = this.normalizeAddress(textoOriginal);

    fetch(
      `https://nominatim.openstreetmap.org/search?` +
      `format=json&q=${encodeURIComponent(texto)}` +
      `&addressdetails=1&limit=5&accept-language=es,en`
    )
      .then((r) => r.json())
      .then((results: any[]) => {
        if (results?.length > 0) {
          const best = results[0];
          this.setMapPosition(
            parseFloat(best.lat),
            parseFloat(best.lon),
            false
          );
        } else {
          void Swal.fire({
            icon: 'warning',
            title: 'No encontrado',
            text: 'No se encontró esa dirección. Intenta ser más específico o mueve el marcador en el mapa.',
            confirmButtonColor: '#e65100',
            timer: 3200,
            timerProgressBar: true
          });
        }
      })
      .catch((err) => {
        console.error('Error geocoding:', err);
        void Swal.fire({
          icon: 'error',
          title: 'Error de búsqueda',
          text: 'No se pudo buscar la dirección. Intenta de nuevo.',
          confirmButtonColor: '#e65100'
        });
      });
  }

  private normalizeAddress(address: string): string {
    return address
      .replace(/\b(\d+)\s+1\/2\b/gi, '$1th')
      .replace(/\b(\d+)\s+½\b/gi, '$1th')
      .replace(/\b(\d+)\s+1\/4\b/gi, '$1th')
      .replace(/\b(\d+)\s+3\/4\b/gi, '$1th')
      .replace(/\bSt\b\.?/gi, 'Street')
      .replace(/\bAve\b\.?/gi, 'Avenue')
      .replace(/\bBlvd\b\.?/gi, 'Boulevard')
      .replace(/\bRd\b\.?/gi, 'Road')
      .replace(/\bDr\b\.?/gi, 'Drive')
      .replace(/\bLn\b\.?/gi, 'Lane')
      .replace(/\bCt\b\.?/gi, 'Court')
      .replace(/\bW\b(?=\s)/gi, 'West')
      .replace(/\bE\b(?=\s)/gi, 'East')
      .replace(/\bN\b(?=\s)/gi, 'North')
      .replace(/\bS\b(?=\s)/gi, 'South')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private setMapPosition(
    lat: number,
    lng: number,
    updateAddress = true
  ): void {
    this.form.controls.latitude.setValue(Number(lat.toFixed(6)));
    this.form.controls.longitude.setValue(Number(lng.toFixed(6)));

    if (this.map && this.marker) {
      this.marker.setLatLng([lat, lng]);
      this.map.setView([lat, lng], 17);
      setTimeout(() => {
        this.map?.invalidateSize(true);
      }, 100);
    }

    if (updateAddress) {
      this.reverseGeocode(lat, lng);
    }
  }

  onAddressKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.searchAddressOnMap();
    }
  }

  myLocation(): void {
    if (!navigator.geolocation) {
      void Swal.fire(
        'No soportado',
        'Tu navegador no soporta geolocalización.',
        'warning'
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.setMapPosition(pos.coords.latitude, pos.coords.longitude, true);
      },
      () => {
        void Swal.fire('Error', 'No se pudo obtener tu ubicación.', 'error');
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