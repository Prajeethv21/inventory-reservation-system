import ReservationClient from "@/app/components/reservation-client";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-white px-6 py-12 text-black sm:px-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <ReservationClient id={id} />
      </div>
    </main>
  );
}
