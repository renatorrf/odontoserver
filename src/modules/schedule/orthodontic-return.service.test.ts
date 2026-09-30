import assert from 'node:assert/strict';
import test from 'node:test';
import { orthodonticReturnTargetDate } from './orthodontic-return.service';

test('orthodontic return is targeted 30 calendar days after the last visit', () => {
  assert.equal(
    orthodonticReturnTargetDate(new Date('2026-09-28T09:30:00-03:00')),
    '2026-10-28',
  );
  assert.equal(
    orthodonticReturnTargetDate(new Date('2026-01-31T16:00:00-03:00')),
    '2026-03-02',
  );
});
