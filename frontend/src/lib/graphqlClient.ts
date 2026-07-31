import { GraphQLClient } from "graphql-request";

// Points at the Rails GraphQL endpoint. Override via .env.local for
// non-default backend ports/hosts (see .env.example). The localhost
// fallback only ever applies to `vite dev` - vite.config.ts fails a real
// build loudly if VITE_GRAPHQL_URL is unset, so a production build can't
// silently ship pointed here instead.
const endpoint = import.meta.env.VITE_GRAPHQL_URL ?? "http://localhost:3000/graphql";

export const graphqlClient = new GraphQLClient(endpoint);
