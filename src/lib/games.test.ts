import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getFilteredGames,
    getAllCategories,
    getAllPublishers,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});

describe('game filtering helpers', () => {
    let db: Database;
    let ids: { catA: number; catB: number; pubX: number; pubY: number };

    beforeEach(async () => {
        db = await createTestDatabase();
        const [catA, catB] = await db
            .insert(categories)
            .values([
                { name: 'Beta Cat', description: 'c' },
                { name: 'Alpha Cat', description: 'c' },
            ])
            .returning({ id: categories.id });
        const [pubX, pubY] = await db
            .insert(publishers)
            .values([
                { name: 'Zed Pub', description: 'p' },
                { name: 'Acme Pub', description: 'p' },
            ])
            .returning({ id: publishers.id });
        ids = { catA: catA.id, catB: catB.id, pubX: pubX.id, pubY: pubY.id };
        await db.insert(games).values([
            { title: 'One', description: 'd', categoryId: catA.id, publisherId: pubX.id },
            { title: 'Two', description: 'd', categoryId: catB.id, publisherId: pubX.id },
            { title: 'Three', description: 'd', categoryId: catA.id, publisherId: pubY.id },
        ]);
    });

    /**
     * Extracts titles from a list of games.
     *
     * @param list - Games to read titles from.
     * @returns Titles in the same order.
     */
    const titles = (list: { title: string }[]): string[] => list.map((g) => g.title);

    it('returns all games when no filters are given', async () => {
        expect(titles(await getFilteredGames(db))).toEqual(['One', 'Three', 'Two']);
        expect(titles(await getFilteredGames(db, { categoryIds: [] }))).toHaveLength(3);
    });

    it('filters by one or more categories', async () => {
        expect(titles(await getFilteredGames(db, { categoryIds: [ids.catA] }))).toEqual(['One', 'Three']);
        expect(
            titles(await getFilteredGames(db, { categoryIds: [ids.catA, ids.catB] })),
        ).toEqual(['One', 'Three', 'Two']);
    });

    it('filters by publisher', async () => {
        expect(titles(await getFilteredGames(db, { publisherId: ids.pubX }))).toEqual(['One', 'Two']);
    });

    it('combines category and publisher filters', async () => {
        expect(
            titles(await getFilteredGames(db, { categoryIds: [ids.catA], publisherId: ids.pubY })),
        ).toEqual(['Three']);
        expect(
            await getFilteredGames(db, { categoryIds: [ids.catB], publisherId: ids.pubY }),
        ).toEqual([]);
    });

    it('lists categories and publishers ordered by name', async () => {
        expect((await getAllCategories(db)).map((c) => c.name)).toEqual(['Alpha Cat', 'Beta Cat']);
        expect((await getAllPublishers(db)).map((p) => p.name)).toEqual(['Acme Pub', 'Zed Pub']);
    });
});
