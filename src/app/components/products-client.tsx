"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type WarehouseStock = {
  id: string;
  name: string;
  total: number;
  totalInventory: number;
  reserved: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  warehouses: WarehouseStock[];
};

export default function ProductsClient() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const parseResponse = async (response: Response) => {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  };

  const fetchProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const data = await parseResponse(response);
      if (!response.ok) {
        const message = data?.error ?? "Failed to load products.";
        throw new Error(`${response.status}: ${message}`);
      }
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const quantityFor = (productId: string, warehouseId: string) => {
    const key = `${productId}-${warehouseId}`;
    return quantities[key] ?? 1;
  };

  const setQuantityFor = (
    productId: string,
    warehouseId: string,
    value: number
  ) => {
    const key = `${productId}-${warehouseId}`;
    setQuantities((prev) => ({
      ...prev,
      [key]: Number.isNaN(value) ? 1 : Math.max(1, Math.min(value, 100)),
    }));
  };

  const handleReserve = async (
    productId: string,
    warehouseId: string,
    quantity: number
  ) => {
    setActionError(null);
    const key = `${productId}-${warehouseId}`;
    setIsSubmitting(key);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ productId, warehouseId, quantity }),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        const message = data?.error ?? "Unable to reserve stock.";
        throw new Error(`${response.status}: ${message}`);
      }
      await fetchProducts();
      router.push(`/reservations/${data.reservation.id}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Unable to reserve stock."
      );
    } finally {
      setIsSubmitting(null);
    }
  };

  const hasProducts = useMemo(() => products.length > 0, [products]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Allo Inventory Reservations
          </h1>
          <p className="mt-2 text-sm text-black/70">
            Reserve stock for 1 minute to complete checkout safely.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchProducts}
          className="rounded-full border border-black px-4 py-2 text-sm font-medium text-black hover:bg-black hover:text-white transition"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-black/20 bg-white p-4 text-sm text-black">
          {error}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-xl border border-black/20 bg-white p-4 text-sm text-black">
          {actionError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-sm text-black/70">Loading products...</div>
      ) : null}

      {!isLoading && !hasProducts ? (
        <div className="text-sm text-black/70">No products seeded yet.</div>
      ) : null}

      <div className="grid gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="rounded-2xl border border-black/10 bg-white p-6"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-black">
                {product.name}
              </h2>
              <span className="text-xs uppercase tracking-[0.2em] text-black/50">
                {product.sku}
              </span>
            </div>

            <div className="mt-4 grid gap-4">
              {product.warehouses.map((warehouse) => {
                const quantity = quantityFor(product.id, warehouse.id);
                const rowKey = `${product.id}-${warehouse.id}`;
                return (
                  <div
                    key={warehouse.id}
                    className="flex flex-col gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium text-black">
                        {warehouse.name}
                      </div>
                      <div className="text-xs text-black/60">
                        Total: {warehouse.totalInventory} | Reserved: {warehouse.reserved} | Available: {warehouse.available}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="flex items-center gap-2 text-xs text-black/70">
                        Qty
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={quantity}
                          onChange={(event) =>
                            setQuantityFor(
                              product.id,
                              warehouse.id,
                              Number(event.target.value)
                            )
                          }
                          className="h-9 w-20 rounded-full border border-black/20 bg-white px-3 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={warehouse.available <= 0 || isSubmitting === rowKey}
                        onClick={() =>
                          handleReserve(product.id, warehouse.id, quantity)
                        }
                        className="h-9 rounded-full border border-black px-4 text-sm font-medium text-black transition hover:bg-black hover:text-white disabled:border-black/20 disabled:text-black/40 disabled:hover:bg-transparent"
                      >
                        {isSubmitting === rowKey ? "Reserving..." : "Reserve"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
