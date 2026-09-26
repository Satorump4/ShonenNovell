/**
 * Демо-книга «The Last Dawn» для проверки системы сцен.
 *
 * Скрипт безопасен для повторного запуска: если в базе уже есть хоть одна глава,
 * он ничего не меняет. Запуск:
 *   npm run db:seed                 — вручную (локально)
 *   node dist/.../seed.js --auto    — при старте контейнера, только если SEED_DEMO=true
 */
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { prisma } from '../server/src/db.js';
import { processUpload, storeMedia } from '../server/src/services/media.js';
import { docToText } from '../server/src/services/tiptap.js';
import type { TiptapNode } from '../shared/types.js';
import { aftermathTrack, battleTrack, calmTrack } from './demo/audio.js';
import { battleAftermath, battleBefore, battleFight, chapter1, chapter2Night, chapter2Streets } from './demo/content.js';
import { aftermathBgSvg, coverSvg } from './demo/images.js';

const auto = process.argv.includes('--auto');

async function main() {
  if (auto && process.env.SEED_DEMO !== 'true') return;

  const chapters = await prisma.chapter.count();
  if (chapters > 0) {
    console.log('[seed] Chapters already exist — demo data was not added.');
    return;
  }
  console.log('[seed] Creating demo book "The Last Dawn"…');

  const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
  const upload = async (buffer: Buffer, filename: string) => storeMedia(await processUpload(buffer), filename);

  const cover = await upload(await png(coverSvg), 'last-dawn-cover.png');
  const dawnBg = await upload(await png(aftermathBgSvg), 'aftermath-dawn.png');
  const calm = await upload(calmTrack(), 'calm.wav');
  const battle = await upload(battleTrack(), 'battle.wav');
  const aftermath = await upload(aftermathTrack(), 'aftermath.wav');

  await prisma.book.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, title: 'The Last Dawn' },
  });
  await prisma.book.update({
    where: { id: 1 },
    data: {
      title: 'Последний рассвет',
      originalTitle: 'The Last Dawn',
      author: 'Демо-автор',
      description:
        'Лира покидает родной Эльдор по зову Ордена Рассвета, не зная, что уже через несколько дней окажется в самом сердце битвы, о которой в её краях рассказывают только шёпотом.\n\nЭто демонстрационная книга: откройте третью главу, чтобы увидеть, как по мере чтения меняются фон и музыка.',
      info: [
        { label: 'Тип', value: 'Роман' },
        { label: 'Выпуск', value: '2026 г.' },
        { label: 'Статус', value: 'Выпускается' },
        { label: 'Жанры', value: 'Фэнтези, приключения' },
      ],
      coverId: cover.id,
      defaultBackground: '#101218',
    },
  });

  type SceneSeed = Omit<Prisma.SceneCreateWithoutChapterInput, 'order' | 'content' | 'plainText'> & { content: TiptapNode };
  const scene = (s: SceneSeed, order: number): Prisma.SceneCreateWithoutChapterInput => ({
    ...s,
    order,
    content: s.content as unknown as Prisma.InputJsonValue,
    plainText: docToText(s.content),
  });
  const now = Date.now();
  const day = 86_400_000;

  const book: { title: string; slug: string; number: string; scenes: SceneSeed[] }[] = [
    {
      title: 'Начало',
      slug: 'the-beginning',
      number: '1',
      scenes: [
        {
          title: 'Утро в Эльдоре',
          content: chapter1,
          musicMode: 'TRACK',
          music: { connect: { id: calm.id } },
          volume: 0.55,
          background: 'linear-gradient(180deg, #0e1424 0%, #121a2e 100%)',
          transitionMs: 1500,
        },
      ],
    },
    {
      title: 'Город',
      slug: 'the-city',
      number: '2',
      scenes: [
        {
          title: 'Улицы столицы',
          content: chapter2Streets,
          musicMode: 'TRACK',
          music: { connect: { id: calm.id } },
          volume: 0.55,
          background: 'linear-gradient(180deg, #17161a 0%, #1b1a20 100%)',
          transitionMs: 1500,
        },
        {
          title: 'Ночь',
          content: chapter2Night,
          musicMode: 'INHERIT',
          volume: 0.4,
          background: 'linear-gradient(180deg, #080b14 0%, #0c1120 100%)',
          transitionMs: 2000,
        },
      ],
    },
    {
      title: 'Битва',
      slug: 'the-battle',
      number: '3',
      scenes: [
        {
          title: 'Перед боем',
          content: battleBefore,
          musicMode: 'TRACK',
          music: { connect: { id: calm.id } },
          volume: 0.55,
          background: 'linear-gradient(180deg, #0b1322 0%, #0f1a30 100%)',
          transitionMs: 1500,
        },
        {
          title: 'Бой',
          content: battleFight,
          musicMode: 'TRACK',
          music: { connect: { id: battle.id } },
          volume: 0.7,
          background: 'linear-gradient(180deg, #1c0b0b 0%, #0e0505 100%)',
          transitionMs: 1200,
        },
        {
          title: 'После боя',
          content: battleAftermath,
          musicMode: 'TRACK',
          music: { connect: { id: aftermath.id } },
          volume: 0.6,
          background: '#141821',
          backgroundImage: { connect: { id: dawnBg.id } },
          backgroundDim: 0.55,
          transitionMs: 2000,
        },
      ],
    },
  ];

  for (const [index, ch] of book.entries()) {
    await prisma.chapter.create({
      data: {
        title: ch.title,
        slug: ch.slug,
        volume: 1,
        number: ch.number,
        order: index + 1,
        published: true,
        publishedAt: new Date(now - (book.length - index) * day),
        scenes: { create: ch.scenes.map((s, i) => scene(s, i + 1)) },
      },
    });
  }
  console.log('[seed] Done: 3 chapters, 5 scenes, 3 demo tracks, cover and background.');
}

main()
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
