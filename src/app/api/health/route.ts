import { connection } from 'next/server';
import { prisma } from '@/lib/db';

/** Healthy only when the DB answers SELECT 1; a DB error surfaces as a 500 (OPS-03). */
export async function GET() {
  await connection();
  await prisma.$queryRaw`SELECT 1`;
  return Response.json({ ok: true });
}
