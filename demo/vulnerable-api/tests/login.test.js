const test = require('node:test');
const assert = require('node:assert/strict');
const { login } = require('../src/login.js');

test('valid credentials succeed', () => {
  assert.equal(login('alice', 'secret123').ok, true);
});

test('invalid credentials fail', () => {
  assert.equal(login('alice', 'wrong').ok, false);
});
