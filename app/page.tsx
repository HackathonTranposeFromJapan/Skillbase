import { Suspense } from "react";
import { SearchClient } from "./components/SearchClient";

export default function Home() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 pt-24" />}>
      <SearchClient />
    </Suspense>
  );
}
