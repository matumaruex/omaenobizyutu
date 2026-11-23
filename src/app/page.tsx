import Museum from "@/components/Museum";
import { primeCatalog } from "@/lib/catalog/server";
export default async function Home() {
  await primeCatalog();
  return <Museum />;
}
