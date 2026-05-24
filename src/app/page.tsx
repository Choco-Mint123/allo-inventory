"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  total: number;
  reserved: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stocks: StockEntry[];
};

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function fetchProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchProducts();
    // Poll every 15s to keep stock fresh
    const interval = setInterval(fetchProducts, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleReserve(productId: string, warehouseId: string) {
    setReserving(`${productId}:${warehouseId}`);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError(`Not enough stock available: ${data.error}`);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      router.push(`/reservation/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setReserving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Reserve an item to hold it for 10 minutes while you checkout.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <span className="text-red-500 mt-0.5">⚠</span>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            {product.imageUrl && (
              <div className="h-48 bg-gray-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="font-semibold text-gray-900 leading-tight">
                  {product.name}
                </h2>
                <span className="text-blue-600 font-bold whitespace-nowrap">
                  ₹{product.price.toLocaleString()}
                </span>
              </div>
              {product.description && (
                <p className="text-gray-500 text-sm mb-3">
                  {product.description}
                </p>
              )}

              <div className="space-y-2">
                {product.stocks.map((stock) => {
                  const key = `${product.id}:${stock.warehouseId}`;
                  const isReserving = reserving === key;
                  const outOfStock = stock.available <= 0;

                  return (
                    <div
                      key={stock.warehouseId}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {stock.warehouseName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {stock.warehouseLocation}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`text-xs font-semibold ${
                              stock.available > 3
                                ? "text-green-600"
                                : stock.available > 0
                                ? "text-amber-600"
                                : "text-red-500"
                            }`}
                          >
                            {outOfStock
                              ? "Out of stock"
                              : `${stock.available} available`}
                          </span>
                          {stock.reserved > 0 && (
                            <span className="text-xs text-gray-400">
                              ({stock.reserved} reserved)
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        disabled={outOfStock || isReserving}
                        onClick={() =>
                          handleReserve(product.id, stock.warehouseId)
                        }
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          outOfStock
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : isReserving
                            ? "bg-blue-400 text-white cursor-wait"
                            : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                        }`}
                      >
                        {isReserving ? "Reserving…" : "Reserve"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
