import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export default function App() {
  const messages = useQuery(api.messages.getAllMessages);

  if (messages === undefined) {
    return <div>Loading...</div>;
  }

  if (messages.length === 0) {
    return <div>No messages yet</div>;
  }

  return (
    <ul>
      {messages.map((message) => (
        <li key={message._id}>
          {message.author}: {message.body}
        </li>
      ))}
    </ul>
  );
}
