import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Cliente, ClienteRequest } from '../models/cliente.model';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/clientes`;

  getAll() { return this.http.get<Cliente[]>(`${this.url}/all`); }
  create(data: ClienteRequest) { return this.http.post<Cliente>(`${this.url}/create`, data); }
  update(id: number, data: ClienteRequest) {
    return this.http.put<Cliente>(`${this.url}/update/${id}`, data);
  }
  delete(id: number) {
    return this.http.delete(`${this.url}/delete/${id}`, { responseType: 'text' });
  }
}
