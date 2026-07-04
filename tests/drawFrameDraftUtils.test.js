const test = require('node:test');
const assert = require('node:assert/strict');
const { computeType3D50TotalDraft } = require('../src/views/draw-frame/draftUtils');

test('computes D50 total draft from delivery hank, feed hank, and no of ends', () => {
  assert.equal(computeType3D50TotalDraft({ delHank: '3.2', feedHank: '0.8', noOfEnds: '4' }), '16.00');
  assert.equal(computeType3D50TotalDraft({ delHank: '2.4', feedHank: '1.2', noOfEnds: '3' }), '6.00');
});

test('returns empty string when required values are missing', () => {
  assert.equal(computeType3D50TotalDraft({ delHank: '', feedHank: '1', noOfEnds: '2' }), '');
  assert.equal(computeType3D50TotalDraft({ delHank: '2', feedHank: '', noOfEnds: '2' }), '');
  assert.equal(computeType3D50TotalDraft({ delHank: '2', feedHank: '1', noOfEnds: '' }), '');
});
