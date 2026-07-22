import { GraphQLClient } from "graphql-request";

// Points at the Rails GraphQL endpoint. Override via .env.local for
// non-default backend ports/hosts (see .env.example).
const endpoint = import.meta.env.VITE_GRAPHQL_URL ?? "http://localhost:3000/graphql";

export const graphqlClient = new GraphQLClient(endpoint);
