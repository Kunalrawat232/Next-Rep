import { describe, expect, it } from 'vitest';
import { isObviouslyOffTopic } from './coachScope.js';

describe('isObviouslyOffTopic', () => {
  it.each([
    'What is the weather today?',
    "what's the weather",
    'weather in Mumbai',
    'weather tomorrow',
    '2+2',
    '12 / 4 =',
    '(3 + 4) * 5',
    'solve 3x + 5 = 20',
    'Solve x^2 = 16',
    'bitcoin price',
    'what is the capital of France',
    "who's the president of the USA",
    'write me a python script for sorting',
    'write a poem about autumn',
  ])('turns away "%s"', (question) => {
    expect(isObviouslyOffTopic(question)).toBe(true);
  });

  it.each([
    '5x5',
    '5 x 5',
    '3x8 or 4x6?',
    'bench 60 x 8 is that ok',
    'How should I train in hot weather?',
    'Does cold weather affect my lifts?',
    'How do I solve a squat plateau?',
    'Should I solve this by adding weight?',
    'Is whey protein worth the price?',
    'What is the best rep range?',
    'How many calories should I eat to gain muscle?',
    'What should I eat after leg day?',
    'Is a 10% jump too much?',
    'Write me a workout plan',
    'Write a 4 day split for me',
    'Write me a training program',
    'Write me a program for chest day',
    'Write a bulking meal plan',
    '',
  ])('lets "%s" through to the model', (question) => {
    expect(isObviouslyOffTopic(question)).toBe(false);
  });
});
