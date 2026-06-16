import { ProtocolForm } from "./protocol-form";

type NewProtocolPageProps = {
  searchParams: Promise<{ draft?: string | string[]; object?: string | string[] }>;
};

export default async function NewProtocolPage({
  searchParams,
}: NewProtocolPageProps) {
  const query = await searchParams;
  const draftNumber = Array.isArray(query.draft) ? query.draft[0] : query.draft;
  const objectCode = Array.isArray(query.object) ? query.object[0] : query.object;

  return <ProtocolForm draftNumber={draftNumber} initialObjectCode={objectCode} />;
}
