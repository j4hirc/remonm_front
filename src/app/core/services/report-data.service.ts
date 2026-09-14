import { inject, Injectable } from '@angular/core';
import { forkJoin } from 'rxjs';
import { JobsService } from './jobs.service';
import { UsersService } from './users.service';
import { MaterialsService } from './materials.service';
@Injectable({ providedIn: 'root' })
export class ReportDataService {
  private readonly jobs = inject(JobsService);
  private readonly users = inject(UsersService);
  private readonly materials = inject(MaterialsService);
  warehouse() {
    return forkJoin({ jobs: this.jobs.getAll(), users: this.users.getAll(), materials: this.materials.getAll() });
  }
  payroll() {
    return forkJoin({ jobs: this.jobs.getAll(), users: this.users.getAll() });
  }
}
