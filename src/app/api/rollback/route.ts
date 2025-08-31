import { NextResponse } from "next/server";
import { snapshots } from "../rollback-chat/route";

export function rollbackSnapshot(threadId: string, version: number) {
  const threadSnapshots = snapshots.get(threadId);
  if (!threadSnapshots || threadSnapshots.length === 0) return;

  const idx = threadSnapshots.findIndex((s) => s.version === version);
  if (idx === -1) return;

  snapshots.set(threadId, threadSnapshots.slice(0, idx + 1));
  return snapshots.get(threadId)?.[idx];
}

// ---- POST /api/rollback ----
// Body: { threadId: string, version: number }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, version } = body ?? {};

    const snapshot = rollbackSnapshot(threadId, version);
    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          message: `No snapshot found for threadId='${threadId}' at version=${version}.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        threadId,
        rolledBackToVersion: snapshot.version,
        restoredState: snapshot.state,
      },
      message: "Rollback successful. State restored.",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to rollback.",
        error: String(err?.message ?? err),
      },
      { status: 500 },
    );
  }
}
