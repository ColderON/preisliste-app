import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  //const filePath = path.join(process.cwd(), 'app', 'api', 'preisliste', 'preisliste.json');
  const filePath = path.join(process.cwd(), 'items', 'preisliste.json');
  try {
    const data = await readFile(filePath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (err) {
    return NextResponse.json([], { status: 500 });
  }
} 