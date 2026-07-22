import { useQuery } from "@tanstack/react-query";
import { gql } from "graphql-request";
import { graphqlClient } from "../lib/graphqlClient";
import { useUiStore } from "../store/useUiStore";

// Minimal typename query - proves the TanStack Query + graphql-request
// wiring can reach the Rails GraphQL endpoint. Replace with real queries
// once the stats data model exists.
const PING_QUERY = gql`
  query Ping {
    __typename
  }
`;

export function HomePage() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const { data, error, isLoading } = useQuery({
    queryKey: ["ping"],
    queryFn: async () => graphqlClient.request<{ __typename: string }>(PING_QUERY),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold text-slate-900">ao3-stats-plus</h1>
      <p className="text-slate-600">
        Project skeleton scaffolded. Feature work (author stats fetching, history, and graphs) comes
        in later SDLC stages.
      </p>
      <button
        type="button"
        onClick={toggleSidebar}
        className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
      >
        Sidebar is {sidebarOpen ? "open" : "closed"} (Zustand demo)
      </button>
      <p className="text-sm text-slate-500">
        {isLoading && "Checking GraphQL API connection..."}
        {error && "Could not reach the backend GraphQL API (is `rails server` running?)."}
        {data && `Connected to backend GraphQL API (${data.__typename}).`}
      </p>
    </main>
  );
}
