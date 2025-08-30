import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          message: "No file provided",
        },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          message: "File size exceeds 10MB limit",
        },
        { status: 400 },
      );
    }

    // Create ai-context directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), "ai-context");

    try {
      await fs.access(uploadDir);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(uploadDir, { recursive: true });
    }

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const originalName = file.name;
    const extension = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, extension);
    const uniqueFilename = `${nameWithoutExt}_${timestamp}${extension}`;

    const filePath = path.join(uploadDir, uniqueFilename);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await fs.writeFile(filePath, buffer);

    // Get file stats for response
    const stats = await fs.stat(filePath);

    return NextResponse.json({
      success: true,
      data: {
        filename: uniqueFilename,
        originalName: originalName,
        size: file.size,
        type: file.type,
        savedAt: filePath,
        uploadedAt: new Date().toISOString(),
      },
      message: "File uploaded successfully",
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to upload file",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
