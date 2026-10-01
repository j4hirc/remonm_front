export interface ClienteRequest {
  clientName: string;
  companyName?: string | null;
  contactName?: string | null;
  clientPhone?: string | null;
  address: string;
  codeBox?: string | null;
  latitude: number;
  longitude: number;
}

export interface Cliente extends ClienteRequest {
  id: number;
}