import { describe, expect, it } from 'vitest';
import { ListingDto } from '../models/playroom';
import { listingToRoom, mapStatus } from './playroom-mappers';
import { isTransitional } from './playroom-display';

describe('mapStatus', () => {
  it('maps the states the backend reports to GUI status keys', () => {
    expect(mapStatus('Ready')).toBe('ready');
    expect(mapStatus('Stopped')).toBe('stopped');
    expect(mapStatus('NotReady')).toBe('no-host');
    expect(mapStatus('Unknown')).toBe('no-host');
  });

  it('folds every failure state into one key', () => {
    for (const state of [
      'CrashLoopBackOff',
      'ImagePullBackOff',
      'ErrImagePull',
      'OOMKilled',
      'Error',
      'CreateContainerConfigError',
      'InvalidImageName',
      'Failed',
    ]) {
      expect(mapStatus(state), state).toBe('failed');
    }
  });

  it('maps the known pending phases to creating', () => {
    expect(mapStatus('Pending')).toBe('creating');
    expect(mapStatus('ContainerCreating')).toBe('creating');
  });

  it('treats anything it does not recognise as still coming up, but says so', () => {
    // `unknown` polls like any transitional status, but must not borrow
    // "creating"'s copy and claim to be provisioning.
    expect(mapStatus('SomeFuturePhase')).toBe('unknown');
    expect(mapStatus('')).toBe('unknown');
    expect(mapStatus()).toBe('unknown');
    expect(isTransitional(mapStatus('SomeFuturePhase'))).toBe(true);
  });
});

describe('listingToRoom', () => {
  const base: ListingDto = { Name: 'demo', Owner: 'someone@example.com' };

  it('carries the playhouse through, since the listing does not name it', () => {
    expect(listingToRoom(base, 'playhouse-demo').playhouse).toBe('playhouse-demo');
  });

  it('derives age in whole minutes from CreatedAt', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(listingToRoom({ ...base, CreatedAt: tenMinutesAgo }, 'ph').ageMin).toBe(10);
  });

  it('never reports a negative age for a clock skewed into the future', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(listingToRoom({ ...base, CreatedAt: future }, 'ph').ageMin).toBe(0);
  });

  it('keeps the raw status only when it adds something to the mapped one', () => {
    // Ready and Stopped are self-explanatory; anything else is worth showing
    // verbatim, because that is where the detail lives.
    expect(listingToRoom({ ...base, Status: 'Ready' }, 'ph').rawStatus).toBe('');
    expect(listingToRoom({ ...base, Status: 'Stopped' }, 'ph').rawStatus).toBe('');
    expect(listingToRoom({ ...base, Status: 'CrashLoopBackOff' }, 'ph').rawStatus).toBe(
      'CrashLoopBackOff',
    );
  });

  it('reads ephemeral from the disk type', () => {
    expect(listingToRoom({ ...base, DiskType: 'ephemeral' }, 'ph').ephemeral).toBe(true);
    expect(listingToRoom({ ...base, DiskType: 'persistent' }, 'ph').ephemeral).toBe(false);
  });

  it('defaults a missing disk type to persistent rather than blank', () => {
    expect(listingToRoom(base, 'ph').diskType).toBe('persistent');
  });

  it('tolerates a listing with nothing but a name', () => {
    const room = listingToRoom({ Name: 'bare' }, 'ph');
    expect(room.name).toBe('bare');
    expect(room.owner).toBe('');
    expect(room.host).toBe('');
  });
});
