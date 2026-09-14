export interface Material {
  materialId: number;
  name: string;
  count: number;
  price: number;
  categoryName: string;
  quantity?: number;
  unit?: string | null;
}

export interface MaterialRequest {
  name: string;
  count: number;
  price: number;
  unit?: string | null;
  categoryId: number;
}