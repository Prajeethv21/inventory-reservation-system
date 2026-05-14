import ProductsClient from "./components/products-client";

export default function Home() {
  return (
    <main className="min-h-screen bg-white px-6 py-12 text-black sm:px-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <ProductsClient />
      </div>
    </main>
  );
}
