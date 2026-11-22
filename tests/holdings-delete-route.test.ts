import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  portfolioHolding: { findFirst: vi.fn(), deleteMany: vi.fn() },
  fundHoldingsImport: { deleteMany: vi.fn() },
};

vi.mock('../src/lib/db', () => ({
  prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
}));

const { DELETE } = await import('../src/app/api/holdings/[id]/route');

function del(id: string) {
  const request = new Request(`http://localhost:8420/api/holdings/${id}`, {
    method: 'DELETE',
    headers: { host: 'localhost:8420' },
  });
  const ctx = { params: Promise.resolve({ id }) } as Parameters<typeof DELETE>[1];
  return DELETE(request, ctx);
}

describe('DELETE /api/holdings/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes the holding and its fund import', async () => {
    tx.portfolioHolding.findFirst.mockResolvedValue({ id: 7, ticker: 'VTI' });
    tx.portfolioHolding.deleteMany.mockResolvedValue({ count: 1 });
    const res = await del('7');
    expect(res.status).toBe(204);
    expect(tx.portfolioHolding.deleteMany).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(tx.fundHoldingsImport.deleteMany).toHaveBeenCalledWith({ where: { ticker: 'VTI' } });
  });

  it('returns 404 for a missing id and keeps imports', async () => {
    tx.portfolioHolding.findFirst.mockResolvedValue(null);
    const res = await del('99');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Holding not found' });
    expect(tx.fundHoldingsImport.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 404 when a concurrent delete removed the row first', async () => {
    tx.portfolioHolding.findFirst.mockResolvedValue({ id: 7, ticker: 'VTI' });
    tx.portfolioHolding.deleteMany.mockResolvedValue({ count: 0 });
    const res = await del('7');
    expect(res.status).toBe(404);
    expect(tx.fundHoldingsImport.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await del('abc');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid id' });
  });
});
