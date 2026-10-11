import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Assignment {
    id: number;
    jobId: number;
    employeeId: number;
    employeeName: string;
    clientName: string;
    address: string;
    status: string;
    assignedAt: string;
    expiresAt: string | null;
    respondedAt: string | null;
    reason: string;
}

export function assignmentLabel(status: string): string {
    const labels: Record<string, string> = {
        PENDING: 'Esperando respuesta',
        ACCEPTED: 'Aceptado',
        REJECTED: 'Rechazado',
        EXPIRED: 'Venció sin respuesta',
        SUPERSEDED: 'Asignación reemplazada',
        CANCELLED: 'Asignación cancelada',
        ADMIN: 'A cargo de administración'
    };

    return labels[status] ?? status;
}

@Injectable({
    providedIn: 'root'
})
export class AssignmentsService {
    private readonly http = inject(HttpClient);

    private readonly url =
        `${environment.apiUrl.replace(/\/$/, '')}/job-assignments`;

    mine() {
        return this.http.get<Assignment[]>(`${this.url}/mine`);
    }

    history(jobId: number) {
        return this.http.get<Assignment[]>(
            `${this.url}/job/${jobId}`
        );
    }

    respond(id: number, decision: 'ACCEPT' | 'REJECT') {
        return this.http.post<{ message: string }>(
            `${this.url}/${id}/decision`,
            { decision }
        );
    }
}