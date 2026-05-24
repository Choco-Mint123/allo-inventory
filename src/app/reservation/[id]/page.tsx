"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED";

type Reservation = {
  id: string;
  status: ReservationStatus;
  quantity: number;
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  product: { name: string; price: number; imageUrl: string | null };
  warehouse: { name: string; location: string };
};

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;

    function update() {
      const diff = Math.max(
        0,
        Math.floor((new Date(expiresAt!).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return secondsLeft;
}

export default function ReservationPage({
  params,
}: {
  params: { id: string };
}) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const secondsLeft = useCountdown(
    reservation?.status === "PENDING" ? reservation.expiresAt : null
  );

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setReservation(data);
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  // Auto-expire in UI when countdown hits zero
  useEffect(() => {
    if (secondsLeft === 0 && reservation?.status === "PENDING") {
      const timer = setTimeout(fetchReservation, 2000);
      return () => clearTimeout(timer);
    }
  }, [secondsLeft, reservation?.status, fetchReservation]);

  async function handleConfirm() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${params.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.status === 410) {
        setError("Your reservation has expired. The units have been released.");
        await fetchReservation();
        return;
      }
      if (!res.ok) {
        setError(data.error || "Failed to confirm");
        return;
      }
      setReservation(data);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${params.id}/release`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to cancel");
        return;
      }
      setReservation(data);
    } finally {
      setActionLoading(false);
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isExpired = secondsLeft === 0 && reservation?.status === "PENDING";
  const timerColor =
    secondsLeft > 120
      ? "text-green-600"
      : secondsLeft > 30
      ? "text-amber-500"
      : "text-red-600";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-lg">Reservation not found.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 text-blue-600 underline text-sm"
        >
          Back to products
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <button
        onClick={() => router.push("/")}
        className="mb-6 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        ← Back to products
      </button>

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        {/* Status banner */}
        <div
          className={`px-6 py-3 text-sm font-medium text-center ${
            reservation.status === "CONFIRMED"
              ? "bg-green-50 text-green-700 border-b border-green-100"
              : reservation.status === "RELEASED"
              ? "bg-gray-50 text-gray-600 border-b"
              : isExpired
              ? "bg-red-50 text-red-700 border-b border-red-100"
              : "bg-blue-50 text-blue-700 border-b border-blue-100"
          }`}
        >
          {reservation.status === "CONFIRMED" && "✓ Purchase confirmed!"}
          {reservation.status === "RELEASED" && "Reservation cancelled"}
          {reservation.status === "PENDING" &&
            !isExpired &&
            "Reservation active — complete your purchase"}
          {reservation.status === "PENDING" &&
            isExpired &&
            "⚠ Reservation expired"}
        </div>

        <div className="p-6">
          {/* Product info */}
          <div className="flex gap-4 mb-6">
            {reservation.product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reservation.product.imageUrl}
                alt={reservation.product.name}
                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div>
              <h1 className="font-bold text-xl text-gray-900">
                {reservation.product.name}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {reservation.warehouse.name} · {reservation.warehouse.location}
              </p>
              <p className="text-blue-600 font-semibold text-lg mt-1">
                ₹{reservation.product.price.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Reservation details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Reservation ID</span>
              <span className="font-mono text-gray-700 text-xs">{reservation.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Quantity</span>
              <span className="text-gray-800 font-medium">{reservation.quantity}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <span
                className={`font-semibold ${
                  reservation.status === "CONFIRMED"
                    ? "text-green-600"
                    : reservation.status === "RELEASED"
                    ? "text-gray-500"
                    : "text-blue-600"
                }`}
              >
                {reservation.status}
              </span>
            </div>
            {reservation.confirmedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Confirmed at</span>
                <span className="text-gray-700">
                  {new Date(reservation.confirmedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
            {reservation.releasedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Released at</span>
                <span className="text-gray-700">
                  {new Date(reservation.releasedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {/* Live countdown */}
          {reservation.status === "PENDING" && (
            <div className="text-center mb-5">
              {isExpired ? (
                <p className="text-red-600 font-semibold">
                  Time&apos;s up — this reservation has expired.
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-1">
                    Reservation expires in
                  </p>
                  <p className={`text-4xl font-mono font-bold ${timerColor}`}>
                    {String(minutes).padStart(2, "0")}:
                    {String(seconds).padStart(2, "0")}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              ⚠ {error}
            </div>
          )}

          {/* Actions */}
          {reservation.status === "PENDING" && !isExpired && (
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={actionLoading}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? "Processing…" : "Confirm purchase"}
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {reservation.status === "CONFIRMED" && (
            <div className="text-center">
              <p className="text-green-600 font-medium mb-3">
                🎉 Your order has been placed!
              </p>
              <button
                onClick={() => router.push("/")}
                className="text-blue-600 text-sm underline"
              >
                Continue shopping
              </button>
            </div>
          )}

          {(reservation.status === "RELEASED" ||
            (reservation.status === "PENDING" && isExpired)) && (
            <div className="text-center">
              <button
                onClick={() => router.push("/")}
                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Back to products
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
