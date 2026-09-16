export interface ClienteRequest {
  clientName: string;
  clientPhone: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface Cliente extends ClienteRequest {
  id: number;
}
