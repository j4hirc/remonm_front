import { Injectable } from '@angular/core';

export interface CalendarState {
    date: string;
    view: string;
    employeeId: string;
}

@Injectable({
    providedIn: 'root'
})
export class CalendarStateService {
    private readonly states = new Map<string, CalendarState>();

    get(key: string): CalendarState | undefined {
        return this.states.get(key);
    }

    set(key: string, state: CalendarState): void {
        this.states.set(key, { ...state });
    }
}