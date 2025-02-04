import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export default function App() {
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const sendMessage = useMutation(api.messages.sendMessage);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      await sendMessage({ author, body });
      setAuthor("");
      setBody("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>
          Author:
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
          />
        </label>
      </div>
      <div>
        <label>
          Message:
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>
      </div>
      <button type="submit" disabled={isSending}>
        {isSending ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
