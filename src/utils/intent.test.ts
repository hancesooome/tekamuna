import { describe, expect, it } from 'vitest';
import { shouldRunVerificationPipeline, type ClassificationCategory } from './intent';

function expectCategory(input: string, category: ClassificationCategory) {
  const actual = shouldRunVerificationPipeline(input);
  expect(actual.category).toBe(category);
  expect(actual.canFactCheck).toBe(category === 'FACT_CHECKABLE');
  expect(actual.shouldVerify).toBe(actual.canFactCheck);
  expect(actual.route).toBe(category === 'FACT_CHECKABLE' ? 'fact_check' : category === 'NEEDS_CONTEXT' ? 'ask_user' : 'reject');
  expect(actual.confidence).toBeGreaterThanOrEqual(0);
  expect(actual.confidence).toBeLessThanOrEqual(1);
  return actual;
}

describe('shouldRunVerificationPipeline', () => {
  it.each([
    'Totoo ba na ₱20 na ang bigas?',
    'Sa tingin ko umiikot ang Earth sa Araw.',
    'Libre ang COVID vaccine sa lahat ng Pilipino.',
    'Ang Pilipinas ay may pinakamataas na unemployment rate sa ASEAN.',
    'Ang Maynila ay ang pinaka-polluted na lungsod sa buong mundo.',
    'May lindol na magnitude 7 sa Mindanao kahapon.',
    'Nanalo si Carlos Yulo ng dalawang Olympic gold medals.',
    'Bumaba ang inflation ngayong taon.',
    'Marcos Jr. declared Martial Law again.',
    'Na-ban na ba ang TikTok sa Pilipinas?',
    'Sinabi ba ni Sara Duterte na kaya niyang mag-hire ng gunman ng ₱5,000?',
    'May batas ba na nagbabawal sa social media para sa menor de edad?',
  ])('classifies a public factual proposition: %s', (input) => {
    const actual = expectCategory(input, 'FACT_CHECKABLE');
    expect(actual.claim.length).toBeGreaterThan(0);
    expect(actual.needs).toEqual([]);
  });

  it('removes an opinion wrapper and extracts its factual proposition', () => {
    const actual = expectCategory('Sa tingin ko umiikot ang Earth sa Araw.', 'FACT_CHECKABLE');
    expect(actual.claim).toBe('umiikot ang Earth sa Araw');
  });

  it.each([
    ['Sinungaling siya.', ['person']],
    ['Totoo ba?', ['claim']],
    ['Fake news ba ito?', ['claim']],
    ['Verify this', ['claim']],
  ])('asks for missing context: %s', (input, needs) => {
    const actual = expectCategory(input as string, 'NEEDS_CONTEXT');
    expect(actual.needs).toEqual(needs);
    expect(actual.claim).toBe('');
  });

  it.each([
    ['Mas magaling si X kaysa kay Y.', 'OPINION'],
    ['Sa tingin mo mas maganda ang Android kaysa iPhone?', 'OPINION'],
    ['Naranasan ko ang matinding sakit kahapon.', 'PERSONAL_EXPERIENCE'],
    ['I feel sick after eating there.', 'PERSONAL_EXPERIENCE'],
    ['Is LeBron James going to Sixers?', 'PREDICTION'],
    ['Mananalo ang Pilipinas bukas.', 'PREDICTION'],
    ['What if mawala ang internet bukas?', 'HYPOTHETICAL'],
    ['Paano kung naging presidente ako?', 'HYPOTHETICAL'],
    ['Totoo ba ang Diyos?', 'BELIEF'],
    ['May sumpa ang bahay na ito.', 'BELIEF'],
    ['Ano ang ASEAN?', 'INFORMATION_REQUEST'],
    ['What is inflation?', 'INFORMATION_REQUEST'],
    ['Who is the president?', 'INFORMATION_REQUEST'],
    ['Bakit mataas ang inflation?', 'INFORMATION_REQUEST'],
    ['Translate this paragraph.', 'COMMAND'],
    ['Gumawa ng tula tungkol sa Maynila.', 'COMMAND'],
    ['Tell me a joke.', 'COMMAND'],
    ['Malaki ba ang titi ni Jason Yap?', 'PRIVATE_OR_UNVERIFIABLE'],
    ['Did she say that in a private conversation?', 'PRIVATE_OR_UNVERIFIABLE'],
    ['Earth is flat haha meme lang.', 'SATIRE_OR_MEME'],
  ] as const)('rejects non-fact-check input: %s', (input, category) => {
    expectCategory(input, category);
  });
});
