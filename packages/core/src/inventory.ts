export class InventoryError extends Error {
  readonly productId?: string;

  constructor(message: string, productId?: string) {
    super(message);
    this.name = "InventoryError";
    this.productId = productId;
  }
}

export interface StockRow {
  productId: string;
  name: string;
  onHand: number;
  lowStockAlert: number;
}

export interface SaleLine {
  productId: string;
  quantity: number;
}

export interface StockUpdate {
  productId: string;
  onHand: number;
  low: boolean;
}

export function isLowStock(onHand: number, lowStockAlert: number): boolean {
  return onHand <= lowStockAlert;
}

export function planInventoryDecrement(stock: StockRow[], lines: SaleLine[]): StockUpdate[] {
  const requested = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new InventoryError("Quantity must be a positive whole number.", line.productId);
    }
    requested.set(line.productId, (requested.get(line.productId) ?? 0) + line.quantity);
  }

  const updates: StockUpdate[] = [];
  for (const [productId, quantity] of requested) {
    const row = stock.find((item) => item.productId === productId);
    if (!row) {
      throw new InventoryError("That product is not in this salon's inventory.", productId);
    }
    if (row.onHand < quantity) {
      throw new InventoryError(`${row.name} only has ${row.onHand} left.`, productId);
    }
    const onHand = row.onHand - quantity;
    updates.push({ productId, onHand, low: isLowStock(onHand, row.lowStockAlert) });
  }
  return updates;
}
