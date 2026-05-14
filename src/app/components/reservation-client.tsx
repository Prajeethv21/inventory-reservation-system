"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Reservation = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  quantity: number;
  expiresAt: string;
  product: { name: string; sku: string };
  warehouse: { name: string };
};

type ReservationClientProps = {
  id: string;
};

export default function ReservationClient({ id }: ReservationClientProps) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const mergeReservation = (next: Reservation | null) => {
    if (!next) {
      return;
    }

    setReservation((current) => {
      if (current?.status === "CONFIRMED" && next.status !== "CONFIRMED") {
        return current;
      }

      if (current?.status === "RELEASED" && next.status === "PENDING") {
        return current;
      }

      return next;
    });
  };

  const fetchReservation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${id}`, {
        cache: "no-store",
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        const message = data?.error ?? "Unable to load reservation.";
        throw new Error(`${response.status}: ${message}`);
      }
      mergeReservation(data.reservation);
      setActionError(null);
      return data.reservation as Reservation;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load reservation."
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReservation();
  }, [id]);

  useEffect(() => {
    if (!reservation || reservation.status !== "PENDING") {
      return;
    }

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [reservation]);

  const expiresInMs = useMemo(() => {
    if (!reservation) {
      return 0;
    }
    return new Date(reservation.expiresAt).getTime() - now;
  }, [reservation, now]);

  const formattedCountdown = useMemo(() => {
    if (!reservation) {
      return "--:--";
    }
    const remaining = Math.max(expiresInMs, 0);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }, [expiresInMs, reservation]);

  const handleConfirm = async () => {
    setActionError(null);
    setIsSubmitting("confirm");
    let shouldRefresh = false;
    try {
      const response = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        const message = data?.error ?? "Unable to confirm reservation.";
        throw new Error(`${response.status}: ${message}`);
      }
      mergeReservation(data.reservation);
      shouldRefresh = !data?.reservation || data.reservation.status === "PENDING";
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Unable to confirm reservation."
      );
      shouldRefresh = true;
    } finally {
      setIsSubmitting(null);
      if (shouldRefresh) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const latest = await fetchReservation();
          if (latest?.status && latest.status !== "PENDING") {
            break;
          }
          await pause(300);
        }
      }
    }
  };

  const handleRelease = async () => {
    setActionError(null);
    setIsSubmitting("release");
    let shouldRefresh = false;
    try {
      const response = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        const message = data?.error ?? "Unable to release reservation.";
        throw new Error(`${response.status}: ${message}`);
      }
      mergeReservation(data.reservation);
      shouldRefresh = !data?.reservation || data.reservation.status === "PENDING";
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Unable to release reservation."
      );
      shouldRefresh = true;
    } finally {
      setIsSubmitting(null);
      if (shouldRefresh) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const latest = await fetchReservation();
          if (latest?.status && latest.status !== "PENDING") {
            break;
          }
          await pause(300);
        }
      }
    }
  };

  const isPending = reservation?.status === "PENDING";
  const isExpired =
    isPending && new Date(reservation.expiresAt).getTime() < now;

  const countdownLabelClass = useMemo(() => {
    if (!reservation) {
      return "bg-black/5 text-black";
    }
    if (isExpired) {
      return "bg-black text-white";
    }
    if (expiresInMs <= 15000) {
      return "bg-amber-200 text-black";
    }
    return "bg-black/5 text-black";
  }, [expiresInMs, isExpired, reservation]);

  const expiredMessage = isExpired ? "410: Reservation expired." : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-black/50">
            Checkout
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Reservation
          </h1>
        </div>
        <Link
          href="/"
          className="rounded-full border border-black px-4 py-2 text-sm font-medium text-black hover:bg-black hover:text-white transition"
        >
          Back to products
        </Link>
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

      {expiredMessage ? (
        <div className="rounded-xl border border-black/20 bg-white p-4 text-sm text-black">
          {expiredMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-sm text-black/70">Loading reservation...</div>
      ) : null}

      {reservation ? (
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-black">
              {reservation.product.name}
            </h2>
            <span className="text-xs uppercase tracking-[0.2em] text-black/50">
              {reservation.product.sku}
            </span>
          </div>

          <div className="mt-4 grid gap-4 text-sm text-black/70">
            <div>Warehouse: {reservation.warehouse.name}</div>
            <div>Quantity: {reservation.quantity}</div>
            <div>Status: {reservation.status}</div>
            <div>Reservation hold: 1 minute</div>
            {isPending ? (
              <div>
                <span className="text-black">Expires in</span>
                <span
                  className={`ml-2 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${countdownLabelClass}`}
                >
                  {formattedCountdown}
                </span>
                {isExpired ? <span className="ml-2">(expired)</span> : null}
              </div>
            ) : (
              <div className="text-black">Countdown stopped</div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={
                reservation.status !== "PENDING" || isSubmitting !== null || isExpired
              }
              className="h-10 rounded-full border border-black px-4 text-sm font-medium text-black transition hover:bg-black hover:text-white disabled:border-black/20 disabled:text-black/40 disabled:hover:bg-transparent"
            >
              {isSubmitting === "confirm" ? "Confirming..." : "Confirm purchase"}
            </button>
            <button
              type="button"
              onClick={handleRelease}
              disabled={reservation.status !== "PENDING" || isSubmitting !== null}
              className="h-10 rounded-full border border-black px-4 text-sm font-medium text-black transition hover:bg-black hover:text-white disabled:border-black/20 disabled:text-black/40 disabled:hover:bg-transparent"
            >
              {isSubmitting === "release" ? "Cancelling..." : "Cancel"}
            </button>
            <button
              type="button"
              onClick={fetchReservation}
              className="h-10 rounded-full border border-black px-4 text-sm font-medium text-black transition hover:bg-black hover:text-white"
            >
              Refresh status
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
