import { tool } from "@langchain/core/tools";
import { z } from "zod";

const schema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).default(5),
});

export const webSearch = tool(
  async ({ query, maxResults }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      throw new Error("TAVILY_API_KEY is not configured.");
    }

    const response = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          search_depth: "basic",
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Web search failed (${response.status}): ${errorText}`,
      );
    }

    const data = await response.json();

    return JSON.stringify({
      success: true,
      query,
      results: data.results ?? [],
    });
  },
  {
    name: "web_search",
    description:
      "Search the internet for current external information that is not available in the merchant's datasets.",
    schema,
  },
);