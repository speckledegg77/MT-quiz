import HostConsolePage from "@/components/host/HostConsolePage"

type DirectHostPageProps = {
  searchParams?: Promise<{ code?: string | string[] }>
}

export default async function DirectHostPage({ searchParams }: DirectHostPageProps) {
  const params = searchParams ? await searchParams : undefined
  const initialRoomCode = Array.isArray(params?.code) ? params?.code[0] : params?.code

  return <HostConsolePage initialRoomCode={initialRoomCode ?? null} />
}
