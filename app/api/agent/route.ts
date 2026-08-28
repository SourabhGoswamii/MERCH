import { NextResponse } from "next/server";
import { agent } from "@/lib/agent/graph";

export async function POST() {
  try {
    const result = await agent.invoke({
      messages: [],
      merchantData: null,
      toolResults: [],
      opportunities: [],
      recommendations: [],
      nextStep: "planner",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Agent failed",
      },
      {
        status: 500,
      }
    );
  }
}