import React from "react";
import { ConvexProvider, usePaginatedQuery } from "convex/react";
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Initialize Convex client
const convex = new ConvexClient("your-convex-endpoint");

export default function App() {
  const { results, isLoading, loadMore, status } = usePaginatedQuery(
    api.items.paginateItems,
    {},
    { initialNumItems: 10 },
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Items</h1>
      <ul>
        {results.map((item: any) => (
          <li key={item._id}>
            <h2>{item.name}</h2>
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(10)}>Load More</button>
      )}
    </div>
  );
}
