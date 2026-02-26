export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'base' | 'option' | 'multiplier';
  features?: string[];
  unit?: string;
  exclusiveGroup?: string; // For base services that replace each other
}

export interface CartItem {
  id: string;
  quantity: number;
  item: ServiceItem;
}