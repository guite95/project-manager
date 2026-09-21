import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('deployment rejects mutable, missing and shell-like image references before host access', () => {
  for (const image of ['', 'project-management:latest', 'arbitrary:1234', 'project-management:$(id)']) {
    const result = spawnSync('bash', ['scripts/deploy-identity-boundary.sh', image], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(result.stderr.trim(), 'IMMUTABLE_PM_IMAGE_REQUIRED');
    assert.equal(result.stdout, '');
  }
});
